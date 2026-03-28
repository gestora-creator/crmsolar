# 🔧 Plano de Implementação - Correções de Cache

## Fase 1: Headers HTTP (2-3 horas)

### 1.1 Corrigir `next.config.ts`

```typescript
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async headers() {
    return [
      // 🔒 HTML dinâmico (sempre valida no servidor)
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'Accept', value: '.*text/html.*' }],
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },

      // 📦 Assets estáticos (JS/CSS com hash)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'ETag',
            value: '"\${hash}"', // Next.js adiciona automaticamente
          },
        ],
      },

      // 🖼️ Imagens otimizadas
      {
        source: '/_next/image/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, stale-while-revalidate=120',
          },
        ],
      },

      // 🔑 API Routes com dados dinâmicos
      {
        source: '/api/oportunidades/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=300, s-maxage=600, stale-while-revalidate=3600',
            // browser: 5 min / edge: 10 min / stale: 1 hora
          },
          {
            key: 'Vary',
            value: 'Authorization, Accept-Encoding',
          },
        ],
      },

      // 📋 API Routes com dados de referência (mudam pouco)
      {
        source: '/api/grupos-economicos/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=3600, s-maxage=7200, stale-while-revalidate=86400',
            // browser: 1 hora / edge: 2 horas / stale: 1 dia
          },
        ],
      },

      // ⚠️ Remover o catch-all agressivo
      // {
      //   source: '/:path*{/}?',
      //   headers: [{
      //     key: 'Cache-Control',
      //     value: 'no-cache, no-store, must-revalidate',
      //   }],
      // },
    ]
  },
}

export default nextConfig
```

### 1.2 Simplificar `middleware.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirecionar se não autenticado
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/tv') &&
    !request.nextUrl.pathname.startsWith('/api/tv') &&
    !request.nextUrl.pathname.startsWith('/_next') &&
    !request.nextUrl.pathname.startsWith('/favicon')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // ✅ REMOVIDO: Headers agressivos (agora em next.config.ts)
  // next.config.ts já cuida dos headers baseado na rota

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## Fase 2: React Query Cache Keys (2-3 horas)

### 2.1 Criar `lib/hooks/query-keys.ts`

```typescript
// Factory pattern para query keys (TanStack recomenda)

export const queryKeys = {
  // CLIENTES
  clientes: {
    all: ['clientes'] as const,
    lists: () => [...queryKeys.clientes.all, 'list'] as const,
    list: (filter: { searchTerm?: string; page?: number }) =>
      [...queryKeys.clientes.lists(), filter] as const,
    details: () => [...queryKeys.clientes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.clientes.details(), id] as const,
  },

  // CONTATOS
  contatos: {
    all: ['contatos'] as const,
    lists: () => [...queryKeys.contatos.all, 'list'] as const,
    list: (searchTerm?: string) => [...queryKeys.contatos.lists(), searchTerm] as const,
    details: () => [...queryKeys.contatos.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.contatos.details(), id] as const,
  },

  // VÍNCULOS
  vinculos: {
    all: ['vinculos'] as const,
    byCliente: (clienteId: string) => [...queryKeys.vinculos.all, 'por-cliente', clienteId] as const,
    byContato: (contatoId: string) => [...queryKeys.vinculos.all, 'por-contato', contatoId] as const,
  },

  // GRUPOS ECONÔMICOS
  grupos: {
    all: ['grupos-economicos'] as const,
  },

  // TAGS
  tags: {
    all: ['tags'] as const,
  },

  // RELATÓRIOS
  relatorios: {
    all: ['relatorios'] as const,
    envios: () => [...queryKeys.relatorios.all, 'envios'] as const,
  },
} as const
```

### 2.2 Atualizar `lib/hooks/useClientes.ts`

```typescript
import { queryKeys } from './query-keys'

// ... outras imports

export function useClientesList(searchTerm = '', page = 0, pageSize = 30) {
  return useQuery({
    // ✅ Usar factory ao invés de array literal
    queryKey: queryKeys.clientes.list({ searchTerm, page }),

    staleTime: 5 * 60 * 1000, // ✅ Aumentado para 5 min
    gcTime: 15 * 60 * 1000,   // ✅ Aumentado para 15 min

    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('crm_clientes')
        .select('*, grupo_economico:grupos_economicos(id, nome)', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(from, to)

      if (searchTerm) {
        // ... search logic
      }

      const { data, error, count } = await query

      if (error) throw error

      return {
        clientes: data,
        total: count || 0,
      }
    },
  })
}

export function useCreateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (cliente: ClienteInsertInput) => {
      // ... mutation logic
      const { data, error } = await supabase
        .from('crm_clientes')
        .insert(normalized)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (newCliente) => {
      // ✅ Usar query key factory para invalidação
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.all,
        exact: false, // Invalida ['clientes'] e todas as variações
      })

      // ✅ Bonus: Adicionar ao cache para evitar re-fetch
      queryClient.setQueryData(
        queryKeys.clientes.detail(newCliente.id),
        newCliente
      )

      toast.success('Cliente criado com sucesso')
    },
  })
}

export function useUpdateCliente() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClienteUpdateInput }) => {
      // ... update logic
      const { data: updated, error } = await supabase
        .from('crm_clientes')
        .update(normalized)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated
    },
    onSuccess: (updatedCliente, variables) => {
      // ✅ Atualizar cache diretamente (sem refetch)
      queryClient.setQueryData(
        queryKeys.clientes.detail(variables.id),
        updatedCliente
      )

      // ✅ Invalidar lista para refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.lists(),
        exact: false,
      })

      toast.success('Cliente atualizado com sucesso')
    },
  })
}
```

---

## Fase 3: Race Conditions (4-5 horas)

### 3.1 Criar RPC no Supabase

Arquivo: `supabase/migrations/20260328000000_atomic_operations.sql`

```sql
-- ✅ Find or Create com atomicidade garantida
CREATE OR REPLACE FUNCTION find_or_create_grupo_economico(
  p_nome TEXT
)
RETURNS TABLE (id UUID, nome TEXT, created_at TIMESTAMP, updated_at TIMESTAMP) AS $$
BEGIN
  -- Try to return existing grupo if it exists
  RETURN QUERY
  SELECT ge.id, ge.nome, ge.created_at, ge.updated_at
  FROM grupos_economicos ge
  WHERE LOWER(TRIM(ge.nome)) = LOWER(TRIM(p_nome))
  LIMIT 1;
  
  -- If no result, insert and return
  IF NOT FOUND THEN
    INSERT INTO grupos_economicos (nome)
    VALUES (TRIM(p_nome))
    ON CONFLICT (nome) DO NOTHING
    RETURNING grupos_economicos.id, grupos_economicos.nome, 
              grupos_economicos.created_at, grupos_economicos.updated_at;
    
    -- If still nothing (race condition won), fetch the winner's insert
    IF NOT FOUND THEN
      RETURN QUERY
      SELECT ge.id, ge.nome, ge.created_at, ge.updated_at
      FROM grupos_economicos ge
      WHERE LOWER(TRIM(ge.nome)) = LOWER(TRIM(p_nome))
      LIMIT 1;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ✅ Create vinculo + relatorio atomicamente
CREATE OR REPLACE FUNCTION create_vinculo_with_relatorio(
  p_cliente_id UUID,
  p_contato_id UUID,
  p_contato_principal BOOLEAN DEFAULT FALSE,
  p_cargo TEXT DEFAULT NULL
)
RETURNS TABLE (
  vinculo_id UUID,
  relatorio_id UUID
) AS $$
DECLARE
  v_vinculo_id UUID;
  v_relatorio_id UUID;
  v_contato_nome TEXT;
BEGIN
  -- Create vínculo
  INSERT INTO crm_clientes_contatos (
    cliente_id,
    contato_id,
    contato_principal,
    cargo_no_cliente
  )
  VALUES (p_cliente_id, p_contato_id, p_contato_principal, p_cargo)
  RETURNING crm_clientes_contatos.id INTO v_vinculo_id;

  -- Get contato name
  SELECT nome_completo INTO v_contato_nome
  FROM crm_contatos
  WHERE id = p_contato_id;

  -- Create relatorio atomically
  INSERT INTO relatorio_envios (
    cliente_id,
    contato_id,
    nome_falado_dono,
    status_envio,
    viewed
  )
  VALUES (
    p_cliente_id,
    p_contato_id,
    CASE 
      WHEN p_contato_principal THEN v_contato_nome
      ELSE v_contato_nome || ' (Contato-Vinculado)'
    END,
    'pendente',
    FALSE
  )
  RETURNING relatorio_envios.id INTO v_relatorio_id;

  RETURN QUERY SELECT v_vinculo_id, v_relatorio_id;
END;
$$ LANGUAGE plpgsql;
```

### 3.2 Atualizar `lib/hooks/useGruposEconomicos.ts`

```typescript
import { queryKeys } from './query-keys'

export function useGruposEconomicos() {
  const [grupos, setGrupos] = useState<GrupoEconomico[]>([])
  const [loading, setLoading] = useState(false)

  const fetchGrupos = useCallback(async (search?: string) => {
    try {
      setLoading(true)
      let query = supabase
        .from('grupos_economicos')
        .select('*')
        .order('nome', { ascending: true })

      if (search) {
        query = query.ilike('nome', `%${search}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setGrupos(data || [])
      return data || []
    } catch (error: any) {
      console.error('Erro ao buscar grupos econômicos:', error)
      toast.error('Erro ao buscar grupos econômicos')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // ✅ NOVO: Usar RPC para atomicidade
  const findOrCreateGrupo = useCallback(async (nome: string): Promise<GrupoEconomico | null> => {
    try {
      const nomeTrimmed = nome.trim()

      if (!nomeTrimmed) {
        return null
      }

      // ✅ Usar RPC ao invés de lógica no cliente
      const { data, error } = await (supabase as any).rpc(
        'find_or_create_grupo_economico',
        { p_nome: nomeTrimmed }
      )

      if (error) throw error

      if (data && data.length > 0) {
        const grupo = data[0] as GrupoEconomico
        toast.success(`Grupo econômico "${nomeTrimmed}" pronto`)
        return grupo
      }

      return null
    } catch (error: any) {
      console.error('Erro ao criar/buscar grupo econômico:', error)
      toast.error('Erro ao processar grupo econômico')
      return null
    }
  }, [])

  // ... resto do código
}
```

### 3.3 Atualizar `lib/hooks/useVinculos.ts`

```typescript
import { queryKeys } from './query-keys'

export function useCreateVinculo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vinculo: VinculoInsert) => {
      console.log('🔵 useCreateVinculo - Dados recebidos:', vinculo)

      // ✅ Usar RPC para garantir atomicidade
      const { data, error } = await (supabase as any).rpc(
        'create_vinculo_with_relatorio',
        {
          p_cliente_id: vinculo.cliente_id,
          p_contato_id: vinculo.contato_id,
          p_contato_principal: vinculo.contato_principal || false,
          p_cargo: vinculo.cargo_no_cliente || null,
        }
      )

      if (error) {
        console.error('🔴 Erro ao criar vínculo:', error)
        throw error
      }

      console.log('🟢 Vínculo e relatório criados atomicamente:', data)

      return data
    },
    onSuccess: (result, variables) => {
      console.log('✅ onSuccess - Vínculo criado')

      // ✅ Usar query key factory
      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.byCliente(variables.cliente_id),
        exact: true,
      })

      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.byContato(variables.contato_id),
        exact: true,
      })

      // ✅ Também invalidar relatórios
      queryClient.invalidateQueries({
        queryKey: queryKeys.relatorios.envios(),
        exact: false,
      })

      toast.success('Vínculo criado com sucesso')
    },
    onError: (error: any) => {
      console.error('🔴 onError capturado:', error)
      if (error.code === '23505') {
        toast.error('Este contato já está vinculado a este cliente')
      } else {
        const message = error?.message || 'Erro ao vincular contato'
        toast.error(message)
      }
    },
  })
}
```

---

## Fase 4: Validação (2 horas)

### 4.1 Teste de Race Conditions

Arquivo: `tests/e2e/cache-race-conditions.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Race Conditions - Cache Consistency', () => {
  test('find_or_create_grupo should handle concurrent requests', async ({ browser }) => {
    // Criar 2 contextos simultâneos
    const context1 = await browser.newContext()
    const page1 = await context1.newPage()

    const context2 = await browser.newContext()
    const page2 = await context2.newPage()

    // Ambos navegam para a página
    await page1.goto('http://localhost:3000/app/clientes')
    await page2.goto('http://localhost:3000/app/clientes')

    // Ambos tentam criar novo grupo "TESTE-RACE" simultaneamente
    const promise1 = page1.evaluate(() => {
      // Simular chamada RPC
      return fetch('/api/create-grupo', {
        method: 'POST',
        body: JSON.stringify({ nome: 'TESTE-RACE' }),
      }).then((r) => r.json())
    })

    const promise2 = page2.evaluate(() => {
      return fetch('/api/create-grupo', {
        method: 'POST',
        body: JSON.stringify({ nome: 'TESTE-RACE' }),
      }).then((r) => r.json())
    })

    const [result1, result2] = await Promise.all([promise1, promise2])

    // ✅ AMBOS devem retornar o MESMO ID
    expect(result1.id).toBe(result2.id)
    expect(result1.nome).toBe('TESTE-RACE')
    expect(result2.nome).toBe('TESTE-RACE')

    await context1.close()
    await context2.close()
  })

  test('vinculo creation should atomically create relatorio', async ({ page }) => {
    await page.goto('http://localhost:3000/app/clientes')

    // Criar vínculo
    const response = await page.evaluate(() => {
      return fetch('/api/create-vinculo', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: 'test-client-id',
          contatoId: 'test-contato-id',
        }),
      }).then((r) => r.json())
    })

    // ✅ Ambos vindas devem ter IDs
    expect(response.vinculo_id).toBeTruthy()
    expect(response.relatorio_id).toBeTruthy()

    // ✅ Verificar que ambos foram criados
    const verificacao = await page.evaluate(
      (vinculoId) => {
        return Promise.all([
          fetch(`/api/vinculo/${vinculoId}`).then((r) => r.json()),
          fetch(`/api/relatorio-envios`).then((r) => r.json()),
        ])
      },
      response.vinculo_id
    )

    expect(verificacao[0]).toBeTruthy() // vínculo existe
    expect(verificacao[1].length).toBeGreaterThan(0) // relatorio existe
  })
})
```

---

## Checklist de Implementação

```
Fase 1: Headers HTTP
[ ] Atualizar next.config.ts
[ ] Simplificar middleware.ts
[ ] Testar cache headers com curl/DevTools
[ ] Medir economia de banda antes/depois

Fase 2: Query Keys
[ ] Criar lib/hooks/query-keys.ts
[ ] Atualizar useClientes.ts
[ ] Atualizar useContatos.ts
[ ] Atualizar useVinculos.ts
[ ] Atualizar useTags.ts

Fase 3: Race Conditions
[ ] Executar migrations RPC
[ ] Atualizar useGruposEconomicos.ts
[ ] Atualizar useCreateVinculo()
[ ] Remover lógica manual "find-or-create"
[ ] Remover try-catch silencioso em relatorio_envios

Fase 4: Validação
[ ] Executar testes E2E
[ ] Monitorar memory no React Query
[ ] Load testing com 50 usuários simultâneos
[ ] Verificar cache misses com Network tab
```

**Tempo total estimado:** 11-15 horas
