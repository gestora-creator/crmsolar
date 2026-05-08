# Fix: race condition no upload de mídia WhatsApp (n8n ↔ banco)

**Data:** 08 de maio de 2026
**Tipo:** Fix de produção (banco — migration aplicada via Supabase MCP)
**Impacto:** Áudios, imagens, vídeos e documentos recebidos pelo WhatsApp deixam de ficar com `media_url = NULL` permanente. A mídia agora aparece automaticamente na tela de atendimento.

---

## Bug

A documentação do fluxo de mídia ([2026-05-08-feature-midia-atendimento.md](./2026-05-08-feature-midia-atendimento.md)) afirmava:

> "Como a inserção da mensagem (`Salvar Msg Entrada`) é mais rápida que o upload + RPC, na prática a `media_url` aparece poucos segundos depois da mensagem na UI."

**Em produção é o oposto.** Métricas observadas em 08/05/2026:

| Etapa | Tempo médio |
|---|---|
| Sub-workflow `r1BtBcdGjja63jM4` (Evolution → Storage → RPC) | ~600 ms |
| `Salvar Msg Entrada` no SDR principal (lookup cliente, transcrição, INSERT) | 2 – 8 s |

Quando o sub-workflow é mais rápido, a RPC `atualizar_media_msg_whatsapp` faz `UPDATE WHERE message_id = $1` em uma linha que **ainda não existe**, retorna `updated: 0` e a mídia fica permanentemente órfã (arquivo no Storage, mas sem referência em `whatsapp_messages`).

Pior: o `executeWorkflow` em modo assíncrono (`waitForSubWorkflow: false`) não bloqueia o SDR, então o erro some — não vira execution failed no n8n.

### Evidência

```sql
-- Áudios órfãos antes do fix (08/05/2026 ~16:30 BRT):
id  | message_id              | created_at              | gap_vs_upload
240 | 3A5F7AD8B23554C2A98D    | 2026-05-08 16:27:36.94  | linha inserida 2.4s DEPOIS do upload
238 | 3A98CF6C01AB05470032    | 2026-05-08 16:27:10.82  | gap de ~8s
234 | 3A5C778CD1539DC884FF    | 2026-05-08 16:08:07.90  | sub-workflow nem rodou
226 | 3EB0AD4C093D88998FA591  | 2026-05-08 15:29:24.38  | gap de ~6s
```

Logs do nó `Atualizar Mensagem com URL` mostravam:
```json
{ "success": false, "updated": 0, "message_id": "3A5F7AD8B23554C2A98D" }
```

---

## Solução

Migration: `supabase/migrations/20260508_whatsapp_media_pending_race_fix.sql`

### 1. Tabela auxiliar `whatsapp_media_pending`

PK = `message_id`. Campos espelham os campos de mídia em `whatsapp_messages`. É o "holding area" para mídia que chega antes da mensagem.

### 2. RPC `atualizar_media_msg_whatsapp` modificada

Tenta `UPDATE` primeiro. Se `ROW_COUNT = 0`, faz `INSERT … ON CONFLICT DO UPDATE` na pending. Resposta agora inclui `pending: true` quando isso acontece — fica claro nos logs do n8n que a mídia foi armazenada em buffer.

### 3. Trigger `BEFORE INSERT` em `whatsapp_messages`

Quando uma linha é inserida com um `message_id` que tem registro em pending, o trigger:
- copia `media_url`/`mimetype`/`filename`/`size`/`transcricao`/`descricao_ia` para a `NEW` row
- deleta o registro da pending

Atômico (mesma transação do INSERT). Resolve a race em qualquer direção.

---

## Comportamento depois do fix

| Cenário | Antes | Depois |
|---|---|---|
| INSERT antes do upload (caso ideal) | UPDATE funciona | UPDATE funciona |
| Upload antes do INSERT (caso real em prod) | `updated: 0`, mídia perdida | INSERT em pending → trigger consome no INSERT principal |
| Upload duplicado (retry do n8n) | RPC quebrava | `ON CONFLICT DO UPDATE`, idempotente |

---

## Áudios órfãos antigos

Foram recuperados manualmente via UPDATE direto após o fix:
- ids 240, 238, 226 → arquivo já estava no Storage, faltava só apontar
- id 234 → arquivo nem foi para o Storage; precisa do endpoint `/api/atendimento/recuperar-midia/[id]` (PR #19) ou clique manual em "Tentar recuperar" no front (PR #18 + #19)

---

## Como testar

1. Pedir cliente cadastrado mandar áudio longo no WhatsApp.
2. SQL para acompanhar:
   ```sql
   SELECT id, message_id, media_url, created_at
   FROM whatsapp_messages
   WHERE jid = 'SEU_JID@s.whatsapp.net' AND tipo = 'audio'
   ORDER BY created_at DESC LIMIT 5;
   ```
3. Em até 10s, `media_url` deve estar preenchida — independente da ordem em que SDR e sub-workflow terminaram.
4. Conferir que `whatsapp_media_pending` está vazia (ou perto disso) na maior parte do tempo:
   ```sql
   SELECT count(*), max(created_at) FROM whatsapp_media_pending;
   ```

---

## Manutenção sugerida

A tabela `whatsapp_media_pending` deve ficar quase sempre vazia. Se acumular registros, indica que mensagens estão sendo perdidas no SDR (não chegam a virar `INSERT`). Sugestão de cron diário:

```sql
-- Limpa registros pendentes com mais de 7 dias (mensagens que nunca chegaram)
DELETE FROM whatsapp_media_pending WHERE created_at < now() - interval '7 days';
```

Pode ser virar um workflow n8n se ficar incomum.
