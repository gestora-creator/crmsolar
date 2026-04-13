---
name: supabase-security
description: Auditoria e hardening de segurança Supabase para CRM Solar Energy. RLS policies, service_role_key, auth middleware, LGPD compliance. Use quando criar/alterar tabelas, policies, migrations, APIs, ou qualquer código que toque o Supabase.
---

## Regras de segurança obrigatórias

### RLS (Row Level Security)
- TODA tabela no schema public DEVE ter RLS habilitado
- TODA policy DEVE usar `TO authenticated` explícito (nunca default PUBLIC)
- NUNCA usar `USING (true)` — usar `USING (auth.uid() IS NOT NULL)` para CRM single-tenant
- INSERT policies: `WITH CHECK (auth.uid() IS NOT NULL)` 
- UPDATE policies: `USING (...) WITH CHECK (...)`
- DELETE policies: `USING (...)` sem WITH CHECK
- Policies para `anon`: APENAS em rotas públicas explicitamente justificadas
- UMA policy por operação (SELECT/INSERT/UPDATE/DELETE) — nunca FOR ALL

### service_role_key
- NUNCA expor em client components (prefixo NEXT_PUBLIC_ proibido)
- NUNCA fazer fallback para anon_key: `process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey` é PROIBIDO
- Validar existência: `if (!supabaseServiceKey) throw new Error('SERVICE_ROLE_KEY não configurada')`
- Usar APENAS em API routes server-side (/app/api/)

### Autenticação
- middleware.ts DEVE proteger todas as rotas server-side
- APIs DEVEM validar Bearer token no header Authorization
- Fallback de role: SEMPRE `?? 'limitada'` — NUNCA `?? 'admin'`

### Migrations
- TODA tabela DEVE ter migration no controle de versão
- Migrations são imutáveis após deploy — criar nova migration para alterações
- Nomear: `YYYYMMDD_descricao.sql`
- Incluir `IF NOT EXISTS` para idempotência
- DROP POLICY IF EXISTS antes de CREATE POLICY

### Funções RPC
- `SECURITY INVOKER` por padrão (roda com permissões do chamador)
- `SECURITY DEFINER` apenas quando justificado (e documentado)
- REVOKE EXECUTE FROM anon em funções sensíveis
- set search_path = '' para evitar schema injection

### LGPD (dados pessoais)
- CPF, CNPJ, telefone, email, endereço = dados regulados
- Log de acesso a dados pessoais (user_login_history)
- Política de retenção definida para clientes inativos
- Mecanismo de exclusão de dados do titular
