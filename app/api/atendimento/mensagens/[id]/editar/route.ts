import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { editMessage, keyFromMessage } from '@/lib/evolution/client'

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
 * POST /api/atendimento/mensagens/[id]/editar
 *
 * Body: { texto: string }
 *
 * Edita uma mensagem propria (direcao='out'). WhatsApp permite edicao
 * apenas dentro de ~15min — se passou, Evolution retorna erro.
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
  const texto = (body?.texto ?? '').toString().trim()
  if (!texto) return NextResponse.json({ error: 'texto obrigatorio' }, { status: 400 })
  if (texto.length > 4096) return NextResponse.json({ error: 'texto muito longo (max 4096)' }, { status: 400 })

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  const { data: msg, error: mErr } = await supabase
    .from('whatsapp_messages')
    .select('id, message_id, jid, direcao, tipo, conteudo, created_at')
    .eq('id', id)
    .single()
  if (mErr || !msg) return NextResponse.json({ error: 'Mensagem nao encontrada' }, { status: 404 })
  if (msg.direcao !== 'out') {
    return NextResponse.json({ error: 'So da pra editar mensagens proprias' }, { status: 403 })
  }
  if (!msg.message_id) {
    return NextResponse.json({ error: 'Mensagem sem message_id' }, { status: 422 })
  }
  if (msg.tipo !== 'text') {
    return NextResponse.json({ error: 'So da pra editar mensagens de texto' }, { status: 400 })
  }
  // WhatsApp permite editar ate ~15min apos enviar
  const ageMs = Date.now() - new Date(msg.created_at).getTime()
  if (ageMs > 15 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Mensagem muito antiga para editar (limite WhatsApp: 15min)' },
      { status: 422 },
    )
  }

  const evo = await editMessage(
    keyFromMessage({ message_id: msg.message_id, jid: msg.jid, direcao: 'out' }),
    texto,
  )
  if (!evo.ok) {
    return NextResponse.json(
      { error: 'WhatsApp recusou a edicao', details: evo.error },
      { status: 502 },
    )
  }

  const { error: uErr } = await supabase
    .from('whatsapp_messages')
    .update({ conteudo: texto, editado_em: new Date().toISOString() })
    .eq('id', id)
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
