# Manual Operacional - Cadastro Web

Este documento descreve o passo a passo para qualquer pessoa configurar e operar o projeto localmente, do zero, com foco em ambiente, banco Supabase e execucao.

## 1. Escopo da aplicacao

O sistema possui os modulos:

- Login com Supabase Auth.
- Dashboard.
- Clientes.
- Contatos.
- Dados tecnicos (`crm_clientes_tecnica`).
- Interacoes e relatorios (`relatorio_envios`).
- Tags (`crm_tags`).
- Grupos economicos (`grupos_economicos`).
- Permissoes de usuarios (`user_roles` + `user_login_history`).
- Faturas (dependente de estrutura de dados externa no Supabase).

## 2. Pre-requisitos

- Node.js `>= 20.9.0` (requisito do `next@16.1.1`).
- npm instalado.
- Para uso na **nuvem**: conta no Supabase com projeto criado e acesso ao SQL Editor.
- Para uso **local** (opcional): [Docker](https://docs.docker.com/get-docker/) e [Supabase CLI](https://supabase.com/docs/guides/cli).

Observacao importante:

- WSL1 nao suporta o fluxo de Node deste projeto. Use terminal do Windows, WSL2 ou Linux/macOS.

## 3. Setup local do projeto

1. Entre na pasta do projeto.
2. Copie o arquivo de ambiente.
3. Instale dependencias.

```bash
cp .env.local.example .env.local
npm install
```

No Windows (PowerShell), se preferir:

```powershell
Copy-Item .env.local.example .env.local
npm install
```

### 3.1 Primeiros passos para usar a aplicacao

1. Preencher `.env.local` com URL e chave do Supabase (secao 4 e, se for stack local, secao 4.1).
2. Aplicar o SQL na ordem documentada (secao 5.2 em diante), no SQL Editor da **nuvem** ou do **Studio local**.
3. Criar ao menos um usuario em **Authentication > Users** (nuvem ou local).
4. `npm run dev` e abrir `http://localhost:3000`.
5. Fazer login em `/login`; a area logada inclui dashboard, clientes, contatos, dados tecnicos, tags, relatorios, etc. (rotas sob `app/(app)/`).

## 4. Variaveis de ambiente (`.env.local`)

Preencha o arquivo `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_KEY
# OU, no dashboard novo do Supabase:
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

Regras:

- `NEXT_PUBLIC_SUPABASE_URL` e uma chave publica (`NEXT_PUBLIC_SUPABASE_ANON_KEY` **ou** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`) sao obrigatorias para o sistema inteiro.
- `SUPABASE_SERVICE_ROLE_KEY` e obrigatoria para o modulo de permissao (`/permicoes`) e APIs `/api/permicoes/*`.

### 4.1 Supabase local (CLI + Docker)

O repositorio ja contem `supabase/config.toml` (gerado pelo `supabase init`). Para subir Postgres, Auth, Studio e API localmente:

1. Instale o Supabase CLI e deixe o Docker em execucao.
2. Na raiz do projeto: `supabase start`.
3. Execute `supabase status` e copie:
   - **API URL** (geralmente `http://127.0.0.1:54321`) para `NEXT_PUBLIC_SUPABASE_URL`;
   - **anon key** para `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - **service_role** para `SUPABASE_SERVICE_ROLE_KEY` (se for usar permissoes/admin).
4. Abra o **Studio** local (URL na saida do `supabase status`, porta comum `54323`) e use o **SQL Editor** para executar os mesmos scripts da secao 5.2 na mesma ordem usada na nuvem.
5. Crie o primeiro usuario em **Authentication** no Studio local.

Tipos TypeScript alinhados ao schema local (opcional): `npx supabase gen types typescript --local > lib/supabase/database.types.ts`

## 5. Configuracao do Supabase

### 5.1 Criar o primeiro usuario

Antes do SQL de permissao, crie ao menos 1 usuario em:

- `Supabase Dashboard > Authentication > Users > Add user`

Recomendacao:

- Criar um usuario admin inicial com email contendo `gestora` (ativa protecoes de super admin previstas no SQL de permissoes).

### 5.2 Executar SQL na ordem correta (banco novo)

No SQL Editor do Supabase, execute os arquivos abaixo na ordem:

1. `supabase/seeds/setup_tables.sql`
2. `supabase/seeds/EXECUTE_THIS_FIRST.sql`
3. `supabase/migrations/add_grupo_whatsapp_field.sql`
4. `supabase/migrations/add_us_grupo_whatsapp_field.sql`
5. `supabase/migrations/add_tipos_relacionamento.sql`
6. `supabase/migrations/create_tags_table.sql`
7. `supabase/migrations/create_grupos_economicos.sql`
8. `supabase/migrations/create_clientes_tecnica_table.sql`
9. `supabase/migrations/fix_relatorio_envios_rls.sql`
10. `supabase/migrations/update_canal_relatorio_constraint.sql`
11. `supabase/seeds/SQL_COMPLETO_EXECUTAR.sql`

### 5.3 SQL de compatibilidade obrigatorio

Depois da sequencia acima, execute este bloco para alinhar constraint/status e evitar erro de criacao de cliente em setup novo:

```sql
-- Permite inserts sem nome_cadastro (o frontend usa razao_social)
ALTER TABLE public.crm_clientes
ALTER COLUMN nome_cadastro DROP NOT NULL;

-- Remove checks antigos de status para recriar no formato atual
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.crm_clientes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_clientes DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

ALTER TABLE public.crm_clientes
ADD CONSTRAINT crm_clientes_status_chk CHECK (
  status IS NULL OR UPPER(status) = ANY (ARRAY['ATIVO', 'INATIVO', 'PROSPECTO', 'SUSPENSO', 'BLOQUEADO'])
);

NOTIFY pgrst, 'reload schema';
```

### 5.4 Scripts legados (nao usar em setup novo)

Para evitar conflito com role antiga `faturas`, nao use em banco novo:

- `supabase/migrations/create_user_roles_rbac.sql`
- `supabase/migrations/assign_user_roles.sql`

O setup atual de permissao e o arquivo:

- `supabase/seeds/SQL_COMPLETO_EXECUTAR.sql` (roles atuais: `admin` e `limitada`).

## 6. Subir a aplicacao

Modo desenvolvimento padrao:

```bash
npm run dev
```

Acesse:

- `http://localhost:3000`

Build de producao local:

```bash
npm run build
npm run start
```

## 7. Validacao pos-setup

Checklist recomendado:

1. Fazer login com usuario criado no Supabase Auth.
2. Abrir `Dashboard` sem erro.
3. Criar um cliente em `Clientes > Novo Cliente`.
4. Criar um contato e vincular ao cliente.
5. Abrir `Tags` e criar ao menos 1 tag.
6. Abrir `Dados Tecnicos` sem erro de tabela ausente.
7. Se usar permissao, abrir `Permissoes` com usuario admin.

## 8. Modulos opcionais e dependencias extras

### 8.1 Permissoes de usuarios

Requisitos:

- `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.
- `SQL_COMPLETO_EXECUTAR.sql` aplicado com sucesso.

Se criar usuarios manualmente depois (via painel Auth), rode `SQL_COMPLETO_EXECUTAR.sql` novamente para inserir faltantes em `user_roles`.

### 8.2 Faturas

O endpoint `app/api/faturas/metrics/route.ts` consulta a tabela/view `base`.

A estrutura minima usada inclui campos como:

- `CLIENTE`
- `CPF/CNPJ`
- `Unidades`
- `Tipo`
- `dados_extraidos`
- `projetada`

Sem essa estrutura, a pagina `/faturas` retorna erro de backend.

Endpoints de debug usam estruturas adicionais:

- `/api/faturas/debug` usa `view_faturas_completa`.
- `/api/faturas/check-agronesa` usa `fila_extracao`.

Se precisar da view de debug, execute:

- `supabase/migrations/verify_and_create_view.sql`

### 8.3 Proxy de fallback (opcional)

Para servir fallback em `:3000` e app em `:3001`:

Terminal 1:

```bash
npm run dev:3001
```

Terminal 2:

```bash
npm run fallback:proxy
```

Variaveis opcionais:

- `FALLBACK_PORT`
- `APP_PORT`
- `APP_HOST`

## 9. Scripts utilitarios

- `npm run lint` valida codigo.
- `node scripts/check-auth.mjs` testa autenticacao (modo interativo).
- `node scripts/test-db.mjs` testa conexao com Supabase.
- `node scripts/test-fetch.mjs` testa endpoint local de metricas.

Exemplo rapido de teste de banco:

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_ANON_KEY=SUA_ANON_KEY node scripts/test-db.mjs
```

## 10. Troubleshooting

- Erro `Invalid login credentials`:
Crie usuario em `Authentication > Users` no Supabase.

- Erro `relation "user_roles" does not exist`:
Execute `SQL_COMPLETO_EXECUTAR.sql`.

- Erro ao abrir `Permissoes` com `403`:
Verifique `SUPABASE_SERVICE_ROLE_KEY` e se o usuario tem linha em `public.user_roles` com `role = 'admin'`.

- Erro ao criar cliente por constraint/status:
Execute o bloco da secao `5.3`.

- Erro na pagina `Faturas` com mensagem sobre tabela `base`:
Configure a fonte de dados `base` no Supabase antes de usar o modulo.

- Erro `WSL 1 is not supported`:
Use terminal Windows, WSL2, Linux ou macOS.

## 11. Checklist final de handoff

Antes de entregar o sistema para outro usuario/equipe:

1. Confirmar `.env.local` preenchido.
2. Confirmar scripts SQL aplicados.
3. Confirmar login funcionando.
4. Confirmar criacao/edicao de cliente e contato.
5. Confirmar modulo `Permissoes` com usuario admin.
6. Confirmar modulo `Faturas` apenas se a tabela/view `base` existir.
