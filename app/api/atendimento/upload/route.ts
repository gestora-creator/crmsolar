import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/require-session'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
// Permitir até 25MB no body (WhatsApp aceita até ~16MB para mídia, 100MB para documento)
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'whatsapp-media'

// Mapear mimetype -> tipo lógico do whatsapp
function inferTipo(mimetype: string): 'image' | 'audio' | 'video' | 'document' {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype.startsWith('video/')) return 'video'
  return 'document'
}

// Sanitizar nome de arquivo: manter extensão, remover caracteres perigosos
function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf('.')
  const ext = lastDot > 0 ? name.slice(lastDot) : ''
  const base = (lastDot > 0 ? name.slice(0, lastDot) : name)
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 80)
  return base + ext.toLowerCase()
}

/**
 * POST /api/atendimento/upload
 *
 * FormData:
 *   - file: File (obrigatório)
 *   - jid: string (opcional, usado para organizar pastas)
 *
 * Retorna:
 *   { url, path, mimetype, filename, size, tipo }
 *
 * Usado pela UI de atendimento para subir anexos antes de enviar pelo WhatsApp.
 * O envio em si continua sendo feito pelo POST /api/atendimento/mensagens/[jid]
 * com o `media_url` retornado aqui.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession()
  if (!guard.ok) return guard.response

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const jidRaw = (formData.get('jid') as string | null) || 'sem-jid'

    if (!file) {
      return NextResponse.json({ error: 'Campo "file" obrigatório' }, { status: 400 })
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })
    }

    // Limite por arquivo: 50MB (mesmo do bucket)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Arquivo excede 50MB' },
        { status: 413 }
      )
    }

    const mimetype = file.type || 'application/octet-stream'
    const tipo = inferTipo(mimetype)
    const safeName = sanitizeFilename(file.name || `arquivo_${Date.now()}`)

    // Pasta por JID (sanitizado) + timestamp para evitar colisão
    const jidSafe = jidRaw.replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 60)
    const path = `outgoing/${jidSafe}/${Date.now()}_${safeName}`

    // Upload para Storage
    const arrayBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: mimetype,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('[upload] storage error:', uploadError)
      return NextResponse.json(
        { error: 'Falha no upload', details: uploadError.message },
        { status: 500 }
      )
    }

    // URL pública
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: uploadData.path,
      mimetype,
      filename: safeName,
      size: file.size,
      tipo,
    })
  } catch (err: any) {
    console.error('[upload] erro inesperado:', err)
    return NextResponse.json(
      { error: 'Erro interno', details: err.message },
      { status: 500 }
    )
  }
}
