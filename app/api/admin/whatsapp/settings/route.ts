/**
 * GET  /api/admin/whatsapp/settings  → settings atuais
 * POST /api/admin/whatsapp/settings  → atualiza settings
 *
 * Settings cobertos: rejectCall, msgCall, groupsIgnore, alwaysOnline,
 * readMessages, readStatus, syncFullHistory.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEvolutionClient } from '@/lib/whatsapp/evolution-client'
import {
  EvolutionApiError,
  type InstanceSettings,
} from '@/lib/whatsapp/evolution-types'
import { requireAdmin } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  try {
    const settings = await getEvolutionClient().getSettings()
    return NextResponse.json(settings)
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'fetch_settings_failed', status: err.status },
        { status: 502 }
      )
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = (await req.json()) as InstanceSettings
  try {
    const updated = await getEvolutionClient().setSettings(body)
    return NextResponse.json({ ok: true, settings: updated })
  } catch (err) {
    if (err instanceof EvolutionApiError) {
      return NextResponse.json({ error: 'update_failed', details: err.body }, { status: 502 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
