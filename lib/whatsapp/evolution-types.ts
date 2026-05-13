/**
 * Types compartilhados — Evolution API v2
 *
 * Cobrem o que o CRM consome:
 *  - Payloads de webhook (eventos da Evolution → CRM)
 *  - Payloads de envio (CRM → Evolution)
 *  - Status normalizado (Evolution usa nomes diferentes em Baileys vs Cloud)
 *
 * Onde divergir entre Baileys e Cloud, exponho o normalizado e mantenho o
 * raw em `raw_*` quando precisar pra debug.
 */

// =====================================================================
// Eventos do webhook
// =====================================================================

export type EvolutionEvent =
  | 'APPLICATION_STARTUP'
  | 'QRCODE_UPDATED'
  | 'CONNECTION_UPDATE'
  | 'MESSAGES_SET'
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'MESSAGES_DELETE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_SET'
  | 'CONTACTS_UPSERT'
  | 'CONTACTS_UPDATE'
  | 'PRESENCE_UPDATE'
  | 'CHATS_SET'
  | 'CHATS_UPSERT'
  | 'CHATS_UPDATE'
  | 'CHATS_DELETE'
  | 'GROUPS_UPSERT'
  | 'GROUPS_UPDATE'
  | 'GROUP_PARTICIPANTS_UPDATE'
  | 'CALL'
  | 'TYPEBOT_START'
  | 'TYPEBOT_CHANGE_STATUS'
  | 'NEW_TOKEN'
  | 'LABELS_EDIT'
  | 'LABELS_ASSOCIATION'

export type ConnectionState = 'open' | 'connecting' | 'close'

export interface WebhookBase<T = unknown> {
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
// CONNECTION_UPDATE
// =====================================================================
export interface ConnectionUpdateData {
  instance: string
  state: ConnectionState
  statusReason?: number
  qrcode?: {
    base64?: string
    code?: string
    pairingCode?: string
  }
}

// =====================================================================
// QRCODE_UPDATED
// =====================================================================
export interface QrcodeUpdatedData {
  qrcode: {
    base64: string
    code?: string
    pairingCode?: string
  }
}

// =====================================================================
// MESSAGES_UPSERT (mensagem nova chegou ou foi enviada)
// =====================================================================
export interface MessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
  participant?: string  // presente em grupo
}

export interface MessageContent {
  conversation?: string                    // texto simples
  extendedTextMessage?: { text: string }
  imageMessage?: { caption?: string; url?: string; mimetype?: string }
  videoMessage?: { caption?: string; url?: string; mimetype?: string }
  audioMessage?: { url?: string; mimetype?: string; seconds?: number; ptt?: boolean }
  documentMessage?: { caption?: string; url?: string; mimetype?: string; fileName?: string }
  stickerMessage?: { url?: string; mimetype?: string }
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
  contactMessage?: { displayName?: string; vcard?: string }
  reactionMessage?: { key?: MessageKey; text?: string }
  // ...e outros
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
  // Quando base64 está ligado, mídias inline:
  base64?: string
}

// =====================================================================
// MESSAGES_UPDATE (status de entrega/leitura mudou, ou mensagem editada)
// =====================================================================
export type MessageStatusRaw =
  | 'PENDING'
  | 'SERVER_ACK'    // entregue ao servidor WhatsApp
  | 'DELIVERY_ACK'  // entregue ao device
  | 'READ'          // lida
  | 'PLAYED'        // áudio reproduzido
  | 'ERROR'

export type MessageStatusNormalized = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export interface MessagesUpdateData {
  keyId: string
  remoteJid: string
  fromMe: boolean
  participant?: string
  status?: MessageStatusRaw
  // Algumas variações trazem:
  messageId?: string
  instanceId?: string
}

export function normalizeStatus(raw: MessageStatusRaw | string | undefined): MessageStatusNormalized {
  switch (raw) {
    case 'PENDING':       return 'queued'
    case 'SERVER_ACK':    return 'sent'
    case 'DELIVERY_ACK':  return 'delivered'
    case 'READ':
    case 'PLAYED':        return 'read'
    case 'ERROR':         return 'failed'
    default:              return 'sent'
  }
}

// =====================================================================
// SEND_MESSAGE (eco de mensagem enviada pela própria API)
// =====================================================================
// Mesma forma do MESSAGES_UPSERT com fromMe=true

// =====================================================================
// CALL
// =====================================================================
export interface CallData {
  id: string
  chatId?: string
  from: string
  date: string
  offline?: boolean
  status?: 'offer' | 'accept' | 'reject' | 'timeout' | 'terminate'
  isVideo?: boolean
  isGroup?: boolean
}

// =====================================================================
// PAYLOADS DE ENVIO (CRM → Evolution)
// =====================================================================
export interface SendTextPayload {
  number: string
  text: string
  delay?: number
  linkPreview?: boolean
  mentioned?: string[]
  quoted?: { key: MessageKey; message?: MessageContent }
}

export type MediaType = 'image' | 'video' | 'document' | 'audio'

export interface SendMediaPayload {
  number: string
  mediatype: MediaType
  media: string                // URL pública ou base64
  mimetype?: string
  fileName?: string
  caption?: string
  delay?: number
}

export interface SendAudioPayload {
  number: string
  audio: string                // URL ou base64 (ogg/opus recomendado)
  delay?: number
  encoding?: boolean
}

export type PresenceType =
  | 'available'
  | 'unavailable'
  | 'composing'   // digitando
  | 'recording'   // gravando áudio
  | 'paused'

export interface SendPresencePayload {
  number: string
  presence: PresenceType
  delay?: number
}

export interface SendReactionPayload {
  key: MessageKey
  reaction: string             // emoji
}

export interface SendStickerPayload {
  number: string
  sticker: string
  delay?: number
}

export interface SendLocationPayload {
  number: string
  name: string
  address: string
  latitude: number
  longitude: number
}

export interface SendPollPayload {
  number: string
  name: string
  selectableCount: number
  values: string[]
}

export interface WhatsappNumbersResponse {
  exists: boolean
  jid: string
  number: string
}

// =====================================================================
// Resposta padrão da Evolution
// =====================================================================
export interface EvolutionSendResponse {
  key: MessageKey
  status?: string
  message?: MessageContent
  messageTimestamp?: string | number
}

// =====================================================================
// Settings da instância
// =====================================================================
export interface InstanceSettings {
  rejectCall?: boolean
  msgCall?: string
  groupsIgnore?: boolean
  alwaysOnline?: boolean
  readMessages?: boolean
  readStatus?: boolean
  syncFullHistory?: boolean
}

// =====================================================================
// Estado da instância (resposta de /instance/connectionState)
// =====================================================================
export interface InstanceStateResponse {
  instance: {
    instanceName: string
    state: ConnectionState
  }
}

// =====================================================================
// Erro tipado
// =====================================================================
export class EvolutionApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: unknown,
    message?: string
  ) {
    super(message ?? `Evolution ${status} ${path}`)
    this.name = 'EvolutionApiError'
  }
}

// =====================================================================
// Helpers de jid
// =====================================================================
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}

export function isBroadcastJid(jid: string): boolean {
  return jid.endsWith('@broadcast')
}

export function isChatJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net')
}

export function tipoConversaFromJid(jid: string): 'chat' | 'grupo' | 'broadcast' {
  if (isGroupJid(jid)) return 'grupo'
  if (isBroadcastJid(jid)) return 'broadcast'
  return 'chat'
}

/** Extrai o número (sem sufixo) de um jid 1:1. Retorna null para grupos. */
export function numberFromJid(jid: string): string | null {
  if (!isChatJid(jid)) return null
  return jid.replace('@s.whatsapp.net', '')
}

// =====================================================================
// Helpers de mídia
// =====================================================================

/**
 * A media_url salva na linha eh uma URL que o browser consegue carregar
 * como midia? Retorna false para URLs cruas da Evolution/Baileys
 * (mmg.whatsapp.net cifradas ou pre-assinadas que viram .enc no
 * download direto).
 *
 * Usada para:
 *   - Decidir idempotencia em recuperarMidia (se nao eh usavel,
 *     re-baixa mesmo que media_url ja esteja preenchida).
 *   - Decidir no front se mostra skeleton (pendente) ou o player.
 *
 * Conservadora: na duvida, considera nao-usavel e forca recuperacao
 * via Evolution -> Storage Supabase.
 */
export function isUsableMediaUrl(url: string | null | undefined): url is string {
  if (!url) return false
  const u = url.toLowerCase()
  // URLs cifradas do Baileys (.enc no path ou query)
  if (u.includes('.enc')) return false
  // URLs cruas da CDN do WhatsApp (mmg.whatsapp.net): pre-assinadas
  // que expiram + browser pode rejeitar Content-Type/CORS.
  if (u.includes('whatsapp.net')) return false
  return true
}
