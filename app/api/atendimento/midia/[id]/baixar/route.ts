/**
 * POST /api/atendimento/midia/[id]/baixar
 *
 * Padrão v3.1 para descriptografar mídia sob demanda. Disparado pelo
 * componente MediaMessage em background quando uma mensagem de
 * imagem/vídeo/áudio/documento ainda está sem media_url no banco
 * (caso típico: webhook entregou só a URL .enc do Baileys).
 *
 * Fluxo (encapsulado em lib/whatsapp/media-storage.recuperarMidia):
 *   1. Carrega a mensagem por id (numérico).
 *   2. Se já tem media_url, retorna idempotente.
 *   3. Pede pra Evolution descriptografar (getBase64FromMediaMessage).
 *   4. Faz upload no Storage Supabase (bucket whatsapp-media).
 *   5. UPDATE da linha com media_url, media_mimetype, media_filename.
 *
 * Retorno: { success, url, alreadyRecovered, mimetype, filename }
 *
 * O endpoint antigo /api/atendimento/recuperar-midia/[id] continua
 * disponível por compatibilidade — funções iguais, ambos consomem o
 * mesmo helper.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { recuperarMidia } from '@/lib/whatsapp/media-storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function getCurrentUser() {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id: idRaw } = await params
  const id = parseInt(idRaw, 10)

  const result = await recuperarMidia(id)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    url: result.url,
    alreadyRecovered: result.alreadyRecovered,
    mimetype: result.mimetype,
    filename: result.filename,
    size: result.size,
  })
}
