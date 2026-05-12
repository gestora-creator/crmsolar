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
export const runtime = 'nodejs'   // garante fetch externo sem restrições edge

function logErr(scope: string, err: unknown) {
  if (err instanceof EvolutionApiError) {
    console.error(`[admin/whatsapp/settings:${scope}] EvolutionApiError`, {
      status: err.status,
      path: err.path,
      body: err.body,
    })
  } else if (err instanceof Error) {
    console.error(`[admin/whatsapp/settings:${scope}] ${err.name}: ${err.message}`, err.stack)
  } else {
    console.error(`[admin/whatsapp/settings:${scope}] erro desconhecido:`, err)
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  try {
    const settings = await getEvolutionClient().getSettings()
    return NextResponse.json(settings)
  } catch (err) {
    logErr('GET', err)
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'fetch_settings_failed', status: err.status, details: err.body },
        { status: 502 }
      )
    }
    const msg = err instanceof Err