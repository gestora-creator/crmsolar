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

  const { data: baseRecords, error: baseError } = await supabase
    .from('base')
    .select('CLIENTE, "CPF/CNPJ", Unidades, Tipo, caminho_fatura, PRAZO')
    .limit(2000)

  if (baseError) {
    return NextResponse.json({ error: `Falha ao acessar tabela base: ${baseError.message}` }, { status: 500 })
  }

  const registros: RegistroFatura[] = []

  for (const row of baseRecords ?? []) {
    const clienteNome: string = (row as any)['CLIENTE'] ?? '—'
    const tipo: string = ((row as any)['Tipo'] ?? '').toLowerCase()
    const unidadesRaw: string = String((row as any)['Unidades'] ?? '')
    const caminhoFatura: string | null = (row as any)['caminho_fatura'] ?? null

    // caminho_fatura é URL pública — verifica se contém o mês solicitado
    const temFatura = !!caminhoFatura && caminhoFatura.includes(mes)
    const prazoRaw: string | null = (row as any)['PRAZO'] ?? null

    const ucs = unidadesRaw
      .split(/[,\n;]/)
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0)

    // URL já é pública — usar diretamente como download_url
    const downloadUrl = temFatura ? caminhoFatura : null

    if (ucs.length === 0) {
      registros.push({ cliente: clienteNome, uc: '—', tipo, tem_fatura: temFatura, caminho_fatura: caminhoFatura, download_url: downloadUrl, prazo: prazoRaw })
      continue
    }

    for (const uc of ucs) {
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
