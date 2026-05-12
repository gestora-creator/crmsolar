/**
 * PUT /api/atendimento/sessao/[jid]/pausar-ia
 * Body: { pausada: boolean, motivo?: string }
 *
 * Toggle de "Pausar IA" no header do chat. Setado a true → próxima
 * mensagem recebida NÃO aciona o agente n8n (CRM filtra).
 *
 * Setado a false → IA volta a responder.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ jid: string }> }
) {
  const { jid } = await params
  const decodedJid = decodeURIComponent(jid)

  const ssr = await createSupabaseServer()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauth' }, { status: 401 })

  const { pausada, motivo } = (await req.json()) as { pausada: boolean; motivo?: string }
  if (typeof pausada !== 'boolean') {
    return NextResponse.json({ error: 'pausada (boolean) obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('pausar_ia_sessao', {
    p_jid: decodedJid,
    p_pausada: pausada,
    p_motivo: motivo ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sessao: data })
}
