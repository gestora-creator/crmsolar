import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { deleteMessageForEveryone, keyFromMessage } from '@/lib/evolution/client'

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
 * POST /api/atendimento/mensagens/[id]/excluir
 *
 * Apaga uma mensagem propria (direcao='out') no WhatsApp do cliente
 * (deleteMessageForEveryone). WhatsApp permite isso ate ~7min.
 *
 * Soft-delete no banco: linha permanece para historico, mas
 * conteudo/media_url sao limpos e excluido_em recebe timestamp.
 * UI renderiza como "Esta mensagem foi apagada".
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'id invalido' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const { data: msg, error: mErr } = await supabase
    .from('whatsapp_messages')
    .select('id, message_id, jid, direcao, created_at, excluido_em')
    .eq('id', id)
    .single()
  if (mErr || !msg) return NextResponse.json({ error: 'Mensagem nao encontrada' }, { status: 404 })
  if (msg.excluido_em) {
    return NextResponse.json({ success: true, alreadyDeleted: true })
  }
  if (msg.direcao !== 'out') {
    return NextResponse.json({ error: 'So da pra excluir mensagens proprias' }, { status: 403 })
  }
  if (!msg.message_id) {
    return NextResponse.json({ error: 'Mensagem sem message_id' }, { status: 422 })
  }
  const ageMs = Date.now() - new Date(msg.created_at).getTime()
  if (ageMs > 7 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Mensagem muito antiga para excluir (limite WhatsApp: 7min)' },
      { status: 422 },
    )
  }

  const evo = await deleteMessageForEveryone(
    keyFromMessage({ message_id: msg.message_id, jid: msg.jid, direcao: 'out' }),
  )
  if (!evo.ok) {
    return NextResponse.json(
      { error: 'WhatsApp recusou a exclusao', details: evo.error },
      { status: 502 },
    )
  }

  // Soft-delete: limpa conteudo + marca timestamp
  const { error: uErr } = await supabase
    .from('whatsapp_messages')
    .update({
      excluido_em: new Date().toISOString(),
      conteudo: null,
      media_url: null,
      transcricao: null,
    })
    .eq('id', id)
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
