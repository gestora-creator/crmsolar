import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const beneficiaria = decodeURIComponent(unidade)

  const { data } = await supabase
    .from('rateio_distribuicao')
    .select(`
      geradora_unidade,
      percentual,
      base!rateio_distribuicao_geradora_unidade_fkey(nome_cliente)
    `)
    .eq('beneficiaria_unidade', beneficiaria)
    .gt('percentual', 0)

  const fontes = (data || []).map((d: any) => ({
    geradora_unidade: d.geradora_unidade,
    nome_geradora: d.base?.nome_cliente || d.geradora_unidade,
    percentual: d.percentual,
  }))

  return NextResponse.json({ fontes })
}
