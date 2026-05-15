# Edge Function: whatsapp-webhook

Recebe webhooks da Evolution API (WhatsApp via Baileys) e:
1. Audita no `whatsapp_events_raw` (eventos não-ruidosos).
2. Dispatcha para o RPC `processar_mensagem_recebida` (insere/atualiza sessao + mensagem com idempotencia).
3. Se for midia (image/audio/video/document/sticker) e nao for grupo, chama o workflow n8n
   "Pipeline Midia WhatsApp" (fire-and-forget) que descriptografa via Evolution e sobe pro
   Storage Supabase.
4. Se o RPC indicar `deve_chamar_agente=true`, chama o agente n8n com o contexto da conversa.

## Versao atual: v3.1 (2026-05-15)

- `dispatchMidiaPipeline` roda para inbound **E** outbound (atendente enviando pelo celular).
- `callAgent` continua filtrando `fromMe` no RPC, nao aqui.

Health check: `GET /functions/v1/whatsapp-webhook` retorna `{ status: 'ok', version: 'v3.1-midia-outbound' }`.

## Variaveis de ambiente (Supabase Functions Secrets)

| Nome | Obrigatoria | Para que serve |
|---|---|---|
| `SUPABASE_URL` | sim | Auto-injetada pelo Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Auto-injetada. Usada para escrever em todas as tabelas (ignora RLS) |
| `EVOLUTION_WEBHOOK_SECRET` | sim | Bearer token que a Evolution envia. Sem isso, a funcao aceita qualquer request |
| `N8N_AGENT_URL` | nao | URL do webhook do agente n8n. Se vazia, agente nao eh chamado (atendimento humano so) |
| `N8N_AGENT_SECRET` | sim, se N8N_AGENT_URL | Bearer token enviado pro agente |
| `MIDIA_PIPELINE_URL` | nao | URL do webhook do Pipeline Midia WhatsApp (workflow n8n `WdiIdEojHtfNNVus`) |
| `MIDIA_PIPELINE_SECRET` | sim, se MIDIA_PIPELINE_URL | Bearer token enviado pro pipeline |
| `DRY_RUN` | nao | Se `'true'`, nao chama agente (so audita) |

Configure em https://supabase.com/dashboard/project/<ref>/functions/<slug>/secrets

## Deploy

```bash
supabase functions deploy whatsapp-webhook --project-ref <ref> --no-verify-jwt
```

Ou via MCP Supabase (`deploy_edge_function`).

**Nao** desabilitar JWT a menos que seja webhook publico (este eh — autenticacao via Bearer customizado).

## Logs

`console.log` no Deno escreve para o aggregator do Supabase. Tudo eh JSON estruturado com `ts`, `level`, `msg` e extras. Nao logamos PII (so previews truncados de conteudo).

## Idempotencia

O RPC `processar_mensagem_recebida` faz upsert por `(jid, message_id)`. Retry pelo Evolution eh seguro.
