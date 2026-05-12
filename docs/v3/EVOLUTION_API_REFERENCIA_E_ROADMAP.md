# Evolution API v2 — Referência completa e roadmap de evolução da integração ao CRM Solar

**Versão:** 1.0
**Data:** 12/05/2026
**Autor:** Hewerton + Claude (Cowork)
**Status:** documento de referência — base para decisões de integração

---

## 0. Sumário executivo

Você **já tem** uma integração Evolution API ↔ CRM funcional em produção: instância `n8n-suporte` rodando em `evo.damaral.ia.br`, n8n processando eventos com debounce + agente LLM com RAG (MongoDB Atlas), Supabase com schema cognitivo (`whatsapp_sessions`, `whatsapp_messages`, `chamados_atendimento`, RPCs `abrir_chamado` / `atualizar_atendente` / `buscar_cliente_por_whatsapp_jid`), e um chat estilo WhatsApp embutido no Next.js consumindo realtime do Supabase.

O ponto a evoluir não é "ligar Evolution ao CRM" — é **explorar o que a Evolution oferece e que o CRM ainda não usa**, decidir entre Baileys e Cloud API para o futuro, e expor controles administrativos (conectar/reconectar instância, settings, métricas de conexão) dentro do CRM em vez de só via Postgres + n8n.

Este documento entrega: (1) o mapa completo da Evolution API v2, (2) o diagnóstico do que já está plugado, (3) os gaps oportunos, (4) um roadmap em quatro ondas (P0 a P3), e (5) snippets prontos para os primeiros itens.

---

## 1. Evolution API v2 — mapa de referência

### 1.1 Visão geral

A Evolution API v2 é uma plataforma open-source de automação de WhatsApp construída em Node.js + Prisma. A versão atual da imagem é `atendai/evolution-api:v2.1.1`. Cada conexão é uma **instância** isolada com credenciais próprias (em disco em `/evolution/instances` ou em Redis). Cada instância pode usar **Baileys** (WhatsApp Web não-oficial, via QR code) ou **WhatsApp Cloud API** (canal oficial Meta). A porta padrão é `8080` e a autenticação é via header `apikey` (chave global no `.env` ou token por instância).

### 1.2 Requisitos de infraestrutura

O banco aceita PostgreSQL ou MySQL via `DATABASE_PROVIDER`, com URI em `DATABASE_CONNECTION_URI` e isolamento multi-instalação pelo `DATABASE_CONNECTION_CLIENT_NAME`. Sete flags `DATABASE_SAVE_*` controlam o que persiste (instâncias, mensagens novas, atualizações, contatos, chats, labels, histórico). O Redis é opcional mas recomendado: ativa cache (`CACHE_REDIS_ENABLED`) e, com `CACHE_REDIS_SAVE_INSTANCES=true`, guarda credenciais Baileys no Redis em vez de disco (essencial para escala horizontal). S3/MinIO é opcional para armazenar mídias.

### 1.3 Variáveis de ambiente principais

Servidor: `SERVER_TYPE`, `SERVER_PORT=8080`, `SERVER_URL`. Autenticação: `AUTHENTICATION_API_KEY` (global, mandatória) e `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES`. Persistência: `DATABASE_ENABLED`, `DATABASE_PROVIDER`, `DATABASE_CONNECTION_URI`, `DATABASE_SAVE_*`. Cache: `CACHE_REDIS_ENABLED`, `CACHE_REDIS_URI`, `CACHE_REDIS_SAVE_INSTANCES`. Filas opcionais: `RABBITMQ_ENABLED`/`SQS_ENABLED` com suas URIs. Webhook global: `WEBHOOK_GLOBAL_ENABLED`, `WEBHOOK_GLOBAL_URL`, flags `WEBHOOK_EVENTS_*`. WhatsApp Cloud: `WA_BUSINESS_TOKEN_WEBHOOK`, `WA_BUSINESS_URL`, `WA_BUSINESS_VERSION`. Sessão/QR: `CONFIG_SESSION_PHONE_CLIENT`, `CONFIG_SESSION_PHONE_NAME`, `QRCODE_LIMIT`, `QRCODE_COLOR`. Integrações: `CHATWOOT_*`, `TYPEBOT_API_VERSION`, `OPENAI_ENABLED`, `DIFY_ENABLED`. Storage: `S3_ENABLED`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_ENDPOINT`.

### 1.4 Gestão de instâncias

Todos os endpoints recebem `apikey: <chave>` no header. `POST /instance/create` cria a instância (campos: `instanceName`, `integration` em `WHATSAPP-BAILEYS` ou `WHATSAPP-BUSINESS`, `token` opcional, `qrcode`, `number`, mais settings inline e `webhook` inline). `GET /instance/fetchInstances` lista. `GET /instance/connect/{instance}` gera QR code (retorna `base64` e `code`). `GET /instance/connectionState/{instance}` retorna `open`/`connecting`/`close`. `PUT /instance/restart/{instance}` reinicia. `POST /instance/setPresence/{instance}` muda presença. `DELETE /instance/logout/{instance}` desconecta mantendo a instância. `DELETE /instance/delete/{instance}` remove de vez.

### 1.5 Envio de mensagens

Todos os endpoints seguem `POST /message/<endpoint>/{instance}`. Tipos suportados:

| Endpoint | Tipo | Campos essenciais |
|---|---|---|
| `/message/sendText` | Texto | `number`, `text`, `delay?`, `linkPreview?`, `mentioned?`, `quoted?` |
| `/message/sendMedia` | Imagem/vídeo/documento | `number`, `mediatype`, `mimetype`, `media` (URL ou base64), `fileName`, `caption?` |
| `/message/sendWhatsAppAudio` | Áudio narrado (PTT) | `number`, `audio`, `delay?`, `encoding?` |
| `/message/sendSticker` | Sticker | `number`, `sticker` |
| `/message/sendLocation` | Localização | `number`, `name`, `address`, `latitude`, `longitude` |
| `/message/sendContact` | vCard | `number`, `contact[]` |
| `/message/sendReaction` | Reação emoji | `key{remoteJid,fromMe,id}`, `reaction` |
| `/message/sendPoll` | Enquete | `number`, `name`, `selectableCount`, `values[]` |
| `/message/sendList` | Lista interativa (Baileys, staging) | `number`, `title`, `description`, `buttonText`, `values[].rows[]` |
| `/message/sendButtons` | Botões (estável só em Cloud) | `number`, `title`, `description`, `footer`, `buttons[]` |
| `/message/sendStatus` | Status/story | conteúdo + tipo |

### 1.6 Webhooks e eventos

Configuração por instância via `POST /webhook/set/{instance}` (campos `url`, `webhook_by_events`, `webhook_base64`, `events[]`, `headers{}`). Consulta via `GET /webhook/find/{instance}`. Também aceita configuração global por env. Eventos suportados:

`APPLICATION_STARTUP`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`, `MESSAGES_SET`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`, `SEND_MESSAGE`, `CONTACTS_SET`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE`, `PRESENCE_UPDATE`, `CHATS_SET`, `CHATS_UPSERT`, `CHATS_UPDATE`, `CHATS_DELETE`, `GROUPS_UPSERT`, `GROUPS_UPDATE`, `GROUP_PARTICIPANTS_UPDATE`, `LABELS_EDIT`, `LABELS_ASSOCIATION`, `CALL`, `TYPEBOT_START`, `TYPEBOT_CHANGE_STATUS`, `NEW_TOKEN`.

O payload sempre traz `event`, `instance`, `data`, `destination`, `date_time`, `sender`, `server_url`, `apikey`. Headers customizados configuráveis para autenticação do consumidor. A doc oficial não publica retry policy automática — a recomendação prática é responder 200 em menos de 1 segundo e enfileirar o trabalho pesado. Para garantias maiores, usar RabbitMQ ou SQS em vez do webhook HTTP.

### 1.7 Integrações nativas

A Evolution v2 traz integrações nativas que você pode ativar por instância: **WebSocket** (push em tempo real sem expor webhook público, configurado em `POST /websocket/set/{instance}`), **RabbitMQ** (fila durável via env), **SQS** (AWS), **Chatwoot** (atendimento humano centralizado, configurado em `POST /chatwoot/set/{instance}` ou no payload do create), **WhatsApp Cloud API** (canal oficial Meta, escolhido com `integration: "WHATSAPP-BUSINESS"`), **Typebot** (fluxos no-code), **Dify** (RAG/LLM), **OpenAI** (assistente GPT direto), **n8n** (orquestração — o que você já usa), e ainda Flowise, EvoAI e Evolution Bot.

### 1.8 Baileys vs Cloud API

| Aspecto | WHATSAPP-BAILEYS | WHATSAPP-BUSINESS (Cloud) |
|---|---|---|
| Conexão | QR code / pairing code | Token permanente Meta + Number ID + Business ID |
| Custo Meta | Zero | Cobrança por conversa (Meta) |
| Risco de ban | Sim (não oficial) | Não |
| Mensagens iniciadas | Livres | Apenas via templates HSM aprovados |
| Recursos | Lista, sticker, status, grupos completos | Botões oficiais, templates; `sendList` Baileys não disponível |
| Histórico | Sync via `syncFullHistory` | Sem sync histórico |
| Recomendado | Atendimento ativo de baixo/médio volume | Operação em escala / regulamentada |

A escolha é feita no campo `integration` na criação da instância.

### 1.9 Grupos, contatos, chats, configurações, perfil e chamadas

Grupos sob `/group/*/{instance}`: `create`, `fetchAllGroups`, `updateParticipant` (action `add`/`remove`/`promote`/`demote`), `updateGroupSubject`, `updateGroupPicture`, `updateGroupDescription`, `updateSetting`, `toggleEphemeral`, `inviteCode`, `revokeInviteCode`, `sendInvite`, `leaveGroup`.

Chats e contatos sob `/chat/*/{instance}`: `whatsappNumbers` (verifica se números existem no WhatsApp — usar antes de envios em lote), `findContacts`, `findChats`, `findMessages`, `markMessageAsRead`, `markChatUnread`, `archiveChat`, `deleteMessageForEveryone`, `sendPresence` (digitando/gravando), `updateMessage` (editar), `updateBlockStatus`, `fetchProfilePictureUrl`, `getBase64FromMediaMessage`.

Settings via `POST /settings/set/{instance}`: `rejectCall`, `msgCall`, `groupsIgnore`, `alwaysOnline`, `readMessages`, `readStatus`, `syncFullHistory`. Profile via `/chat/*`: `fetchProfile`, `fetchBusinessProfile`, `fetchPrivacySettings`, `updatePrivacySettings`, `updateProfileName`, `updateProfileStatus`, `updateProfilePicture`, `removeProfilePicture`.

Chamadas: auto-rejeição com `rejectCall: true` + `msgCall` (mensagem automática). O evento `CALL` chega via webhook/RabbitMQ/WebSocket e contém a `offer` recebida, útil para logar tentativas.

### 1.10 Rate limits e boas práticas

A doc oficial não publica limites numéricos, mas a Evolution recomenda implicitamente: usar `delay` em ms entre mensagens (parecer humano), manter `alwaysOnline: false` e `readMessages: false` por padrão, `groupsIgnore: true` em instâncias de CRM, evitar `syncFullHistory` em produção, sempre checar `whatsappNumbers` antes de enviar em lote, aquecer contas Baileys novas com volume crescente, configurar proxy por instância (`proxyHost/Port/Protocol/Username/Password`) para distribuir egress, e migrar para Cloud API quando o volume justificar.

### 1.11 Modelo de banco que a Evolution mantém

A combinação das flags `DATABASE_SAVE_*` com o schema Prisma confirma as tabelas principais: `Instance`, `Message`, `MessageUpdate`, `Contact`, `Chat`, `Label`, `LabelAssociation`, `Webhook`, `Setting`, e uma tabela por integração ativada (`Chatwoot`, `Typebot`, `OpenAI`, `Dify`, `Flowise`, `EvoAI`, `n8n`, `Websocket`, `Rabbitmq`, `Sqs`). O `DATABASE_CONNECTION_CLIENT_NAME` segrega múltiplas instalações no mesmo banco.

---

## 2. Estado atual da integração no CRM Solar

### 2.1 O que já está em produção

Você tem instância `n8n-suporte` em `evo.damaral.ia.br` (VPS própria via EasyPanel). O CRM em Next.js (deployado em `crmsolarenergy.netlify.app`) conversa com a Evolution por dois caminhos: o n8n recebe os webhooks da Evolution, classifica e responde via agente LLM com RAG (MongoDB Atlas), e o front Next.js usa diretamente a API REST da Evolution para enviar mensagens quando um atendente humano responde, em `app/api/atendimento/mensagens/[jid]/route.ts` (variáveis `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`).

O Supabase tem um esquema cognitivo robusto. A migração mais recente (`20260511_120000_atendimento_v3_campos_cognitivos.sql`) adicionou aos `whatsapp_sessions` os campos `intencao`, `caso_tipo` (com CHECK em 13 casos solar como `fatura_alta`, `sem_creditos`, `vistoria_om`, `problema_inversor`, `aluguel_uc`, `troca_titularidade`, `pos_venda`), `etapa` (máquina de estado: `saudacao`, `coleta_dados`, `diagnostico`, `proposta_solucao`, `aguardando_acao_cliente`, `aguardando_atendente`, `encerramento`), `dados_caso` (jsonb), `prioridade`, `ia_pausada`, `ultima_intencao_em`, `sla_primeira_resposta_em`. Os `whatsapp_messages` ganharam `intencao`, `tags[]`, `confianca_ia`, `requer_humano`. A tabela `chamados_atendimento` foi estendida com FK `atribuido_a_user_id` para `auth.users`, `sla_proxima_acao_em` e `jid`. Há RPC `abrir_chamado(jid, tipo, descricao, prioridade, origem)` com `SECURITY DEFINER`, helper `GREATEST_PRIORIDADE`, e trigger `tg_auto_abrir_chamado` que abre chamado automaticamente quando uma sessão vai para `aguardando` ou `humano`.

O frontend (`app/(app)/atendimento/page.tsx`) entrega uma experiência de chat madura: separação por aba (todos, em espera, em andamento, meus), agrupamento de mensagens em janela de 60s, separadores de data ao estilo WhatsApp (`Hoje`, `Ontem`, dia da semana, data), tratamento de placeholders de mídia, deduplicação em ordem estável por `enviado_em || created_at` com fallback por id, modo supervisor (espia conversa de outro atendente sem zerar não-lidas), e realtime via Supabase. A API `route.ts` injeta o atendente a partir do JWT, chama a RPC `atualizar_atendente`, e renova `timeout_em` em 30 min.

O n8n tem o workflow `KB Ingest - Agent Atendimento v2` carregando 13 arquivos modulares da KB para vector store no MongoDB Atlas, e há um patch documentado para adicionar um node `Buscar Contexto Cliente` antes do agente principal (LLM agent) para que ele responda já conhecendo cliente, status, UC e chamados abertos.

### 2.2 O que ainda não é aproveitado da Evolution

Existem 14 capacidades documentadas da Evolution v2 que estão fora da sua integração hoje. O agrupamento abaixo é por prioridade:

**Alto valor com baixo esforço.** (1) `POST /chat/whatsappNumbers/{instance}` antes de envios em lote, para reduzir custo e risco de ban quando você enviar campanhas. (2) `POST /chat/sendPresence/{instance}` com `composing`/`recording` enquanto o atendente digita, mostrando o "digitando..." real no WhatsApp do cliente. (3) `MESSAGES_UPDATE` (status de entrega/leitura) para refletir os ticks azuis na UI do CRM. (4) `CONNECTION_UPDATE` para alertar a equipe quando a instância cair (hoje você só descobre quando o cliente reclama). (5) `POST /settings/set/{instance}` com `rejectCall: true` e `msgCall` para auto-rejeitar chamadas com mensagem padrão.

**Médio valor.** (6) `sendPoll` para coletar feedback rápido pós-atendimento ou agendar janela de vistoria. (7) `sendLocation` para mandar endereço de visita técnica. (8) `sendReaction` para o agente reagir com 👍 quando o cliente confirma uma ação. (9) `sendWhatsAppAudio` (PTT com waveform) para mensagens de voz do agente quando o caso é sensível. (10) `deleteMessageForEveryone` e `updateMessage` para correção de envios.

**Estratégico.** (11) Multi-instância (cada vendedor com seu número, ou separar instância de SDR/comercial da instância de suporte). (12) Tela de admin no CRM para conectar/reconectar instância (consumir QR base64 da Evolution e renderizar). (13) Migração futura para Cloud API quando a operação atingir volume que justifique o custo (estabilidade, sem ban, templates HSM aprovados). (14) Webhook receiver direto no CRM (Edge Function Supabase) como fallback ou substituto parcial do n8n para eventos críticos — reduz acoplamento.

---

## 3. Decisões arquiteturais propostas

### 3.1 Mantenha n8n como hub de IA, mas exponha um webhook direto no Supabase para eventos críticos

O n8n é excelente para orquestrar o pipeline cognitivo (debounce, classificação, RAG, agente LLM, tools). Mantenha tudo isso. Crie em paralelo uma **Edge Function Supabase** (`whatsapp-webhook-direct`) que recebe o mesmo webhook da Evolution, mas se ocupa apenas dos eventos de **infra/observabilidade** que não dependem do agente: `CONNECTION_UPDATE` (alertar quando cair), `QRCODE_UPDATED` (atualizar tela admin), `MESSAGES_UPDATE` (status de leitura na UI). Isso evita que o n8n vire um SPOF para esses fluxos secundários e dá ao CRM um canal de telemetria próprio.

Configure isso na Evolution registrando **dois webhooks** — possível porque o `webhook` aceita múltiplos consumidores quando se combina o `webhook_by_events: true` (sub-rotas por evento) com regras na URL. Alternativa mais limpa: usar RabbitMQ na Evolution e ter dois consumidores (n8n e Edge Function) lendo da mesma fila.

### 3.2 Permaneça em Baileys agora; planeje a migração para Cloud API

Baileys atende sua operação atual (atendimento humano + chatbot de uma instância). Migrar para Cloud API hoje cria custo (Meta cobra por conversa) e fricção (templates HSM aprovados antes de enviar). Mantenha Baileys e tenha pronto um plano: quando o volume justificar ou quando uma conta for banida pela primeira vez, vire a chave criando uma nova instância `WHATSAPP-BUSINESS` em paralelo, valide com tráfego espelhado e corte. O modelo de dados não muda — o que muda é o canal.

### 3.3 Centralize chamadas REST à Evolution em uma única camada do CRM

Hoje as variáveis `EVOLUTION_API_URL`/`KEY`/`INSTANCE` estão hard-coded na route handler do atendimento. Extraia para `lib/whatsapp/evolution-client.ts` com funções tipadas (`sendText`, `sendMedia`, `sendPresence`, `connectionState`, `whatsappNumbers`, etc.). Isso facilita: trocar instância sem mexer em N arquivos, mockar em testes, adicionar retry/timeout/circuit breaker uma vez só, e migrar para Cloud API quando chegar a hora (mesma assinatura, payload ajustado).

### 3.4 Trate `apikey` como segredo gerenciado

A `AUTHENTICATION_API_KEY` da Evolution e o `SUPABASE_SERVICE_ROLE_KEY` (que hoje aparecem no n8n como string hard-coded em 3 nodes Supabase) deveriam estar em **Supabase Vault** ou na seção de credenciais do n8n. Ao expor o webhook receiver no CRM, valide o header `apikey` ou um shared secret próprio que você injetar via `webhook.headers.authorization` ao registrar o webhook. Sem essa validação, qualquer um que descobrir a URL pode forjar eventos.

### 3.5 Idempotência: ancore tudo em `data.key.id`

Toda mensagem recebida tem `data.key.id` (Baileys) ou `messages[].id` (Cloud) único. Seu `whatsapp_messages.message_id` já está preparado para isso. Garanta UNIQUE em `(jid, message_id)` para que o webhook receiver (ou o n8n) faça `INSERT ... ON CONFLICT DO UPDATE` sem duplicar quando a Evolution reentregar.

---

## 4. Roadmap proposto (4 ondas)

### Onda P0 — Robustez do que já existe (1 semana)

Adicionar UNIQUE em `(jid, message_id)` nos `whatsapp_messages` se ainda não houver. Extrair `evolution-client.ts` substituindo o `fetch` ad-hoc da route handler. Subir Edge Function `whatsapp-webhook-connection` que apenas consome `CONNECTION_UPDATE` e grava em `whatsapp_instances_state` + notifica admin via e-mail/Slack quando state vira `close` por mais de 60s. Implementar `MESSAGES_UPDATE` no n8n: atualizar `status` (`sent`/`delivered`/`read`) e `lida` em `whatsapp_messages` por `message_id`. UI passa a mostrar ticks reais.

### Onda P1 — UX premium no chat do atendimento (1-2 semanas)

Implementar `sendPresence` no front: enquanto o atendente digita há mais de 500ms, dispara `composing`; quando pára, dispara `paused`. Adicionar suporte a `sendWhatsAppAudio` no compositor (gravação direta no navegador → upload Supabase Storage → endpoint Evolution). Adicionar `sendReaction` como menu de contexto sobre mensagens recebidas. Adicionar `deleteMessageForEveryone` e `updateMessage` (editar) com janela de 7 minutos. Sincronizar foto do contato chamando `fetchProfilePictureUrl` no primeiro evento `MESSAGES_UPSERT` de cada jid novo.

### Onda P2 — Operação + telemetria + admin (2-3 semanas)

Tela "WhatsApp" no CRM (rota `/admin/whatsapp`) com: status de conexão em tempo real (consumindo Realtime do `CONNECTION_UPDATE`), botão "reconectar" que chama `POST /instance/restart`, modal QR code (`GET /instance/connect`) renderizando o base64, configurações (settings: `rejectCall`, `msgCall`, `groupsIgnore`, `alwaysOnline`), e métricas (mensagens 24h por direção, latência média webhook → CRM, taxa de erro de envio). Adicionar `chat/whatsappNumbers` antes de qualquer broadcast (ex.: aviso de manutenção de inversor em lote).

### Onda P3 — Multi-instância + Cloud API (4-6 semanas, quando justificar)

Migrar `whatsapp_*` para modelo multi-instância: nova tabela `whatsapp_instances (id, org_id, instance_name, api_key_encrypted, integration_type, phone_number, connection_state, created_at)`, e FKs em `whatsapp_sessions.instance_id`. Ajustar `evolution-client.ts` para receber instância como parâmetro. Criar primeira instância `WHATSAPP-BUSINESS` em paralelo (Cloud API), com templates HSM pré-aprovados para os fluxos críticos (boas-vindas, lembrete de vistoria, conclusão de OS, alerta de fatura alta). Tráfego espelhado por uma semana, depois corte.

---

## 5. Snippets de partida (Onda P0)

### 5.1 Cliente Evolution centralizado

Arquivo `lib/whatsapp/evolution-client.ts`:

```ts
type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string }

export class EvolutionClient {
  constructor(private cfg: EvolutionConfig) {}

  private async req(path: string, init: RequestInit = {}) {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        'Content-Type': 'application/json',
        apikey: this.cfg.apiKey,
      },
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(`Evolution ${res.status}: ${path}`) as any
      err.status = res.status
      err.body = body
      throw err
    }
    return body
  }

  sendText(number: string, text: string, opts: { delay?: number; quoted?: any } = {}) {
    return this.req(`/message/sendText/${this.cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, text, ...opts }),
    })
  }

  sendMedia(number: string, payload: {
    mediatype: 'image' | 'video' | 'document' | 'audio'
    media: string; fileName?: string; caption?: string; mimetype?: string
  }) {
    return this.req(`/message/sendMedia/${this.cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, ...payload }),
    })
  }

  sendPresence(number: string, presence: 'composing' | 'recording' | 'paused' | 'available') {
    return this.req(`/chat/sendPresence/${this.cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, presence }),
    })
  }

  whatsappNumbers(numbers: string[]) {
    return this.req(`/chat/whatsappNumbers/${this.cfg.instance}`, {
      method: 'POST',
      body: JSON.stringify({ numbers }),
    })
  }

  connectionState() {
    return this.req(`/instance/connectionState/${this.cfg.instance}`, { method: 'GET' })
  }
}

export const evolution = new EvolutionClient({
  baseUrl: process.env.EVOLUTION_API_URL || 'https://evo.damaral.ia.br',
  apiKey: process.env.EVOLUTION_API_KEY!,
  instance: process.env.EVOLUTION_INSTANCE || 'n8n-suporte',
})
```

A route handler de envio passa a chamar `evolution.sendText(number, text)` em vez de montar `fetch` no lugar.

### 5.2 Edge Function para `CONNECTION_UPDATE`

Estrutura sugerida em `supabase/functions/whatsapp-connection/index.ts`:

```ts
import { serve } from 'std/http/server.ts'
import { createClient } from '@supabase/supabase-js'

const SHARED_SECRET = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')!
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${SHARED_SECRET}`)
    return new Response('forbidden', { status: 403 })

  const body = await req.json()
  if (body.event !== 'CONNECTION_UPDATE') return new Response('ignored', { status: 200 })

  const { instance, data } = body
  await supabase.from('whatsapp_instances_state').upsert({
    instance_name: instance,
    state: data.state,
    qr_base64: data.qrcode?.base64 ?? null,
    updated_at: new Date().toISOString(),
  })

  if (data.state === 'close') {
    await supabase.from('admin_alerts').insert({
      tipo: 'whatsapp_offline',
      titulo: `Instância ${instance} desconectada`,
      severidade: 'alta',
    })
  }

  return new Response('ok', { status: 200 })
})
```

Migração de tabelas mínimas:

```sql
CREATE TABLE IF NOT EXISTS public.whatsapp_instances_state (
  instance_name text PRIMARY KEY,
  state         text NOT NULL,
  qr_base64     text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_instances_state ENABLE ROW LEVEL SECURITY;
```

Registrar o webhook na Evolution apontando para essa Edge Function:

```bash
curl -X POST "https://evo.damaral.ia.br/webhook/set/n8n-suporte" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "url": "https://<projeto>.supabase.co/functions/v1/whatsapp-connection",
    "webhook_by_events": false,
    "events": ["CONNECTION_UPDATE", "QRCODE_UPDATED"],
    "headers": { "authorization": "Bearer <EVOLUTION_WEBHOOK_SECRET>" }
  }'
```

### 5.3 Status `MESSAGES_UPDATE` no n8n

Adicione um ramo ao workflow que escuta `MESSAGES_UPDATE` e roda um nó HTTP Request para o Supabase RPC ou direto no PostgREST:

```sql
-- Migração: aceita status sent/delivered/read no whatsapp_messages
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check CHECK (
    status = ANY (ARRAY['queued','sent','delivered','read','failed'])
  );

CREATE OR REPLACE FUNCTION public.atualizar_status_msg(p_message_id text, p_status text)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.whatsapp_messages
     SET status = p_status,
         lida   = (p_status = 'read'),
         updated_at = now()
   WHERE message_id = p_message_id;
$$;
```

E no n8n, o nó que processa `MESSAGES_UPDATE` chama essa RPC com `p_message_id = $json.body.data.keyId` e `p_status` mapeado (`PLAYED`/`READ` → `read`, `DELIVERY_ACK` → `delivered`, `SERVER_ACK` → `sent`).

---

## 6. Pontos de atenção operacionais

A instância está em VPS sua (EasyPanel + n8n), então o monitoramento é responsabilidade da casa. Inclua no plano: backup periódico do volume `/evolution/instances` (se Baileys local) ou snapshot do Redis (se `CACHE_REDIS_SAVE_INSTANCES`); monitoramento de uso de disco (mídia recebida pode crescer rápido se a Evolution baixar tudo); regra de retenção em `whatsapp_messages` no Supabase (mídias antigas para Storage frio); e teste de reconexão automática quando o WhatsApp Web invalida a sessão Baileys (acontece a cada poucas semanas em algumas contas).

Sobre segurança: ative HTTPS em `evo.damaral.ia.br` (provavelmente já está via EasyPanel/Traefik), restrinja a porta 8080 internamente, gere uma `AUTHENTICATION_API_KEY` longa (>32 chars random) e troque-a se algum dia ela vazar para um repositório público. Ao configurar webhook do CRM, sempre use shared secret no `authorization` header.

Sobre LGPD: o webhook recebe conteúdo de mensagens — texto, áudio, imagem. O Supabase já é um data processor regulado. Documente isso no DPA do cliente final (a GoNova) e tenha clara a política de retenção de mídia (sugiro 12 meses online, depois Storage frio com acesso controlado por papel).

---

## 7. Fontes

A documentação Evolution v2 foi lida nas páginas: introduction, env, install/docker, requirements/database, requirements/redis, configuration/webhooks, configuration/available-resources, integrations/chatwoot, integrations/cloudapi, integrations/typebot, integrations/dify, integrations/openai, integrations/evolution-channel, e nas referências de API de instância (create/connect/connectionState/fetch/restart/logout/delete/setPresence), mensagens (sendText, sendMedia, sendAudio, sendSticker, sendLocation, sendContact, sendReaction, sendPoll, sendList, sendButton, sendStatus), webhooks (set/get), settings (set/get), chat (find-chats, find-contacts, find-messages, check-is-whatsapp, mark-as-read, mark-as-unread, archive-chat, delete-message-for-everyone, send-presence, update-message, updateBlockStatus, fetch-profilepic-url, get-base64), grupos (todos), profile-settings (todos), integrações websocket (set/find), além do `llms.txt` consolidado da doc oficial.

URL raiz: https://doc.evolution-api.com/v2/

---

## Próximos passos sugeridos

Eu sugiro começar pela Onda P0 (1 semana de trabalho). Quando você quiser, me peça para implementar (1) o `evolution-client.ts` extraído com a route handler refatorada, ou (2) a Edge Function `whatsapp-connection` + migração da tabela `whatsapp_instances_state`, ou (3) o ramo do n8n que consome `MESSAGES_UPDATE` para atualizar status de leitura. Posso também detalhar a tela de admin (`/admin/whatsapp`) com mockup antes de codar.
