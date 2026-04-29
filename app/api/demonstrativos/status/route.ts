/**
 * GET /api/demonstrativos/status?storage_path=INCOMING/UNKNOWN/sem-ref-XXX.pdf
 *
 * Usado como polling após upload assíncrono. Estados possíveis:
 *  - { status: 'processando' }                       → ainda em INCOMING/UNKNOWN, sem resposta do pg_net
 *  - { status: 'organizado', uc_geradora, ... }      → PDF foi movido pra path organizado, OCR completo
 *  - { status: 'erro', erro: '...' }                 → última resposta do pg_net foi 4xx/5xx
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const storagePath = req.nextUrl.searchParams.get('storage_path')
  if (!storagePath) {
    return NextResponse.json({ error: 'Falta storage_path' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verifica via RPC: estado do PDF (ainda em INCOMING/UNKNOWN ou organizado) +
  // última resposta do webhook armazenada em net._http_response.
  const { data: status, error } = await supabase.rpc('status_demonstrativo', {
    p_storage_path: storagePath,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(status)
}
