import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 120 // OCR pode demorar

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''

function normPath(str: string): string {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_').trim().toUpperCase()
}

async function ocrFatura(pdfBase64: string): Promise<{
  codigo_cliente: string | null
  numero_uc: string | null
  referencia: string | null
  vencimento: string | null
  valor: string | null
  nome_titular: string | null
}> {
  const prompt = `Você é um extrator de dados de faturas de energia elétrica da Energisa (Brasil).
Analise esta fatura PDF e extraia EXATAMENTE os seguintes campos:

1. codigo_cliente: o "Código do Cliente" no formato 10/XXXXXXX-X (ex: 10/2272721-8)
2. numero_uc: a "Unidade Consumidora" no formato com pontos e traço (ex: 753.509.051-91)
3. referencia: o mês/ano de referência (ex: 04/2026)
4. vencimento: data de vencimento (ex: 06/05/2026)
5. valor: valor total da fatura em reais, apenas números e vírgula (ex: 737,67)
6. nome_titular: nome do titular da UC

Responda APENAS em JSON puro sem markdown, sem explicações:
{"codigo_cliente": "...", "numero_uc": "...", "referencia": "...", "vencimento": "...", "valor": "...", "nome_titular": "..."}`

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }
          ]
        }],
        generationConfig: { temperature: 0 }
      })
    }
  )

  const data = await resp.json()
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const limpo = texto.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(limpo)
  } catch {
    return { codigo_cliente: null, numero_uc: null, referencia: null, vencimento: null, valor: null, nome_titular: null }
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const formData = await req.formData()
  const action = formData.get('action') as string // 'preview' | 'upload'
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })
  }

  const resultados = await Promise.all(files.map(async (file) => {
    const base = {
      filename: file.name,
      size: file.size,
    }

    // Validar chave antes de chamar OCR
    if (!GEMINI_KEY) {
      return { ...base, status: 'erro_ocr', motivo: 'GEMINI_API_KEY não configurada no servidor' }
    }

    // Converter para base64 para o Gemini
    const buffer = await file.arrayBuffer()
    const pdfBase64 = Buffer.from(buffer).toString('base64')

    // OCR
    let ocr: Awaited<ReturnType<typeof ocrFatura>>
    try {
      ocr = await ocrFatura(pdfBase64)
    } catch (e: any) {
      return { ...base, status: 'erro_ocr', motivo: `OCR falhou: ${e.message}` }
    }

    const codigoCliente = (ocr.codigo_cliente || '').trim()
    const numeroUC = (ocr.numero_uc || '').trim()
    const referencia = (ocr.referencia || '').trim()

    // Lookup no banco: primeiro pelo código do cliente (unidade_antiga)
    let row: { unidade: string; nome_cliente: string; documento: string } | null = null
    let metodo = 'nao_encontrado'

    if (codigoCliente) {
      const { data } = await supabase
        .from('base')
        .select('unidade, nome_cliente, documento')
        .eq('unidade_antiga', codigoCliente)
        .limit(1)
        .single()
      if (data) { row = data; metodo = 'codigo_cliente' }
    }

    // Fallback: pelo número da UC diretamente
    if (!row && numeroUC) {
      const { data } = await supabase
        .from('base')
        .select('unidade, nome_cliente, documento')
        .eq('unidade', numeroUC)
        .limit(1)
        .single()
      if (data) { row = data; metodo = 'numero_uc' }
    }

    if (!row) {
      return {
        ...base,
        status: 'sem_uc',
        codigo_cliente: codigoCliente || null,
        numero_uc: numeroUC || null,
        referencia: referencia || null,
        valor: ocr.valor || null,
        nome_titular: ocr.nome_titular || null,
        motivo: `UC não encontrada — código: ${codigoCliente || 'não detectado'} | UC: ${numeroUC || 'não detectado'}`,
      }
    }

    if (!referencia) {
      return {
        ...base,
        status: 'sem_referencia',
        codigo_cliente: codigoCliente,
        numero_uc: row.unidade,
        nome_cliente: row.nome_cliente,
        motivo: 'Mês/ano de referência não detectado',
      }
    }

    // Montar path no storage
    const mesAno = referencia.replace('/', '-') // "04/2026" → "04-2026"
    const path = `${normPath(row.nome_cliente)}/${normPath(row.unidade)}/${mesAno}.pdf`
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/faturas/${path}`

    const preview = {
      ...base,
      status: 'ok',
      codigo_cliente: codigoCliente,
      numero_uc: row.unidade,
      nome_cliente: row.nome_cliente,
      referencia,
      mesAno,
      valor: ocr.valor || null,
      nome_titular: ocr.nome_titular || null,
      metodo_lookup: metodo,
      path,
      publicUrl,
    }

    // Se for apenas preview, retorna sem fazer upload
    if (action === 'preview') return preview

    // Upload para Supabase Storage
    const { error: upErr } = await supabase.storage
      .from('faturas')
      .upload(path, Buffer.from(buffer), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (upErr) {
      return { ...preview, status: 'erro', resultado: 'erro_upload', motivo: upErr.message }
    }

    // Registrar em historico_documentos
    await supabase.from('historico_documentos').upsert(
      { unidade: row.unidade, tipo: 'fatura', mes_ano: mesAno, url: publicUrl },
      { onConflict: 'unidade,tipo,mes_ano' }
    )

    return { ...preview, resultado: 'ok' }
  }))

  return NextResponse.json({ resultados })
}
