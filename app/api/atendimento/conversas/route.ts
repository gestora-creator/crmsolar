import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Pega o usuário logado a partir dos cookies SSR (auth do CRM)
async function getCurrentUser() {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    return user
  } catch {
    return null
  }
}

// =============================================================
// GET /api/atendimento/conversas — Listar conversas
// =============================================================
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status')        // bot | humano | aguardando | encerrado | todos
  const aba    = searchParams.get('aba')           // todos | espera | andamento | meus
  const busca  = searchParams.get('busca')
  const limit  = parseInt(searchParams.get('limit') || '50')

  const user = await getCurrentUser()

  let query = supabase
    .from('whatsapp_sessions')
    .select('*')
    .order('ultima_msg_em', { ascending: false })
    .limit(limit)

  // Aba (mapeia o layout do print)
  if (aba === 'espera') {
    query = query.eq('status', 'aguardando')
  } else if (aba === 'andamento') {
    query = query.eq('status', 'humano')
  } else if (aba === 'meus' && user) {
    query = query.eq('atendente_id', user.id)
  }
  // 'todos' ou ausente => sem filtro de aba (transparência total)

  // Filtro adicional por status (compat com versão antiga)
  if (status && status !== 'todos') {
    query = query.eq('status', status)
  }
  if (busca) {
    query = query.or(
      `nome_contato.ilike.%${busca}%,jid.ilike.%${busca}%,atendente_nome.ilike.%${busca}%`
    )
  }

  const { data: sessions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Empresa via crm_clientes
  const clienteIds = sessions?.map(s => s.cliente_id).filter(Boolean) as string[]
  const clientesMap: Record<string, string> = {}
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from('crm_clientes')
      .select('id, razao_social, nome_fantasia')
      .in('id', clienteIds)
    for (const c of clientes || []) {
      clientesMap[c.id] = c.razao_social || c.nome_fantasia || ''
    }
  }

  // Última msg
  const jids = sessions?.map(s => s.jid) || []
  const ultimasMsgs: Record<string, { conteudo: string; tipo: string }> = {}
  for (const jid of jids.slice(0, 50)) {
    const { data: msgs } = await supabase
      .from('whatsapp_messages')
      .select('conteudo, tipo')
      .eq('jid', jid)
      .order('created_at', { ascending: false })
      .limit(1)
    if (msgs?.[0]) {
      ultimasMsgs[jid] = { conteudo: msgs[0].conteudo || '', tipo: msgs[0].tipo }
    }
  }

  // Contadores globais (para os badges das abas, sem filtro)
  const { data: counts } = await supabase
    .from('whatsapp_sessions')
    .select('status, atendente_id')
  const totals = {
    todos: counts?.length || 0,
    espera: counts?.filter(c => c.status === 'aguardando').length || 0,
    andamento: counts?.filter(c => c.status === 'humano').length || 0,
    meus: user ? counts?.filter(c => c.atendente_id === user.id).length || 0 : 0,
  }

  const conversas = (sessions || []).map(s => ({
    ...s,
    empresa: s.cliente_id ? clientesMap[s.cliente_id] || null : null,
    ultima_msg: ultimasMsgs[s.jid]?.conteudo || null,
    ultima_msg_tipo: ultimasMsgs[s.jid]?.tipo || null,
  }))

  return NextResponse.json({
    conversas,
    total: conversas.length,
    totals,
    user_id: user?.id || null,
  })
}

// =============================================================
// POST /api/atendimento/conversas — Ações: assumir | devolver | encerrar | excluir
// =============================================================
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { acao, jid } = body
  if (!jid || !acao) {
    return NextResponse.json({ error: 'jid e acao são obrigatórios' }, { status: 400 })
  }

  const user = await getCurrentUser()
  const userId    = user?.id ?? null
  const userEmail = user?.email ?? null
  const userName  =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    (userEmail ? userEmail.split('@')[0] : 'Atendente')
  const userAvatar = user?.user_metadata?.avatar_url || null

  let result: any

  switch (acao) {
    case 'assumir':
      result = await supabase.rpc('assumir_atendimento', {
        p_jid: jid,
        p_atendente_id: userId,
        p_atendente_nome: userName,
      })
      // garante email + avatar (campos novos)
      if (!result.error) {
        await supabase.rpc('atualizar_atendente', {
          p_jid: jid,
          p_atendente_id: userId,
          p_atendente_nome: userName,
          p_atendente_email: userEmail,
          p_atendente_avatar: userAvatar,
          p_assumir_se_bot: true,
        })
      }
      break

    case 'devolver':
      result = await supabase.rpc('devolver_para_bot', { p_jid: jid })
      break

    case 'encerrar':
      await supabase
        .from('whatsapp_sessions')
        .update({
          status: 'encerrado',
          resolvido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('jid', jid)
      result = { data: { success: true } }
      break

    case 'reabrir':
      result = await supabase.rpc('atualizar_atendente', {
        p_jid: jid,
        p_atendente_id: userId,
        p_atendente_nome: userName,
        p_atendente_email: userEmail,
        p_atendente_avatar: userAvatar,
        p_assumir_se_bot: true,  // tambem cobre 'encerrado' apos a migration
      })
      break

    case 'excluir':
      result = await supabase.rpc('excluir_conversa', {
        p_jid: jid,
        p_executado_por: userId,
        p_executado_email: userEmail,
      })
      break

    default:
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }
  return NextResponse.json(result.data)
}

// =============================================================
// DELETE /api/atendimento/conversas?jid=... — atalho REST p/ excluir
// =============================================================
export async function DELETE(req: NextRequest) {
  const jid = req.nextUrl.searchParams.get('jid')
  if (!jid) return NextResponse.json({ error: 'jid obrigatório' }, { status: 400 })

  const user = await getCurrentUser()
  const { data, error } = await supabase.rpc('excluir_conversa', {
    p_jid: jid,
    p_executado_por: user?.id ?? null,
    p_executado_email: user?.email ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
