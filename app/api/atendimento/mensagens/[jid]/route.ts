/**
 * Route handler — atendimento humano envia mensagem ao cliente.
 *
 * V3:
 *   - Usa o EvolutionClient centralizado (lib/whatsapp/evolution-client).
 *   - Dedupe via RPC inserir_mensagem_saida_idempotente (a UNIQUE index
 *     parcial não é acessível pelo .upsert() do supabase-js).
 *   - Bloqueia envio para grupos via aba "atendimento" (separar fluxo).
 *   - Garante que tipo_conversa é setado coerentemente.
 *   - "Digitando..." real: dispara composing antes do send.
 *   - Tratamento de erro tipado.
 */

export const runtime = 'nodejs'   // garante setTimeout do typingFor

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  getEvolutionClient,
} from '@/lib/whatsapp/evolution-client'
import {
  EvolutionApiError,
  isChatJid,
  isGroupJid,
  numberFromJid,
  tipoConversaFromJid,
  type MediaType,
} from '@/lib/whatsapp/evolution-types'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const before = searchParams.get('before')

  let query = supabaseAdmin
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

  const { data: session } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('*')
    .eq('jid', decodedJid)
    .single()

  // Marca como lida + propaga pro WhatsApp do cliente (tick azul).
  //
  // Só executa quando o atendente DONO da sessão abre a conversa —
  // supervisores observando não devem disparar markAsRead no WhatsApp.
  //
  // Fluxo:
  //   1. RPC marcar_conversa_como_lida(p_jid) — UPDATE lida=true em msgs in
  //      + zera whatsapp_sessions.total_msgs_nao_lidas, retornando os
  //      message_ids que foram marcados.
  //   2. Fire-and-forget Evolution chat/markMessageAsRead pra esses ids
  //      (não bloqueia a resposta — UX fica rápida e tick azul aparece
  //      em segundo plano).
  const user = await getCurrentUser()
  const isOwner = !!(session && user && session.atendente_id === user.id)

  if (isOwner) {
    const { data: marcadas, error: marcErr } = await supabaseAdmin.rpc(
      'marcar_conversa_como_lida',
      { p_jid: decodedJid }
    )
    if (marcErr) {
      console.error('[atendimento/mensagens] marcar_conversa_como_lida falhou', marcErr)
    } else {
      const ids = (marcadas as Array<{ marked_message_id: string }> | null)
        ?.map(r => r.marked_message_id)
        .filter(Boolean) ?? []
      if (ids.length > 0) {
        // fire-and-forget — não await
        getEvolutionClient()
          .markMessagesAsRead(decodedJid, ids)
          .catch(err => console.warn('[atendimento/mensagens] markMessagesAsRead bg falhou', err))
      }
    }
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
interface SendBody {
  tipo?: 'text' | 'image' | 'document' | 'video' | 'audio'
  conteudo?: string
  media_url?: string
  media_filename?: string
  media_mimetype?: string
  show_typing?: boolean   // dispara composing antes do envio
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)

  // Bloqueio: grupos não usam o fluxo padrão de atendimento.
  // Se for grupo, retornar 400 com instrução clara — front pode renderizar
  // mensagem específica.
  if (isGroupJid(decodedJid)) {
    return NextResponse.json(
      {
        error: 'Envio para grupos não é suportado pelo fluxo de atendimento.',
        code: 'GROUP_NOT_SUPPORTED',
      },
      { status: 400 }
    )
  }

  if (!isChatJid(decodedJid)) {
    return NextResponse.json(
      { error: 'JID inválido', jid: decodedJid },
      { status: 400 }
    )
  }

  const body = (await req.json()) as SendBody
  const { tipo, conteudo, media_url, media_filename, media_mimetype, show_typing } = body

  if (!conteudo && !media_url) {
    return NextResponse.json(
      { error: 'conteudo ou media_url obrigatório' },
      { status: 400 }
    )
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const atendente_id = user.id
  const atendente_email = user.email ?? null
  const atendente_nome =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (atendente_email ? atendente_email.split('@')[0] : 'Atendente')
  const atendente_avatar = user.user_metadata?.avatar_url || null

  const number = numberFromJid(decodedJid)!
  const evolution = getEvolutionClient()

  try {
    // 1. "Digitando..." real (não bloqueia o envio)
    if (show_typing !== false) {
      evolution.typingFor(number, 1_500).catch(() => {})
    }

    // 2. Enviar via Evolution
    let evoResult
    if (!tipo || tipo === 'text') {
      evoResult = await evolution.sendText(number, conteudo!)
    } else if (['image', 'document', 'video', 'audio'].includes(tipo)) {
      evoResult = await evolution.sendMedia({
        number,
        mediatype: tipo as MediaType,
        media: media_url!,
        caption: conteudo || undefined,
        fileName: media_filename || undefined,
        mimetype: media_mimetype || undefined,
      })
    } else {
      return NextResponse.json({ error: `Tipo não suportado: ${tipo}` }, { status: 400 })
    }

    const message_id = evoResult?.key?.id ?? null

    // 3. Persistir mensagem (idempotente via RPC — supabase-js não consegue
    //    fazer ON CONFLICT com WHERE clause necessário pra partial index).
    let msgData
    if (message_id) {
      const { data, error } = await supabaseAdmin.rpc(
        'inserir_mensagem_saida_idempotente',
        {
          p_jid: decodedJid,
          p_message_id: message_id,
          p_tipo: tipo || 'text',
          p_conteudo: conteudo ?? null,
          p_media_url: media_url ?? null,
          p_media_mimetype: media_mimetype ?? null,
          p_media_filename: media_filename ?? null,
          p_remetente_nome: atendente_nome,
          p_enviado_em: new Date().toISOString(),
        }
      )
      if (error) throw error
      msgData = data
    } else {
      // Sem message_id (raro — Evolution não retornou key). Insert direto.
      const { data, error } = await supabaseAdmin
        .from('whatsapp_messages')
        .insert({
          jid: decodedJid,
          tipo_conversa: tipoConversaFromJid(decodedJid),
          direcao: 'out',
          tipo: tipo || 'text',
          conteudo,
          remetente: 'atendente',
          remetente_nome: atendente_nome,
          media_url: media_url || null,
          media_mimetype: media_mimetype || null,
          media_filename: media_filename || null,
          status: 'sent',
          lida: false,
          enviado_em: new Date().toISOString(),
        })
        .select()
        .single()
      if (error) throw error
      msgData = data
    }

    // 4. Atualizar sessão (atendente + timeout)
    await supabaseAdmin.rpc('atualizar_atendente', {
      p_jid: decodedJid,
      p_atendente_id: atendente_id,
      p_atendente_nome: atendente_nome,
      p_atendente_email: atendente_email,
      p_atendente_avatar: atendente_avatar,
      p_assumir_se_bot: true,
    })

    await supabaseAdmin
      .from('whatsapp_sessions')
      .update({
        ultima_msg_em: new Date().toISOString(),
        timeout_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('jid', decodedJid)

    return NextResponse.json({ success: true, message: msgData })

  } catch (err) {
    if (err instanceof EvolutionApiError) {
      console.error('[atendimento] Evolution API error:', {
        status: err.status,
        path: err.path,
        body: err.body,
      })
      return NextResponse.json(
        {
          error: 'Falha ao enviar pelo WhatsApp',
          details: err.body,
          status: err.status,
        },
        { status: 502 }
      )
    }

    console.error('[atendimento] Erro inesperado:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
