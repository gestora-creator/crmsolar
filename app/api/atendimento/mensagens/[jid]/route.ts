import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_API_URL  = process.env.EVOLUTION_API_URL  || 'https://evo.damaral.ia.br'
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY  || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'n8n-suporte'

async function getCurrentUser() {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    return user
  } catch {
    return null
  }
}

// =====================================================================
// GET — Histórico de mensagens
// =====================================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)
  const { searchParams } = req.nextUrl
  const limit  = parseInt(searchParams.get('limit') || '50')
  const before = searchParams.get('before')

  let query = supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('jid', decodedJid)
    .order('enviado_em', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (before) query = query.lt('enviado_em', before)

  const { data: messages, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('jid', decodedJid)
    .single()

  // Zera não-lidas só se quem está abrindo é o atendente DONO da conversa.
  // Em modo supervisor (espiando conversa de outro), NÃO marca como lida.
  const user = await getCurrentUser()
  if (session && user && session.atendente_id === user.id) {
    await supabase
      .from('whatsapp_sessions')
      .update({ total_msgs_nao_lidas: 0 })
      .eq('jid', decodedJid)
  }

  return NextResponse.json({
    messages: (messages || []).reverse(),
    session,
    hasMore: (messages || []).length === limit,
    is_supervisor: !!(session && user && session.atendente_id !== user.id && session.atendente_id),
    current_user_id: user?.id ?? null,
  })
}

// =====================================================================
// POST — Enviar mensagem (texto e/ou mídia)
// =====================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)
  const body = await req.json()
  const {
    tipo, conteudo, media_url, media_filename, media_mimetype,
  } = body

  if (!conteudo && !media_url) {
    return NextResponse.json({ error: 'conteudo ou media_url obrigatório' }, { status: 400 })
  }

  // Atendente vem do AUTH (não mais do payload)
  const user = await getCurrentUser()
  const atendente_id    = user?.id ?? null
  const atendente_email = user?.email ?? null
  const atendente_nome  =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (atendente_email ? atendente_email.split('@')[0] : 'Atendente')
  const atendente_avatar = user?.user_metadata?.avatar_url || null

  const number = decodedJid.replace('@s.whatsapp.net', '')

  try {
    // 1. Evolution API
    let evoResponse: Response | undefined
    const evoHeaders = {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    }

    if (tipo === 'text' || !tipo) {
      evoResponse = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        { method: 'POST', headers: evoHeaders, body: JSON.stringify({ number, text: conteudo }) }
      )
    } else if (['image','document','video','audio'].includes(tipo)) {
      evoResponse = await fetch(
        `${EVOLUTION_API_URL}/message/sendMedia/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            number,
            mediatype: tipo,
            media: media_url,
            caption: conteudo || undefined,
            fileName: media_filename || undefined,
          }),
        }
      )
    }

    const evoResult = evoResponse ? await evoResponse.json().catch(() => null) : null

    if (evoResponse && !evoResponse.ok) {
      console.error('Evolution API error:', evoResult)
      return NextResponse.json(
        { error: 'Falha ao enviar pelo WhatsApp', details: evoResult },
        { status: 502 }
      )
    }

    // 2. Persistir mensagem
    const { data: msgData, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        jid: decodedJid,
        direcao: 'out',
        tipo: tipo || 'text',
        conteudo,
        remetente: 'atendente',
        remetente_nome: atendente_nome,
        media_url: media_url || null,
        media_mimetype: media_mimetype || null,
        media_filename: media_filename || null,
        message_id: evoResult?.key?.id || null,
        status: 'sent',
        lida: false,
        enviado_em: new Date().toISOString(),
      })
      .select()
      .single()

    if (msgError) throw msgError

    // 3. Atribuir atendente automaticamente (se a sessão ainda não tem dono)
    //    e renovar timeout. Usa a RPC nova com email/avatar.
    await supabase.rpc('atualizar_atendente', {
      p_jid: decodedJid,
      p_atendente_id: atendente_id,
      p_atendente_nome: atendente_nome,
      p_atendente_email: atendente_email,
      p_atendente_avatar: atendente_avatar,
      p_assumir_se_bot: true,   // se está em bot/aguardando, vira humano
    })

    await supabase
      .from('whatsapp_sessions')
      .update({
        ultima_msg_em: new Date().toISOString(),
        timeout_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('jid', decodedJid)

    return NextResponse.json({ success: true, message: msgData })
  } catch (err: any) {
    console.error('Erro ao enviar mensagem:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
