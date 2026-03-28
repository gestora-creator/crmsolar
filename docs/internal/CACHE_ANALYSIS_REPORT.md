# 🔍 Análise de Problemas de Cache - CRM SOLAR

**Data:** 28 de Março de 2026  
**Versão:** 1.0  
**Status:** Crítico

> Análise realizada por Engenheiro de Software Sênior especializado em Performance e Escalabilidade

---

## 📊 Sumário Executivo

Este projeto utiliza **Next.js 16 + React Query 5 + Supabase**, com uma configuração de cache apresentando **5 problemas críticos** que podem causar:

- ❌ **Cache poisoning** (dados antigos persistindo)
- ❌ **Race conditions** em operações simultâneas
- ❌ **Excesso de cache misses** (requisições desnecessárias)
- ❌ **Inconsistência entre instâncias** (se escalar horizontalmente)
- ❌ **Consumo excessivo de banda** (Supabase)

---

## 🚨 PROBLEMA #1: Headers HTTP Excessivamente Agressivos

### Localização
- [next.config.ts](next.config.ts#L1)
- [middleware.ts](middleware.ts#L55)

### ❌ Problema Identificado

```typescript
// next.config.ts - CONFIGURAÇÃO ATUAL
headers: [
  {
    source: '/:path*{/}?',
    headers: [
      {
        key: 'Cache-Control',
        value: 'no-cache, no-store, must-revalidate', // ⚠️ MUITO AGRESSIVO
      },
      {
        key: 'Pragma',
        value: 'no-cache',
      },
      {
        key: 'Expires',
        value: '0',
      },
    ],
  },
]

// middleware.ts - REDUNDÂNCIA
supabaseResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
supabaseResponse.headers.set('Pragma', 'no-cache');
supabaseResponse.headers.set('Expires', '0');
```

### 💥 Impacto

1. **Zero cache no CDN/Browser** - Toda requisição vai ao servidor
2. **Overhead de Supabase** - Multiplicação de requisições ao banco
3. **Latência aumentada** - Especialmente em conexões lentas
4. **Banda desperdiçada** - Sem aproveitamento do cache intermediário

### 📏 Análise de Cardinalidade

```
Padrão de requisições observadas:
- useClientesList(): query key = ['clientes', searchTerm, page, pageSize]
  → Cardinalidade ALTA: múltiplas buscas × múltiplas páginas
  → Impacto: CRÍTICO com no-cache

- useContatoById(id): query key = ['contato', id]
  → Cardinalidade MÉDIA: número de contatos
  → Requisitos: Dados muda com frequência? Se não, merecia cache

- useGruposEconomicos(): query key = ['grupos_economicos']
  → Cardinalidade BAIXA: dados raramente mudam
  → Requisitos: DEVERIA ter cache agressivo (1 hora)
```

### ✅ Recomendação

```typescript
// next.config.ts - CORRIGIDO
const nextConfig = {
  async headers() {
    return [
      // 🔒 Rotas autenticadas (admin/app)
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
            // ↑ "private" = só cache do navegador (não CDN público)
            // ↑ "no-store" = não armazenar em disco
          },
        ],
      },
      // 📱 Assets estáticos (JS, CSS, imagens)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
            // ↑ 1 ano de cache (seguro porque são assets hasheados)
          },
        ],
      },
      // 🔑 API routes (dados dinâmicos, mas com revalidação)
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=300, s-maxage=600, stale-while-revalidate=3600',
            // ↑ 5 min browser / 10 min servidor / 1 hora stale
          },
        ],
      },
    ]
  },
}
```

---

## 🔄 PROBLEMA #2: Invalidação de Cache INCOMPLETA e sobre-agressiva

### Localização
- [useClientes.ts](lib/hooks/useClientes.ts#L236)
- [useContatos.ts](lib/hooks/useContatos.ts#L163)
- [useVinculos.ts](lib/hooks/useVinculos.ts#L142)

### ❌ Problema Identificado

```typescript
// useClientes.ts - PADRÃO ATUAL
export function useCreateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cliente: ClienteInsertInput) => {
      // ... inserir cliente
      const { data, error } = await supabase
        .from('crm_clientes')
        .insert(normalized)
        .select()
        .single()
      return data
    },
    onSuccess: () => {
      // ⚠️ PROBLEMA: Invalidar TODA a query 'clientes'
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      // ↑ Isso invalida TODAS as instâncias:
      //   - ['clientes', '', 0, 30]
      //   - ['clientes', 'search termo', 0, 30]
      //   - ['clientes', 'outro termo', 1, 30]
      // ↑ Causa refetch completo de TODAS as páginas/buscas
      toast.success('Cliente criado com sucesso')
    },
  })
}
```

### 💥 Impacto de Cache Poisoning

```
Cenário de Race Condition (CRÍTICO):

T1: Usuário A cria Cliente "ACME Corp"
T2: Supabase confirma insert → ID: 123
T3: Usuário B está vendo lista (page=0) - STALE
T4: A novo cliente INICIA refetch de ['clientes', '', 0, 30]
T5: User B CONCORRENTEMENTE faz mutação (edita cliente 456)
T6: B's invalidate também roda → queryClient.invalidateQueries({ queryKey: ['clientes'] })
T7: RACE: Qual query retorna primeiro?
    - Se B retorna antes → User A vê dados desatualizados
    - Se A retorna antes → User A vê dados corretos MAS
      dados podem não estar sincronizados com User B

RESULTADO: ⚠️ Inconsistência temporária de dados
```

### 📊 Padrão Atual de Invalidação

```typescript
// useVinculos.ts - CASCATA DE INVALIDAÇÕES
onSuccess: (_, variables) => {
  queryClient.invalidateQueries({ queryKey: ['vinculos', variables.cliente_id] })
  // ✋ Bom: específico para o cliente
  queryClient.invalidateQueries({ queryKey: ['vinculos-contato', variables.contato_id] })
  // ✋ Bom: específico para o contato
}

// MAS em useCreateVinculo há lógica DUPLICADA:
try {
  // ... cria relatorio_envios concorrentemente
  // ⚠️ Sem invalidação de relatorio_envios!
  // → STALE DATA: 'relatorio_envios' cache nunca é invalidado
}

// useTags.ts - CASCATA EXCESSIVA
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['all-tags'] })
  queryClient.invalidateQueries({ queryKey: ['clientes'] })
  // ⚠️ Problema: Why invalidate clientes?
  // → Tag é apenas metadado de cliente, não causa mudança no cliente
}
```

### ✅ Recomendação: Estratégia de Invalidação Inteligente

```typescript
// lib/hooks/cache-invalidation.ts - NOVO
/**
 * Estratégia de invalidação por dependência de dados
 * 
 * Cliente
 *   ├─ Tags (ligadas ao cliente)
 *   ├─ Contatos (vinculados)
 *   ├─ Grupo Econômico (referência)
 *   └─ Faturas/Oportunidades (dependem de cliente)
 */

const CACHE_DEPENDENCIES = {
  cliente: {
    creates: ['clientes', 'grupos_economicos', 'relatorio_envios'],
    updates: ['cliente', 'vinculos', 'vinculos-contato'],
    deletes: ['clientes', 'vinculos', 'vinculos-contato'],
  },
  contato: {
    creates: ['contatos', 'relatorio_envios'],
    updates: ['contato', 'vinculos-contato'],
    deletes: ['contatos', 'vinculos', 'vinculos-contato'],
  },
  vinculo: {
    creates: ['vinculos', 'vinculos-contato', 'relatorio_envios'],
    deletes: ['vinculos', 'vinculos-contato', 'relatorio_envios'],
  },
} as const

export function useCreateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cliente: ClienteInsertInput) => {
      // ... insert
    },
    onSuccess: (newCliente) => {
      // ✅ Apenas invalidar queries relevantes (específicas)
      queryClient.invalidateQueries({
        queryKey: ['clientes'], // Essa já é genérica o suficiente
        exact: false, // Permite que ['clientes', ...filter] também seja invalida
      })
      
      // ✅ Otimizado: usar setQueryData para atualizar cache localmente
      // Evita refetch desnecessário
      queryClient.setQueryData(['cliente', newCliente.id], newCliente)
    },
  })
}

export function useUpdateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClienteUpdateInput }) => {
      // ... update
      return updatedCliente
    },
    onSuccess: (updatedCliente, variables) => {
      // ✅ Atualizar dados específicos em cache (sem refetch)
      queryClient.setQueryData(
        ['cliente', variables.id],
        updatedCliente
      )

      // ✅ Invalidar apenas lista genérica se necessário
      queryClient.invalidateQueries({
        queryKey: ['clientes'],
        exact: false,
      })

      // ❌ NÃO invalidar grupos_economicos (não mudou)
      // ❌ NÃO invalidar tags (não mudou)
    },
  })
}

export function useCreateVinculo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vinculo: VinculoInsert) => {
      // ... create vinculo
      // ... create relatorio_envios concorrentemente

      // ✅ Retornar ambos para poder atualizar cache
      return { vinculo, relatorio }
    },
    onSuccess: (result, variables) => {
      // ✅ Invalidar queries relacionadas APENAS
      queryClient.invalidateQueries({
        queryKey: ['vinculos', variables.cliente_id],
        exact: false,
      })
      queryClient.invalidateQueries({
        queryKey: ['vinculos-contato', variables.contato_id],
        exact: false,
      })

      // ✅ IMPORTANTE: Também invalidar relatorio_envios
      // (antes estava faltando!)
      queryClient.invalidateQueries({
        queryKey: ['relatorio_envios'],
        exact: false,
      })
    },
  })
}
```

---

## ⚡ PROBLEMA #3: Race Conditions em Operações Simultâneas

### Localização
- [useGruposEconomicos.ts](lib/hooks/useGruposEconomicos.ts#L70)
- [useCreateVinculo.ts](lib/hooks/useVinculos.ts#L80)

### ❌ Problema: Padrão "Find or Create" não é atômico

```typescript
// useGruposEconomicos.ts - CRÍTICO
export function useGruposEconomicos() {
  const findOrCreateGrupo = useCallback(async (nome: string) => {
    try {
      const nomeTrimmed = nome.trim()

      // T1: Usuário A busca "Grupo XYZ"
      const { data: existingGrupo, error: searchError } = await supabase
        .from('grupos_economicos')
        .select('*')
        .ilike('nome', nomeTrimmed)
        .single()

      if (existingGrupo) {
        return existingGrupo // ← Retorna se encontrar
      }

      // T2: Ainda não encontrou
      // T3: Usuário B TAMBÉM chamou findOrCreateGrupo("Grupo XYZ")
      // T4: B também não encontrou (busca concorrente)
      // T5: Unit A tenta INSERIR "Grupo XYZ" → OK, ID: 100
      // T6: Unit B tenta INSERIR "Grupo XYZ" → ERROR 23505 (conflict)
      
      if (searchError?.code === 'PGRST116') {
        const { data: newGrupo, error: insertError } = await supabase
          .from('grupos_economicos')
          .insert({ nome: nomeTrimmed })
          .select()
          .single()

        if (insertError) {
          // T7: B entra aqui com erro 23505
          if (insertError.code === '23505') {
            // ⚠️ PROBLEMA: B tenta buscar novamente
            // Mas em T3 já não era single!
            const { data: retryGrupo } = await supabase
              .from('grupos_economicos')
              .select('*')
              .ilike('nome', nomeTrimmed)
              .single()
            
            // ✋ Se houver 2+ grupos com nome similar após normalization,
            // isso falharia com "returned more than one row"
            return retryGrupo
          }
          throw insertError
        }

        toast.success(`Grupo econômico "${nomeTrimmed}" criado`)
        return newGrupo
      }

      throw searchError
    } catch (error: any) {
      console.error('Erro ao criar/buscar grupo econômico:', error)
      toast.error('Erro ao processar grupo econômico')
      return null
    }
  }, [])
}
```

### 💥 Cenário de Race Condition

```
T0: Estado inicial = zero "Electrônicos" em DB

T1: Usuário A → findOrCreateGrupo("Eletrônicos")
T2: Usuário B → findOrCreateGrupo("Eletrônicos")

T3: A: SELECT * WHERE nome ILIKE "eletrônicos" → No results
T4: B: SELECT * WHERE nome ILIKE "eletrônicos" → No results
    (query é instantânea, ambos correm antes de A inserir)

T5: A: INSERT INTO grupos_economicos (nome) VALUES ("Eletrônicos") → SUCCESS, ID: 100

T6: B: INSERT INTO grupos_economicos (nome) VALUES ("Eletrônicos") → ERROR 23505
    (constraint violation: nome é unique)

T7: B: SELECT SINGLE * WHERE nome ILIKE "eletrônicos" → Retorna ID: 100
    (funciona, é agora single match)

RESULTADO: ✅ Aparentemente OK, mas:
- Ambos os usuários veem sucesso
- Código é frágil: se .single() retornar >1 resultado → crash
- Sem garantia de atomicidade
```

### ⚠️ Cascata de Efeitos: `useCreateVinculo`

```typescript
// useVinculos.ts - SEGUNDA RACE CONDITION
export function useCreateVinculo() {
  return useMutation({
    mutationFn: async (vinculo: VinculoInsert) => {
      // T1: Criar vínculo cliente-contato
      const { data: vinculoData, error: vinculoError } = await supabase
        .from('crm_clientes_contatos')
        .insert(vinculo)
        .select()
        .single()

      if (vinculoError) throw vinculoError

      // T2: Criar entrada em relatorio_envios (CONCORRENTE?)
      // ⚠️ N Sincronizado! Se relatorio_envios falhar:
      try {
        // T3: Verificar se já existe regist em relatorio_envios
        const { data: existingRelatorio } = await supabase
          .from('relatorio_envios')
          .select('id')
          .eq('cliente_id', vinculo.cliente_id)
          .eq('contato_id', vinculo.contato_id)
          .maybeSingle()

        // T4: User A AQUI entra
        // T5: Outro user B começa operação no mesmo cliente/contato
        // T6: T5: B é mais rápido e INSERE em relatorio_envios primeiro
        // T7: A: INSERT... → ERROR 23505 (duplicate)

        if (!existingRelatorio) {
          const { error: relatorioError } = await supabase
            .from('relatorio_envios')
            .insert({...})
          
          // ⚠️ Aviso silencioso! Não falha a operação principal
          if (relatorioError) {
            console.warn('⚠️ Aviso ao criar relatório:', relatorioError)
            // Continua mesmo com erro → STALE DATA
          }
        }
      } catch (error) {
        console.warn('⚠️ Aviso na criação do relatório:', error)
        // ⚠️ Silêncio completo! Dados podem ficar inconsistentes
      }

      return vinculoData
    },
  })
}
```

### ✅ Recomendação: Usar Supabase RPC ou Transações

```typescript
// supabase/migrations/xxx_create_atomic_operations.sql
-- BASE DE DADOS: Operações ATÔMICAS

-- Função para find_or_create com garantia de atomicidade
CREATE OR REPLACE FUNCTION find_or_create_grupo_economico(
  p_nome TEXT
)
RETURNS TABLE (id UUID, nome TEXT) AS $$
BEGIN
  -- Try INSERT first (more efficient)
  INSERT INTO grupos_economicos (nome)
  VALUES (p_nome)
  ON CONFLICT (nome) DO NOTHING
  RETURNING grupos_economicos.id, grupos_economicos.nome;
  
  -- If already existed, just return it
  IF NOT FOUND THEN
    SELECT ge.id, ge.nome INTO id, nome
    FROM grupos_economicos ge
    WHERE ge.nome = p_nome;
  END IF;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo não encontrado';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Função para create_vinculo com relatorio_envios em transação
CREATE OR REPLACE FUNCTION create_vinculo_with_relatorio(
  p_cliente_id UUID,
  p_contato_id UUID,
  p_contato_principal BOOLEAN,
  p_cargo TEXT
)
RETURNS TABLE (vinculo_id UUID, relatorio_id UUID) AS $$
DECLARE
  v_vinculo_id UUID;
  v_relatorio_id UUID;
  v_contato_nome TEXT;
BEGIN
  -- Create vínculo
  INSERT INTO crm_clientes_contatos (
    cliente_id, contato_id, contato_principal, cargo_no_cliente
  )
  VALUES (p_cliente_id, p_contato_id, p_contato_principal, p_cargo)
  RETURNING crm_clientes_contatos.id INTO v_vinculo_id;

  -- Get contato name for relatorio
  SELECT nome_completo INTO v_contato_nome
  FROM crm_contatos
  WHERE id = p_contato_id;

  -- Create relatorio_envios (atomic with vínculo)
  INSERT INTO relatorio_envios (
    cliente_id, contato_id, nome_falado_dono, status_envio
  )
  VALUES (
    p_cliente_id,
    p_contato_id,
    CASE 
      WHEN p_contato_principal THEN v_contato_nome
      ELSE v_contato_nome || ' (Contato-Vinculado)'
    END,
    'pendente'
  )
  RETURNING relatorio_envios.id INTO v_relatorio_id;

  RETURN QUERY SELECT v_vinculo_id, v_relatorio_id;
END;
$$ LANGUAGE plpgsql;

-- Usage in TypeScript
export function useCreateVinculo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vinculo: VinculoInsert) => {
      // ✅ ATOMIC: Ambos inserem ou ambos falham
      const { data, error } = await (supabase as any).rpc(
        'create_vinculo_with_relatorio',
        {
          p_cliente_id: vinculo.cliente_id,
          p_contato_id: vinculo.contato_id,
          p_contato_principal: vinculo.contato_principal || false,
          p_cargo: vinculo.cargo_no_cliente || null,
        }
      )

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['vinculos', variables.cliente_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['vinculos-contato', variables.contato_id],
      })
    },
  })
}
```

---

## 🔑 PROBLEMA #4: Chaves de Cache com Cardinalidade Inadequada

### Localização
- [useClientes.ts](lib/hooks/useClientes.ts#L50)
- [useContatos.ts](lib/hooks/useContatos.ts#L12)

### ❌ Problema Identificado

```typescript
// ALTA CARDINALIDADE - Criar muitas chaves diferentes
export function useClientesList(searchTerm = '', page = 0, pageSize = 30) {
  return useQuery({
    queryKey: ['clientes', searchTerm, page, pageSize],
    //        ↑         ↑             ↑      ↑
    //        |         |             |      |
    //        base      searchTerm   page    size
    // Possibilidades:
    // ['clientes', '', 0, 30]
    // ['clientes', '', 1, 30]
    // ['clientes', '', 2, 30]
    // ['clientes', 'ACME', 0, 30]    (50+ empresas = 50+ chaves)
    // ['clientes', 'SOLAR', 0, 30]   (etc)
    // ['clientes', 'Tech', 0, 30]
    //
    // Cardinalidade = número_de_páginas × número_de_buscas
    //               ≈ 10 páginas × 50 buscas recentes
    //               ≈ 500+ chaves SIMULTÂNEAS no React Query cache

    staleTime: 2 * 60 * 1000, // ⚠️ Muito curto!
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // ... fetch
    },
  })
}

export function useContatosList(searchTerm = '') {
  return useQuery({
    queryKey: ['contatos', searchTerm],
    //        ↑           ↑
    // Possibilidades:
    // ['contatos', '']
    // ['contatos', 'Maria']
    // ['contatos', 'João']
    // ... 100+ nomes populares
    //
    // Cardinalidade = número_de_buscas
    //              ≈ 30+ contatos

    staleTime: 2 * 60 * 1000, // ⚠️ Subesperado para dados raramente mutáveis
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // ...
    },
    enabled: !!id,
  })
}
```

### 📊 Impacto de Cardinalidade

```
Memória do React Query Cache:

Cada entrada: ~2-5 KB (dados + metadados)

✅ Suposição otimista: 
  500 chaves × 3 KB = 1.5 MB (razoável)

❌ Realidade com usuário ativo:
  - Busca por "A" → cache 10 páginas
  - Busca por "ACME" → cache 5 páginas
  - Busca por "eletrônicos" → cache 8 páginas
  - Volta pra "A" (já stale, refetch!) → 10+ páginas
  - Cada refetch = NOVO dado + cache antigo não é limpo imediatamente
  
  Resultado: 1500+ chaves, 5+ MB de RAM por aberta
  
⚠️ Com 10 abas abertas? 50 MB apenas do cache
⚠️ Múltiplos usuários? Servidor fica sobrecarregado
```

### ✅ Recomendação: Normalizar Cardinalidade

```typescript
// lib/hooks/useClientes.ts - OPTIMIZADO
const CLIENTES_PAGE_SIZE = 30 // Constante global

export function useClientesList(searchTerm = '', page = 0) {
  // ✅ REDUZIR: Remover pageSize da query key (usar constante)
  return useQuery({
    queryKey: ['clientes', searchTerm, page],
    //        ↑         ↑             ↑
    //        Base      Filter        Page
    
    staleTime: 5 * 60 * 1000, // ✅ 5 minutos (mais realista)
    gcTime: 15 * 60 * 1000,  // ✅ 15 minutos
    
    queryFn: async () => {
      const from = page * CLIENTES_PAGE_SIZE
      const to = from + CLIENTES_PAGE_SIZE - 1
      
      // ... fetch com CLIENTES_PAGE_SIZE
    },
  })
}

export function useContatosList(searchTerm = '') {
  return useQuery({
    queryKey: ['contatos', searchTerm],
    
    staleTime: 10 * 60 * 1000, // ✅ 10 minutos (dados raramente mudam)
    gcTime: 30 * 60 * 1000,   // ✅ 30 minutos
    
    queryFn: async () => {
      // ... fetch
    },
  })
}

// ✅ BONUS: Usar React Query Filters para invalidação inteligente
export function useCreateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    // ...
    onSuccess: () => {
      // ✅ Invalida TODAS as variações de ['clientes', ...] de uma vez
      queryClient.invalidateQueries({
        queryKey: ['clientes'],
        type: 'all', // inclusive stale queries
      })
      
      // Evita refetch desnecessário de páginas que não mudarão
      // (ex: página 5 de busca por ACME provavelmente nem tem novos registros)
    },
  })
}

// ✅ BONUS: Query Key Factory (melhor prática)
export const clienteKeys = {
  all: ['clientes'] as const,
  lists: () => [...clienteKeys.all, 'list'] as const,
  list: (searchTerm: string, page: number) =>
    [...clienteKeys.lists(), { searchTerm, page }] as const,
  details: () => [...clienteKeys.all, 'detail'] as const,
  detail: (id: string) => [...clienteKeys.details(), id] as const,
}

// Uso:
// useQuery({ queryKey: clienteKeys.list('', 0), ... })
// queryClient.invalidateQueries({ queryKey: clienteKeys.all })
// queryClient.invalidateQueries({ queryKey: clienteKeys.lists() })
```

---

## 🌐 PROBLEMA #5: Falta de Cache Busting Inteligente (ETags, Last-Modified)

### ❌ Problema: Sem Revalidação Eficiente

```
Padrão atual:
1. Browser pede: GET /api/clientes
2. Servidor retorna: 200 OK + dados completos (20KB)
3. 2 minutos depois...
4. Browser pede: GET /api/clientes (denovo!)
5. Servidor retorna: 200 OK + dados completos (20KB) — mesmos dados!

Problema:
- Transferência: 40KB pior caso
- Sem aproveitamento de cache intermediário
- Sem validação eficiente
```

### ✅ Recomendação: Implementar ETags

```typescript
// lib/supabase/client.ts - INTERCEPTAR RESPOSTAS
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

let etagCache = new Map<string, string>() // URL -> ETag

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// ✅ Wrapper para fetch com suporte a ETag
export async function cachedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const storedETag = etagCache.get(url)
  
  const headers = new Headers(options?.headers)
  if (storedETag) {
    headers.set('If-None-Match', storedETag)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 304) {
    // Not Modified — dados no browser ainda estão válidos
    console.log(`✅ 304 Not Modified: ${url}`)
    return response
  }

  const newETag = response.headers.get('ETag')
  if (newETag) {
    etagCache.set(url, newETag)
  }

  return response
}
```

---

## 📋 Resumo de Correções Prioritárias

| Prioridade | Problema | Impacto | Esforço | Solução |
|-----------|----------|--------|--------|---------|
| **CRÍTICO** | Headers no-cache tudo | Sem cache any | 2h | Diferenciar por rota |
| **CRÍTICO** | Race conditions (find_or_create) | Data inconsistency | 4h | Usar RPC Supabase |
| **ALTO** | Invalidação cascata | Performance | 3h | Implementar deps |
| **ALTO** | Cardinalidade alta | Memory leak | 2h | Remover pageSize key |
| **MÉDIO** | Sem ETags | Banda desperdiçada | 4h | Adicionar ETag check |

---

## 🛠️ Checklist de Implementação

- [ ] Corrigir headers HTTP (separar por rota)
- [ ] Criar `cache-invalidation.ts` com strategy
- [ ] Migrar find_or_create para RPC atômico
- [ ] Migração: criar_vinculo_with_relatorio RPC
- [ ] Reduzir cardinalidade de query keys
- [ ] Implementar React Query Key Factory
- [ ] Adicionar suporte a ETag no cliente
- [ ] Testar race conditions com Playwright
- [ ] Monitorar memória React Query em produção
- [ ] Documentar estratégia de cache

---

**Próximos passos:** Implementação começando pelo PROBLEMA #1 (headers HTTP)
