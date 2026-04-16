import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  checks.env_supabase_url = {
    ok: !!url,
    detail: url ? `presente (${url.split('.')[0].replace('https://', '')}...)` : 'AUSENTE',
  }

  checks.env_service_role_key = {
    ok: !!serviceKey,
    detail: serviceKey
      ? `presente (${serviceKey.substring(0, 12)}...)`
      : 'AUSENTE — necessaria para acessar storage.objects',
  }

  if (!url || !serviceKey) {
    return NextResponse.json({ status: 'error', checks }, { status: 500 })
  }

  try {
    const client = createClient(url, serviceKey)
    const { data, error } = await client
      .schema('storage')
      .from('objects')
      .select('name')
      .eq('bucket_id', 'faturas')
      .limit(1)

    checks.storage_faturas = error
      ? { ok: false, detail: `Erro: ${error.message}` }
      : { ok: true, detail: `OK — bucket faturas acessivel` }
  } catch (e: any) {
    checks.storage_faturas = { ok: false, detail: `Excecao: ${e?.message}` }
  }

  try {
    const client = createClient(url, serviceKey)
    const { count, error } = await client
      .from('base')
      .select('*', { count: 'exact', head: true })

    checks.table_base = error
      ? { ok: false, detail: `Erro: ${error.message}` }
      : { ok: true, detail: `OK — ${count} registros na tabela base` }
  } catch (e: any) {
    checks.table_base = { ok: false, detail: `Excecao: ${e?.message}` }
  }

  const allOk = Object.values(checks).every(c => c.ok)

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks },
    { status: allOk ? 200 : 500 }
  )
}
