import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Mesmo padrão de path usado em monitor-faturas/upload e no n8n
function normPath(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\\]/g, '-')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/&/g, 'E')
    .trim()
    .toUpperCase()
}

const N8N_WEBHOOK_URL = process.env.N8N_DEMONSTRATIVO_WEBHOOK_URL
  ?? 'https://n8n.damaral.ia.br/webhook/upload-demonstrativo-geracao'

export interface DemonstrativoUploadResult {
  storage_path: string
  public_url: string
  webhook_response: any
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  // cliente e uc_geradora são opcionais — se não vierem, usamos um path provisório
  // e o n8n descobre via OCR. Mas o ideal é o frontend já saber.
  const cliente = (formData.get('cliente') as string | null) ?? 'INCOMING'
  const ucGeradora = (formData.get('uc_geradora') as string | null) ?? 'UNKNOWN'
  // mes_referencia opcional — se não vier, usa timestamp como fallback no path
  const mesRefRaw = (formData.get('mes_referencia') as string | null) ?? null

  if (!file) {
    return NextResponse.json({ error: 'Campo obrigatório: file' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Apenas PDFs são aceitos' }, { status: 400 })
  }

  // Padroniza mes_referencia para MM-YYYY (aceita "03/2026" ou "03-2026")
  let mesRefPath = 'sem-ref-' + Date.now()
  if (mesRefRaw && /^\d{2}[-/]\d{4}$/.test(mesRefRaw)) {
    mesRefPath = mesRefRaw.replace('/', '-')
  }

  const clientePath = normPath(cliente)
  const ucPath = normPath(ucGeradora)
  const storagePath = `${clientePath}/${ucPath}/${mesRefPath}.pdf`

  // Upload no bucket demonstrativos
  const arrayBuffer = await file.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)
  const { error: uploadError } = await supabase.storage
    .from('demonstrativos')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: `Falha no upload: ${uploadError.message}` }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from('demonstrativos').getPublicUrl(storagePath)
  const publicUrl = pub.publicUrl

  // Dispara webhook do n8n com a URL do PDF
  let webhookData: any = null
  try {
    const webhookResp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_storage_url: publicUrl,
        nome_arquivo: file.name,
      }),
    })
    webhookData = await webhookResp.json().catch(() => ({ erro: 'Resposta não-JSON do webhook' }))
    if (!webhookResp.ok) {
      return NextResponse.json({
        storage_path: storagePath,
        public_url: publicUrl,
        webhook_status: webhookResp.status,
        webhook_response: webhookData,
        error: 'Webhook retornou erro — PDF foi salvo mas o banco pode não ter sido atualizado',
      }, { status: 500 })
    }
  } catch (err: any) {
    return NextResponse.json({
      storage_path: storagePath,
      public_url: publicUrl,
      error: `PDF salvo mas falha ao chamar webhook: ${err.message}`,
    }, { status: 500 })
  }

  return NextResponse.json({
    storage_path: storagePath,
    public_url: publicUrl,
    webhook_response: webhookData,
  } as DemonstrativoUploadResult)
}
