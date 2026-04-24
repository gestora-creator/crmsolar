import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''

function normPath(str: string): string {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_').trim().toUpperCase()
}

// Detecta o formato do identificador extraído pelo OCR
function detectarFormato(id: string): 'codigo_cliente' | 'numero_uc' {
  if (!id) return 'numero_uc'
  // Código do Cliente: começa com dígitos, tem barra (ex: 10/2272721-8)
  if (/^\d+\//.test(id.trim())) return 'codigo_cliente'
  // Número da UC: tem pontos separando grupos (ex: 753.509.051-91)
  return 'numero_uc'
}

async function ocrFatura(pdfBase64: string): Promise<{
  identificador: string | null
  referencia: string | null
  vencimento: string | null
  valor: string | null
  nome_titular: string | null
}> {
  const prompt = `Você é um extrator de dados de faturas de energia elétrica da Energisa (Brasil).

IMPORTANTE: O identificador da unidade aparece de formas diferentes dependendo da época da fatura:
- Faturas ANTIGAS: campo "Código do Cliente" formato 10/XXXXXXX-X (ex: 10/2272721-8)
- Faturas NOVAS: campo "Unidade Consumidora" formato XXX.XXX.051-XX (ex: 753.509.051-91)
São a MESMA coisa com nomes diferentes. Extraia O QUE EXISTIR.

Extraia:
1. identificador: valor do "Código do Cliente" OU "Unidade Consumidora" — o que aparecer
2. referencia: mês/ano de referência (ex: "04/2026")
3. vencimento: data de vencimento (ex: "06/05/2026")
4. valor: valor total a pagar, só números e vírgula (ex: "737,67")
5. nome_titular: nome do titular

Responda APENAS em JSON puro sem markdown:
{"identificador": "...", "referencia": "...", "vencimento": "...", "valor": "...", "nome_titular": "..."}`

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
        ]}],
        generationConfig: { temperature: 0 }
      })
    }
  )

  const data = await resp.json()
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const limpo = texto.replace(/```json|```/g, '').trim()

  try { return JSON.parse(limpo) }
  catch { return { identificador: null, referencia: null, vencimento: null, valor: null, nome_titular: null } }
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const formData = await req.formData()
  const action = formData.get('action') as string
  const files  = formData.getAll('files') as File[]

  if (!files.length) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })

  const resultados = await Promise.all(files.map(async (file) => {
    const base = { filename: file.name, size: file.size }

    if (!GEMINI_KEY) return { ...base, status: 'erro_ocr', motivo: 'GEMINI_API_KEY não configurada no servidor' }

    const buffer   = await file.arrayBuffer()
    const b64      = Buffer.from(buffer).toString('base64')

    let ocr: Awaited<ReturnType<typeof ocrFatura>>
    try { ocr = await ocrFatura(b64) }
    catch (e: any) { return { ...base, status: 'erro_ocr', motivo: `OCR falhou: ${e.message}` } }

    const id        = (ocr.identificador || '').trim()
    const referencia = (ocr.referencia || '').trim()
    const formato   = detectarFormato(id)

    let row: { unidade: string; nome_cliente: string; documento: string } | null = null
    let metodo = 'nao_encontrado'

    if (id) {
      // Busca primária pelo formato detectado
      if (formato === 'codigo_cliente') {
        const { data } = await supabase.from('base')
          .select('unidade, nome_cliente, documento')
          .eq('unidade_antiga', id).limit(1).single()
        if (data) { row = data; metodo = 'codigo_cliente' }
      } else {
        const { data } = await supabase.from('base')
          .select('unidade, nome_cliente, documento')
          .eq('unidade', id).limit(1).single()
        if (data) { row = data; metodo = 'numero_uc' }
      }

      // Fallback cruzado
      if (!row) {
        if (formato === 'codigo_cliente') {
          const { data } = await supabase.from('base')
            .select('unidade, nome_cliente, documento')
            .eq('unidade', id).limit(1).single()
          if (data) { row = data; metodo = 'fallback_uc' }
        } else {
          const { data } = await supabase.from('base')
            .select('unidade, nome_cliente, documento')
            .eq('unidade_antiga', id).limit(1).single()
          if (data) { row = data; metodo = 'fallback_antiga' }
        }
      }
    }

    if (!row) {
      return {
        ...base, status: 'sem_uc',
        codigo_cliente: id || null,
        numero_uc: null,
        referencia: referencia || null,
        valor: ocr.valor || null,
        motivo: `UC não encontrada — identificador: "${id || 'não detectado'}" (${formato})`,
      }
    }

    if (!referencia) {
      return {
        ...base, status: 'sem_referencia',
        codigo_cliente: id,
        numero_uc: row.unidade,
        nome_cliente: row.nome_cliente,
        motivo: 'Mês/ano de referência não detectado',
      }
    }

    const mesAno    = referencia.replace('/', '-')
    const path      = `${normPath(row.nome_cliente)}/${normPath(row.unidade)}/${mesAno}.pdf`
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/faturas/${path}`

    const preview = {
      ...base, status: 'ok',
      codigo_cliente: id,
      numero_uc: row.unidade,
      nome_cliente: row.nome_cliente,
      referencia, mesAno,
      valor: ocr.valor || null,
      metodo_lookup: metodo,
      path, publicUrl,
    }

    if (action === 'preview') return preview

    const { error: upErr } = await supabase.storage
      .from('faturas')
      .upload(path, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true })

    if (upErr) return { ...preview, status: 'erro', resultado: 'erro_upload', motivo: upErr.message }

    await supabase.from('historico_documentos').upsert(
      { unidade: row.unidade, tipo: 'fatura', mes_ano: mesAno, url: publicUrl },
      { onConflict: 'unidade,tipo,mes_ano' }
    )

    return { ...preview, resultado: 'ok' }
  }))

  return NextResponse.json({ resultados })
}
