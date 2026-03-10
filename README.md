# SECRM — Sistema de Gestão de Clientes

CRM web para gestão de clientes, contatos, dados técnicos de usinas solares, faturas, relatórios e permissões.

## Stack

- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
- **UI:** shadcn/ui (Radix UI) · Lucide Icons · Recharts
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **State:** TanStack React Query v5
- **Forms:** React Hook Form + Zod

## Início Rápido

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY

# 3. Configurar banco de dados (Supabase SQL Editor)
# Executar na ordem: supabase/seeds/setup_tables.sql → seeds/EXECUTE_THIS_FIRST.sql → seeds/SQL_COMPLETO_EXECUTAR.sql
# Depois aplicar migrações necessárias de supabase/migrations/

# 4. Rodar em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (porta 3000) |
| `npm run build` | Build de produção |
| `npm run start` | Produção local |
| `npm run lint` | Lint do código |

## Estrutura do Projeto

```
app/
  (auth)/login/           → Autenticação
  (app)/                  → Área protegida (requer login)
    dashboard/            → Painel de métricas
    clientes/             → CRUD de clientes
    contatos/             → CRUD de contatos
    tecnica/              → Dados técnicos de usinas
    faturas/              → Painel de faturas e UCs
    interacoes/           → Interações com clientes
    tags/                 → Tags e categorias
    grupos-economicos/    → Grupos econômicos
    relatorios/           → Relatórios de envio
    permicoes/            → Gestão de usuários (admin)
  api/                    → Route Handlers (server-side)
  tv/                     → Dashboard para exibição em TV
components/               → Componentes React
lib/
  hooks/                  → Hooks customizados (useClientes, useAuth, etc.)
  supabase/               → Cliente e tipos do Supabase
  validators/             → Schemas Zod
  utils/                  → Formatação, máscaras, normalização
docs/                     → Documentação completa
  setup/                  → Guias de instalação e configuração
  features/               → Documentação de funcionalidades
  internal/               → Relatórios internos e debug
supabase/
  seeds/                  → SQL de setup inicial do banco
  migrations/             → Migrações incrementais
scripts/                  → Utilitários (testes, proxy, etc.)
```

## Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave pública (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim* | Módulo de permissões e APIs admin |

\* Obrigatória apenas se usar o módulo `/permicoes`.

## Documentação

- [Manual Operacional](docs/setup/MANUAL_OPERACIONAL.md) — Setup completo do zero
- [Sistema de Permissões](docs/setup/INSTRUÇÕES_SISTEMA_PERMISSÕES.md) — Roles e RBAC
- [Guia de Funcionalidades](docs/features/FEATURES_GUIDE.md) — Features disponíveis
- [Segurança](docs/features/SECURITY.md) — Práticas de segurança

## Licença

Projeto privado — uso interno.
