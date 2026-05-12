/**
 * GET /api/admin/whatsapp/qr
 * Solicita novo QR code da Evolution para reconectar a instância.
 *
 * Retorna { base64, code, pairingCode } ou { error }.
 */

import { NextResponse } from 'next/server'
import { getEvolutionClient } from '@/lib/whatsapp/evolution-client'
import { EvolutionApiError } from '@/lib/whatsapp/evolution-types'
import { requireAdmin } from '@/lib/auth/require-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const evolution = getEvolutionClient()
  try {
    const res = await evolution.connect()
    return NextResponse.json({
      base64: res.base64 ?? null,
      code: res.code ?? null,
      pairingCode: res.pairingCode ?? null,
    })
  } catch (err) {
    console.error('[admin/whatsapp/qr] connect falhou', err)
    if (err instanceof EvolutionApiError) {
      return NextResponse.json(
        { error: 'Falha ao gerar QR', status: err.status, details: err.body },
        { status: 502