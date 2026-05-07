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

    // 1. UNIVERSO: clientes únicos da tabela base
    const { data: baseRows, error: baseError } = await supabase
      .from('base')
      .select('nome_cliente, cliente_id')

    if (baseError) throw baseError

    // Deduplicar por nome_cliente (pegar primeiro cliente_id de cada)
    const clientesMap = new Map<string, string | null>()
    for (const row of (baseRows || [])) {
      if (row.nome_cliente && !clientesMap.has(row.nome_cliente)) {
        clientesMap.set(row.nome_cliente, row.cliente_id)
      }
    }

    // 2. ENVIOS: buscar mais recente por cliente_id
    const { data: envios, error: enviosError } = await supabase
      .from('relatorio_envios')
      .select('id, nome_cliente, cliente_id, status_envio, viewed, canal, created_at')
      .order('created_at', { ascending: false })

    if (enviosError) throw enviosError

    // Indexar envios por cliente_id (mais recente de cada)
    const enviosPorClienteId = new Map<string, {
      id: number; status_envio: string | null; viewed: boolean | null;
      canal: string | null; created_at: string | null
    }>()
    for (const e of (envios || [])) {
      if (e.cliente_id && !enviosPorClienteId.has(e.cliente_id)) {
        enviosPorClienteId.set(e.cliente_id, e)
      }
    }

    // 3. Razão social dos clientes
    const clienteIds = [...clientesMap.values()].filter(Boolean) as string[]
    const { data: crmClientes } = await supabase
      .from('crm_clientes')
      .select('id, razao_social, telefone_principal')
      .in('id', clienteIds.length > 0 ? clienteIds : ['00000000-0000-0000-0000-000000000000'])

    const crmMap = new Map<string, { razao_social: string; telefone: string | null }>()
    for (const c of (crmClientes || [])) {
      crmMap.set(c.id, { razao_social: c.razao_social, telefone: c.telefone_principal })
    }

    // 4. Montar lista: TODOS os clientes da base + status de envio
    const contatos = [...clientesMap.entries()].map(([nomeCliente, clienteId]) => {
      const envio = clienteId ? enviosPorClienteId.get(clienteId) : null
      const crm = clienteId ? crmMap.get(clienteId) : null

      const foiEnviado = envio?.status_envio === '✅ Enviado'
      const foiVisto = foiEnviado && envio?.viewed === true

      return {
        id: envio?.id || 0,
        nome: nomeCliente,
        telefone: crm?.telefone || '-',
        empresa: crm?.razao_social || nomeCliente,
        cargo: null,
        viewed: foiVisto ? 'sim' : null,
        status_envio: foiEnviado ? '✅ Enviado' : null,
        interagido: foiVisto,
        enviado: foiEnviado,
        canal: envio?.canal || null,
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

    // Ordenar: não enviados primeiro, depois por nome
    filtered.sort((a, b) => {
      if (a.enviado !== b.enviado) return a.enviado ? 1 : -1
      return a.nome.localeCompare(b.nome)
    })

    // 6. Métricas sobre o UNIVERSO TOTAL
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
