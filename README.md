# SECRM — Sistema de Gestão de Clientes

CRM web para gestão de clientes, contatos, dados técnicos de usinas solares, faturas, relatórios e permissões.

## Stack

- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4
- **UI:** shadcn/ui (Radix UI) · Lucide Icons · Recharts
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **State:** TanStack React Query v5
- **Forms:** React Hook Form + Zod

## Início rápido

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.local.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
# (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY no lugar da anon)
# Opcional: SUPABASE_SERVICE_ROLE_KEY para /permicoes

# 3. Configurar banco de dados (Supabase SQL Editor na nuvem, ou Studio local — ver manual)
# Executar na ordem: supabase/seeds/setup_tables.sql → seeds/EXECUTE_THIS_FIRST.sql → …
# Detalhes: docs/setup/MANUAL_OPERACIONAL.md

# 4. Rodar em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`, faça login em `/login` e use os módulos em `(app)/` (dashboard, clientes, contatos, etc.).

### Supabase local (opcional)

Com [Docker](https://docs.docker.com/get-docker/) e [Supabase CLI](https://supabase.com/docs/guides/cli): na raiz do projeto, `supabase start` (após `supabase init`, já presente no repositório). Use no `.env.local` a URL `http://127.0.0.1:54321` e as chaves exibidas por `supabase status`. Aplique o SQL na mesma ordem do [Manual Operacional](docs/setup/MANUAL_OPERACIONAL.md), no SQL Editor do Studio local (porta padrão `54323`).

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
  config.toml             → Configuração Supabase CLI (stack local)
  seeds/                  → SQL de setup inicial do banco
  migrations/             → Migrações incrementais
scripts/                  → Utilitários (testes, proxy, etc.)
```

## Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto (`https://….supabase.co` ou `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim* | Chave pública (anon JWT) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Sim* | Alternativa à anon (dashboard Supabase novo); use uma das duas |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim† | Módulo de permissões e APIs admin |

\* Informe **anon** ou **publishable**, não é necessário definir as duas.

† Obrigatória apenas se usar o módulo `/permicoes`.

## Documentação

- [Manual Operacional](docs/setup/MANUAL_OPERACIONAL.md) — Setup completo do zero, nuvem e local
- [Sistema de Permissões](docs/setup/INSTRUÇÕES_SISTEMA_PERMISSÕES.md) — Roles e RBAC
- [Guia de Funcionalidades](docs/features/FEATURES_GUIDE.md) — Features disponíveis
- [Segurança](docs/features/SECURITY.md) — Práticas de segurança

## Licença

Projeto privado — uso interno.
