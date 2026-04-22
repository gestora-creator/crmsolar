import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function normPath(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .toUpperCase()
}

// Extrai UC e mes_ano do nome do arquivo.
// Formato esperado: {UC}_{MM-YYYY}.pdf ou {MM-YYYY}_{UC}.pdf
// UC pode ter pontos (1.316.247.051-48) ou sem (1316247051-48 / 728988051-06)
// Exemplos válidos:
//   728988051-06_04-2026.pdf
//   1.316.247.051-48_04-2026.pdf
//   04-2026_728988051-06.pdf
function parseFilename(filename: string): { ucRaw: string | null; mesAno: string | null } {
  const name = filename.replace(/\.pdf$/i, '')

  // 1. Detectar MM-YYYY
  const mesAnoMatch = name.match(/\b(0[1-9]|1[0-2])[-_](20\d{2})\b/)
  const mesAno = mesAnoMatch ? `${mesAnoMatch[1]}-${mesAnoMatch[2]}` : null

  // 2. UC com pontos — formato canônico da base (1.316.247.051-48)
  const ucPontosMatch = name.match(/(\d{1,3}\.\d{3}\.\d{3}\.\d{3}-\d{2})/)
  if (ucPontosMatch) {
    return { ucRaw: ucPontosMatch[1], mesAno }
  }

  // 3. UC sem pontos com traço separador de dígito verificador (728988051-06)
  // Remover MM-YYYY para não confundir os dígitos
  const semMesAno = mesAno
    ? name.replace(`${mesAnoMatch![1]}-${mesAnoMatch![2]}`, '').replace(`${mesAnoMatch![1]}_${mesAnoMatch![2]}`, '')
    : name
  const ucDigitsMatch = semMesAno.match(/\b(\d{7,12}-\d{2})\b/)
  if (ucDigitsMatch) {
    return { ucRaw: ucDigitsMatch[1], mesAno }
  }

  return { ucRaw: null, mesAno }
}

// POST: preview — valida sem fazer upload
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const formData = await req.formData()
  const action = formData.get('action') as string // 'preview' | 'upload'
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  // Buscar todas as UCs da base para matching
  const { data: baseRows } = await supabase
    .from('base')
    .select('unidade, nome_cliente, documento')

  const ucMap = new Map<string, { unidade: string; nome_cliente: string }>()
  for (const row of baseRows ?? []) {
    const norm = (row.unidade || '').replace(/[.\-\s]/g, '').toLowerCase()
    ucMap.set(norm, { unidade: row.unidade, nome_cliente: row.nome_cliente || '' })
  }

  const resultados = await Promise.all(files.map(async (file) => {
    const { ucRaw, mesAno } = parseFilename(file.name)

    let matched: { unidade: string; nome_cliente: string } | null = null

    if (ucRaw) {
      const ucNorm = ucRaw.replace(/[.\-\s]/g, '').toLowerCase()

      // Busca exata
      if (ucMap.has(ucNorm)) {
        matched = ucMap.get(ucNorm)!
      } else {
        // Busca parcial (UC da base pode ter mais dígitos)
        for (const [key, val] of ucMap.entries()) {
          if (key.includes(ucNorm) || ucNorm.includes(key)) {
            matched = val
            break
          }
        }
      }
    }

    if (action === 'preview') {
      return {
        filename: file.name,
        size: file.size,
        ucRaw,
        mesAno,
        unidade: matched?.unidade ?? null,
        nome_cliente: matched?.nome_cliente ?? null,
        status: matched && mesAno ? 'ok' : matched && !mesAno ? 'sem_mes' : !matched && mesAno ? 'sem_uc' : 'erro',
      }
    }

    // action === 'upload'
    if (!matched || !mesAno) {
      return { filename: file.name, resultado: 'pulado', motivo: !matched ? 'UC não encontrada' : 'Mês não detectado' }
    }

    const { unidade, nome_cliente } = matched
    const ucNorm = normPath(unidade.replace(/[.\-]/g, ''))
    const clienteNorm = normPath(nome_cliente)
    const storagePath = `${clienteNorm}/${ucNorm}/${mesAno}.pdf`

    const buffer = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from('faturas')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

    if (upErr) {
      return { filename: file.name, resultado: 'erro_upload', motivo: upErr.message }
    }

    const { data: urlData } = supabase.storage.from('faturas').getPublicUrl(storagePath)
    const publicUrl = urlData.publicUrl

    await supabase.from('historico_documentos').upsert(
      { unidade, tipo: 'fatura', mes_ano: mesAno, url: publicUrl },
      { onConflict: 'unidade,tipo,mes_ano' }
    )
    // caminho_fatura atualizado automaticamente pelo trigger trg_sync_caminho_fatura
    // que só atualiza se mesAno for mais recente que o atual em historico_documentos

    return { filename: file.name, resultado: 'ok', unidade, mesAno, publicUrl }
  }))

  return NextResponse.json({ resultados })
}
