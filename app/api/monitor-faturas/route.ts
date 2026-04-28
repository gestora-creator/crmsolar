import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export interface RegistroFatura {
  cliente: string
  uc: string
  tipo: string
  /** Data ISO (YYYY-MM-DD) extraída de dados_extraidos.proxima_leitura da última fatura. */
  proxima_leitura: string | null
  tem_fatura: boolean
  caminho_fatura: string | null
  download_url: string | null
  status_atual: 'ativa' | 'desativada' | 'pendente_ativacao' | null
  data_adesao: string | null
  data_desativacao: string | null
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
  // dados_extraidos.proxima_leitura vem da última fatura OCR'ada e diz quando a próxima é esperada
  const { data: baseRecords, error: baseError } = await supabase
    .from('base_com_status')
    .select('nome_cliente, documento, unidade, tipo, dados_extraidos, caminho_fatura, status_atual, data_adesao, data_desativacao')
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

  // Determina se a UC está fora do escopo do mês de referência (visão operacional)
  // - desativada: status_atual='desativada' (não vou mais buscar fatura dela)
  // - nao_aderiu: data_adesao em mês POSTERIOR ao mês ref (UC ainda não existia no programa)
  const [mesRefMM, mesRefYYYY] = mes.split('-')
  const mesRefYM = `${mesRefYYYY}-${mesRefMM}` // YYYY-MM
  function escopoNoMes(statusAtual: string | null, dataAdesao: string | null, _dataDesativacao: string | null): 'desativada' | 'nao_aderiu' | null {
    // Desativada hoje → fora do escopo em qualquer mês (visão operacional do monitor)
    if (statusAtual === 'desativada') return 'desativada'
    // UC ainda não tinha aderido naquele mês → fora do escopo
    if (dataAdesao) {
      const adYM = dataAdesao.substring(0, 7)
      if (adYM > mesRefYM) return 'nao_aderiu'
    }
    return null
  }

  const registros: RegistroFatura[] = []

  for (const row of baseRecords ?? []) {
    const clienteNome: string = (row as any)['nome_cliente'] ?? '—'
    const tipo: string = ((row as any)['tipo'] ?? '').toLowerCase()
    const unidadesRaw: string = String((row as any)['unidade'] ?? '')
    const dadosExtraidos = (row as any)['dados_extraidos'] as Record<string, any> | null
    // proxima_leitura vem da última fatura OCR'ada (formato YYYY-MM-DD)
    const proximaLeituraRaw: string | null = dadosExtraidos?.proxima_leitura ?? null
    const proximaLeitura = (typeof proximaLeituraRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(proximaLeituraRaw))
      ? proximaLeituraRaw : null
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
      proxima_leitura: proximaLeitura,
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

  // Hoje em formato ISO YYYY-MM-DD (timezone Brasil) para comparação string-a-string com proxima_leitura
  const hojeISO = new Date().toISOString().slice(0, 10)

  let pendentes_no_prazo = 0
  let pendentes_atrasadas = 0
  let fora_escopo = 0

  for (const reg of registros) {
    if (reg.fora_escopo) {
      fora_escopo++
      continue // UC desativada ou ainda não aderiu não é pendente
    }
    if (reg.tem_fatura) continue
    if (!reg.proxima_leitura) continue // sem dado, não classifica
    // Se hoje >= proxima_leitura, a leitura/fatura já era pra ter saído → atrasada
    // Se hoje < proxima_leitura, ainda dentro do prazo
    if (hojeISO < reg.proxima_leitura) {
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
  // sem_fatura conta APENAS UCs no escopo (sem fatura E não desativada/não-aderida).
  // Esse é o número real de pendências; UCs fora_escopo vão pro contador `fora_escopo`.
  const sem_fatura = registros.filter(r => !r.tem_fatura && !r.fora_escopo).length

  return NextResponse.json({
    mes,
    total_ucs: registros.length,
    pendentes_no_prazo,
    pendentes_atrasadas,
    fora_escopo,
    com_fatura,
    sem_fatura,
    registros,
  } as MonitorFaturasResult)
}
