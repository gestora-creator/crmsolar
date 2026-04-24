import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

const N8N_WEBHOOK = 'https://n8n.damaral.ia.br/webhook/upload-fatura-historica'

function normPath(str: string): string {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_').trim().toUpperCase()
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const action   = formData.get('action') as string  // 'preview' | 'upload'
  const files    = formData.getAll('files') as File[]

  if (!files.length) return NextResponse.json({ error: 'Nenhum arquivo' }, { status: 400 })

  // Preview: apenas registra os arquivos sem processar (OCR acontece no upload)
  if (action === 'preview') {
    const resultados = files.map(file => ({
      filename: file.name,
      size: file.size,
      status: 'aguardando',
    }))
    return NextResponse.json({ resultados })
  }

  // Upload: envia cada arquivo para o webhook n8n (OCR + storage + DB)
  const resultados = await Promise.all(files.map(async (file) => {
    const base = { filename: file.name, size: file.size }
    try {
      const buffer    = await file.arrayBuffer()
      const pdfBase64 = Buffer.from(buffer).toString('base64')

      const resp = await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdf_base64:   pdfBase64,
          nome_arquivo: file.name,
        }),
        signal: AbortSignal.timeout(90_000),
      })

      if (!resp.ok) {
        const txt = await resp.text().catch(() => `HTTP ${resp.status}`)
        return { ...base, status: 'erro', resultado: 'erro_upload', motivo: txt }
      }

      const json = await resp.json()

      // Webhook retornou erro de UC não encontrada
      if (json.status === 'nao_encontrado' || json.erro) {
        return {
          ...base,
          status: 'sem_uc',
          codigo_cliente: json.identificador || null,
          numero_uc: null,
          nome_cliente: null,
          referencia: json.referencia || null,
          motivo: json.erro || 'UC não encontrada',
        }
      }

      // Sucesso
      return {
        ...base,
        status: 'ok',
        resultado: 'ok',
        codigo_cliente: json.identificador || null,
        numero_uc:      json.unidade       || null,
        nome_cliente:   json.nome_cliente  || null,
        referencia:     json.referencia    || null,
        publicUrl:      json.public_url    || null,
        metodo_lookup:  json.metodo_lookup || null,
      }
    } catch (e: any) {
      return { ...base, status: 'erro', resultado: 'erro_upload', motivo: e?.message || 'timeout ou falha de rede' }
    }
  }))

  return NextResponse.json({ resultados })
}
