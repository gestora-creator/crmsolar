/**
 * POST /api/admin/whatsapp/restart
 * Reinicia a instância Evolution.
 *
 * IMPORTANTE: usuário precisa ter papel admin. Implementar middleware
 * de role check antes de subir pra produção. Por ora valida apenas auth.
 */

import { NextResponse } from 'next/server'
import { getEvolutionClient } from '@/lib/whatsapp/evolution-client'
import { EvolutionApiError } from '@/lib/whatsapp/evolution-types'
import { requireAdmin } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const evolution = getEvolutionClient()
  try {
    const res = await evolution.restart()
    return NextResponse.json({ ok: true, ...res })
  } catch (err) {
    console.error('[admin/whatsapp/restart] falhou', err)
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'restart_failed', status: err.status, details: err.body },
        { status: 502 }
      )
    }
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
