import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { markMessagesAsRead, keyFromMessage } from '@/lib/evolution/client'

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
 * POST /api/atendimento/conversas/[jid]/marcar-lido
 *
 * Marca todas as mensagens 'in' nao-lidas da conversa como lidas no
 * WhatsApp do cliente (2 checks azuis). Tambem zera total_msgs_nao_lidas
 * na sessao.
 *
 * Idempotente: se nao ha mensagens nao-lidas, nao chama Evolution.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jid: string }> },
) {
  const { jid: jidRaw } = await params
  const jid = decodeURIComponent(jidRaw)

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

  // Busca todas mensagens 'in' que ainda nao foram marcadas como lidas
  // (lida=false) e que tem message_id (sem ele Evolution nao consegue)
  const { data: msgs, error } = await supabase
    .from('whatsapp_messages')
    .select('message_id, jid, direcao')
    .eq('jid', jid)
    .eq('direcao', 'in')
    .eq('lida', false)
    .not('message_id', 'is', null)
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ success: true, marked: 0, alreadyRead: true })
  }

  const keys = msgs.map(m => keyFromMessage({
    message_id: m.message_id as string,
    jid: m.jid as string,
    direcao: 'in',
  }))

  const evo = await markMessagesAsRead(keys)
  if (!evo.ok) {
    console.error('[marcar-lido] evolution error', evo)
    // Nao falha hard — atualiza DB mesmo assim para consistencia interna
  }

  // Atualiza DB: marca como lidas + zera contador da sessao
  await supabase
    .from('whatsapp_messages')
    .update({ lida: true })
    .eq('jid', jid)
    .eq('direcao', 'in')
    .eq('lida', false)

  await supabase
    .from('whatsapp_sessions')
    .update({ total_msgs_nao_lidas: 0 })
    .eq('jid', jid)

  return NextResponse.json({
    success: true,
    marked: msgs.length,
    evolutionOk: evo.ok,
    ...(evo.ok ? {} : { evolutionError: evo.error }),
  })
}
