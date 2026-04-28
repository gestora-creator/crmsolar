import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET — Retorna o histórico completo de status de uma UC.
 *   Resposta: { status_atual, data_desativacao, historico: [...] }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const uc = decodeURIComponent(unidade)

  const [statusRes, histRes] = await Promise.all([
    supabase
      .from('base_com_status')
      .select('status_atual, data_desativacao')
      .eq('unidade', uc)
      .single(),
    supabase
      .from('unidade_status_historico')
      .select('id, status, data_inicio, data_fim, motivo, criado_por, criado_em')
      .eq('unidade', uc)
      .order('data_inicio', { ascending: false }),
  ])

  if (statusRes.error) {
    return NextResponse.json({ error: statusRes.error.message }, { status: 404 })
  }

  return NextResponse.json({
    status_atual: statusRes.data?.status_atual || 'ativa',
    data_desativacao: statusRes.data?.data_desativacao || null,
    historico: histRes.data || [],
  })
}

/**
 * POST — Desativa ou reativa uma UC via RPC.
 *   Body: { acao: 'desativar' | 'reativar', data: 'YYYY-MM-DD', motivo?: string, criado_por?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const { unidade } = await params
  const uc = decodeURIComponent(unidade)
  const body = await req.json()

  const { acao, data, motivo, criado_por } = body
  if (!acao || (acao !== 'desativar' && acao !== 'reativar')) {
    return NextResponse.json({ error: "acao deve ser 'desativar' ou 'reativar'" }, { status: 400 })
  }
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'data inválida (use YYYY-MM-DD)' }, { status: 400 })
  }

  const fnName = acao === 'desativar' ? 'desativar_unidade' : 'reativar_unidade'
  const params_rpc =
    acao === 'desativar'
      ? { p_unidade: uc, p_data_desativacao: data, p_motivo: motivo || null, p_criado_por: criado_por || null }
      : { p_unidade: uc, p_data_reativacao: data, p_motivo: motivo || null, p_criado_por: criado_por || null }

  const { error } = await supabase.rpc(fnName, params_rpc)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, acao, unidade: uc, data })
}
