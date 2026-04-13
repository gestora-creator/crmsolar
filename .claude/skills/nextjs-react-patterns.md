---
name: nextjs-react-patterns
description: Padrões de qualidade para Next.js 16, React 19, TanStack Query v5, shadcn/ui, Tailwind. Use para criar/editar componentes, pages, hooks, APIs, formulários, ou qualquer código frontend do CRM Solar Energy.
---

## Stack do projeto
- Next.js 16.1 (App Router)
- React 19.2
- TanStack React Query v5
- Zod 4 (validação)
- shadcn/ui (componentes)
- Tailwind CSS
- Recharts (gráficos)
- Supabase SSR (@supabase/ssr)
- Sonner (toasts)
- Lucide React (ícones)

## Padrões obrigatórios

### Hooks com React Query
- Todo acesso a dados DEVE usar React Query (useQuery/useMutation)
- staleTime mínimo 5 minutos para listas, 10 minutos para dados estáveis
- Usar `keepPreviousData` para paginação
- Usar `queryKeys` factory pattern (lib/hooks/query-keys.ts)
- Invalidação cruzada: ao criar/atualizar, invalidar listas relacionadas

### Componentes
- 'use client' APENAS quando necessário (hooks, event handlers, state)
- Componentes de formulário: Zod schema + react-hook-form
- Loading states: Skeleton do shadcn/ui ou LoadingState componente
- Error states: ErrorBoundary + retry button
- Empty states: EmptyState componente com ícone, título, descrição

### Tipagem
- NUNCA usar `as any` sem justificativa documentada
- Importar tipos de `database.types.ts` para queries Supabase
- Interfaces exportadas para props de componentes e filtros de hooks

### Performance
- Paginação server-side para listas (30 items/página)
- Debounce de 400ms para campos de busca
- Ordenação server-side (não client-side)
- Filtros server-side (não client-side)
- useCallback/useMemo para referências estáveis em dependências

### Formulários
- Normalização na escrita: normalizeDigits, normalizeEmail, normalizeText
- Auto-save opcional (não padrão)
- Confirmação antes de ações destrutivas (ConfirmDialog)
- Validação Zod com mensagens em português

### Layout
- Sidebar: Dashboard Hub colapsável + itens top-level + Permissões (admin)
- Topbar: botão sair + navegação breadcrumb
- Loading global: app/(app)/loading.tsx
