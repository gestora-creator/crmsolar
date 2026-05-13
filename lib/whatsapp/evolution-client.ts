/**
 * Cliente Evolution API v2 — único ponto de chamadas REST do CRM.
 *
 * Use SEMPRE este client. Não construa fetch direto.
 *
 * Recursos:
 *   - Timeout configurável (30s default — aumentado de 15s em 2026-05-12
 *     porque a Evolution às vezes demora >15s em /instance/connect e
 *     /settings/find quando a conexão WhatsApp está degradada)
 *   - Retry com backoff exponencial em 5xx e 429
 *   - Erro tipado (EvolutionApiError) com status + body + path
 *   - Logging estruturado em desenvolvimento
 *
 * Auth: header `apikey` com chave global da instância. Para multi-instância,
 * crie um novo EvolutionClient por instância — o cliente é leve.
 */

import {
  type EvolutionSendResponse,
  type InstanceSettings,
  type InstanceStateResponse,
  type SendMediaPayload,
  type SendPollPayload,
  type SendPresencePayload,
  type SendReactionPayload,
  type SendTextPayload,
  type WhatsappNumbersResponse,
  EvolutionApiError,
} from './evolution-types'

interface EvolutionConfig {
  baseUrl: string
  apiKey: string
  instance: string
  /** ms — default 30000 */
  timeoutMs?: number
  /** retries em 5xx/429 — default 2 */
  maxRetries?: number
  /** habilita logs em DEBUG */
  debug?: boolean
}

export class EvolutionClient {
  private baseUrl: string
  private apiKey: string
  private instance: string
  private timeoutMs: number
  private maxRetries: number
  private debug: boolean

  constructor(cfg: EvolutionConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '')
    this.apiKey = cfg.apiKey
    this.instance = cfg.instance
    this.timeoutMs = cfg.timeoutMs ?? 30_000
    this.maxRetries = cfg.maxRetries ?? 2
    this.debug = cfg.debug ?? false
  }

  /** Instância usada por padrão pelas chamadas — útil pra log/admin. */
  get instanceName(): string {
    return this.instance
  }

  // ===================================================================
  // Núcleo
  // ===================================================================
  private async request<T>(
    path: string,
    init: RequestInit = {},
    attempt = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const startedAt = Date.now()

    if (this.debug) {
      console.log(`[evolution] ${init.method ?? 'GET'} ${path} (attempt ${attempt + 1})`)
    }

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
          ...(init.headers ?? {}),
        },
      })

      const text = await res.text()
      let body: unknown = null
      if (text) {
        try { body = JSON.parse(text) } catch { body = text }
      }

      if (this.debug) {
        console.log(
          `[evolution] ${init.method ?? 'GET'} ${path} -> ${res.status} (${Date.now() - startedAt}ms)`
        )
      }

      if (!res.ok) {
        // retry em 5xx e 429
        const isRetryable = res.status >= 500 || res.status === 429
        if (isRetryable && attempt < this.maxRetries) {
          const delay = Math.min(2_000 * Math.pow(2, attempt), 8_000)
          if (this.debug) {
            console.warn(`[evolution] retry ${path} em ${delay}ms (status ${res.status})`)
          }
          await new Promise(r => setTimeout(r, delay))
          return this.request<T>(path, init, attempt + 1)
        }
        throw new EvolutionApiError(res.status, path, body)
      }

      return body as T
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (attempt < this.maxRetries) {
          const delay = Math.min(2_000 * Math.pow(2, attempt), 8_000)
          if (this.debug) {
            console.warn(`[evolution] timeout ${path}, retry em ${delay}ms`)
          }
          await new Promise(r => setTimeout(r, delay))
          return this.request<T>(path, init, attempt + 1)
        }
        throw new EvolutionApiError(0, path, null, `Timeout após ${this.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // ===================================================================
  // Mensagens — envio
  // ===================================================================
  async sendText(
    number: string,
    text: string,
    opts: Partial<SendTextPayload> = {}
  ): Promise<EvolutionSendResponse> {
    const payload: SendTextPayload = { number, text, ...opts }
    return this.request<EvolutionSendResponse>(
      `/message/sendText/${this.instance}`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  }

  async sendMedia(payload: SendMediaPayload): Promise<EvolutionSendResponse> {
    return this.request<EvolutionSendResponse>(
      `/message/sendMedia/${this.instance}`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  }

  async sendAudio(number: string, audio: string, opts: { delay?: number; encoding?: boolean } = {}) {
    return this.request<EvolutionSendResponse>(
      `/message/sendWhatsAppAudio/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ number, audio, ...opts }) }
    )
  }

  async sendSticker(number: string, sticker: string) {
    return this.request<EvolutionSendResponse>(
      `/message/sendSticker/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ number, sticker }) }
    )
  }

  async sendLocation(
    number: string,
    name: string,
    address: string,
    latitude: number,
    longitude: number
  ) {
    return this.request<EvolutionSendResponse>(
      `/message/sendLocation/${this.instance}`,
      {
        method: 'POST',
        body: JSON.stringify({ number, name, address, latitude, longitude }),
      }
    )
  }

  async sendReaction(payload: SendReactionPayload) {
    return this.request<EvolutionSendResponse>(
      `/message/sendReaction/${this.instance}`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  }

  async sendPoll(payload: SendPollPayload) {
    return this.request<EvolutionSendResponse>(
      `/message/sendPoll/${this.instance}`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  }

  // ===================================================================
  // Chat — presence, edição, exclusão, mark as read
  // ===================================================================
  async sendPresence(payload: SendPresencePayload): Promise<void> {
    await this.request(
      `/chat/sendPresence/${this.instance}`,
      { method: 'POST', body: JSON.stringify(payload) }
    )
  }

  async markAsRead(jid: string, messageIds: string[]) {
    return this.request(
      `/chat/markMessageAsRead/${this.instance}`,
      {
        method: 'POST',
        body: JSON.stringify({
          readMessages: messageIds.map(id => ({ remoteJid: jid, id, fromMe: false })),
        }),
      }
    )
  }

  /**
   * Marca um lote de message_ids como lidos no WhatsApp do CLIENTE
   * (tick azul). Diferente de markAsRead acima que recebia uma única
   * lista, esse método é otimizado para o fluxo "atendente abriu a
   * conversa": agrupa N message_ids do mesmo jid em uma chamada só.
   *
   * Não lança erro — falhas viram log e seguem em frente. O efeito é
   * cosmético no app do cliente; não vale travar UX do atendente.
   */
  async markMessagesAsRead(jid: string, messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return
    try {
      await this.request(
        `/chat/markMessageAsRead/${this.instance}`,
        {
          method: 'POST',
          body: JSON.stringify({
            readMessages: messageIds.map(id => ({
              remoteJid: jid,
              id,
              fromMe: false,
            })),
          }),
        }
      )
    } catch (err) {
      if (this.debug) {
        console.warn(`[evolution] markMessagesAsRead falhou (${messageIds.length} msgs)`, err)
      }
    }
  }

  /**
   * Recupera base64 + mimetype de uma mensagem de mídia da Evolution.
   *
   * Necessário porque os webhooks entregam apenas a URL criptografada do
   * Baileys (.enc) — quem tenta baixar direto recebe o blob criptografado.
   * Esse endpoint pede pra Evolution descriptografar e devolver o conteúdo
   * pronto pra upload no Storage.
   */
  async getBase64FromMediaMessage(opts: {
    messageId: string
    jid: string
    fromMe: boolean
    convertToMp4?: boolean
  }): Promise<{ base64: string; mimetype?: string; fileName?: string }> {
    return this.request(
      `/chat/getBase64FromMediaMessage/${this.instance}`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: {
            key: {
              id: opts.messageId,
              remoteJid: opts.jid,
              fromMe: opts.fromMe,
            },
          },
          convertToMp4: opts.convertToMp4 ?? false,
        }),
      }
    )
  }

  async deleteForEveryone(key: { remoteJid: string; fromMe: boolean; id: string }) {
    return this.request(
      `/chat/deleteMessageForEveryone/${this.instance}`,
      { method: 'DELETE', body: JSON.stringify(key) }
    )
  }

  async updateMessage(
    number: string,
    key: { remoteJid: string; fromMe: boolean; id: string },
    text: string
  ) {
    return this.request(
      `/chat/updateMessage/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ number, key, text }) }
    )
  }

  /** Verifica se números existem no WhatsApp — usar antes de broadcasts. */
  async whatsappNumbers(numbers: string[]): Promise<WhatsappNumbersResponse[]> {
    return this.request<WhatsappNumbersResponse[]>(
      `/chat/whatsappNumbers/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ numbers }) }
    )
  }

  async fetchProfilePictureUrl(number: string): Promise<{ profilePictureUrl: string | null }> {
    return this.request(
      `/chat/fetchProfilePictureUrl/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ number }) }
    )
  }

  // ===================================================================
  // Instância — estado, conexão, settings
  // ===================================================================
  async connectionState(): Promise<InstanceStateResponse> {
    return this.request<InstanceStateResponse>(
      `/instance/connectionState/${this.instance}`,
      { method: 'GET' }
    )
  }

  /** Gera novo QR code. Retorna base64 da imagem. */
  async connect(opts?: { number?: string }): Promise<{ base64?: string; code?: string; pairingCode?: string }> {
    const path = `/instance/connect/${this.instance}${opts?.number ? `?number=${opts.number}` : ''}`
    return this.request(path, { method: 'GET' })
  }

  async restart(): Promise<{ status: string }> {
    return this.request(`/instance/restart/${this.instance}`, { method: 'PUT' })
  }

  async logout(): Promise<{ status: string }> {
    return this.request(`/instance/logout/${this.instance}`, { method: 'DELETE' })
  }

  async getSettings(): Promise<InstanceSettings> {
    return this.request<InstanceSettings>(
      `/settings/find/${this.instance}`,
      { method: 'GET' }
    )
  }

  async setSettings(settings: InstanceSettings): Promise<InstanceSettings> {
    return this.request<InstanceSettings>(
      `/settings/set/${this.instance}`,
      { method: 'POST', body: JSON.stringify(settings) }
    )
  }

  // ===================================================================
  // Webhook — set/find (admin)
  // ===================================================================
  async setWebhook(payload: {
    url: string
    enabled?: boolean
    webhook_by_events?: boolean
    webhook_base64?: boolean
    events?: string[]
    headers?: Record<string, string>
  }) {
    return this.request(
      `/webhook/set/${this.instance}`,
      { method: 'POST', body: JSON.stringify({ webhook: payload }) }
    )
  }

  async getWebhook() {
    return this.request(`/webhook/find/${this.instance}`, { method: 'GET' })
  }

  // ===================================================================
  // Helpers de conveniência
  // ===================================================================
  /**
   * Envia presença "composing" e agenda paused depois de N ms.
   * Útil pra "agente está digitando..." enquanto a IA gera resposta.
   */
  async typingFor(number: string, ms: number = 2_000): Promise<void> {
    await this.sendPresence({ number, presence: 'composing' })
    setTimeout(() => {
      this.sendPresence({ number, presence: 'paused' }).catch(() => {})
    }, ms)
  }
}

// =====================================================================
// Singleton baseado em env — uso no servidor (route handlers, edge functions)
// =====================================================================

let _singleton: EvolutionClient | null = null

export function getEvolutionClient(): EvolutionClient {
  if (_singleton) return _singleton

  const baseUrl = process.env.EVOLUTION_API_URL || 'https://evo.damaral.ia.br'
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE || 'n8n-suporte'

  if (!apiKey) {
    throw new Error('EVOLUTION_API_KEY não configurada')
  }

  _singleton = new EvolutionClient({
    baseUrl,
    apiKey,
    instance,
    debug: process.env.NODE_ENV !== 'production',
  })

  return _singleton
}

/** Use só em testes — reseta o singleton. */
export function __resetEvolutionClient(): void {
  _singleton = null
}
