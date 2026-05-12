# Plano de Ação V3 — CRM dono do webhook, Evolution direto, agente n8n como serviço

**Data:** 12/05/2026
**Status:** entregue, pronto para aplicação faseada
**Causa-raiz endereçada:** o n8n recebe o webhook antes do CRM, então o agente nunca tem contexto pronto, não respeita `ia_pausada`/`status='humano'`, não filtra grupos, e há corrida entre POST do CRM e SEND_MESSAGE do webhook.

## Princípio arquitetural

O **CRM passa a ser dono do webhook**. A Evolution envia mensagem recebida direto pra uma função no Supabase. O CRM persiste, decide (com SQL simples) se deve responder, e — se sim — chama o n8n por HTTP passando o contexto pronto. O n8n vira um **serviço de IA**, não um orquestrador.

```
cliente → Evolution → webhook receiver CRM (Supabase Edge Function)
                       ↓
                     upsert msg + sessão (Postgres)
                       ↓
                     SE: não é grupo, ia_pausada=false, status≠humano
                       ↓
                     POST n8n /agent/responder (com contexto completo)
                       ↓
                     resposta volta ao CRM
                       ↓
                     CRM persiste + envia via Evolution
```

## Entregáveis deste plano

Tudo está em `C:\Users\User\Documents\Claude\Projects\CRM\` em pastas paralelas — você aplica no ritmo que quiser, sem mexer no que já roda.

| # | Caminho | O que é | Fase |
|---|---|---|---|
| 1 | `supabase/migrations/20260512_100000_whatsapp_idempotencia_e_grupo.sql` | UNIQUE em message_id, coluna `tipo_conversa`, backfill, índices | F1 |
| 2 | `patches_v3/lib/whatsapp/evolution-client.ts` | Cliente tipado da Evolution (sendText, sendMedia, sendPresence, etc) | F1 |
| 3 | `patches_v3/lib/whatsapp/evolution-types.ts` | Types compartilhados (payload de webhook, eventos, status) | F1 |
| 4 | `patches_v3/app/api/atendimento/mensagens/[jid]/route.ts` | Route handler refatorada usando o client | F1 |
| 5 | `supabase/migrations/20260512_110000_rpc_processar_mensagem_recebida.sql` | RPC central que recebe payload e decide próximo passo | F2 |
| 6 | `supabase/functions/whatsapp-webhook/index.ts` | Edge Function: webhook receiver | F2 |
| 7 | `supabase/functions/whatsapp-webhook/types.ts` | Types do webhook Evolution | F2 |
| 8 | `patches_v3/lib/whatsapp/contexto-agente.ts` | Builder do `ContextoAgente` enviado ao n8n | F2 |
| 9 | `n8n/patches/2026-05-12_AGENT_HTTP_SERVICE.md` | Como transformar workflow atual em endpoint HTTP simples | F2 |
| 10 | `patches_v3/app/(app)/admin/whatsapp/page.tsx` | Tela admin: status, QR reconnect, settings, toggle IA | F3 |
| 11 | `patches_v3/app/api/admin/whatsapp/*` | APIs internas: estado, QR, settings, pausar IA por sessão | F3 |

## Sequência de aplicação (com validação)

### Fase 0 — Pré-requisitos (5 min)

Gere um shared secret para o webhook:

```bash
openssl rand -hex 32
# Salve como EVOLUTION_WEBHOOK_SECRET nos secrets do Supabase e do CRM
```

Confirme as envs do CRM (`.env.production` / Netlify):

```
EVOLUTION_API_URL=https://evo.damaral.ia.br
EVOLUTION_API_KEY=<a chave global da sua Evolution>
EVOLUTION_INSTANCE=n8n-suporte
EVOLUTION_WEBHOOK_SECRET=<gerado acima>
N8N_AGENT_URL=https://<seu n8n>/webhook/agent-responder
N8N_AGENT_SECRET=<gerar outro hex>
```

### Fase 1 — Idempotência + cliente centralizado (1 dia, zero risco)

**1.1 Aplicar migração SQL.**
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512_100000_whatsapp_idempotencia_e_grupo.sql
```
A migração é idempotente (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`). Faz: UNIQUE em `(message_id)`, coluna `tipo_conversa` com backfill (detecta `@g.us` vs `@s.whatsapp.net`), índice, comentários.

**Validar:**
```sql
SELECT tipo_conversa, COUNT(*) FROM whatsapp_messages GROUP BY 1;
SELECT tipo_conversa, COUNT(*) FROM whatsapp_sessions GROUP BY 1;
-- Espera ver as duas categorias.
```

**1.2 Adicionar o cliente Evolution ao repo.**
Copie `patches_v3/lib/whatsapp/evolution-client.ts` e `evolution-types.ts` para `lib/whatsapp/` do repo `crmsolar`.

**1.3 Substituir a route handler.**
Substitua `app/api/atendimento/mensagens/[jid]/route.ts` pela versão em `patches_v3/`.

**Validar:**
- Abrir uma conversa, enviar texto → deve aparecer no chat do cliente normalmente.
- Conferir `whatsapp_messages`: status='sent', `message_id` preenchido.
- Verificar no log que não existem 2 linhas com mesmo `message_id`.

### Fase 2 — Webhook no CRM + agente como serviço (3-4 dias)

**2.1 Aplicar RPC.**
```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512_110000_rpc_processar_mensagem_recebida.sql
```

**2.2 Deploy da Edge Function.**
```bash
# Adicionar secrets primeiro
supabase secrets set EVOLUTION_WEBHOOK_SECRET=<valor>
supabase secrets set N8N_AGENT_URL=<valor>
supabase secrets set N8N_AGENT_SECRET=<valor>

# Deploy
supabase functions deploy whatsapp-webhook
```

**2.3 Configurar webhook DUPLO na Evolution.** A Evolution v2 não suporta múltiplas URLs nativamente em `webhook.url`, mas você pode (a) deixar o webhook do n8n atual e adicionar o do CRM via `WEBHOOK_GLOBAL_URL` no .env, ou (b) usar RabbitMQ na Evolution e ter dois consumidores. Para a Fase 1 de migração (shadow), o caminho mais simples é configurar o webhook **só do CRM** na instância e manter o n8n recebendo via outro evento (ou desligar gradualmente).

Recomendado: começar **shadow mode** apontando webhook para a Edge Function, mas configurar a Edge Function pra NÃO enviar resposta ainda (`DRY_RUN=true` em secrets). Quando validar que 100% das mensagens entram, ligar o envio.

```bash
# Registrar webhook do CRM
curl -X POST "https://evo.damaral.ia.br/webhook/set/n8n-suporte" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "url": "https://<projeto>.supabase.co/functions/v1/whatsapp-webhook",
    "webhook_by_events": false,
    "webhook_base64": true,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED"
    ],
    "headers": {
      "authorization": "Bearer <EVOLUTION_WEBHOOK_SECRET>",
      "Content-Type": "application/json"
    }
  }'
```

**2.4 Subir o workflow `agent-responder` no n8n.** Veja `n8n/patches/2026-05-12_AGENT_HTTP_SERVICE.md`. Em resumo: novo workflow simples (Webhook → Buscar KB Vector → Agent LLM → Respond), sem nenhum lookup de cliente ou sessão (porque vem pronto no payload).

**Validar:**
- Mandar mensagem teste de número conhecido.
- Conferir no log da Edge Function: payload recebido, `processar_mensagem_recebida` retornou `{deve_chamar_agente: true}`, chamada ao n8n, resposta voltou.
- Conferir `whatsapp_messages`: 2 linhas (in + out), com `message_id` válidos.
- Mandar mensagem de grupo: NÃO deve acionar agente, deve gravar com `tipo_conversa='grupo'`.
- Pausar IA na sessão (`UPDATE whatsapp_sessions SET ia_pausada=true WHERE jid=...`): próxima mensagem do mesmo cliente NÃO aciona agente.

**2.5 Desligar fluxo conversacional antigo do n8n.** Quando confiança = 100%, desativa o workflow `SDR - Com Debounce WhatsApp` (não delete — desativa, dá pra reativar se algo quebrar). Os workflows batch (`KB Ingest`, fatura monitor) continuam.

### Fase 3 — Tela admin + UX premium (2-3 dias)

**3.1 Adicionar rota `/admin/whatsapp`.** Copiar `patches_v3/app/(app)/admin/whatsapp/page.tsx` e as APIs internas em `patches_v3/app/api/admin/whatsapp/`.

**3.2 Adicionar toggle "Pausar IA" no header do chat.** Botão que dispara `PUT /api/atendimento/sessao/[jid]/pausar-ia` (incluso nos patches).

**3.3 Adicionar aba "Grupos" no atendimento.** Filtro simples na listagem por `tipo_conversa='grupo'`.

**3.4 Adicionar status de entrega/leitura na UI.** O webhook receiver já trata `MESSAGES_UPDATE` e atualiza o `status` na linha — a UI só precisa renderizar (`sent` → ✓, `delivered` → ✓✓, `read` → ✓✓ azul).

## Rollback por etapa

- **Fase 1**: rollback da migração no fim do arquivo SQL (comentado). Reverter os 2 arquivos TS no Git.
- **Fase 2**: reapontar webhook da Evolution de volta pro endpoint do n8n (mesmo curl, url diferente). RPC pode ficar — não impacta nada se não for chamada. Edge Function pode ser desligada (`supabase functions delete whatsapp-webhook`).
- **Fase 3**: remover rota `/admin/whatsapp` do menu — código pode ficar.

## Métricas de sucesso

| Métrica | Antes | Meta |
|---|---|---|
| Mensagens duplicadas em `whatsapp_messages` | >0 (race condition conhecida) | 0 |
| Agente respondendo grupo `@g.us` | sim | nunca |
| Agente respondendo quando `ia_pausada=true` | sim | nunca |
| Agente respondendo quando `status='humano'` | sim | nunca |
| Latência média Evolution→CRM persist | desconhecida (via n8n) | < 500ms |
| Mensagens com contexto cliente injetado no prompt | inconsistente | 100% |
| Pontos de falha entre cliente e atendente | 3 (Evo, n8n, Supabase) | 2 (Evo, Supabase) |

## Próximos passos após este plano

Onda P1 do roadmap anterior fica natural depois: `sendPresence` enquanto atendente digita, `sendReaction`, `sendWhatsAppAudio`, deletar/editar mensagem, status de leitura na UI. O `evolution-client.ts` já tem essas funções prontas — só falta plugar nos componentes do chat.

## Checklist de aplicação (marcar conforme avança)

**Fase 0 — Pré (validar suposições do projeto antes)**
- [ ] Gerar `EVOLUTION_WEBHOOK_SECRET` (`openssl rand -hex 32`)
- [ ] Adicionar envs no Netlify (CRM)
- [ ] Adicionar secrets no Supabase (`supabase secrets set ...`)
- [ ] Confirmar `N8N_AGENT_URL` e `N8N_AGENT_SECRET`
- [ ] **Confirmar contrato da RPC `buscar_cliente_por_whatsapp_jid`** (`\df+ ...` no psql). Se só retorna `cliente_id, contato_id`, estender para retornar `razao_social, apelido_relacionamento, documento, status, tags, grupo_economico, relacionamento, ucs[]` — senão o agente perde dados.
- [ ] Confirmar existência de `Card`, `Switch`, `Label` em `components/ui/`. Senão: `npx shadcn@latest add card switch label`
- [ ] Confirmar nome e schema da tabela `user_roles` (ajustar `lib/auth/require-admin.ts` se diferir)
- [ ] Confirmar schema de `timeline_relacional` bate com o que `pausar_ia_sessao` espera
- [ ] **Backup** de `whatsapp_messages` antes da migração 100000 (DELETE de duplicatas)

**Fase 1**
- [ ] Aplicar migração `20260512_100000`
- [ ] Validar `tipo_conversa` populada
- [ ] Adicionar `lib/whatsapp/evolution-client.ts` ao repo
- [ ] Adicionar `lib/whatsapp/evolution-types.ts` ao repo
- [ ] Substituir `app/api/atendimento/mensagens/[jid]/route.ts`
- [ ] Deploy → testar envio de texto
- [ ] Confirmar zero duplicatas em `whatsapp_messages`

**Fase 2**
- [ ] Aplicar migração `20260512_110000` (RPC)
- [ ] Deploy Edge Function `whatsapp-webhook`
- [ ] Criar workflow `agent-responder` no n8n
- [ ] Configurar shared secret no n8n
- [ ] Apontar webhook Evolution → CRM (curl)
- [ ] Testar mensagem de teste — confirmar fluxo end-to-end
- [ ] Testar mensagem de grupo — confirmar que NÃO aciona agente
- [ ] Testar pausar IA — confirmar que NÃO aciona agente
- [ ] Desativar workflow conversacional antigo do n8n
- [ ] Monitorar 48h

**Fase 3**
- [ ] Adicionar rota `/admin/whatsapp`
- [ ] Adicionar APIs internas admin
- [ ] Adicionar toggle "Pausar IA" no chat
- [ ] Adicionar aba "Grupos"
- [ ] Renderizar status de entrega/leitura na UI
