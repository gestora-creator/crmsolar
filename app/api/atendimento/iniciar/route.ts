/**
 * POST /api/atendimento/iniciar
 *
 * Inicia uma nova conversa com um número que ainda não tem sessão.
 *
 * Fluxo:
 *   1. Valida que o usuário é atendente autenticado.
 *   2. Normaliza o número e monta o JID (E.164 -> 5511999999999@s.whatsapp.net).
 *   3. Verifica via Evolution chat/whatsappNumbers se o número
 *      realmente existe no WhatsApp — devolve 422 se não existir
 *      pra não criar conversa fantasma.
 *   4. Envia a primeira mensagem (texto) via sendText.
 *   5. Persiste a mensagem via RPC inserir_mensagem_saida_idempotente
 *      (mesmo caminho de mensagens normais — dedupe + tipo_conversa).
 *   6. Atualiza/cria a sessão atribuindo ao atendente que iniciou
 *      (atualizar_atendente, p_assumir_se_bot=true).
 *
 * Request body:
 *   {
 *     numero: '+5511999999999' | '5511999999999' | '11999999999',
 *     mensagem: 'texto inicial obrigatório',
 *     nome_contato?: 'Joao Silva'   // opcional, pra preencher whatsapp_sessions
 *   }
 *
 * Response 200:
 *   { success: true, jid, message_id, mensagem_id }
 */

export const runtime = 'nodejs'   // setTimeout do typingFor + fetch externo

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getEvolutionClient } from '@/lib/whatsapp/evolution-client'
import { EvolutionApiError, tipoConversaFromJid } from '@/lib/whatsapp/evolution-types'

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

/**
 * Aceita '+5511999999999', '5511999999999', '(11) 99999-9999', etc.
 * Devolve só dígitos. Não valida país — vamos confiar na Evolution
 * pra dizer se o número existe.
 */
function normalizeNumber(input: string): string {
  return input.replace(/\D/g, '')
}

interface IniciarBody {
  numero?: string
  mensagem?: string
  nome_contato?: string
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: IniciarBody
  try {
    body = (await req.json()) as IniciarBody
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const numero = body.numero ? normalizeNumber(body.numero) : ''
  const mensagem = body.mensagem?.trim() ?? ''

  if (!numero || numero.length < 10) {
    return NextResponse.json(
      { error: 'Número inválido. Use formato com DDD (e país, se internacional).' },
      { status: 400 }
    )
  }
  if (!mensagem) {
    return NextResponse.json({ error: 'mensagem inicial obrigatória' }, { status: 400 })
  }

  const jid = `${numero}@s.whatsapp.net`
  const evolution = getEvolutionClient()

  // 1. Validar que o número existe no WhatsApp
  try {
    const check = await evolution.whatsappNumbers([numero])
    const found = check.find(r => r.exists === true)
    if (!found) {
      return NextResponse.json(
        {
          error: 'Número não está no WhatsApp ou não pôde ser verificado',
          code: 'NUMBER_NOT_ON_WHATSAPP',
        },
        { status: 422 }
      )
    }
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'Falha ao validar número', details: err.body },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao validar número' },
      { status: 500 }
    )
  }

  // 2. Identidade do atendente
  const atendente_id = user.id
  const atendente_email = user.email ?? null
  const atendente_nome =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (atendente_email ? atendente_email.split('@')[0] : 'Atendente')
  const atendente_avatar = user.user_metadata?.avatar_url || null

  // 3. Enviar primeira mensagem
  let evoResult
  try {
    // "Digitando..." pra dar UX mais natural — não bloqueia o send
    evolution.typingFor(numero, 1_500).catch(() => {})
    evoResult = await evolution.sendText(numero, mensagem)
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'Falha ao enviar pelo WhatsApp', details: err.body, status: err.status },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao enviar' },
      { status: 500 }
    )
  }

  const message_id = evoResult?.key?.id ?? null

  // 4. Persistir mensagem (idempotente)
  let msgData: unknown = null
  if (message_id) {
    const { data, error } = await supabaseAdmin.rpc(
      'inserir_mensagem_saida_idempotente',
      {
        p_jid: jid,
        p_message_id: message_id,
        p_tipo: 'text',
        p_conteudo: mensagem,
        p_media_url: null,
        p_media_mimetype: null,
        p_media_filename: null,
        p_remetente_nome: atendente_nome,
        p_enviado_em: new Date().toISOString(),
      }
    )
    if (error) {
      console.error('[atendimento/iniciar] inserir_mensagem_saida_idempotente falhou', error)
    } else {
      msgData = data
    }
  } else {
    // Fallback — Evolution não retornou key (raro)
    const { data, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        jid,
        tipo_conversa: tipoConversaFromJid(jid),
        direcao: 'out',
        tipo: 'text',
        conteudo: mensagem,
        remetente: 'atendente',
        remetente_nome: atendente_nome,
        status: 'sent',
        lida: false,
        enviado_em: new Date().toISOString(),
      })
      .select()
      .single()
    if (error) {
      console.error('[atendimento/iniciar] insert direto falhou', error)
    }
    msgData = data
  }

  // 5. Garantir sessão atribuída ao atendente
  await supabaseAdmin.rpc('atualizar_atendente', {
    p_jid: jid,
    p_atendente_id: atendente_id,
    p_atendente_nome: atendente_nome,
    p_atendente_email: atendente_email,
    p_atendente_avatar: atendente_avatar,
    p_assumir_se_bot: true,
  })

  // Atualiza nome_contato se foi passado e não existir
  if (body.nome_contato) {
    await supabaseAdmin
      .from('whatsapp_sessions')
      .update({
        nome_contato: body.nome_contato,
        ultima_msg_em: new Date().toISOString(),
        timeout_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('jid', jid)
  } else {
    await supabaseAdmin
      .from('whatsapp_sessions')
      .update({
        ultima_msg_em: new Date().toISOString(),
        timeout_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('jid', jid)
  }

  return NextResponse.json({
    success: true,
    jid,
    message_id,
    mensagem: msgData,
  })
}
