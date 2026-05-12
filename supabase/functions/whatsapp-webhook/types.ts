/**
 * Types do webhook Evolution v2 (subset usado pela Edge Function).
 *
 * Mantemos aqui em vez de importar de lib/whatsapp/ porque Edge Function
 * é Deno e tem boundary próprio.
 */

export type EvolutionEvent =
  | 'APPLICATION_STARTUP'
  | 'QRCODE_UPDATED'
  | 'CONNECTION_UPDATE'
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'MESSAGES_DELETE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_UPSERT'
  | 'CONTACTS_UPDATE'
  | 'PRESENCE_UPDATE'
  | 'CHATS_UPSERT'
  | 'CHATS_UPDATE'
  | 'CALL'
  | 'NEW_TOKEN'

export interface MessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
  participant?: string
}

export interface MessageContent {
  conversation?: string
  extendedTextMessage?: { text: string }
  imageMessage?: { caption?: string; url?: string; mimetype?: string }
  videoMessage?: { caption?: string; url?: string; mimetype?: string }
  audioMessage?: { url?: string; mimetype?: string; seconds?: number; ptt?: boolean }
  documentMessage?: { caption?: string; url?: string; mimetype?: string; fileName?: string; title?: string }
  stickerMessage?: { url?: string; mimetype?: string }
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
  contactMessage?: { displayName?: string; vcard?: string }
  reactionMessage?: { key?: MessageKey; text?: string }
}

export interface MessagesUpsertData {
  key: MessageKey
  pushName?: string
  status?: string
  message?: MessageContent
  messageType?: string
  messageTimestamp?: number | string
  instanceId?: string
  source?: string
  base64?: string
}

export interface MessagesUpdateData {
  keyId?: string
  remoteJid?: string
  fromMe?: boolean
  status?: string
  messageId?: string
}

export interface ConnectionUpdateData {
  instance: string
  state: 'open' | 'connecting' | 'close'
  statusReason?: number
  qrcode?: {
    base64?: string
    code?: string
    pairingCode?: string
  }
}

export interface QrcodeUpdatedData {
  qrcode: {
    base64: string
    code?: string
    pairingCode?: string
  }
}

export interface WebhookEnvelope<T = unknown> {
  event: EvolutionEvent
  instance: string
  data: T
  destination?: string
  date_time?: string
  sender?: string
  server_url?: string
  apikey?: string
}

// =====================================================================
// Helpers
// =====================================================================

export function extractText(msg?: MessageContent): string | null {
  if (!msg) return null
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    msg.documentMessage?.caption ??
    null
  )
}

export function extractMediaInfo(msg?: MessageContent): {
  tipo: string
  media_url: string | null
  media_mimetype: string | null
  media_filename: string | null
} {
  if (!msg) return { tipo: 'text', media_url: null, media_mimetype: null, media_filename: null }

  if (msg.imageMessage) {
    return {
      tipo: 'image',
      media_url: msg.imageMessage.url ?? null,
      media_mimetype: msg.imageMessage.mimetype ?? null,
      media_filename: null,
    }
  }
  if (msg.videoMessage) {
    return {
      tipo: 'video',
      media_url: msg.videoMessage.url ?? null,
      media_mimetype: msg.videoMessage.mimetype ?? null,
      media_filename: null,
    }
  }
  if (msg.audioMessage) {
    return {
      tipo: msg.audioMessage.ptt ? 'audio' : 'audio',
      media_url: msg.audioMessage.url ?? null,
      media_mimetype: msg.audioMessage.mimetype ?? null,
      media_filename: null,
    }
  }
  if (msg.documentMessage) {
    return {
      tipo: 'document',
      media_url: msg.documentMessage.url ?? null,
      media_mimetype: msg.documentMessage.mimetype ?? null,
      media_filename: msg.documentMessage.fileName ?? msg.documentMessage.title ?? null,
    }
  }
  if (msg.stickerMessage) {
    return {
      tipo: 'sticker',
      media_url: msg.stickerMessage.url ?? null,
      media_mimetype: msg.stickerMessage.mimetype ?? null,
      media_filename: null,
    }
  }
  if (msg.locationMessage) return { tipo: 'location', media_url: null, media_mimetype: null, media_filename: null }
  if (msg.contactMessage) return { tipo: 'contact', media_url: null, media_mimetype: null, media_filename: null }
  if (msg.reactionMessage) return { tipo: 'reaction', media_url: null, media_mimetype: null, media_filename: null }

  return { tipo: 'text', media_url: null, media_mimetype: null, media_filename: null }
}

export function normalizeStatus(raw?: string): string {
  switch (raw) {
    case 'PENDING':      return 'queued'
    case 'SERVER_ACK':   return 'sent'
    case 'DELIVERY_ACK': return 'delivered'
    case 'READ':
    case 'PLAYED':       return 'read'
    case 'ERROR':        return 'failed'
    default:             return raw?.toLowerCase() ?? 'sent'
  }
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}
