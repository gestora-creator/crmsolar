import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  try {
    // 1. Buscar todos os arquivos no bucket 'faturas' via storage.objects
    const { data: storageObjects, error: storageError } = await supabaseAdmin
      .schema('storage')
      .from('objects')
      .select('name, created_at')
      .eq('bucket_id', 'faturas')

    if (storageError) {
      console.error('[monitor-faturas] Erro ao listar storage:', storageError)
      return NextResponse.json({ error: 'Falha ao acessar storage' }, { status: 500 })
    }

    // 2. Filtrar arquivos do mês solicitado
    // Padrão: cliente/uc/MM-YYYY.pdf
    const fileName = `${mes}.pdf`
    const arquivosPorUC: Record<string, { path: string; created_at: string }> = {}

    for (const obj of storageObjects ?? []) {
      if (!obj.name) continue
      const parts = obj.name.split('/')
      // Esperamos exatamente: [pasta_cliente, numero_uc, MM-YYYY.pdf]
      if (parts.length === 3 && parts[2] === fileName) {
        const uc = parts[1]
        arquivosPorUC[uc] = { path: obj.name, created_at: obj.created_at }
      }
    }

    // 3. Buscar todas as UCs da tabela base
    const { data: baseRecords, error: baseError } = await supabaseAdmin
      .from('base')
      .select('*')
      .limit(2000)

    if (baseError) {
      console.error('[monitor-faturas] Erro ao consultar tabela base:', baseError)
      return NextResponse.json({ error: 'Falha ao acessar tabela base' }, { status: 500 })
    }

    // 4. Montar registros cruzados
    const registros: RegistroFatura[] = []

    for (const row of baseRecords ?? []) {
      // Normaliza o campo de cliente
      const clienteNome: string = row['CLIENTE'] ?? row['cliente'] ?? row['nome'] ?? '—'

      // Normaliza tipo (geradora/beneficiaria)
      const tipo: string = (row['Tipo'] ?? row['tipo'] ?? '').toLowerCase()

      // Extrai UCs — pode ser string única ou lista separada por vírgula/quebra de linha
      const unidadesRaw: string = String(row['Unidades'] ?? row['unidades'] ?? row['UC'] ?? row['uc'] ?? '')
      const ucs = unidadesRaw
        .split(/[,\n;]/)
        .map((u: string) => u.trim())
        .filter((u: string) => u.length > 0)

      if (ucs.length === 0) {
        // Row sem UC mapeada — inclui como pendente sem UC
        registros.push({
          cliente: clienteNome,
          uc: '—',
          tipo,
          tem_fatura: false,
          arquivo: null,
          created_at: null,
        })
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
    const result: MonitorFaturasResult = {
      mes,
      total_ucs: registros.length,
      com_fatura,
      sem_fatura: registros.length - com_fatura,
      registros,
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[monitor-faturas] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
