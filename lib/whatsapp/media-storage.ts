/**
 * Helper de mídia WhatsApp — descriptografa via Evolution, sobe no
 * Storage Supabase e atualiza a linha em whatsapp_messages.
 *
 * Usado pelos endpoints sob-demanda:
 *   - POST /api/atendimento/midia/[id]/baixar       (v3.1, padrão)
 *   - POST /api/atendimento/recuperar-midia/[id]    (legacy, mantido)
 *
 * Idempotente: se a linha já tem media_url, retorna sem refetch.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getEvolutionClient } from './evolution-client'
import { EvolutionApiError, isUsableMediaUrl } from './evolution-types'

export const WHATSAPP_BUCKET = 'whatsapp-media'

// isUsableMediaUrl foi movido para evolution-types.ts (safe pro client).
// Importado acima como named import.

export type RecuperarMidiaOk = {
  success: true
  url: string
  alreadyRecovered: boolean
  mimetype: string
  filename: string
  size?: number
}

export type RecuperarMidiaFail = {
  success: false
  status: number   // HTTP code sugerido pra resposta
  error: string
  details?: unknown
}

export type RecuperarMidiaResult = RecuperarMidiaOk | RecuperarMidiaFail

/** Heurística mimetype -> extensão para nomeação. */
function extFromMimetype(mt: string | null | undefined): string {
  const m = (mt || '').toLowerCase()
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('mp4') && m.startsWith('audio')) return 'm4a'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('webm')) return 'webm'
  if (m.includes('webp')) return 'webp'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('gif')) return 'gif'
  if (m.includes('pdf')) return 'pdf'
  return 'bin'
}

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Pipeline completo de recuperação de mídia.
 *
 * @param messageId id numérico (BIGSERIAL) da linha em whatsapp_messages
 */
export async function recuperarMidia(messageId: number): Promise<RecuperarMidiaResult> {
  if (!Number.isFinite(messageId)) {
    return { success: false, status: 400, error: 'id inválido' }
  }

  const supabase = admin()

  // 1. Carregar mensagem
  const { data: msg, error: msgErr } = await supabase
    .from('whatsapp_messages')
    .select('id, jid, tipo, message_id, media_url, media_mimetype, media_filename, direcao')
    .eq('id', messageId)
    .maybeSingle()

  if (msgErr) {
    return { success: false, status: 500, error: 'Erro ao consultar mensagem', details: msgErr.message }
  }
  if (!msg) {
    return { success: false, status: 404, error: 'Mensagem não encontrada' }
  }

  // 2. Idempotente — só pula recuperação quando a URL já é renderizável
  //    (Storage Supabase). URLs cruas do WhatsApp/.enc são tratadas como
  //    pendentes e disparam o pipeline de descriptografia mesmo se
  //    media_url já estiver preenchida.
  if (isUsableMediaUrl(msg.media_url)) {
    return {
      success: true,
      url: msg.media_url,
      alreadyRecovered: true,
      mimetype: msg.media_mimetype ?? 'application/octet-stream',
      filename: msg.media_filename ?? `media_${msg.id}`,
    }
  }

  // 3. Pré-requisitos
  const mediaTypes = new Set(['image', 'audio', 'video', 'document', 'sticker'])
  if (!mediaTypes.has(msg.tipo)) {
    return { success: false, status: 400, error: 'Mensagem não é de mídia' }
  }
  if (!msg.message_id) {
    return {
      success: false,
      status: 422,
      error: 'Mensagem sem message_id — recuperação impossível pela Evolution',
    }
  }

  // 4. Pedir descriptografia pra Evolution
  const evolution = getEvolutionClient()
  let evo: { base64: string; mimetype?: string; fileName?: string }
  try {
    evo = await evolution.getBase64FromMediaMessage({
      messageId: msg.message_id,
      jid: msg.jid,
      fromMe: msg.direcao === 'out',
    })
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return {
        success: false,
        status: 502,
        error: 'Evolution não retornou a mídia (mensagem pode ter expirado)',
        details: err.body,
      }
    }
    return {
      success: false,
      status: 502,
      error: 'Falha ao contatar Evolution',
      details: err instanceof Error ? err.message : String(err),
    }
  }

  if (!evo?.base64) {
    return { success: false, status: 502, error: 'Evolution retornou resposta sem base64' }
  }

  // 5. Determinar mimetype + filename
  const mimetype =
    msg.media_mimetype ||
    evo.mimetype?.split(';')?.[0]?.trim() ||
    'application/octet-stream'

  const ext = extFromMimetype(mimetype)
  const filename = msg.media_filename || evo.fileName || `media_${msg.id}.${ext}`

  // 6. Upload Storage
  const buffer = Buffer.from(evo.base64, 'base64')
  const jidSafe = (msg.jid || 'sem-jid').replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 60)
  const path = `incoming/${jidSafe}/recovered_${msg.id}_${Date.now()}.${ext}`

  const { data: up, error: upErr } = await supabase.storage
    .from(WHATSAPP_BUCKET)
    .upload(path, buffer, {
      contentType: mimetype,
      cacheControl: '3600',
      upsert: false,
    })

  if (upErr || !up) {
    return {
      success: false,
      status: 500,
      error: 'Falha ao salvar no Storage',
      details: upErr?.message,
    }
  }

  const { data: urlData } = supabase.storage.from(WHATSAPP_BUCKET).getPublicUrl(up.path)
  const publicUrl = urlData.publicUrl

  // 7. UPDATE da linha
  const { error: updErr } = await supabase
    .from('whatsapp_messages')
    .update({
      media_url: publicUrl,
      media_mimetype: mimetype,
      media_filename: filename,
    })
    .eq('id', msg.id)

  if (updErr) {
    // Storage subiu mas DB falhou — devolvemos o URL pra UI conseguir
    // renderizar imediatamente, mas o status fica 500 pra logar.
    return {
      success: false,
      status: 500,
      error: 'Storage ok, mas falhou ao atualizar a mensagem',
      details: updErr.message,
    }
  }

  return {
    success: true,
    url: publicUrl,
    alreadyRecovered: false,
    mimetype,
    filename,
    size: buffer.length,
  }
}
