import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { serverLog } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  || 'https://evo.damaral.ia.br'
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'n8n-suporte'

const BUCKET = 'whatsapp-media'

async function getCurrentUser() {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    return user
  } catch {
    return null
  }
}

// Mapeia mimetype -> extensao mais provavel para nomeacao no Storage
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

/**
 * POST /api/atendimento/recuperar-midia/[id]
 *
 * Recupera media_url para uma mensagem que ficou orfã: chama
 * Evolution getBase64FromMediaMessage com o `message_id` salvo no
 * banco, sobe o resultado no Storage e atualiza a linha em
 * whatsapp_messages. Idempotente: se media_url já existir, retorna
 * o valor atual sem refetch.
 *
 * Casos de uso:
 *   - Mensagem antiga (anterior à feature de upload paralelo)
 *   - Sub-workflow `r1BtBcdGjja63jM4` falhou silenciosamente
 *   - Atendente clica em "Tentar recuperar" no skeleton da UI
 *
 * Retorno: { success, url, alreadyRecovered, mimetype, filename }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  // Auth: só atendentes logados
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // 1. Busca a mensagem
  const { data: msg, error: msgErr } = await supabase
    .from('whatsapp_messages')
    .select('id, jid, tipo, message_id, media_url, media_mimetype, media_filename, direcao')
    .eq('id', id)
    .single()

  if (msgErr || !msg) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  }

  // 2. Idempotente: já tem URL
  if (msg.media_url) {
    return NextResponse.json({
      success: true,
      url: msg.media_url,
      alreadyRecovered: true,
      mimetype: msg.media_mimetype,
      filename: msg.media_filename,
    })
  }

  // 3. Validações de pré-requisito
  const mediaTypes = new Set(['image', 'audio', 'video', 'document', 'sticker'])
  if (!mediaTypes.has(msg.tipo)) {
    return NextResponse.json(
      { error: 'Mensagem não é de mídia' },
      { status: 400 },
    )
  }
  if (!msg.message_id) {
    return NextResponse.json(
      { error: 'Mensagem sem message_id — recuperação impossível pela Evolution' },
      { status: 422 },
    )
  }

  // 4. Chama Evolution getBase64FromMediaMessage
  let evoJson: any
  try {
    const evoResp = await fetch(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          message: {
            key: {
              id: msg.message_id,
              remoteJid: msg.jid,
              fromMe: msg.direcao === 'out',
            },
          },
          convertToMp4: false,
        }),
      },
    )
    evoJson = await evoResp.json().catch(() => null)
    if (!evoResp.ok) {
      serverLog('error', 'recuperar_midia.evolution_error', { status: evoResp.status, body: evoJson })
      return NextResponse.json(
        {
          error: 'Evolution não retornou a mídia (mensagem pode ter expirado)',
          details: evoJson,
        },
        { status: 502 },
      )
    }
  } catch (e: any) {
    console.error('[recuperar-midia] evolution fetch failed', e)
    return NextResponse.json(
      { error: 'Falha ao contatar Evolution', details: e?.message },
      { status: 502 },
    )
  }

  const base64 = evoJson?.base64 as string | undefined
  if (!base64) {
    return NextResponse.json(
      { error: 'Evolution retornou resposta sem base64' },
      { status: 502 },
    )
  }

  // Mimetype: prefere o do banco, senão o que a Evolution mandou
  const mimetype: string =
    msg.media_mimetype ||
    evoJson?.mimetype?.split(';')?.[0]?.trim() ||
    'application/octet-stream'

  const ext = extFromMimetype(mimetype)
  const filename =
    msg.media_filename ||
    evoJson?.fileName ||
    `recovered_${id}.${ext}`

  // 5. Decodifica e sobe no Storage
  const buffer = Buffer.from(base64, 'base64')
  const jidSafe = (msg.jid || 'sem-jid').replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 60)
  const path = `incoming/${jidSafe}/recovered_${id}_${Date.now()}.${ext}`

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mimetype,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadErr || !uploadData) {
    console.error('[recuperar-midia] storage upload failed', uploadErr)
    return NextResponse.json(
      { error: 'Falha ao salvar no Storage', details: uploadErr?.message },
      { status: 500 },
    )
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)
  const publicUrl = urlData.publicUrl

  // 6. Atualiza a linha (UPDATE direto pelo id evita depender do
  //    message_id estar populado em todas as linhas legacy)
  const { error: updErr } = await supabase
    .from('whatsapp_messages')
    .update({
      media_url: publicUrl,
      media_mimetype: mimetype,
      media_filename: filename,
    })
    .eq('id', id)

  if (updErr) {
    console.error('[recuperar-midia] db update failed', updErr)
    return NextResponse.json(
      {
        error: 'Storage ok, mas falhou ao atualizar a mensagem',
        details: updErr.message,
        url: publicUrl,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    url: publicUrl,
    alreadyRecovered: false,
    mimetype,
    filename,
    size: buffer.length,
  })
}
