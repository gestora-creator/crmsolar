import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// App Router: aumenta limite de body para uploads grandes (padrão é 4MB)
export const maxDuration = 60


// Mapa de meses em PT para número
const MESES: Record<string, string> = {
  jan: '01', janeiro: '01', fev: '02', fevereiro: '02',
  mar: '03', março: '03', marco: '03', abr: '04', abril: '04',
  mai: '05', maio: '05', jun: '06', junho: '06',
  jul: '07', julho: '07', ago: '08', agosto: '08',
  set: '09', setembro: '09', out: '10', outubro: '10',
  nov: '11', novembro: '11', dez: '12', dezembro: '12',
}

// Extrai MM-YYYY do nome do arquivo — UC já é conhecida pelo contexto
function parseMesAno(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '').toLowerCase()

  // 04-2026 ou 04_2026 (MM-YYYY)
  const numMatch = name.match(/(?<![0-9])(0[1-9]|1[0-2])[-_](20\d{2})(?![0-9])/)
  if (numMatch) return `${numMatch[1]}-${numMatch[2]}`

  // 2026-01 ou 2026_01 (YYYY-MM)
  const invertMatch = name.match(/(?<![0-9])(20\d{2})[-_](0[1-9]|1[0-2])(?![0-9])/)
  if (invertMatch) return `${invertMatch[2]}-${invertMatch[1]}`

  // abril-2026 ou abril_2026 ou abril2026
  const anoMatch = name.match(/(20\d{2})/)
  if (anoMatch) {
    const ano = anoMatch[1]
    for (const [nome, num] of Object.entries(MESES)) {
      if (name.includes(nome)) return `${num}-${ano}`
    }
  }

  return null
}

function normPath(str: string): string {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_').trim().toUpperCase()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ unidade: string }> }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { unidade: ucParam } = await params
  const unidade = decodeURIComponent(ucParam)

  // Buscar nome do cliente para montar o path
  const { data: uc } = await supabase.from('base')
    .select('unidade, nome_cliente').eq('unidade', unidade).single()

  if (!uc) return NextResponse.json({ error: 'UC não encontrada' }, { status: 404 })

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })

  const clienteNorm = normPath(uc.nome_cliente)
  const ucNorm = normPath(unidade.replace(/[.\-]/g, ''))

  const resultados = await Promise.all(files.map(async (file) => {
    const mesAno = parseMesAno(file.name)

    if (!mesAno) {
      return { filename: file.name, resultado: 'sem_mes',
        motivo: 'Não foi possível identificar o mês/ano no nome do arquivo' }
    }

    try {
      const storagePath = `${clienteNorm}/${ucNorm}/${mesAno}.pdf`
      const buffer = new Uint8Array(await file.arrayBuffer())

      const { error: upErr } = await supabase.storage.from('faturas')
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

      if (upErr) {
        console.error('[upload UC] Storage error:', upErr)
        return { filename: file.name, resultado: 'erro', motivo: upErr.message }
      }

      const { data: urlData } = supabase.storage.from('faturas').getPublicUrl(storagePath)
      const publicUrl = urlData.publicUrl

      const { error: dbErr } = await supabase.from('historico_documentos').upsert(
        { unidade, tipo: 'fatura', mes_ano: mesAno, url: publicUrl },
        { onConflict: 'unidade,tipo,mes_ano' }
      )
      if (dbErr) console.error('[upload UC] DB error:', dbErr)

      return { filename: file.name, resultado: 'ok', mesAno, publicUrl }
    } catch (e: any) {
      console.error('[upload UC] Unexpected error:', e)
      return { filename: file.name, resultado: 'erro', motivo: e?.message || 'erro inesperado' }
    }
  }))

  return NextResponse.json({ unidade, resultados })
}
