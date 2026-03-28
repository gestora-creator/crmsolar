# ✅ Fase 3 - Quick Validation Checklist

## 🎯 Objetivo
Validar que todas as mudanças da Fase 3 foram aplicadas corretamente

## 📋 Verificação por Arquivo

### 1. lib/hooks/query-keys.ts
- [ ] Arquivo existe
- [ ] Contém `export const queryKeys`
- [ ] `queryKeys.clientes` com `.list()` e `.detail()`
- [ ] `queryKeys.contatos` com `.list()` e `.detail()`
- [ ] `queryKeys.vinculos` com `.byCliente()` e `.byContato()`
- [ ] `queryKeys.tags` with `.all`
- [ ] `queryKeys.relatorios` com `.envios()`

### 2. lib/hooks/useClientes.ts
**Imports:**
- [ ] `import { queryKeys } from './query-keys'`

**useClientesList():**
- [ ] `queryKey: queryKeys.clientes.list(searchTerm, page)`
- [ ] `staleTime: 5 * 60 * 1000` (5 minutos)
- [ ] `gcTime: 15 * 60 * 1000` (15 minutos)

**useClienteById():**
- [ ] `queryKey: queryKeys.clientes.detail(id)`

**useCreateCliente() onSuccess:**
- [ ] Contém `queryClient.setQueryData(...detail...)`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.clientes.lists()...})`
- [ ] ❌ NÃO contém `invalidateQueries(['clientes'])`

**useUpdateCliente() onSuccess:**
- [ ] Contém `queryClient.setQueryData(...detail...)`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.clientes.lists()...})`
- [ ] ❌ NÃO contém `invalidateQueries(['clientes'])`
- [ ] ❌ NÃO contém `invalidateQueries(['cliente', id])`

**useDeleteCliente() onSuccess:**
- [ ] Contém `queryClient.removeQueries({queryKey: queryKeys.clientes.detail(id)})`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.clientes.lists()...})`

### 3. lib/hooks/useContatos.ts
**Imports:**
- [ ] `import { queryKeys } from './query-keys'`

**useContatosList():**
- [ ] `queryKey: queryKeys.contatos.list(searchTerm)`
- [ ] `staleTime: 5 * 60 * 1000`
- [ ] `gcTime: 15 * 60 * 1000`

**useContatoById():**
- [ ] `queryKey: queryKeys.contatos.detail(id)`

**useCreateContato() onSuccess:**
- [ ] Contém `queryClient.setQueryData(...detail...)`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.contatos.lists()...})`

**useUpdateContato() onSuccess:**
- [ ] Contém `queryClient.setQueryData(...detail...)`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.contatos.lists()...})`

**useDeleteContato() onSuccess:**
- [ ] Contém `queryClient.removeQueries(...detail...)`
- [ ] Contém `queryClient.invalidateQueries({queryKey: queryKeys.contatos.lists()...})`

### 4. lib/hooks/useVinculos.ts
**Imports:**
- [ ] `import { queryKeys } from './query-keys'`

**useVinculosByCliente():**
- [ ] `queryKey: queryKeys.vinculos.byCliente(clienteId)`

**useVinculosByContato():**
- [ ] `queryKey: queryKeys.vinculos.byContato(contatoId)`

**useCreateVinculo() onSuccess:**
- [ ] Invalidates: `queryKeys.vinculos.byCliente()`
- [ ] Invalidates: `queryKeys.vinculos.byContato()`
- [ ] Invalidates: `queryKeys.clientes.detail()`
- [ ] Invalidates: `queryKeys.contatos.detail()`
- [ ] Contém `toast.success('Contato vinculado com sucesso')`

**useDeleteVinculo() onSuccess:**
- [ ] Invalidates: `queryKeys.vinculos.all`
- [ ] Contém `toast.success('Vínculo removido com sucesso')`

**useSetContatoPrincipal() onSuccess:**
- [ ] Invalidates: `queryKeys.vinculos.byCliente(clienteId)`
- [ ] Contém `toast.success('Contato principal definido')`

### 5. lib/hooks/useTags.ts
**Imports:**
- [ ] `import { queryKeys } from './query-keys'`

**useAllTags():**
- [ ] `queryKey: queryKeys.tags.all`
- [ ] `staleTime: 10 * 60 * 1000`
- [ ] `gcTime: 30 * 60 * 1000`

**useCreateTag() onSuccess:**
- [ ] Contém `queryClient.setQueryData(queryKeys.tags.all, ...)`
- [ ] ❌ NÃO contém `invalidateQueries(['all-tags'])`

**useRenameTag() onSuccess:**
- [ ] Invalidates: `queryKeys.tags.all`
- [ ] Invalidates: `queryKeys.clientes.lists()`

**useDeleteTag() onSuccess:**
- [ ] Invalidates: `queryKeys.tags.all`
- [ ] Invalidates: `queryKeys.clientes.lists()`

### 6. lib/hooks/useRelatorios.ts
**Imports:**
- [ ] `import { queryKeys } from './query-keys'`

**useRelatoriosList():**
- [ ] `queryKey: queryKeys.relatorios.envios()`
- [ ] `staleTime: 60000` (60 segundos)
- [ ] `gcTime: 5 * 60 * 1000`

**useDashboardStats():**
- [ ] `queryKey: queryKeys.relatorios.all`
- [ ] `staleTime: 2 * 60 * 1000`
- [ ] `gcTime: 10 * 60 * 1000`

### 7. lib/hooks/useGruposEconomicos.ts (Fase 2)
**findOrCreateGrupo:**
- [ ] Usa `supabase.rpc('find_or_create_grupo_economico')`
- [ ] ❌ Não contém lógica manual de find/insert/retry
- [ ] ❌ Não contém try-catch para erro 23505

### 8. next.config.ts (Fase 1)
- [ ] Contém route-specific cache rules
- [ ] `/_next/static/*` → max-age=31536000, immutable
- [ ] `/api/*` → max-age=60, stale-while-revalidate
- [ ] `/tv/*` → max-age=300, stale-while-revalidate

### 9. middleware.ts (Fase 1)
- [ ] ❌ Não contém `Cache-Control` header
- [ ] ❌ Não contém `Pragma` header
- [ ] ❌ Não contém `Expires` header
- [ ] Contém comentário: "Headers cache agora em next.config.ts"

### 10. supabase/migrations/20260328_atomic_find_or_create_grupo.sql (Fase 2)
- [ ] Arquivo existe
- [ ] Contém função PL/pgSQL `find_or_create_grupo_economico`
- [ ] Contém `ON CONFLICT DO NOTHING`
- [ ] Contém função `create_vinculo_with_relatorio`

## 🧪 Testes Rápidos

### Teste 1: Verificar Query Keys Estrutura
```typescript
// Execute no browser console após abrir a página
import { queryKeys } from '@/lib/hooks/query-keys'

console.log(queryKeys.clientes.all)
// Deve retornar: ['clientes']

console.log(queryKeys.clientes.list('search', 1))
// Deve retornar: ['clientes', 'list', { searchTerm: 'search', page: 1 }]

console.log(queryKeys.clientes.detail('id123'))
// Deve retornar: ['clientes', 'detail', 'id123']
```

### Teste 2: Verificar Cache Behavior
```typescript
// 1. Abrir Network tab no DevTools
// 2. Abrir página de clientes
// 3. Contar requests: ~5-10 (inicial)
// 4. Editar um cliente e salvar
// 5. Contar requests: ~1-2 (inteligente, não cascata)
// 6. Resultado: ~90% menos requests ✅
```

### Teste 3: Verificar Memory
```typescript
// 1. Abrir Chrome DevTools → Memory tab
// 2. Anotar tamanho initial: ~8-10MB
// 3. Fazer 10 edições de clientes
// 4. Anotar tamanho final: ~5-6MB (não cresceu!)
// 5. Resultado: Memory estável ✅
```

### Teste 4: Verificar Cache Hit Rate
```javascript
// No React Query DevTools (extensão Chrome):
// 1. Dashboard → Cache
// 2. Após 5 minutos de uso: Hit rate deve ser > 80%
// 3. Resultado: Alto cache reuse ✅
```

## 🚀 Validação Pré-Deploy

Antes de fazer deploy, executar:

```bash
# 1. Lint check
npm run lint

# 2. Build check  
npm run build

# 3. Type check (TypeScript)
npm run type-check

# Resultado esperado: ✅ Sem erros de type, lint ou build
```

## 📊 Métricas Esperadas Após Deploy

| Métrica | Target | Status |
|---------|--------|--------|
| Cache Hit Rate | > 80% | ? |
| Queries/Edição | < 5 | ? |
| P95 Latency | < 200ms | ? |
| Memory/User | < 6MB | ? |
| Error Rate (23505) | < 1/10k | ? |

## 🎯 Próximos Passos

- [ ] Validar todos os checkboxes acima
- [ ] Executar testes rápidos
- [ ] Deploy em staging
- [ ] Cooletar métricas por 24h
- [ ] Comparar com baseline
- [ ] Deploy em produção se tudo OK
- [ ] Monitorar APM por 1 semana

## ✅ Sign-Off

- **Implementado Por:** [Dev Name]
- **Validado Por:** [QA Name]
- **Data Implementação:** 2025-03-28
- **Data Validação:** [Date]
- **Status Geral:** ⏳ Aguardando validação

---

**Dúvidas?** Consulte:
- [FASE_3_QUERY_KEYS_COMPLETE.md](./FASE_3_QUERY_KEYS_COMPLETE.md) - Detalhes completos
- [FASE_3_BEFORE_AFTER.md](./FASE_3_BEFORE_AFTER.md) - Impacto visual
- [CACHE_IMPLEMENTATION_PLAN.md](./CACHE_IMPLEMENTATION_PLAN.md) - Contexto arquitetural
