import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export interface RegistroFatura {
  cliente: string
  uc: string
  tipo: string
  tem_fatura: boolean
  arquivo: string | null
  created_at: string | null
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
  const mes = searchParams.get('mes') // formato: MM-YYYY  ex: 04-2026

  if (!mes || !/^\d{2}-\d{4}$/.test(mes)) {
    return NextResponse.json({ error: 'Parâmetro mes inválido. Use formato MM-YYYY' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(url, serviceKey)

  try {
    const fileName = `${mes}.pdf`

    // 1. Listar pastas raiz do bucket (uma pasta por cliente)
    const { data: clienteFolders, error: rootError } = await supabase.storage
      .from('faturas')
      .list('', { limit: 500 })

    if (rootError) {
      return NextResponse.json({ error: `Falha ao listar storage: ${rootError.message}` }, { status: 500 })
    }

    // 2. Para cada pasta de cliente, listar subpastas (UCs) em paralelo
    const arquivosPorUC: Record<string, { path: string; created_at: string | null }> = {}

    const folders = (clienteFolders ?? []).filter(f => !f.name.includes('.'))

    await Promise.all(
      folders.map(async (clienteFolder) => {
        const { data: ucFolders, error: ucError } = await supabase.storage
          .from('faturas')
          .list(clienteFolder.name, { limit: 500 })

        if (ucError || !ucFolders) return

        // 3. Para cada UC, verificar se o arquivo do mês existe
        await Promise.all(
          ucFolders
            .filter(f => !f.name.includes('.'))
            .map(async (ucFolder) => {
              const prefix = `${clienteFolder.name}/${ucFolder.name}`
              const { data: files, error: filesError } = await supabase.storage
                .from('faturas')
                .list(prefix, { limit: 50, search: mes })

              if (filesError || !files) return

              const match = files.find(f => f.name === fileName)
              if (match) {
                arquivosPorUC[ucFolder.name] = {
                  path: `${prefix}/${fileName}`,
                  created_at: match.created_at ?? null,
                }
              }
            })
        )
      })
    )

    // 4. Buscar todas as UCs da tabela base
    const { data: baseRecords, error: baseError } = await supabase
      .from('base')
      .select('CLIENTE, "CPF/CNPJ", Unidades, Tipo')
      .limit(2000)

    if (baseError) {
      return NextResponse.json({ error: `Falha ao acessar tabela base: ${baseError.message}` }, { status: 500 })
    }

    // 5. Cruzar UCs do storage com registros da tabela base
    const registros: RegistroFatura[] = []

    for (const row of baseRecords ?? []) {
      const clienteNome: string = (row as any)['CLIENTE'] ?? '—'
      const tipo: string = ((row as any)['Tipo'] ?? '').toLowerCase()
      const unidadesRaw: string = String((row as any)['Unidades'] ?? '')

      const ucs = unidadesRaw
        .split(/[,\n;]/)
        .map((u: string) => u.trim())
        .filter((u: string) => u.length > 0)

      if (ucs.length === 0) {
        registros.push({ cliente: clienteNome, uc: '—', tipo, tem_fatura: false, arquivo: null, created_at: null })
        continue
      }

      for (const uc of ucs) {
        const encontrado = arquivosPorUC[uc]
        registros.push({
          cliente: clienteNome,
          uc,
          tipo,
          tem_fatura: !!encontrado,
          arquivo: encontrado?.path ?? null,
          created_at: encontrado?.created_at ?? null,
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

  } catch (err: any) {
    console.error('[monitor-faturas] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
