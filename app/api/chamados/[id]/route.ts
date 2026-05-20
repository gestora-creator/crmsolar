/**
 * GET   /api/chamados/[id] — detalhe de um chamado (+ cliente + contato).
 * PATCH /api/chamados/[id] — atualiza status, prioridade, atribuição e resolução.
 *
 * Acesso: admin + atendentes (requireAtendimento).
 *
 * PATCH body (todos opcionais):
 *   status              — status válido
 *   prioridade          — baixa | normal | alta | urgente
 *   atribuido_a         — nome do atendente (texto)
 *   atribuido_a_user_id — uuid do usuário responsável
 *   resolucao           — texto da resolução
 *   link_agendamento    — url de agendamento
 *
 * Regra: ao mudar status para 'resolvido', resolvido_em é preenchido com now();
 * ao sair de 'resolvido', resolvido_em é limpo.
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAtendimento()
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  }

  const supabase = await createSupabaseServer()

  const { data: chamado, error } = await supabase
    .from('chamados_atendimento')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 })
  }
  if (!chamado) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 })
  }

  let cliente = null
  if (chamado.cliente_id) {
    const { data } = await supabase
      .from('crm_clientes')
      .select('id,razao_social,nome_fantasia,documento,municipio,uf')
      .eq('id', chamado.cliente_id)
      .maybeSingle()
    cliente = data ?? null
  }

  let contato = null
  if (chamado.contato_id) {
    const { data } = await supabase
      .from('crm_contatos')
      .select('id,nome_completo,celular')
      .eq('id', chamado.contato_id)
      .maybeSingle()
    contato = data ?? null
  }

  return NextResponse.json({ data: { ...chamado, cliente, contato } })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAtendimento()
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUS_VALIDOS.includes(body.status)) {
      return NextResponse.json({ error: 'status_invalido' }, { status: 400 })
    }
    update.status = body.status
    update.resolvido_em = body.status === 'resolvido' ? new Date().toISOString() : null
  }

  if (body.prioridade !== undefined) {
    if (typeof body.prioridade !== 'string' || !PRIORIDADES.includes(body.prioridade)) {
      return NextResponse.json({ error: 'prioridade_invalida' }, { status: 400 })
    }
    update.prioridade = body.prioridade
  }

  if (body.atribuido_a !== undefined) {
    update.atribuido_a =
      body.atribuido_a === null || body.atribuido_a === ''
        ? null
        : String(body.atribuido_a).slice(0, 200)
  }

  if (body.atribuido_a_user_id !== undefined) {
    if (body.atribuido_a_user_id === null || body.atribuido_a_user_id === '') {
      update.atribuido_a_user_id = null
    } else if (
      typeof body.atribuido_a_user_id === 'string' &&
      UUID_RE.test(body.atribuido_a_user_id)
    ) {
      update.atribuido_a_user_id = body.atribuido_a_user_id
    } else {
      return NextResponse.json({ error: 'atribuido_a_user_id_invalido' }, { status: 400 })
    }
  }

  if (body.resolucao !== undefined) {
    update.resolucao =
      body.resolucao === null || body.resolucao === ''
        ? null
        : String(body.resolucao).slice(0, 4000)
  }

  if (body.link_agendamento !== undefined) {
    update.link_agendamento =
      body.link_agendamento === null || body.link_agendamento === ''
        ? null
        : String(body.link_agendamento).slice(0, 1000)
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'nada_para_atualizar' }, { status: 400 })
  }

  const supabase = await createSupabaseServer()

  const { data, error } = await supabase
    .from('chamados_atendimento')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'update_failed', details: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 })
  }

  return NextResponse.json({ data })
}
