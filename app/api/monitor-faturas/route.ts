import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export interface RegistroFatura {
  cliente: string
  uc: string
  tipo: string
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

  // Buscar registros da tabela base incluindo caminho_fatura
  const { data: baseRecords, error: baseError } = await supabase
    .from('base')
    .select('CLIENTE, "CPF/CNPJ", Unidades, Tipo, caminho_fatura')
    .limit(2000)

  if (baseError) {
    return NextResponse.json({ error: `Falha ao acessar tabela base: ${baseError.message}` }, { status: 500 })
  }

  // Montar registros e gerar URLs assinadas para quem tem fatura
  const registros: RegistroFatura[] = []

  for (const row of baseRecords ?? []) {
    const clienteNome: string = (row as any)['CLIENTE'] ?? '—'
    const tipo: string = ((row as any)['Tipo'] ?? '').toLowerCase()
    const unidadesRaw: string = String((row as any)['Unidades'] ?? '')
    const caminhoFatura: string | null = (row as any)['caminho_fatura'] ?? null

    // Filtrar pelo mês: caminho contém MM-YYYY ou é do mês corrente
    // Se o campo estiver preenchido, considera que é do mês solicitado
    // (ajuste aqui se o campo armazenar o mês no nome do arquivo)
    const temFatura = !!caminhoFatura && caminhoFatura.includes(mes)

    const ucs = unidadesRaw
      .split(/[,\n;]/)
      .map((u: string) => u.trim())
      .filter((u: string) => u.length > 0)

    // Gerar URL assinada (válida por 1 hora) se tiver fatura
    let downloadUrl: string | null = null
    if (temFatura && caminhoFatura) {
      // Remove bucket prefix se existir (ex: "faturas/omar/...") 
      const storagePath = caminhoFatura.replace(/^faturas\//, '')
      const { data: signedData } = await supabase.storage
        .from('faturas')
        .createSignedUrl(storagePath, 3600)
      downloadUrl = signedData?.signedUrl ?? null
    }

    if (ucs.length === 0) {
      registros.push({
        cliente: clienteNome,
        uc: '—',
        tipo,
        tem_fatura: temFatura,
        caminho_fatura: caminhoFatura,
        download_url: downloadUrl,
      })
      continue
    }

    for (const uc of ucs) {
      registros.push({
        cliente: clienteNome,
        uc,
        tipo,
        tem_fatura: temFatura,
        caminho_fatura: caminhoFatura,
        download_url: downloadUrl,
      })
    }
  }

  // Ordena: pendentes primeiro, depois por cliente
  registros.sort((a, b) => {
    if (a.tem_fatura !== b.tem_fatura) return a.tem_fatura ? 1 : -1
    return a.cliente.localeCompare(b.cliente, 'pt-BR')
  })

  const com_fatura = registros.filter(r => r.tem_fatura).length

  return NextResponse.json({
    mes,
    total_ucs: registros.length,
    com_fatura,
    sem_fatura: registros.length - com_fatura,
    registros,
  } as MonitorFaturasResult)
}
