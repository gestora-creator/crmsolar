import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'

type TimelineInsert = Database['public']['Tables']['timeline_relacional']['Insert']

const VALID_TIPOS = [
  'mensagem_whatsapp', 'mensagem_email', 'ligacao_telefone',
  'reuniao', 'visita_tecnica', 'chamado_aberto', 'chamado_encerrado',
  'relatorio_enviado', 'relatorio_visualizado', 'pesquisa_respondida',
  'nota_interna', 'agente_acao', 'agente_resumo',
]

const VALID_CANAIS = [
  'whatsapp', 'email', 'telefone', 'presencial',
  'sistema', 'agente_ia', 'portal_cliente',
]

const VALID_DIRECOES = ['entrada', 'saida', 'interna']

/**
 * POST /api/timeline
 * Endpoint para n8n e agentes IA gravarem eventos na timeline
 * Autenticação: Bearer token (service_role_key) no header Authorization
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuração do servidor incompleta' },
        { status: 500 }
      )
    }

    // Validar autenticação via service_role
    const authorization = request.headers.get('authorization') || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

    if (!token || token !== supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Não autorizado. Use service_role_key como Bearer token.' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Suporte para batch (array) ou evento único (objeto)
    const events: TimelineInsert[] = Array.isArray(body) ? body : [body]

    if (events.length === 0) {
      return NextResponse.json({ error: 'Nenhum evento enviado' }, { status: 400 })
    }

    if (events.length > 100) {
      return NextResponse.json({ error: 'Máximo 100 eventos por request' }, { status: 400 })
    }

    // Validar cada evento
    const errors: string[] = []
    const validated: TimelineInsert[] = []

    events.forEach((ev, i) => {
      const prefix = events.length > 1 ? `Evento[${i}]: ` : ''

      if (!ev.cliente_id) {
        errors.push(`${prefix}cliente_id é obrigatório`)
        return
      }
      if (!ev.tipo_evento || !VALID_TIPOS.includes(ev.tipo_evento)) {
        errors.push(`${prefix}tipo_evento inválido. Valores: ${VALID_TIPOS.join(', ')}`)
        return
      }
      if (!ev.resumo_chave || ev.resumo_chave.trim().length === 0) {
        errors.push(`${prefix}resumo_chave é obrigatório`)
        return
      }
      if (ev.canal && !VALID_CANAIS.includes(ev.canal)) {
        errors.push(`${prefix}canal inválido. Valores: ${VALID_CANAIS.join(', ')}`)
        return
      }
      if (ev.direcao && !VALID_DIRECOES.includes(ev.direcao)) {
        errors.push(`${prefix}direcao inválida. Valores: ${VALID_DIRECOES.join(', ')}`)
        return
      }

      validated.push({
        cliente_id: ev.cliente_id,
        contato_id: ev.contato_id || null,
        tipo_evento: ev.tipo_evento,
        canal: ev.canal || null,
        direcao: ev.direcao || null,
        resumo_chave: ev.resumo_chave.trim(),
        tom_conversa: ev.tom_conversa || null,
        conteudo_longo: ev.conteudo_longo || null,
        metadata: ev.metadata || {},
        origem: ev.origem || 'n8n_webhook',
        autor: ev.autor || 'n8n',
        ocorrido_em: ev.ocorrido_em || new Date().toISOString(),
      })
    })

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validação falhou', details: errors }, { status: 400 })
    }

    // Inserir com service_role (bypass RLS)
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from('timeline_relacional')
      .insert(validated)
      .select('id, cliente_id, tipo_evento, resumo_chave, ocorrido_em')

    if (error) {
      return NextResponse.json(
        { error: 'Erro ao gravar eventos', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      events: data,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro interno', details: err.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/timeline?cliente_id=xxx&limit=50
 * Buscar timeline de um cliente (para integrações externas)
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Configuração incompleta' }, { status: 500 })
    }

    const authorization = request.headers.get('authorization') || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null
    if (!token || token !== supabaseServiceKey) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get('cliente_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    if (!clienteId) {
      return NextResponse.json({ error: 'cliente_id é obrigatório' }, { status: 400 })
    }

    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase
      .from('timeline_relacional')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('ocorrido_em', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ events: data, count: data.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
