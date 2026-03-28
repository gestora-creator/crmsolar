# 🚀 Fase 3 - Quick Start Guide for Developers

## 📖 TL;DR (30 segundos)

**Fase 3 mudou como o Cache funciona no CRM SOLAR:**

| Aspecto | Antes | Depois |
|--------|-------|--------|
| Query Keys | `['clientes', searchTerm, page]` | `queryKeys.clientes.list(searchTerm, page)` |
| Invalidation | `invalidateQueries(['clientes'])` = 15-30 refetches | `invalidateQueries(queryKeys.clientes.lists())` = 1-2 refetches |
| Performance | 7-9s por edição | 0.3s por edição |

**4 Mudanças Principais:**
1. ✅ Novo arquivo: `lib/hooks/query-keys.ts` (Query Key Factory)
2. ✅ 5 hooks refatorados: useClientes, useContatos, useVinculos, useTags, useRelatorios
3. ✅ Fase 1 já aplicada: next.config.ts com stale-while-revalidate
4. ✅ Fase 2 já aplicada: RPC atômico para evitar race conditions

---

## 🎯 Se você está aqui por que...

### ❓ "Preciso adicionar novo hook com cache"
→ [Siga o padrão](#-como-criar-novo-hook-com-query-keys)

### ❓ "Preciso entender como funciona o cache agora"
→ [Leia a arquitetura](#-arquitetura-do-query-key-factory)

### ❓ "Preciso debugar um problema de cache"
→ [Use React Query DevTools](#-como-debugar-cache-com-devtools)

### ❓ "Preciso entender antes/depois"
→ [Leia FASE_3_BEFORE_AFTER.md](./FASE_3_BEFORE_AFTER.md)

---

## 📚 Arquitetura do Query Key Factory

### Estrutura (Exemplo: Clientes)

```typescript
// Em lib/hooks/query-keys.ts
export const queryKeys = {
  clientes: {
    // Level 1: Tudo relacionado a clientes
    all: ['clientes'] as const,
    
    // Level 2: Todas as LISTAS de clientes
    lists: () => [...queryKeys.clientes.all, 'list'] as const,
    
    // Level 3: Uma LISTA específica (com filtros)
    list: (searchTerm?: string, page?: number) =>
      [...queryKeys.clientes.lists(), { searchTerm, page }] as const,
    
    // Level 2: Todos os DETALHES de clientes
    details: () => [...queryKeys.clientes.all, 'detail'] as const,
    
    // Level 3: Um DETALHE específico
    detail: (id: string) => 
      [...queryKeys.clientes.details(), id] as const,
  },
}

// Resultado prático:
queryKeys.clientes.all           → ['clientes']
queryKeys.clientes.lists()       → ['clientes', 'list']
queryKeys.clientes.list('x', 1)  → ['clientes', 'list', { search: 'x', page: 1 }]
queryKeys.clientes.detail('123') → ['clientes', 'detail', '123']
```

### Por Que Essa Estrutura?

```typescript
// Invalidação inteligente é possível porque:

// ✅ Invalida uma lista específica
queryClient.invalidateQueries({
  queryKey: queryKeys.clientes.list('search', 1),  // Exato
})

// ✅ Invalida TODAS as listas (mas não detalhes)
queryClient.invalidateQueries({
  queryKey: queryKeys.clientes.lists(),  // Padrão
  exact: false,  // ← Permite subsets
})

// ✅ Invalida detalhes de um cliente
queryClient.removeQueries({
  queryKey: queryKeys.clientes.detail('123'),
})

// ❌ EVITA cascatas: não toca em outros recursos
// queryKeys.contatos, queryKeys.vinculos, etc. mantêm cache
```

---

## 🧩 Como Criar Novo Hook com Query Keys

### Passo 1: Adicionar Query Keys

```typescript
// Em lib/hooks/query-keys.ts

export const queryKeys = {
  // ... clientes, contatos, vinculos, tags, relatorios
  
  // Novo recurso: exemplo "invoices"
  invoices: {
    all: ['invoices'] as const,
    lists: () => [...queryKeys.invoices.all, 'list'] as const,
    list: (clienteId?: string, status?: string) =>
      [...queryKeys.invoices.lists(), { clienteId, status }] as const,
    details: () => [...queryKeys.invoices.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.invoices.details(), id] as const,
  },
}
```

### Passo 2: Criar Hook com Padrão

```typescript
// Em lib/hooks/useInvoices.ts

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

// Query Hook - PADRÃO
export function useInvoicesList(clienteId?: string, status?: string) {
  return useQuery({
    queryKey: queryKeys.invoices.list(clienteId, status),  // ✅ Factory
    staleTime: 5 * 60 * 1000,  // 5 minutos
    gcTime: 15 * 60 * 1000,    // 15 minutos (antes: 5)
    queryFn: async () => {
      let query = supabase.from('invoices').select('*')
      
      if (clienteId) query = query.eq('cliente_id', clienteId)
      if (status) query = query.eq('status', status)
      
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

// Detail Query - PADRÃO
export function useInvoiceById(id: string) {
  return useQuery({
    queryKey: queryKeys.invoices.detail(id),  // ✅ Factory
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

// Create Mutation - PADRÃO INTELIGENTE
export function useCreateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (invoice: any) => {
      const { data, error } = await supabase
        .from('invoices')
        .insert(invoice)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (newInvoice) => {
      // 1. Adicionar novo item ao cache (sem refetch)
      queryClient.setQueryData(
        queryKeys.invoices.detail(newInvoice.id),
        newInvoice
      )

      // 2. Invalidar apenas listas (não cascata)
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.lists(),
        exact: false,
      })

      toast.success('Fatura criada com sucesso')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar fatura')
    },
  })
}

// Update Mutation - PADRÃO INTELIGENTE
export function useUpdateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: updated, error } = await supabase
        .from('invoices')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return updated
    },
    onSuccess: (updatedInvoice, variables) => {
      // 1. Atualizar detalhe com dados frescos
      queryClient.setQueryData(
        queryKeys.invoices.detail(variables.id),
        updatedInvoice
      )

      // 2. Invalidar listas
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.lists(),
        exact: false,
      })

      toast.success('Fatura atualizada com sucesso')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar fatura')
    },
  })
}

// Delete Mutation - PADRÃO INTELIGENTE
export function useDeleteInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      // 1. Remover detalhe
      queryClient.removeQueries({
        queryKey: queryKeys.invoices.detail(id),
      })

      // 2. Invalidar listas
      queryClient.invalidateQueries({
        queryKey: queryKeys.invoices.lists(),
        exact: false,
      })

      toast.success('Fatura excluída com sucesso')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir fatura')
    },
  })
}
```

### Passo 3: Usar no Componente

```typescript
// Em components/invoices/InvoicesList.tsx

import { useInvoicesList, useDeleteInvoice } from '@/lib/hooks/useInvoices'

export function InvoicesList() {
  const { data: invoices, isLoading } = useInvoicesList(
    clienteId,  // Filtro
    'pagina'    // Status
  )
  const deleteMutation = useDeleteInvoice()

  return (
    <div>
      {invoices?.map(invoice => (
        <div key={invoice.id}>
          {invoice.numero}
          <button
            onClick={() => deleteMutation.mutate(invoice.id)}
            disabled={deleteMutation.isPending}
          >
            Deletar
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

## 🐛 Como Debugar Cache com DevTools

### Instalação (1x)

```bash
# Chrome DevTools para React Query
# https://chrome.google.com/webstore/detail/tanstack-query-devtools/...
```

### Usage

```
1. Abrir Chrome DevTools (F12)
2. Tab "React Query" aparece
3. Visualizar:
   ├─ Todas as queries ativas
   ├─ Estado: idle, loading, error, success
   ├─ Stale/Fresh status
   ├─ Cache times
   ├─ Query keys exatos
   └─ Data cached

4. Para invalidar manualmente (teste):
   ├─ Click "Refetch" no DevTools
   └─ Ver Nova request no Network tab
```

### Exemplo Real

```
DevTools mostra:
├─ ['clientes', 'list', { searchTerm: 'Amazon', page: 1 }]
│  └─ Status: fresh (loaded 2 min ago)
│  └─ Stale-Time: 5 min (estará stale em 3 min)
│  └─ GC Time: 15 min (será removido se não usado em 15 min)
│
├─ ['clientes', 'detail', '123']
│  └─ Status: fresh
│  └─ Data: { id: '123', name: 'Amazon', ... }
│
└─ ['vinculos', 'por-cliente', '123']
   └─ Status: fresh
   └─ Refetch status: idle (não vai refetchar automaticamente)
```

---

## ⚡ Quick Reference

### Padrões Comuns

**Invalidação Inteligente:**
```typescript
// ✅ Correto: Invalida apenas uma lista específica
queryClient.invalidateQueries({
  queryKey: queryKeys.clientes.list('search', 1)
})

// ✅ Correto: Invalida TODAS as listas
queryClient.invalidateQueries({
  queryKey: queryKeys.clientes.lists(),
  exact: false,
})

// ❌ Evitar: Cascata antiga
queryClient.invalidateQueries({ queryKey: ['clientes'] })
// ^^ Esto invalida tudo, não use mais!
```

**Atualização de Cache:**
```typescript
// ✅ Correto: Atualizar sem refetch
queryClient.setQueryData(
  queryKeys.clientes.detail(id),
  updatedData
)

// ❌ Evitar: Invalidar (força refetch)
queryClient.invalidateQueries({ queryKey: queryKeys.clientes.detail(id) })
```

**Remoção do Cache:**
```typescript
// ✅ Correto: Remover quando deletar
queryClient.removeQueries({
  queryKey: queryKeys.clientes.detail(id)
})
```

---

## 📋 Conversão: Como Migrar Hook Existente

Se você tem um hook antigo:

```typescript
// ❌ ANTES
export function useOldHook() {
  return useQuery({
    queryKey: ['some-old-key', param1, param2],  // ← Não centralizado
    queryFn: async () => { ... },
  })
}

// Migração:
// 1. Adicionar em query-keys.ts
// 2. Import queryKeys no hook
// 3. Trocar queryKey: ['...'] → queryKey: queryKeys.resource.operation()
// 4. Atualizar invalidateQueries para patterns inteligentes
// 5. Testar tudo
```

---

## 🆘 FAQ / Troubleshooting

### P: "Meu cache não está invalidando quando edito"
**R:** Verifique se você está chamando:
```typescript
queryClient.invalidateQueries({
  queryKey: queryKeys.recurso.lists(),  // ← Não esqueça de chamar lists()
  exact: false,
})
```

### P: "Como verificar se está usando cache?"
**R:** 
1. Abrir React Query DevTools
2. DevTools mostra "hit" quando pega do cache
3. Network tab não mostra nova request

### P: "Achei que cache deveria durar 5 minutos, mas refetchou em 1 minuto"
**R:** Pode ser por que a query ficou "stale" (1 min default). Aumentar `staleTime`:
```typescript
useQuery({
  queryKey: ...,
  staleTime: 5 * 60 * 1000,  // ← Aumentar para 5 min
  queryFn: ...,
})
```

### P: "Memory está crescendo muito"
**R:** Aumentar `gcTime` para remover cache não usado:
```typescript
useQuery({
  queryKey: ...,
  staleTime: 5 * 60 * 1000,
  gcTime: 15 * 60 * 1000,  // ← Remova após 15 min inativo
  queryFn: ...,
})
```

---

## 📚 Próximas Leituras

1. **Entender antes/depois:** [FASE_3_BEFORE_AFTER.md](./FASE_3_BEFORE_AFTER.md)
2. **Detalhes completos:** [FASE_3_QUERY_KEYS_COMPLETE.md](./FASE_3_QUERY_KEYS_COMPLETE.md)
3. **Validação:** [FASE_3_VALIDATION_CHECKLIST.md](./FASE_3_VALIDATION_CHECKLIST.md)
4. **React Query docs:** https://tanstack.com/query/latest/docs/react/overview

---

**Dúvida?** Consulte um sênior ou veja o código existente em useClientes.ts que já foi refatorado.
