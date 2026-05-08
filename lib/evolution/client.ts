/**
 * Wrapper centralizado da Evolution API.
 *
 * Por que isso existe:
 *   - Evita duplicar logica de fetch/headers em cada endpoint
 *   - Centraliza retry, timeout e error handling
 *   - Facilita trocar a Evolution por outra API no futuro
 *
 * Convencoes:
 *   - Todo metodo retorna { ok: true, data } | { ok: false, error, status, details }
 *   - Erros de rede/timeout sao tratados (nao throwam)
 *   - Headers (apikey) e instance sao adicionados automaticamente
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evo.damaral.ia.br'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'n8n-suporte'

const DEFAULT_TIMEOUT_MS = 15_000

export type EvoOk<T> = { ok: true; data: T }
export type EvoErr = { ok: false; error: string; status: number; details?: any }
export type EvoResult<T> = EvoOk<T> | EvoErr

export type WhatsAppKey = {
  id: string
  remoteJid: string
  fromMe: boolean
}

async function evoFetch<T = any>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<EvoResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init
  const url = `${EVOLUTION_API_URL}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const resp = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY,
        ...(rest.headers || {}),
      },
      signal: ctrl.signal,
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: json?.message || json?.error || `HTTP ${resp.status}`,
        details: json,
      }
    }
    return { ok: true, data: json as T }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, status: 504, error: 'Timeout na Evolution API' }
    }
    return { ok: false, status: 0, error: e?.message || 'Falha de rede' }
  } finally {
    clearTimeout(timer)
  }
}

// =====================================================================
// Envio de mensagens (com suporte a quoted para threaded replies)
// =====================================================================

export type QuotedRef = {
  key: WhatsAppKey
  /** Texto da mensagem citada (opcional — Evolution mostra mesmo sem) */
  message?: { conversation?: string }
}

export type SendTextParams = {
  number: string
  text: string
  quoted?: QuotedRef
}

export function sendText(p: SendTextParams) {
  return evoFetch<{ key: WhatsAppKey; message: any }>(
    `/message/sendText/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: p.number,
        text: p.text,
        ...(p.quoted ? { quoted: p.quoted } : {}),
      }),
    },
  )
}

export type SendMediaParams = {
  number: string
  mediatype: 'image' | 'document' | 'video' | 'audio'
  media: string
  caption?: string
  fileName?: string
  quoted?: QuotedRef
}

export function sendMedia(p: SendMediaParams) {
  return evoFetch<{ key: WhatsAppKey }>(
    `/message/sendMedia/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: p.number,
        mediatype: p.mediatype,
        media: p.media,
        ...(p.caption ? { caption: p.caption } : {}),
        ...(p.fileName ? { fileName: p.fileName } : {}),
        ...(p.quoted ? { quoted: p.quoted } : {}),
      }),
    },
  )
}

// =====================================================================
// Reagir a mensagem
// =====================================================================

/**
 * Reage a uma mensagem com emoji. Para REMOVER a reacao, passar emoji=''
 * (Evolution interpreta string vazia como remocao).
 */
export function sendReaction(key: WhatsAppKey, emoji: string) {
  return evoFetch<{ success: boolean }>(
    `/message/sendReaction/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({
        key,
        reaction: emoji,
      }),
    },
  )
}

// =====================================================================
// Editar mensagem (sendUpdate)
// =====================================================================

/**
 * Edita uma mensagem ja enviada. WhatsApp permite edicao apenas dentro
 * de ~15 minutos. Se passou desse tempo, Evolution retorna erro.
 */
export function editMessage(key: WhatsAppKey, newText: string) {
  return evoFetch<{ success: boolean }>(
    `/chat/updateMessage/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: key.remoteJid.replace(/@.+$/, ''),
        key,
        text: newText,
      }),
    },
  )
}

// =====================================================================
// Excluir mensagem para todos
// =====================================================================

/**
 * Exclui uma mensagem para todos (deleteMessageForEveryone). WhatsApp
 * permite isso apenas dentro de ~7 minutos para mensagens proprias.
 */
export function deleteMessageForEveryone(key: WhatsAppKey) {
  return evoFetch<{ success: boolean }>(
    `/chat/deleteMessageForEveryone/${EVOLUTION_INSTANCE}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ key }),
    },
  )
}

// =====================================================================
// Marcar mensagens como lidas
// =====================================================================

/**
 * Marca uma ou mais mensagens como lidas. O cliente vê os 2 checks
 * azuis no WhatsApp dele.
 */
export function markMessagesAsRead(messages: Array<WhatsAppKey>) {
  return evoFetch<{ success: boolean; readMessages: number }>(
    `/chat/markMessageAsRead/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({ readMessages: messages }),
    },
  )
}

// =====================================================================
// Indicador "digitando..." (presence)
// =====================================================================

export type Presence = 'composing' | 'paused' | 'available' | 'unavailable'

/**
 * Atualiza presence (typing indicator) do bot/atendente para um JID.
 * - composing  = "digitando..."
 * - paused     = parou de digitar
 * - available  = online
 * - unavailable = offline
 */
export function setPresence(jid: string, presence: Presence, delay = 1000) {
  return evoFetch<{ success: boolean }>(
    `/chat/sendPresence/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: jid.replace(/@.+$/, ''),
        presence,
        delay,
      }),
    },
  )
}

// =====================================================================
// Buscar perfil
// =====================================================================

export function fetchProfile(jid: string) {
  return evoFetch<{ name?: string; status?: string; picture?: string; numberExists?: boolean }>(
    `/chat/fetchProfile/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: jid.replace(/@.+$/, '') }),
    },
  )
}

export function fetchProfilePicture(jid: string) {
  return evoFetch<{ profilePictureUrl: string | null }>(
    `/chat/fetchProfilePictureUrl/${EVOLUTION_INSTANCE}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: jid.replace(/@.+$/, '') }),
    },
  )
}

// =====================================================================
// Helper: monta um WhatsAppKey a partir de um message_id + jid + direcao
// =====================================================================

export function keyFromMessage(opts: {
  message_id: string
  jid: string
  direcao: 'in' | 'out'
}): WhatsAppKey {
  return {
    id: opts.message_id,
    remoteJid: opts.jid,
    fromMe: opts.direcao === 'out',
  }
}
