# Patches V3 — pronto para aplicar

Arquivos prontos para copiar pro repo `crmsolar`. Mantenha a mesma estrutura de pastas.

## Pré-requisitos (CONFIRMAR ANTES DE APLICAR)

A revisão automática pegou alguns pontos a checar no seu projeto real:

### A) Componentes shadcn/ui necessários
A tela admin importa `Card`, `Switch`, `Label` — confirme se existem no seu `components/ui/`. Senão:
```bash
npx shadcn@latest add card switch label
```

### B) Confirmar contrato da RPC `buscar_cliente_por_whatsapp_jid`
O `build_contexto_agente` e o `processar_mensagem_recebida` chamam essa RPC existente. Rode no banco:
```sql
\df+ buscar_cliente_por_whatsapp_jid
SELECT * FROM buscar_cliente_por_whatsapp_jid('5511999999999@s.whatsapp.net') LIMIT 1;
```
Se ela só retorna `cliente_id, contato_id`, o agente perderá nome/UC/grupo. Nesse caso, estender essa RPC para retornar também `razao_social, apelido_relacionamento, documento, status, tags, grupo_economico, relacionamento, ucs[]`.

### C) Pg_cron para limpeza de eventos
Não obrigatório, mas evita explosão de tabela:
```sql
SELECT cron.schedule('cleanup-whatsapp-events', '0 3 * * *',
  $$DELETE FROM whatsapp_events_raw WHERE received_at < now() - interval '30 days'$$);
```

### D) Schema de `timeline_relacional`
A RPC `pausar_ia_sessao` insere lá. Confirme as colunas:
```sql
\d timeline_relacional
```
Se diferir do esperado (`cliente_id, contato_id, tipo_evento, canal, direcao, resumo_chave, conteudo_longo, origem, autor, ocorrido_em`), o insert falha silenciosamente (envolto em `EXCEPTION WHEN OTHERS`).

### E) Tabela `user_roles` para `requireAdmin()`
O helper espera `user_roles(user_id uuid, role text)`. Se o nome for diferente, ajustar constantes em `lib/auth/require-admin.ts`. Se a tabela não existir, qualquer acesso a `/admin/whatsapp` é bloqueado.

---

## Mapeamento workspace → repo

| Aqui (workspace) | No seu repo (`crmsolar/`) |
|---|---|
| `patches_v3/lib/whatsapp/evolution-client.ts` | `lib/whatsapp/evolution-client.ts` |
| `patches_v3/lib/whatsapp/evolution-types.ts` | `lib/whatsapp/evolution-types.ts` |
| `patches_v3/lib/whatsapp/contexto-agente.ts` | `lib/whatsapp/contexto-agente.ts` |
| `patches_v3/lib/auth/require-admin.ts` | `lib/auth/require-admin.ts` (novo) |
| `patches_v3/app/api/atendimento/mensagens/[jid]/route.ts` | `app/api/atendimento/mensagens/[jid]/route.ts` (substitui) |
| `patches_v3/app/api/atendimento/sessao/[jid]/pausar-ia/route.ts` | `app/api/atendimento/sessao/[jid]/pausar-ia/route.ts` (novo) |
| `patches_v3/app/api/admin/whatsapp/status/route.ts` | `app/api/admin/whatsapp/status/route.ts` (novo) |
| `patches_v3/app/api/admin/whatsapp/qr/route.ts` | `app/api/admin/whatsapp/qr/route.ts` (novo) |
| `patches_v3/app/api/admin/whatsapp/restart/route.ts` | `app/api/admin/whatsapp/restart/route.ts` (novo) |
| `patches_v3/app/api/admin/whatsapp/settings/route.ts` | `app/api/admin/whatsapp/settings/route.ts` (novo) |
| `patches_v3/app/(app)/admin/whatsapp/page.tsx` | `app/(app)/admin/whatsapp/page.tsx` (novo) |

## Migrações SQL (em ordem)

1. `supabase/migrations/20260512_100000_whatsapp_idempotencia_e_grupo.sql`
2. `supabase/migrations/20260512_110000_rpc_processar_mensagem_recebida.sql`
3. `supabase/migrations/20260512_120000_rpc_build_contexto_agente.sql`

Aplicar nessa ordem:
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512_100000_whatsapp_idempotencia_e_grupo.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512_110000_rpc_processar_mensagem_recebida.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512_120000_rpc_build_contexto_agente.sql
```

## Edge Function

```bash
cd seu-repo/
mkdir -p supabase/functions/whatsapp-webhook
# copiar index.ts e types.ts do workspace pra essa pasta

# Secrets
supabase secrets set EVOLUTION_WEBHOOK_SECRET=<hex32>
supabase secrets set N8N_AGENT_URL=https://<seu-n8n>/webhook/agent-responder
supabase secrets set N8N_AGENT_SECRET=<hex32>
supabase secrets set DRY_RUN=true   # comece em shadow mode

# Deploy
supabase functions deploy whatsapp-webhook
```

## Configurar webhook na Evolution

> **Nota:** `webhook_base64: false` recomendado. Mídias grandes (vídeo, áudio) em base64 podem estourar o limite de body da Edge Function (~6MB). Baixar mídia sob demanda via `/chat/getBase64FromMediaMessage` quando necessário.

```bash
curl -X POST "https://evo.damaral.ia.br/webhook/set/n8n-suporte" \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<projeto>.supabase.co/functions/v1/whatsapp-webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "CALL"
    ],
    "headers": {
      "authorization": "Bearer <EVOLUTION_WEBHOOK_SECRET>"
    }
  }'
```

## n8n: criar workflow `agent-responder`

Ver `n8n/patches/2026-05-12_AGENT_HTTP_SERVICE.md` — passo a passo dos nodes, prompt do agente, variáveis env.

## Validação por etapa

### Após Fase 1 (migração + cliente + route)

```sql
-- Sem duplicatas:
SELECT message_id, COUNT(*) FROM whatsapp_messages
 WHERE message_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
-- Espera: 0 linhas

-- tipo_conversa populada:
SELECT tipo_conversa, COUNT(*) FROM whatsapp_messages GROUP BY 1;
-- Espera: chat + grupo (se há registros de grupo)
```

### Após Fase 2 (Edge Function + RPCs)

```sql
-- Eventos chegando:
SELECT event, COUNT(*) FROM whatsapp_events_raw
 WHERE received_at > now() - interval '1 hour' GROUP BY 1;

-- Testar build_contexto_agente:
SELECT public.build_contexto_agente('5511999999999@s.whatsapp.net');

-- Testar processar_mensagem_recebida:
SELECT * FROM public.processar_mensagem_recebida(
  'MESSAGES_UPSERT', 'n8n-suporte',
  '5511999999999@s.whatsapp.net', 'TEST_001', false,
  'text', 'Mensagem teste', NULL, NULL, NULL,
  'Cliente Teste', now(), '{}'::jsonb
);
```

### Após Fase 3 (admin UI)

- Acessar `/admin/whatsapp` no CRM.
- Conferir métricas, status, settings.
- Botão "Pausar IA" no chat: clicar e ver `whatsapp_sessions.ia_pausada=true`.
- Mandar mensagem no número pausado: NÃO deve ter resposta automática.

## Variáveis de ambiente no CRM (Netlify)

```
NEXT_PUBLIC_SUPABASE_URL=https://lodgnyduaezlcjxfcxrh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>

EVOLUTION_API_URL=https://evo.damaral.ia.br
EVOLUTION_API_KEY=<chave>
EVOLUTION_INSTANCE=n8n-suporte
```

## Rollback

Cada arquivo SQL tem rollback comentado no rodapé. Para o código:
```bash
git revert <commit>
```
Edge Function pode ser deletada sem afetar o resto:
```bash
supabase functions delete whatsapp-webhook
```
Webhook da Evolution pode ser reapontado a qualquer momento (mesmo curl, URL diferente).
