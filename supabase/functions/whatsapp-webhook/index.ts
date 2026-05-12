/**
 * Edge Function: whatsapp-webhook
 *
 * Recebe webhooks da Evolution API, persiste em whatsapp_events_raw (audit),
 * dispatch por tipo de evento, e — quando aplicável — chama o agente n8n
 * com o ContextoAgente pronto.
 *
 * Variáveis de ambiente esperadas (Supabase secrets):
 *   SUPABASE_URL                — auto
 *   SUPABASE_SERVICE_ROLE_KEY   — auto
 *   EVOLUTION_WEBHOOK_SECRET    — shared secret no header Authorization
 *   N8N_AGENT_URL               — URL do workflow /agent-responder
 *   N8N_AGENT_SECRET            — Bearer token p/ autenticar no n8n
 *   DRY_RUN                     — "true" para shadow mode (não chama agente)
 *
 * Deploy:
 *   supabase functions deploy whatsapp-webhook
 *
 * Configurar webhook na Evolution:
 *   curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
 *     -H "apikey: $EVOLUTION_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "url": "https://<projeto>.supabase.co/functions/v1/whatsapp-webhook",
 *       "webhook_by_events": false,
 *       "webhook_base64": true,
 *       "events": ["MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE","CONNECTION_UPDATE","QRCODE_UPDATED","CALL"],
 *       "headers": {
 *         "authorization": "Bearer <EVOLUTION_WEBHOOK_SECRET>"
 *       }
 *     }'
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  extractMediaInfo,
  extractText,
  isGroupJid,
  normalizeStatus,
  type ConnectionUpdateData,
  type MessagesUpdateData,
  type MessagesUpsertData,
  type QrcodeUpdatedData,
  type WebhookEnvelope,
} from './types.ts'

// =====================================================================
// Config
// =====================================================================
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') ?? ''
const N8N_AGENT_URL = Deno.env.get('N8N_AGENT_URL') ?? ''
const N8N_AGENT_SECRET = Deno.env.get('N8N_AGENT_SECRET') ?? ''
const DRY_RUN = Deno.env.get('DRY_RUN') === 'true'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// =====================================================================
// Util
// =====================================================================
function genTraceId(): string {
  return crypto.randomUUID()
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: unknown) {
  const payload = { ts: new Date().toISOString(), level, msg, ...((extra ?? {}) as object) }
  console.log(JSON.stringify(payload))
}

function unauthorized(reason: string): Response {
  log('warn', 'unauthorized', { reason })
  return new Response(JSON.stringify({ error: 'forbidden', reason }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ok(body: Record<string, unknown> = { status: 'ok' }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isAuthorized(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true   // dev mode
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${WEBHOOK_SECRET}`
}

// =====================================================================
// Handlers por evento
// =====================================================================

async function handleMessagesUpsert(env: WebhookEnvelope<MessagesUpsertData | MessagesUpsertData[]>) {
  const traceId = genTraceId()
  const arr = Array.isArray(env.data) ? env.data : [env.data]

  for (const msgData of arr) {
    const key = msgData.key
    if (!key) continue

    const text = extractText(msgData.message)
    const mediaInfo = extractMediaInfo(msgData.message)

    const ts = (() => {
      const raw = msgData.messageTimestamp
      if (!raw) return new Date()
      const n = typeof raw === 'number' ? raw : parseInt(String(raw))
      // Evolution costuma mandar segundos
      return n > 10_000_000_000 ? new Date(n) : new Date(n * 1000)
    })()

    log('info', 'messages_upsert', {
      trace_id: traceId,
      instance: env.instance,
      jid: key.remoteJid,
      from_me: key.fromMe,
      message_id: key.id,
      tipo: mediaInfo.tipo,
      conteudo_preview: text?.slice(0, 80),
    })

    // RPC processar_mensagem_recebida — cérebro
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('processar_mensagem_recebida', {
        p_event: env.event,
        p_instance: env.instance,
        p_jid: key.remoteJid,
        p_message_id: key.id,
        p_from_me: key.fromMe,
        p_message_type: mediaInfo.tipo,
        p_conteudo: text,
        p_media_url: mediaInfo.media_url,
        p_media_mimetype: mediaInfo.media_mimetype,
        p_media_filename: mediaInfo.media_filename,
        p_push_name: msgData.pushName ?? null,
        p_message_ts: ts.toISOString(),
        p_raw_payload: msgData as unknown as Record<string, unknown>,
      })

    if (rpcError) {
      log('error', 'rpc_processar_failed', { trace_id: traceId, error: rpcError.message })
      continue
    }

    const result = rpcResult as {
      deve_chamar_agente: boolean
      motivo_skip: string | null
      session_jid: string
      tipo_conversa: string
      ja_existia: boolean
    }

    log('info', 'rpc_processar_ok', {
      trace_id: traceId,
      deve_chamar_agente: result.deve_chamar_agente,
      motivo_skip: result.motivo_skip,
      ja_existia: result.ja_existia,
    })

    // Se não deve chamar agente, terminou o trabalho.
    if (!result.deve_chamar_agente) continue
    if (DRY_RUN) {
      log('info', 'dry_run_skip_agent', { trace_id: traceId })
      continue
    }
    if (!N8N_AGENT_URL) {
      log('warn', 'n8n_agent_url_not_configured', { trace_id: traceId })
      continue
    }

    // Dispara chamada ao agente n8n em background (não bloqueia ack do webhook).
    // O n8n responde de volta ao CRM via outra rota (/api/agent/callback).
    // Alternativa: aguardar resposta aqui mesmo (síncrono) — preferido por simplicidade.
    callAgent(traceId, env.instance, key.remoteJid, key.id, text, mediaInfo, ts).catch(err => {
      log('error', 'call_agent_failed', { trace_id: traceId, error: String(err) })
    })
  }
}

async function callAgent(
  traceId: string,
  instance: string,
  jid: string,
  messageId: string,
  conteudo: string | null,
  mediaInfo: ReturnType<typeof extractMediaInfo>,
  ts: Date
): Promise<void> {
  // Carrega contexto via RPC dedicada (Postgres faz o trabalho em 1 round-trip)
  const { data: ctx, error } = await supabase
    .rpc('build_contexto_agente', {
      p_jid: jid,
      p_message_id: messageId,
      p_historico_limit: 20,
    })

  if (error) {
    log('error', 'build_contexto_failed', { trace_id: traceId, error: error.message })
    return
  }

  const payload = {
    schema_version: 'v1',
    trace_id: traceId,
    sent_at: new Date().toISOString(),
    instance,
    cliente: (ctx as any)?.cliente ?? {},
    sessao: (ctx as any)?.sessao ?? {},
    chamados_abertos: (ctx as any)?.chamados_abertos ?? [],
    historico: (ctx as any)?.historico ?? [],
    mensagem_atual: {
      message_id: messageId,
      tipo: mediaInfo.tipo,
      conteudo,
      media_url: mediaInfo.media_url,
      media_mimetype: mediaInfo.media_mimetype,
      enviado_em: ts.toISOString(),
    },
    modo: (ctx as any)?.modo ?? 'normal',
  }

  log('info', 'calling_agent', { trace_id: traceId, url: N8N_AGENT_URL })

  const res = await fetch(N8N_AGENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${N8N_AGENT_SECRET}`,
      'x-trace-id': traceId,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    log('error', 'agent_returned_error', {
      trace_id: traceId,
      status: res.status,
      body: errText.slice(0, 500),
    })
    return
  }

  // O agente é fire-and-forget: ele recebe, processa, e envia mensagem
  // de volta via Evolution por conta própria, gravando no CRM no mesmo
  // fluxo (POST /api/atendimento/mensagens/{jid} OU direto via Evolution + RPC).
  //
  // Se quiser síncrono (n8n responde com resposta e CRM envia), trocar para:
  //   const resposta = await res.json()
  //   await enviarResposta(jid, resposta)
  log('info', 'agent_accepted', { trace_id: traceId })
}

async function handleSendMessage(env: WebhookEnvelope<MessagesUpsertData>) {
  // SEND_MESSAGE é o eco de mensagem enviada pela própria API.
  // Útil para idempotência: o CRM já gravou via POST, mas o webhook chega
  // com message_id final — só atualiza media_url se ainda não estava.
  await handleMessagesUpsert(env as any)
}

async function handleMessagesUpdate(env: WebhookEnvelope<MessagesUpdateData | MessagesUpdateData[]>) {
  const arr = Array.isArray(env.data) ? env.data : [env.data]

  for (const u of arr) {
    const messageId = u.keyId ?? u.messageId
    if (!messageId) continue

    const status = normalizeStatus(u.status)
    const { error } = await supabase.rpc('atualizar_status_mensagem', {
      p_message_id: messageId,
      p_status: status,
    })

    if (error) {
      log('error', 'atualizar_status_failed', { message_id: messageId, error: error.message })
    } else {
      log('info', 'status_updated', { message_id: messageId, status })
    }
  }
}

async function handleConnectionUpdate(env: WebhookEnvelope<ConnectionUpdateData>) {
  const state = env.data.state
  const qrBase64 = env.data.qrcode?.base64 ?? null
  const now = new Date().toISOString()

  await supabase.from('whatsapp_instances_state').upsert(
    {
      instance_name: env.instance,
      state,
      qr_base64: qrBase64,
      last_qr_at: qrBase64 ? now : undefined,
      last_connect_at: state === 'open' ? now : undefined,
      last_disconnect_at: state === 'close' ? now : undefined,
      updated_at: now,
    },
    { onConflict: 'instance_name' }
  )

  if (state === 'close') {
    await supabase.from('admin_alerts').insert({
      tipo: 'whatsapp_offline',
      titulo: `Instância "${env.instance}" desconectada`,
      descricao: `statusReason=${env.data.statusReason ?? 'n/a'}`,
      severidade: 'alta',
      metadata: { instance: env.instance, statusReason: env.data.statusReason ?? null },
    })
  }

  log('info', 'connection_update', { instance: env.instance, state })
}

async function handleQrcodeUpdated(env: WebhookEnvelope<QrcodeUpdatedData>) {
  await supabase.from('whatsapp_instances_state').upsert(
    {
      instance_name: env.instance,
      state: 'connecting',
      qr_base64: env.data.qrcode.base64,
      last_qr_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'instance_name' }
  )
  log('info', 'qrcode_updated', { instance: env.instance })
}

async function handleCall(env: WebhookEnvelope<unknown>) {
  log('info', 'call_event', { instance: env.instance, data: env.data })
  // Apenas log por enquanto. Settings auto-rejeitam.
}

// =====================================================================
// Entry point
// =====================================================================

serve(async (req: Request): Promise<Response> => {
  // Healthcheck
  if (req.method === 'GET') {
    return ok({ status: 'ok', service: 'whatsapp-webhook', dry_run: DRY_RUN })
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  if (!isAuthorized(req)) {
    return unauthorized('invalid_secret')
  }

  let env: WebhookEnvelope
  try {
    env = (await req.json()) as WebhookEnvelope
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Auditoria: gravar payload bruto (mas filtrar eventos ruidosos pra
  // não explodir a tabela em produção).
  const NOISY_EVENTS = new Set<string>([
    'PRESENCE_UPDATE',
    'CHATS_UPDATE',
    'CONTACTS_UPDATE',
    'APPLICATION_STARTUP',
  ])

  if (!NOISY_EVENTS.has(env.event)) {
    try {
      const msgId =
        (env.data as any)?.key?.id ??
        (env.data as any)?.keyId ??
        (Array.isArray(env.data) ? (env.data as any)[0]?.key?.id : null) ??
        null
      const jid =
        (env.data as any)?.key?.remoteJid ??
        (env.data as any)?.remoteJid ??
        (env.data as any)?.instance ??
        null

      await supabase.from('whatsapp_events_raw').insert({
        event: env.event,
        instance: env.instance,
        message_id: msgId,
        jid,
        payload: env as unknown as Record<string, unknown>,
      })
    } catch (err) {
      log('warn', 'audit_insert_failed', { error: String(err) })
    }
  }

  try {
    switch (env.event) {
      case 'MESSAGES_UPSERT':
        await handleMessagesUpsert(env as WebhookEnvelope<MessagesUpsertData | MessagesUpsertData[]>)
        break

      case 'SEND_MESSAGE':
        await handleSendMessage(env as WebhookEnvelope<MessagesUpsertData>)
        break

      case 'MESSAGES_UPDATE':
        await handleMessagesUpdate(env as WebhookEnvelope<MessagesUpdateData | MessagesUpdateData[]>)
        break

      case 'CONNECTION_UPDATE':
        await handleConnectionUpdate(env as WebhookEnvelope<ConnectionUpdateData>)
        break

      case 'QRCODE_UPDATED':
        await handleQrcodeUpdated(env as WebhookEnvelope<QrcodeUpdatedData>)
        break

      case 'CALL':
        await handleCall(env)
        break

      default:
        log('info', 'unhandled_event', { event: env.event })
    }
  } catch (err) {
    log('error', 'handler_error', { event: env.event, error: String(err) })
    // Retorna 200 mesmo assim — Evolution não tem retry inteligente,
    // e queremos o evento auditado (já gravamos em events_raw).
  }

  return ok()
})
