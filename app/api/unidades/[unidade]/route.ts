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
  const uc = decodeURIComponent(unidade)

  const [ucRes, histRes] = await Promise.all([
    supabase.from('base_com_status').select('*').eq('unidade', uc).single(),
    supabase.from('historico_documentos')
      .select('mes_ano, url, tipo, created_at')
      .eq('unidade', uc)
      .order('mes_ano', { ascending: false })
      .limit(24),
  ])

  if (ucRes.error) return NextResponse.json({ error: ucRes.error.message }, { status: 404 })
  return NextResponse.json({ uc: ucRes.data, historico: histRes.data || [] })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const uc = decodeURIComponent(unidade)
  const body = await req.json()

  const allowed = ['nome_cliente','documento','tipo','rateio','data_ativacao',
    'projetada','prazo','observacoes','autoconsumo','roi','historico_gerado',
    'saldo_credito','cliente_id','unidade_antiga']

  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // data_adesao não fica na tabela base — vai pra unidade_status_historico via RPC
  if ('data_adesao' in body && body.data_adesao) {
    const { error: rpcError } = await supabase.rpc('definir_data_adesao', {
      p_unidade: uc,
      p_data_adesao: body.data_adesao,
    })
    if (rpcError) {
      return NextResponse.json({ error: 'Erro ao salvar data de adesão: ' + rpcError.message }, { status: 500 })
    }
  }

  // Se só veio data_adesao no body, não tem outras updates pra rodar — retorna ok
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { data, error } = await supabase
    .from('base')
    .update(updates)
    .eq('unidade', uc)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const uc = decodeURIComponent(unidade)

  const { error } = await supabase.from('base').delete().eq('unidade', uc)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
