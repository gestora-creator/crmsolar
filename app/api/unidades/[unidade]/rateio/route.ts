import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Extrai os 8 primeiros dígitos do CNPJ (cnpj_base = matriz + filiais)
function getCnpjBase(documento: string | null): string | null {
  if (!documento) return null
  const digits = documento.replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(0, 8) : null
}

// GET: retorna distribuição atual + UCs do mesmo CNPJ base (matriz + filiais)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const geradora = decodeURIComponent(unidade)
  const supabase = sb()

  // Buscar a geradora
  const { data: uc } = await supabase
    .from('base')
    .select('unidade, nome_cliente, documento, tipo, autoconsumo, cliente_id')
    .eq('unidade', geradora)
    .single()

  if (!uc) return NextResponse.json({ error: 'UC não encontrada' }, { status: 404 })

  const cnpjBase = getCnpjBase(uc.documento)

  // Buscar TODAS as UCs do mesmo CNPJ base (mesmos 8 primeiros dígitos)
  // Isso cobre: mesma empresa (0001), filiais (0002, 0003...), sub-CNPJs
  let ucsQuery = supabase
    .from('base')
    .select('unidade, nome_cliente, tipo, documento, rateio')
    .neq('unidade', geradora)

  if (cnpjBase) {
    // Filtra por CNPJ base usando LIKE nos primeiros 8 dígitos (sem pontuação)
    // Ex: 18325344 pega 18.325.344/0001-36 E 18.325.344/0002-17 E 18.325.344/0003-XX
    ucsQuery = ucsQuery.or(
      `documento.ilike.${cnpjBase.slice(0,2)}.${cnpjBase.slice(2,5)}.${cnpjBase.slice(5,8)}%`
    )
  } else if (uc.cliente_id) {
    // Fallback para CPF ou documento sem CNPJ: mesmo cliente_id
    ucsQuery = ucsQuery.eq('cliente_id', uc.cliente_id)
  }

  const { data: ucsDisponiveis } = await ucsQuery

  // Buscar distribuição atual desta geradora
  const { data: distribuicao } = await supabase
    .from('rateio_distribuicao')
    .select('beneficiaria_unidade, percentual')
    .eq('geradora_unidade', geradora)

  const distMap = new Map((distribuicao || []).map(d => [d.beneficiaria_unidade, d.percentual]))

  // UCs que já estão na distribuição mas não vieram na query (edge case)
  const ucSet = new Set((ucsDisponiveis || []).map(u => u.unidade))
  const ucsFaltantes = [...distMap.keys()].filter(u => !ucSet.has(u))

  let ucsExtras: any[] = []
  if (ucsFaltantes.length > 0) {
    const { data } = await supabase.from('base')
      .select('unidade, nome_cliente, tipo, documento, rateio')
      .in('unidade', ucsFaltantes)
    ucsExtras = data || []
  }

  const todas = [...(ucsDisponiveis || []), ...ucsExtras]

  return NextResponse.json({
    geradora: uc,
    cnpj_base: cnpjBase,
    beneficiarias: todas.map(b => ({
      unidade: b.unidade,
      nome_cliente: b.nome_cliente,
      tipo: b.tipo,
      documento: b.documento,
      percentual_desta_geradora: distMap.get(b.unidade) ?? 0,
    })),
  })
}

// POST: salva distribuição em lote
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const geradora = decodeURIComponent(unidade)
  const { distribuicao } = await req.json()

  const supabase = sb()

  // Remover distribuições antigas
  await supabase.from('rateio_distribuicao').delete().eq('geradora_unidade', geradora)

  // Inserir novas (apenas percentual > 0)
  const linhas = (distribuicao as { beneficiaria_unidade: string; percentual: number }[])
    .filter(d => d.percentual > 0)
    .map(d => ({ geradora_unidade: geradora, beneficiaria_unidade: d.beneficiaria_unidade, percentual: d.percentual }))

  if (linhas.length > 0) {
    const { error } = await supabase.from('rateio_distribuicao').insert(linhas)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Atualizar rateio da própria geradora (resto)
  const totalDistribuido = linhas.reduce((s, l) => s + l.percentual, 0)
  const resto = Math.max(0, 100 - totalDistribuido)
  await supabase.from('base').update({ rateio: `${resto} %` }).eq('unidade', geradora)

  return NextResponse.json({ ok: true, totalDistribuido, resto })
}
