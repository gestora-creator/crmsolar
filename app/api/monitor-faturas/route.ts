import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export interface RegistroFatura {
  cliente: string
  uc: string
  tipo: string
  prazo: string | null
  tem_fatura: boolean
  caminho_fatura: string | null
  download_url: string | null
  // 🆕 Status no mês de referência
  status_atual: 'ativa' | 'desativada' | 'pendente_ativacao' | null
  data_adesao: string | null
  data_desativacao: string | null
  // 🆕 Diz se a UC está fora do escopo do mês (desativada ou ainda não aderiu)
  fora_escopo: 'desativada' | 'nao_aderiu' | null
}

export interface MonitorFaturasResult {
  mes: string
  total_ucs: number
  com_fatura: number
  sem_fatura: number
  pendentes_no_prazo: number
  pendentes_atrasadas: number
  fora_escopo: number
  registros: RegistroFatura[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') // MM-YYYY

  if (!mes || !/^\d{2}-\d{4}$/.test(mes)) {
    return NextResponse.json({ error: 'Parâmetro mes inválido. Use formato MM-YYYY' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Buscar cadastro de UCs em base_com_status (inclui status_atual, data_adesao, data_desativacao)
  const { data: baseRecords, error: baseError } = await supabase
    .from('base_com_status')
    .select('nome_cliente, documento, unidade, tipo, prazo, caminho_fatura, status_atual, data_adesao, data_desativacao')
    .limit(2000)

  if (baseError) {
    return NextResponse.json({ error: `Falha ao acessar tabela base: ${baseError.message}` }, { status: 500 })
  }

  // Buscar faturas do mês solicitado em historico_documentos
  const { data: historicoRecords } = await supabase
    .from('historico_documentos')
    .select('unidade, url')
    .eq('tipo', 'fatura')
    .eq('mes_ano', mes)

  // Montar mapa UC -> URL para lookup rápido
  const faturaMap = new Map<string, string>()
  for (const h of historicoRecords ?? []) {
    faturaMap.set(h.unidade, h.url)
  }

  // Determina se a UC está fora do escopo do mês de referência
  // - desativada: data_desativacao em mês ANTERIOR ou IGUAL ao mês ref
  // - nao_aderiu: data_adesao em mês POSTERIOR ao mês ref
  // mes está no formato MM-YYYY; comparamos só ano-mês.
  const [mesRefMM, mesRefYYYY] = mes.split('-')
  const mesRefYM = `${mesRefYYYY}-${mesRefMM}` // YYYY-MM
  function escopoNoMes(statusAtual: string | null, dataAdesao: string | null, dataDesativacao: string | null): 'desativada' | 'nao_aderiu' | null {
    // Desativada: comparar ano-mês (data_desativacao YYYY-MM-DD)
    if (dataDesativacao) {
      const desYM = dataDesativacao.substring(0, 7) // YYYY-MM
      if (desYM <= mesRefYM) return 'desativada'
    }
    // Adesão: se data_adesao YYYY-MM > mesRefYM → não aderiu ainda
    if (dataAdesao) {
      const adYM = dataAdesao.substring(0, 7)
      if (adYM > mesRefYM) return 'nao_aderiu'
    }
    // Fallback por status_atual quando não há data_desativacao explícita
    if (statusAtual === 'desativada' && !dataDesativacao) return 'desativada'
    return null
  }

  const registros: RegistroFatura[] = []

  for (const row of baseRecords ?? []) {
    const clienteNome: string = (row as any)['nome_cliente'] ?? '—'
    const tipo: string = ((row as any)['tipo'] ?? '').toLowerCase()
    const unidadesRaw: string = String((row as any)['unidade'] ?? '')
    const prazoRaw: string | null = (row as any)['prazo'] ?? null
    const caminhoFaturaBase: string | null = (row as any)['caminho_fatura'] ?? null
    const fallbackValido = !!caminhoFaturaBase && caminhoFaturaBase.includes(`${mes}.pdf`)

    const statusAtual = ((row as any)['status_atual'] ?? null) as RegistroFatura['status_atual']
    const dataAdesao = ((row as any)['data_adesao'] ?? null) as string | null
    const dataDesativacao = ((row as any)['data_desativacao'] ?? null) as string | null
    const fora = escopoNoMes(statusAtual, dataAdesao, dataDesativacao)

    const ucs = unidadesRaw
      .split(/[,\n;]/)
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0)

    const baseRegistro = {
      cliente: clienteNome,
      tipo,
      prazo: prazoRaw,
      status_atual: statusAtual,
      data_adesao: dataAdesao,
      data_desativacao: dataDesativacao,
      fora_escopo: fora,
    }

    if (ucs.length === 0) {
      const viaHistorico = faturaMap.get(unidadesRaw) ?? null
      const caminhoFinal = viaHistorico ?? (fallbackValido ? caminhoFaturaBase : null)
      registros.push({ ...baseRegistro, uc: '—', tem_fatura: !!caminhoFinal, caminho_fatura: caminhoFinal, download_url: caminhoFinal })
      continue
    }

    for (const uc of ucs) {
      const viaHistorico = faturaMap.get(uc) ?? null
      const caminhoFinal = viaHistorico ?? (fallbackValido ? caminhoFaturaBase : null)
      registros.push({ ...baseRegistro, uc, tem_fatura: !!caminhoFinal, caminho_fatura: caminhoFinal, download_url: caminhoFinal })
    }
  }

  // Calcular PRAZO: parsear "De 01 até 07" -> { inicio: 1, fim: 7 }
  function parsePrazo(prazo: string | null): { inicio: number; fim: number } | null {
    if (!prazo) return null
    const match = prazo.match(/De\s*(\d+)\s*até\s*(\d+)/i)
    if (!match) return null
    return { inicio: parseInt(match[1]), fim: parseInt(match[2]) }
  }

  const hoje = new Date()
  const diaHoje = hoje.getDate()

  let pendentes_no_prazo = 0
  let pendentes_atrasadas = 0
  let fora_escopo = 0

  for (const reg of registros) {
    if (reg.fora_escopo) {
      fora_escopo++
      continue // UC desativada ou ainda não aderiu não é pendente
    }
    if (reg.tem_fatura) continue
    const p = parsePrazo(reg.prazo)
    if (!p) continue
    if (diaHoje <= p.fim) {
      pendentes_no_prazo++
    } else {
      pendentes_atrasadas++
    }
  }

  registros.sort((a, b) => {
    // Fora do escopo vai por último
    if (!!a.fora_escopo !== !!b.fora_escopo) return a.fora_escopo ? 1 : -1
    if (a.tem_fatura !== b.tem_fatura) return a.tem_fatura ? 1 : -1
    return a.cliente.localeCompare(b.cliente, 'pt-BR')
  })

  const com_fatura = registros.filter(r => r.tem_fatura).length

  return NextResponse.json({
    mes,
    total_ucs: registros.length,
    pendentes_no_prazo,
    pendentes_atrasadas,
    fora_escopo,
    com_fatura,
    sem_fatura: registros.length - com_fatura,
    registros,
  } as MonitorFaturasResult)
}
