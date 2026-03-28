# 📋 Checklist de Implementação - Cache Fixes

## Quick Start

```bash
# Fase total estimada: 11-15 horas de trabalho
# Impacto: 80% economia Supabase + 10x performance boost
```

---

## ✅ Fase 1: Headers HTTP (2-3 horas)

**Objetivo:** Implementar cache headers inteligentes por rota

### Tarefa 1.1: Reescrever `next.config.ts`
- [ ] Backup do arquivo atual
- [ ] Remover config de catch-all (no-cache em tudo)
- [ ] Adicionar rotas específicas:
  - [ ] `/_next/static/*` → 1 year immutable
  - [ ] `/api/*` → max-age=300, stale-while-revalidate=3600
  - [ ] `/app/*` → no-cache, private
  - [ ] `/_next/image/*` → max-age=60
- [ ] Testar com `curl -I` que headers estão corretos
- [ ] Testar no DevTools que cache está funcionando

### Tarefa 1.2: Simplificar `middleware.ts`
- [ ] Remover os três headers agressivos (Cache-Control, Pragma, Expires)
- [ ] Deixar apenas lógica de autenticação
- [ ] Testar que middleware ainda funciona

### Tarefa 1.3: Validação
- [ ] Abrir DevTools → Network
- [ ] Carregar `/api/clientes`
- [ ] Verificar header `Cache-Control: private, max-age=300`
- [ ] Recarregar página (F5)
- [ ] Segunda requisição deve ser <5ms (cache hit)

---

## ✅ Fase 2: Query Key Factory (2 horas)

**Objetivo:** Implementar padrão consistente para query keys

### Tarefa 2.1: Criar `lib/hooks/query-keys.ts`
- [ ] Copiar conteúdo de `CACHE_IMPLEMENTATION_PLAN.md`
- [ ] Ajustar para todas as queries do projeto:
  - [ ] `queryKeys.clientes`
  - [ ] `queryKeys.contatos`
  - [ ] `queryKeys.vinculos`
  - [ ] `queryKeys.grupos`
  - [ ] `queryKeys.tags`
  - [ ] `queryKeys.relatorios`
- [ ] Adicionar typing correto (as const)

### Tarefa 2.2: Atualizar `useClientes.ts`
- [ ] Importar `queryKeys` do novo arquivo
- [ ] Substituir `['clientes', ...]` por `queryKeys.clientes.list(...)`
- [ ] Substituir `['cliente', id]` por `queryKeys.clientes.detail(id)`
- [ ] Atualizar todos os `invalidateQueries` para usar factory

### Tarefa 2.3: Atualizar `useContatos.ts`
- [ ] Mesmo processo que useClientes.ts

### Tarefa 2.4: Atualizar `useVinculos.ts`
- [ ] Mesmo processo

### Tarefa 2.5: Atualizar `useTags.ts`
- [ ] Mesmo processo

### Tarefa 2.6: Atualizar `useGruposEconomicos.ts`
- [ ] Mesmo processo

### Tarefa 2.7: Atualizar `useRelatorios.ts` (se existir)
- [ ] Mesmo processo

### Tarefa 2.8: Validação
- [ ] Rodar linter (eslint)
- [ ] Garantir que nenhum erro de tipo
- [ ] Testar app localmente que queries funcionam

---

## ✅ Fase 3: Race Conditions - RPC Atômico (4-5 horas)

**Objetivo:** Implementar operações atômicas no banco de dados

### Tarefa 3.1: Criar migração Supabase
- [ ] Criar arquivo: `supabase/migrations/20260328_atomic_operations.sql`
- [ ] Copiar funções de `CACHE_IMPLEMENTATION_PLAN.md`:
  - [ ] `find_or_create_grupo_economico()`
  - [ ] `create_vinculo_with_relatorio()`
- [ ] Validar SQL syntax
- [ ] Executar localmente em dev database

### Tarefa 3.2: Atualizar `useGruposEconomicos.ts`
- [ ] Remover lógica manual de find-or-create
- [ ] Usar `supabase.rpc('find_or_create_grupo_economico', ...)`
- [ ] Remover try-catch silencioso
- [ ] Adicionar testes

### Tarefa 3.3: Atualizar `useVinculos.ts`
- [ ] Remover criação manual de vínculo + relatório
- [ ] Usar `supabase.rpc('create_vinculo_with_relatorio', ...)`
- [ ] Remover try-catch silencioso de relatorio_envios
- [ ] Adicionar testes

### Tarefa 3.4: Criar testes E2E
- [ ] Arquivo: `tests/e2e/cache-race-conditions.spec.ts`
- [ ] Teste: Concurrent find-or-create retorna mesmo ID
- [ ] Teste: Vínculo + relatório criados atomicamente
- [ ] Garantir que testes passam

### Tarefa 3.5: Validação
- [ ] Executar testes com `npm run test:e2e`
- [ ] Testar manualmente com 2 abas simultâneas
- [ ] Verificar que não há erros "returned more than one row"

---

## ✅ Fase 4: Invalidação Inteligente (3-4 horas)

**Objetivo:** Implementar invalidação específica em mutations

### Tarefa 4.1: Atualizar `useClientes.ts`
- [ ] `useCreateCliente`: 
  - [ ] Usar `setQueryData` para adicionar ao cache
  - [ ] Invalidar apenas `queryKeys.clientes.lists()`
- [ ] `useUpdateCliente`:
  - [ ] Usar `setQueryData` para atualizar específico
  - [ ] Invalidar apenas se campo filtrado mudou
- [ ] `useDeleteCliente`:
  - [ ] Invalidar apenas lista genérica

### Tarefa 4.2: Atualizar `useContatos.ts`
- [ ] Mesmo padrão de useClientes

### Tarefa 4.3: Atualizar `useVinculos.ts`
- [ ] Invalidar apenas vinculos relacionados
- [ ] Não cascata para clientes/contatos

### Tarefa 4.4: Atualizar `useTags.ts`
- [ ] Invalidar apenas `queryKeys.tags.all`
- [ ] Não invalidar clientes (não relacionado)

### Tarefa 4.5: Validação
- [ ] Testar que criar cliente não refetch todas as páginas
- [ ] Testar que editar tag não refetch clientes
- [ ] Network tab deve mostrar <3 requisições simultâneas

---

## ✅ Fase 5: Otimização de Cardinalidade (1-2 horas)

**Objetivo:** Reduzir número de cache keys

### Tarefa 5.1: Remover `pageSize` da query key
- [ ] Em `useClientesList`: usar `CLIENTS_PAGE_SIZE = 30` constante
- [ ] Remover pageSize do queryKey
- [ ] Mesmo em outros hooks se aplicável

### Tarefa 5.2: Aumentar `staleTime`
- [ ] `useClientesList`: 2 min → 5 min
- [ ] `useContatosList`: 2 min → 10 min
- [ ] `useGruposEconomicos`: deve ser 1 hora
- [ ] Others: revisar se faz sentido

### Tarefa 5.3: Aumentar `gcTime`
- [ ] `useClientesList`: 5 min → 15 min
- [ ] `useContatosList`: 5 min → 30 min
- [ ] Others: revisar valores

### Tarefa 5.4: Adicionar prefetch (opcional)
- [ ] Em `useClientesList`: prefetch próxima página
- [ ] Melhora UX ao navegar entre páginas

### Tarefa 5.5: Validação
- [ ] Memory Profiler que uso de RAM decresceu
- [ ] React Query DevTools mostra menos keys ativas

---

## ✅ Fase 6: Testes e Validação (2-3 horas)

### Tarefa 6.1: Testes Unitários
- [ ] `npm run test` passa 100%
- [ ] Adicionar testes para query-keys factory

### Tarefa 6.2: Testes E2E
- [ ] `npm run test:e2e` passa 100%
- [ ] Testes de race condition funcionam

### Tarefa 6.3: Testes Performance
- [ ] Chrome DevTools → Performance
- [ ] Gravação de ações normais
- [ ] Verificar que:
  - [ ] Cache hits estão >70%
  - [ ] Latência reduzida p95 <200ms
  - [ ] Memory estavelizada

### Tarefa 6.4: Testes Manuais
- [ ] [ ] Abrir app em browser
- [ ] [ ] Navegar entre clientes, contatos, vinculos
- [ ] [ ] Criar novo cliente (verificar que não freezes)
- [ ] [ ] Editar cliente (mesmo)
- [ ] [ ] Criar vínculo (sem erros race condition)
- [ ] [ ] DevTools network deve mostrar poucos requests

### Tarefa 6.5: Monitoramento em Staging
- [ ] Deploy para staging (se tiver)
- [ ] Monitorar por 1 semana:
  - [ ] Supabase query count
  - [ ] Error logs para "returned more than one row"
  - [ ] Performance metrics

---

## ✅ Fase 7: Documentação e Deploy (1 hora)

### Tarefa 7.1: Atualizar README.md
- [ ] Adicionar seção "Cache Strategy"
- [ ] Documentar query key factory usage
- [ ] Documentar RPC functions

### Tarefa 7.2: Deploy para Produção
- [ ] Criar PR com todas mudanças
- [ ] Code review by 1+ pessoa
- [ ] Merge para `main`
- [ ] Trigger CI/CD deploy
- [ ] Monitorar Sentry/analytics por 24h

### Tarefa 7.3: Rollback Plan
- [ ] Se problemas erscheinen:
  - [ ] `git revert <commit-hash>`
  - [ ] Re-deploy versão anterior

---

## 📊 Métricas para Validação

Antes de considerar o trabalho concluído, validar:

```
Métrica                     Meta        Validação
─────────────────────────────────────────────────────
Cache Hit Rate              70%+        DevTools Network
Latência P95               <200ms        DevTools Performance
Memory por usuario          <5MB         Chrome Memory Profiler
Supabase queries/min       <300          Supabase Dashboard
Errores race condition      <1/10k req   Sentry/Logs
Test coverage              >90%          npm run test
E2E tests                  All pass      npm run test:e2e
```

---

## 🚨 Pontos de Atenção

### Coisas que podem dar problema:

1. **RPC migrations não rodar em staging**
   - Verificar senha SERVICE_ROLE_KEY
   - Rodar manually se necesário

2. **Testes quebrarem após refactor**
   - Queries cache keys mudaram
   - Atualizar mocks se houver

3. **Old cache data no localStorage**
   - Usuarios podem ter cache old em localStorage
   - Primeira requisição após update será cache miss (OK, esperado)

4. **Race condition testes flaky**
   - Às vezes passa, às vezes não?
   - Aumentar delay entre requisições nos testes
   - Use `waitFor` do Playwright

---

## 📞 Suporte

Se preso em alguma tarefa:
1. Consulte o documento correspondente:
   - CACHE_ANALYSIS_REPORT.md (problema detalhado)
   - CACHE_IMPLEMENTATION_PLAN.md (solução técnica)
   - CACHE_CODE_EXAMPLES.md (código antes/depois)

2. Rodar em modo debug:
   ```bash
   # Terminal 1
   npm run dev
   
   # Terminal 2
   npm run test -- --watch
   
   # Terminal 3
   VS Code DevTools Console
   ```

---

**Tempo total estimado:** 11-15 horas
**Benefício anual:** $5-8K economia + melhor UX
**ROI:** EXCELENTE ✅
