import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filtroViewed = searchParams.get('viewed') || 'todos'
    const filtroStatus = searchParams.get('status') || 'todos'
    const busca = searchParams.get('busca') || null

    // 1. UNIVERSO: tabela base — agrupar por cliente
    //    "Enviado" = feito = 'sim' na base
    const { data: baseRows, error: baseError } = await supabase
      .from('base')
      .select('nome_cliente, cliente_id, feito')

    if (baseError) throw baseError

    // Agrupar por nome_cliente: enviado se QUALQUER UC tem feito='sim'
    const clientesMap = new Map<string, {
      cliente_id: string | null
      enviado: boolean
    }>()
    for (const row of (baseRows || [])) {
      if (!row.nome_cliente) continue
      const existing = clientesMap.get(row.nome_cliente)
      if (!existing) {
        clientesMap.set(row.nome_cliente, {
          cliente_id: row.cliente_id,
          enviado: row.feito === 'sim',
        })
      } else if (row.feito === 'sim') {
        existing.enviado = true
      }
    }

    // 2. Buscar viewed de relatorio_envios (para interação)
    const { data: envios } = await supabase
      .from('relatorio_envios')
      .select('cliente_id, viewed')
      .eq('viewed', true)

    const viewedSet = new Set<string>()
    for (const e of (envios || [])) {
      if (e.cliente_id) viewedSet.add(e.cliente_id)
    }

    // 3. Razão social dos clientes
    const clienteIds = [...clientesMap.values()]
      .map(c => c.cliente_id)
      .filter(Boolean) as string[]

    const { data: crmClientes } = await supabase
      .from('crm_clientes')
      .select('id, razao_social, telefone_principal')
      .in('id', clienteIds.length > 0 ? clienteIds : ['00000000-0000-0000-0000-000000000000'])

    const crmMap = new Map<string, { razao_social: string; telefone: string | null }>()
    for (const c of (crmClientes || [])) {
      crmMap.set(c.id, { razao_social: c.razao_social, telefone: c.telefone_principal })
    }

    // 4. Montar lista completa
    const contatos = [...clientesMap.entries()].map(([nomeCliente, info]) => {
      const crm = info.cliente_id ? crmMap.get(info.cliente_id) : null
      const foiVisto = info.cliente_id ? viewedSet.has(info.cliente_id) : false
      const interagido = info.enviado && foiVisto

      return {
        id: 0,
        nome: nomeCliente,
        telefone: crm?.telefone || '-',
        empresa: crm?.razao_social || nomeCliente,
        cargo: null,
        viewed: interagido ? 'sim' : null,
        status_envio: info.enviado ? '✅ Enviado' : null,
        interagido,
        enviado: info.enviado,
      }
    })

    // 5. Filtros
    const filtered = contatos.filter(c => {
      if (filtroViewed === 'visto' && !c.interagido) return false
      if (filtroViewed === 'naoVisto' && c.interagido) return false
      if (filtroStatus === 'enviado' && !c.enviado) return false
      if (filtroStatus === 'naoEnviado' && c.enviado) return false
      if (busca) {
        const term = busca.toLowerCase()
        if (!c.nome.toLowerCase().includes(term) &&
            !(c.empresa || '').toLowerCase().includes(term)) return false
      }
      return true
    })

    filtered.sort((a, b) => {
      if (a.enviado !== b.enviado) return a.enviado ? 1 : -1
      return a.nome.localeCompare(b.nome)
    })

    // 6. Métricas
    const totalClientes = contatos.length
    const enviados = contatos.filter(c => c.enviado).length
    const naoEnviados = totalClientes - enviados
    const vistos = contatos.filter(c => c.interagido).length
    const naoVistos = totalClientes - vistos

    const taxaEnvio = totalClientes > 0 ? (enviados / totalClientes) * 100 : 0
    const taxaInteracao = enviados > 0 ? (vistos / enviados) * 100 : 0

    return NextResponse.json({
      contatos: filtered,
      total: totalClientes,
      totalFiltrado: filtered.length,
      metricas: {
        enviados,
        naoEnviados,
        vistos,
        naoVistos,
        taxaEnvio: Math.round(taxaEnvio * 100) / 100,
        taxaInteracao: Math.round(taxaInteracao * 100) / 100,
      },
      filtrosAplicados: {
        viewed: filtroViewed,
        status: filtroStatus,
        busca,
      },
    })
  } catch (error) {
    console.error('Erro no endpoint /api/tv/metrics:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
