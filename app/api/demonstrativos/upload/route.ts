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

  // Dispara webhook do n8n VIA pg_net (fire-and-forget, não bloqueia).
  // Antes: fetch direto pro n8n com await — Vercel matava em 10-60s, mas n8n leva ~38s
  // (OCR Gemini + lookup + RPC + move). A função morria antes do webhook sequer começar.
  // Agora: chama RPC que enfileira a request no pg_net e retorna em milissegundos.
  // Frontend mostra "Em processamento" e atualiza ao recarregar.
  let requestId: number | null = null
  let webhookError: string | null = null
  try {
    const { data, error } = await supabase.rpc('disparar_webhook_demonstrativo', {
      pdf_url: publicUrl,
    })
    if (error) {
      webhookError = error.message
    } else {
      requestId = data as number
    }
  } catch (err: any) {
    webhookError = err?.message || String(err)
  }

  return NextResponse.json({
    storage_path: storagePath,
    public_url: publicUrl,
    webhook_request_id: requestId,
    webhook_async: true,
    webhook_error: webhookError,
    mensagem: webhookError
      ? `PDF salvo, mas falha ao enfileirar processamento: ${webhookError}`
      : 'PDF enfileirado para processamento. Aguarde ~40 segundos e atualize para ver o resultado.',
  })
}
