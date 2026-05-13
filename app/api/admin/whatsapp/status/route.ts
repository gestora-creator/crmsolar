/**
 * GET /api/admin/whatsapp/status
 *
 * Retorna estado consolidado da instância: Evolution real + estado salvo
 * pela última CONNECTION_UPDATE. Usado na tela /admin/whatsapp.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEvolutionClient } from '@/lib/whatsapp/evolution-client'
import { EvolutionApiError } from '@/lib/whatsapp/evolution-types'
import { requireAdmin } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const evolution = getEvolutionClient()

  // 1. Estado em tempo real (Evolution)
  let liveState: string | null = null
  let liveError: string | null = null
  try {
    const res = await evolution.connectionState()
    liveState = res.instance?.state ?? null
  } catch (err) {
    console.error('[admin/whatsapp/status] connectionState falhou', err)
    liveError = err instanceof EvolutionApiError
      ? `Evolution ${err.status}: ${err.path}`
      : err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  // 2. Estado salvo (último CONNECTION_UPDATE recebido)
  const { data: savedState, error: savedErr } = await supabase
    .from('whatsapp_instances_state')
    .select('*')
    .eq('instance_name', evolution.instanceName)
    .maybeSingle()

  if (savedErr) {
    console.error('[admin/whatsapp/status] saved state query falhou', savedErr)
  }

  // 3. Métricas rápidas (últimas 24h)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [
    { count: msg_in_24h },
    { count: msg_out_24h },
    { count: sessoes_ativas },
  ] = await Promise.all([
    supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direcao', 'in')
      .gte('created_at', since),
    supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direcao', 'out')
      .gte('created_at', since),
    supabase
      .from('whatsapp_sessions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['aguardando', 'humano', 'bot']),
  ])

  // 4. Alertas não lidos
  const { count: alertas_nao_lidos } = await supabase
    .from('admin_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('lido', false)

  return NextResponse.json({
    instance: evolution.instanceName,
    live_state: liveState,
    live_error: liveError,
    saved_state: savedState,
    metrics: {
      msg_in_24h: msg_in_24h ?? 0,
      msg_out_24h: msg_out_24h ?? 0,
      sessoes_ativas: sessoes_ativas ?? 0,
      alertas_nao_lidos: alertas_nao_lidos ?? 0,
    },
  })
}
