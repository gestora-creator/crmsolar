import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('base')
    .select('CLIENTE, Unidades, caminho_fatura')
    .not('caminho_fatura', 'is', null)
    .neq('caminho_fatura', '')
    .limit(3)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = await Promise.all(
    (data ?? []).map(async (row: any) => {
      const caminho: string = row.caminho_fatura
      const isUrl = caminho.startsWith('http')
      const storagePath = caminho.replace(/^faturas\//, '')

      let signedResult: any = null
      if (!isUrl) {
        const { data: s, error: e } = await supabase.storage
          .from('faturas')
          .createSignedUrl(storagePath, 3600)
        signedResult = {
          ok: !e,
          error: e?.message ?? null,
          url_preview: s?.signedUrl?.substring(0, 100) ?? null
        }
      }

      return {
        cliente: row['nome_cliente'],
        caminho_fatura: caminho,
        tipo: isUrl ? 'URL_DIRETA' : 'STORAGE_PATH',
        storage_path_usado: isUrl ? null : storagePath,
        signed_url: signedResult,
      }
    })
  )

  return NextResponse.json({ samples: results })
}
