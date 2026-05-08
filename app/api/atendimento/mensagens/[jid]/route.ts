import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evo.damaral.ia.br'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'n8n-suporte'

// GET /api/atendimento/mensagens/[jid] — Histórico de mensagens
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)
  const { searchParams } = req.nextUrl
  const limit = parseInt(searchParams.get('limit') || '50')
  const before = searchParams.get('before') // cursor paginação

  let query = supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('jid', decodedJid)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Buscar sessão
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('jid', decodedJid)
    .single()

  // Zerar não lidas
  if (session) {
    await supabase
      .from('whatsapp_sessions')
      .update({ total_msgs_nao_lidas: 0 })
      .eq('jid', decodedJid)
  }

  return NextResponse.json({
    messages: (messages || []).reverse(), // cronológico (mais antigo primeiro)
    session,
    hasMore: (messages || []).length === limit,
  })
}

// POST /api/atendimento/mensagens/[jid] — Enviar mensagem
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)
  const body = await req.json()
  const { tipo, conteudo, media_url, media_filename, media_mimetype, atendente_id, atendente_nome } = body

  if (!conteudo && !media_url) {
    return NextResponse.json({ error: 'conteudo ou media_url obrigatório' }, { status: 400 })
  }

  // Número do WhatsApp (remover @s.whatsapp.net)
  const number = decodedJid.replace('@s.whatsapp.net', '')

  try {
    // 1. Enviar via Evolution API
    let evoResponse: any
    const evoHeaders = {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    }

    if (tipo === 'text' || !tipo) {
      // Texto
      evoResponse = await fetch(
        `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: evoHeaders,
          body: JSON.stringify({
            number,
            text: conteudo,
          }),
        }
      )
    } else if (tipo === 'image' || tipo === 'document' || tipo === 'video' || tipo === 'audio') {
      // Mídia
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

    // 2. Salvar no banco
    const { data: msgData, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        jid: decodedJid,
        direcao: 'out',
        tipo: tipo || 'text',
        conteudo,
        remetente: 'atendente',
        remetente_nome: atendente_nome || 'Atendente',
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

    // 3. Atualizar sessão
    await supabase
      .from('whatsapp_sessions')
      .update({
        ultima_msg_em: new Date().toISOString(),
        timeout_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // renovar timeout 30min
        updated_at: new Date().toISOString(),
      })
      .eq('jid', decodedJid)

    return NextResponse.json({ success: true, message: msgData })
  } catch (err: any) {
    console.error('Erro ao enviar mensagem:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
