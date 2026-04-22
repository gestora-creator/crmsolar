import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: retorna distribuição atual + lista de beneficiárias do mesmo cliente
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const geradora = decodeURIComponent(unidade)
  const supabase = sb()

  // Buscar geradora para saber o cliente
  const { data: uc } = await supabase
    .from('base')
    .select('unidade, nome_cliente, documento, tipo, autoconsumo, cliente_id')
    .eq('unidade', geradora)
    .single()

  if (!uc) return NextResponse.json({ error: 'UC não encontrada' }, { status: 404 })

  // Buscar UCs do mesmo cliente (para exibição rápida)
  let ucsMesmoClienteQuery = supabase
    .from('base')
    .select('unidade, nome_cliente, tipo, rateio')
    .neq('unidade', geradora)

  if (uc.cliente_id) {
    ucsMesmoClienteQuery = ucsMesmoClienteQuery.eq('cliente_id', uc.cliente_id)
  } else if (uc.documento) {
    ucsMesmoClienteQuery = ucsMesmoClienteQuery.eq('documento', uc.documento)
  }

  const { data: beneficiarias } = await ucsMesmoClienteQuery

  // Buscar UCs que já estão na distribuição mas NÃO são do mesmo cliente
  // (foram adicionadas manualmente via busca)
  const distUnidades = (distribuicao || []).map(d => d.beneficiaria_unidade)
  const ucsMesmoClienteSet = new Set((beneficiarias || []).map(b => b.unidade))
  const ucsExternas = distUnidades.filter(u => !ucsMesmoClienteSet.has(u))

  let ucExternaData: any[] = []
  if (ucsExternas.length > 0) {
    const { data } = await supabase
      .from('base')
      .select('unidade, nome_cliente, tipo, rateio')
      .in('unidade', ucsExternas)
    ucExternaData = data || []
  }

  const todasUCs = [...(beneficiarias || []), ...ucExternaData]

  // Buscar distribuição atual desta geradora
  const { data: distribuicao } = await supabase
    .from('rateio_distribuicao')
    .select('beneficiaria_unidade, percentual')
    .eq('geradora_unidade', geradora)

  const distMap = new Map((distribuicao || []).map(d => [d.beneficiaria_unidade, d.percentual]))

  return NextResponse.json({
    geradora: uc,
    beneficiarias: todasUCs.map(b => ({
      unidade: b.unidade,
      nome_cliente: b.nome_cliente,
      tipo: b.tipo,
      percentual_desta_geradora: distMap.get(b.unidade) ?? 0,
      externo: !ucsMesmoClienteSet.has(b.unidade), // flag: UC de outro cliente
    })),
  })
}

// POST: salva distribuição — upsert em lote + atualiza geradora
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const geradora = decodeURIComponent(unidade)
  const { distribuicao } = await req.json()
  // distribuicao: Array<{ beneficiaria_unidade: string, percentual: number }>

  const supabase = sb()

  // 1. Remover todas as distribuições antigas desta geradora
  await supabase.from('rateio_distribuicao').delete().eq('geradora_unidade', geradora)

  // 2. Inserir novas (apenas as com percentual > 0)
  const linhas = (distribuicao as { beneficiaria_unidade: string; percentual: number }[])
    .filter(d => d.percentual > 0)
    .map(d => ({
      geradora_unidade: geradora,
      beneficiaria_unidade: d.beneficiaria_unidade,
      percentual: d.percentual,
    }))

  if (linhas.length > 0) {
    const { error } = await supabase.from('rateio_distribuicao').insert(linhas)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 3. Atualizar rateio da própria geradora (100% - total distribuído)
  const totalDistribuido = linhas.reduce((s, l) => s + l.percentual, 0)
  const resto = Math.max(0, 100 - totalDistribuido)
  await supabase.from('base').update({ rateio: `${resto} %` }).eq('unidade', geradora)

  return NextResponse.json({ ok: true, totalDistribuido, resto })
}
