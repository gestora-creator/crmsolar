/**
 * Logger estruturado com mask de PII (LGPD).
 *
 * Use em route handlers e libs do servidor em vez de console.log direto.
 * - serverLog: log padronizado JSON-friendly, sem PII vazada.
 * - maskValue: mascara CPF/CNPJ/telefone/email/JID/base64.
 *
 * Consumo: cat dos logs do Vercel/Supabase Functions.
 */

type LogLevel = 'info' | 'warn' | 'error'

const SENSITIVE_KEYS = new Set([
  'cpf', 'cnpj', 'documento', 'telefone', 'phone', 'whatsapp',
  'email', 'e-mail', 'jid', 'remoteJid', 'remote_jid',
  'base64', 'b64', 'mediaKey', 'media_key',
  'password', 'senha', 'token', 'apiKey', 'api_key', 'secret',
  'authorization', 'cookie',
  'conteudo', 'content', 'message_body', 'caption',
])

/**
 * Mascara o valor mantendo um sufixo curto para diagnostico.
 * Ex.: "556799945540@s.whatsapp.net" -> "***45540@s.w***" (mantem so o final 5 chars)
 * Strings com menos de 6 chars sao trocadas por '***'
 */
export function maskValue(v: unknown): unknown {
  if (v == null) return v
  if (typeof v === 'string') {
    if (v.length < 6) return '***'
    // base64 muito longo: so prefixo + tamanho
    if (v.length > 200) return `***[len=${v.length}]`
    return `***${v.slice(-5)}`
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.slice(0, 3).map(maskValue).concat(v.length > 3 ? [`...+${v.length-3}`] : [])
  if (typeof v === 'object') return sanitizeForLog(v as Record<string, unknown>)
  return '***'
}

/**
 * Percorre o objeto e mascara campos com chave sensivel.
 */
export function sanitizeForLog(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 4) return { _truncated: true }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (SENSITIVE_KEYS.has(lk)) {
      out[k] = maskValue(v)
      continue
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeForLog(v as Record<string, unknown>, depth + 1)
    } else if (Array.isArray(v)) {
      out[k] = v.length > 5
        ? [`[array len=${v.length}, first=`, v[0], ']']
        : v
    } else {
      out[k] = v
    }
  }
  return out
}

export function serverLog(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(extra ? sanitizeForLog(extra) : {}),
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(line))
}
