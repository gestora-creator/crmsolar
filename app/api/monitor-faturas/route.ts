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
}

export interface MonitorFaturasResult {
  mes: string
  total_ucs: number
  com_fatura: number
  sem_fatura: number
  pendentes_no_prazo: number
  pendentes_atrasadas: number
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

  // Buscar cadastro de UCs na base
  const { data: baseRecords, error: baseError } = await supabase
    .from('base')
    .select('nome_cliente, documento, unidade, tipo, prazo')
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

  const registros: RegistroFatura[] = []

  for (const row of baseRecords ?? []) {
    const clienteNome: string = (row as any)['nome_cliente'] ?? '—'
    const tipo: string = ((row as any)['tipo'] ?? '').toLowerCase()
    const unidadesRaw: string = String((row as any)['unidade'] ?? '')
    // Buscar fatura do mês no mapa construído de historico_documentos

    // caminho_fatura é URL pública — verifica se contém o mês solicitado
    const prazoRaw: string | null = (row as any)['prazo'] ?? null

    const ucs = unidadesRaw
      .split(/[,\n;]/)
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0)

    if (ucs.length === 0) {
      const caminhoFaturaUnico = faturaMap.get(unidadesRaw) ?? null
      const temFaturaUnico = !!caminhoFaturaUnico
      registros.push({ cliente: clienteNome, uc: '—', tipo, tem_fatura: temFaturaUnico, caminho_fatura: caminhoFaturaUnico, download_url: caminhoFaturaUnico, prazo: prazoRaw })
      continue
    }

    for (const uc of ucs) {
      const caminhoFatura = faturaMap.get(uc) ?? null
      const temFatura = !!caminhoFatura
      const downloadUrl = caminhoFatura
      registros.push({ cliente: clienteNome, uc, tipo, tem_fatura: temFatura, caminho_fatura: caminhoFatura, download_url: downloadUrl, prazo: prazoRaw })
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

  for (const reg of registros) {
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
    if (a.tem_fatura !== b.tem_fatura) return a.tem_fatura ? 1 : -1
    return a.cliente.localeCompare(b.cliente, 'pt-BR')
  })

  const com_fatura = registros.filter(r => r.tem_fatura).length

  return NextResponse.json({
    mes,
    total_ucs: registros.length,
    pendentes_no_prazo,
    pendentes_atrasadas,
    com_fatura,
    sem_fatura: registros.length - com_fatura,
    registros,
  } as MonitorFaturasResult)
}
