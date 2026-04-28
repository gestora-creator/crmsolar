import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const tipo = searchParams.get('tipo') || ''
  const cliente_id = searchParams.get('cliente_id') || ''
  const page = parseInt(searchParams.get('page') || '0')
  const limit = parseInt(searchParams.get('limit') || '50')

  let query = supabase
    .from('base_com_rateio')
    .select('*', { count: 'exact' })
    .order('nome_cliente', { ascending: true })
    .order('unidade', { ascending: true })
    .range(page * limit, (page + 1) * limit - 1)

  if (search) {
    query = query.or(`unidade.ilike.%${search}%,nome_cliente.ilike.%${search}%,documento.ilike.%${search}%`)
  }
  if (tipo) query = query.eq('tipo', tipo)
  if (cliente_id) query = query.eq('cliente_id', cliente_id)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const { unidade, nome_cliente, documento, tipo, rateio, data_ativacao,
    projetada, prazo, observacoes, autoconsumo, roi, cliente_id,
    unidade_antiga, data_adesao } = body

  if (!unidade || !nome_cliente) {
    return NextResponse.json({ error: 'unidade e nome_cliente são obrigatórios' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('base')
    .insert({
      unidade, nome_cliente, documento: documento || null,
      tipo: tipo || 'Beneficiária', rateio: rateio || null,
      data_ativacao: data_ativacao || null, projetada: projetada || null,
      prazo: prazo || null, observacoes: observacoes || null,
      autoconsumo: autoconsumo ?? null, roi: roi || null,
      cliente_id: cliente_id || null,
      unidade_antiga: unidade_antiga || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Registra a data de adesão no histórico de status (cria registro 'ativa' inicial)
  // Se não veio data_adesao, usa hoje.
  const dataInicio = data_adesao || new Date().toISOString().split('T')[0]
  const { error: histError } = await supabase
    .from('unidade_status_historico')
    .insert({
      unidade,
      status: 'ativa',
      data_inicio: dataInicio,
      motivo: 'cadastro inicial',
    })
  if (histError) {
    // Não falha o cadastro da UC, só loga (constraint pode reclamar se já existir)
    console.warn('[POST /unidades] erro ao criar status inicial:', histError.message)
  }

  return NextResponse.json(data, { status: 201 })
}
