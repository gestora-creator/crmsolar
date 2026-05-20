/**
 * GET /api/chamados — lista de chamados de atendimento com filtros e paginação.
 *
 * Acesso: admin + atendentes (requireAtendimento).
 * Query params (todos opcionais):
 *   status      — um status válido
 *   tipo        — um tipo de chamado
 *   prioridade  — baixa | normal | alta | urgente
 *   cliente_id  — uuid do cliente
 *   q           — busca textual na descrição
 *   page        — página (default 1)
 *   pageSize    — itens por página (default 50, máx 100)
 *
 * Resposta: { data: ChamadoListItem[], page, pageSize, total }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { requireAtendimento } from '@/lib/auth/require-atendimento'

const STATUS_VALIDOS = [
  'aberto', 'em_andamento_agente', 'escalado_humano', 'agendado', 'resolvido', 'cancelado',
]
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente']

interface ClienteRef {
  id: string
  razao_social: string | null
  nome_fantasia: string | null
  documento: string | null
}

export async function GET(req: NextRequest) {
  const guard = await requireAtendimento()
  if (!guard.ok) return guard.response

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '50', 10) || 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createSupabaseServer()

  let query = supabase
    .from('chamados_atendimento')
    .select(
      'id,tipo,status,prioridade,descricao,resolucao,atribuido_a,atribuido_a_user_id,' +
        'cliente_id,contato_id,jid,link_agendamento,sla_proxima_acao_em,created_at,updated_at,resolvido_em',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  const status = sp.get('status')
  if (status && STATUS_VALIDOS.includes(status)) query = query.eq('status', status)

  const tipo = sp.get('tipo')
  if (tipo) query = query.eq('tipo', tipo)

  const prioridade = sp.get('prioridade')
  if (prioridade && PRIORIDADES.includes(prioridade)) query = query.eq('prioridade', prioridade)

  const clienteId = sp.get('cliente_id')
  if (clienteId) query = query.eq('cliente_id', clienteId)

  const q = sp.get('q')?.trim()
  if (q) query = query.ilike('descricao', `%${q}%`)

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 })
  }

  const rows = data ?? []

  // Resolve nomes de cliente em uma única query (sem depender de FK embed).
  const ids = [...new Set(rows.map((r) => r.cliente_id).filter(Boolean))] as string[]
  const clientes: Record<string, ClienteRef> = {}
  if (ids.length) {
    const { data: cli } = await supabase
      .from('crm_clientes')
      .select('id,razao_social,nome_fantasia,documento')
      .in('id', ids)
    for (const c of (cli ?? []) as ClienteRef[]) clientes[c.id] = c
  }

  const result = rows.map((r) => ({
    ...r,
    cliente: r.cliente_id ? clientes[r.cliente_id] ?? null : null,
  }))

  return NextResponse.json({ data: result, page, pageSize, total: count ?? 0 })
}
