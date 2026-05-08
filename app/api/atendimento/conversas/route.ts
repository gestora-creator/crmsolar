import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/atendimento/conversas — Listar conversas
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') // bot | humano | aguardando | todos
  const busca = searchParams.get('busca')
  const limit = parseInt(searchParams.get('limit') || '30')

  let query = supabase
    .from('whatsapp_sessions')
    .select('*')
    .order('ultima_msg_em', { ascending: false })
    .limit(limit)

  if (status && status !== 'todos') {
    query = query.eq('status', status)
  }
  if (busca) {
    query = query.or(`nome_contato.ilike.%${busca}%,jid.ilike.%${busca}%`)
  }

  const { data: sessions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Buscar info dos clientes vinculados
  const clienteIds = sessions?.map(s => s.cliente_id).filter(Boolean) as string[]
  let clientesMap: Record<string, string> = {}
  
  if (clienteIds.length > 0) {
    const { data: clientes } = await supabase
      .from('crm_clientes')
      .select('id, razao_social, nome_fantasia')
      .in('id', clienteIds)
    
    for (const c of (clientes || [])) {
      clientesMap[c.id] = c.razao_social || c.nome_fantasia || ''
    }
  }

  // Buscar última msg de cada sessão
  const jids = sessions?.map(s => s.jid) || []
  let ultimasMsgs: Record<string, { conteudo: string; tipo: string }> = {}
  
  if (jids.length > 0) {
    // Uma query por sessão (máximo 30)
    for (const jid of jids.slice(0, 30)) {
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
  }

  const conversas = (sessions || []).map(s => ({
    ...s,
    empresa: s.cliente_id ? clientesMap[s.cliente_id] || null : null,
    ultima_msg: ultimasMsgs[s.jid]?.conteudo || null,
    ultima_msg_tipo: ultimasMsgs[s.jid]?.tipo || null,
  }))

  // Contadores por status
  const { data: counts } = await supabase.rpc('_placeholder' as any).select('*') // placeholder
  
  return NextResponse.json({
    conversas,
    total: conversas.length,
  })
}

// POST /api/atendimento/conversas — Ações (assumir, devolver, encerrar)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { acao, jid, atendente_id, atendente_nome } = body

  if (!jid || !acao) {
    return NextResponse.json({ error: 'jid e acao são obrigatórios' }, { status: 400 })
  }

  let result: any

  switch (acao) {
    case 'assumir':
      result = await supabase.rpc('assumir_atendimento', {
        p_jid: jid,
        p_atendente_id: atendente_id,
        p_atendente_nome: atendente_nome,
      })
      break

    case 'devolver':
      result = await supabase.rpc('devolver_para_bot', { p_jid: jid })
      break

    case 'encerrar':
      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'encerrado', atendente_id: null, updated_at: new Date().toISOString() })
        .eq('jid', jid)
      result = { data: { success: true } }
      break

    default:
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }

  return NextResponse.json(result.data)
}
