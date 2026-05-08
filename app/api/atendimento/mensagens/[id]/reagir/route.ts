import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { sendReaction, keyFromMessage } from '@/lib/evolution/client'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getCurrentUser() {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    return user
  } catch { return null }
}

/**
 * POST /api/atendimento/mensagens/[id]/reagir
 *
 * Body: { emoji: string }  — string vazia '' remove a reacao.
 *
 * Reage a uma mensagem como atendente. Cliente ve a reacao no
 * WhatsApp dele em tempo real. Atualiza coluna reactions (jsonb)
 * com a nova entrada (substitui se atendente ja reagiu).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id invalido' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const emoji = (body?.emoji ?? '') as string
  if (typeof emoji !== 'string' || emoji.length > 10) {
    return NextResponse.json({ error: 'emoji invalido' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
  const userName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : 'Atendente')

  const { data: msg, error: mErr } = await supabase
    .from('whatsapp_messages')
    .select('id, message_id, jid, direcao, reactions')
    .eq('id', id)
    .single()
  if (mErr || !msg) return NextResponse.json({ error: 'Mensagem nao encontrada' }, { status: 404 })
  if (!msg.message_id) {
    return NextResponse.json({ error: 'Mensagem sem message_id' }, { status: 422 })
  }

  const evo = await sendReaction(
    keyFromMessage({ message_id: msg.message_id, jid: msg.jid, direcao: msg.direcao }),
    emoji,
  )
  if (!evo.ok) {
    return NextResponse.json(
      { error: 'Falha ao reagir no WhatsApp', details: evo.error },
      { status: 502 },
    )
  }

  // Atualiza array reactions: remove reacao previa do mesmo atendente, adiciona nova (se nao vazia)
  const reactions = (Array.isArray(msg.reactions) ? msg.reactions : []) as any[]
  const filtered = reactions.filter(
    r => !(r.by === 'atendente' && r.atendente_id === user.id),
  )
  const updated = emoji
    ? [...filtered, { emoji, by: 'atendente', atendente_id: user.id, name: userName, ts: new Date().toISOString() }]
    : filtered

  const { error: uErr } = await supabase
    .from('whatsapp_messages')
    .update({ reactions: updated })
    .eq('id', id)
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, reactions: updated })
}
