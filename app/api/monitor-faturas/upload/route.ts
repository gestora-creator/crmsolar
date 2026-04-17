import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Normaliza strings para uso em paths de storage (idêntico ao n8n)
function normPath(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')         // remove acentos
    .replace(/[\/\\]/g, '-')                 // / \ → -
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')      // remove chars especiais (incluindo pontos)
    .replace(/\s+/g, '_')                    // espaços → _
    .replace(/&/g, 'E')                      // & → E
    .trim()
    .toUpperCase()
}

// Mantido por retrocompatibilidade
function normalizeClientePath(nome: string): string {
  return normPath(nome)
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

  const file      = formData.get('file') as File | null
  const cliente   = formData.get('cliente') as string | null
  const uc        = formData.get('uc') as string | null
  const mes       = formData.get('mes') as string | null  // MM
  const ano       = formData.get('ano') as string | null  // YYYY

  if (!file || !cliente || !uc || !mes || !ano) {
    return NextResponse.json({ error: 'Campos obrigatórios: file, cliente, uc, mes, ano' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Apenas arquivos PDF são permitidos' }, { status: 400 })
  }

  // Montar caminho no mesmo padrão do sistema automático
  const clientePath = normalizeClientePath(cliente)
  const ucNorm = normPath(uc)  // normaliza UC (remove pontos) — igual ao n8n
  const storagePath = `${clientePath}/${ucNorm}/${mes}-${ano}.pdf`

  // Converter File para ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)

  // Upload para o bucket faturas
  const { error: uploadError } = await supabase.storage
    .from('faturas')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true, // sobrescreve se já existir
    })

  if (uploadError) {
    return NextResponse.json({ error: `Falha no upload: ${uploadError.message}` }, { status: 500 })
  }

  // Obter URL pública
  const { data: urlData } = supabase.storage
    .from('faturas')
    .getPublicUrl(storagePath)

  const publicUrl = urlData.publicUrl

  const mesAno = `${mes}-${ano}` // ex: 04-2026

  // Gravar em historico_documentos (upsert — substitui se já existir para o mesmo mês)
  const { error: historicoError } = await supabase
    .from('historico_documentos')
    .upsert({
      unidade: uc,       // chave de lookup com formato original (pontos) da base
      tipo: 'fatura',
      mes_ano: mesAno,
      url: publicUrl,
    }, { onConflict: 'unidade,tipo,mes_ano' })

  if (historicoError) {
    return NextResponse.json({
      error: `Upload feito mas falha ao gravar histórico: ${historicoError.message}`,
      upload_ok: true,
      public_url: publicUrl,
    }, { status: 500 })
  }

  // Manter retrocompatibilidade: atualizar caminho_fatura na base também
  await supabase
    .from('base')
    .update({ caminho_fatura: publicUrl })
    .eq('unidade', uc)

  return NextResponse.json({
    ok: true,
    storage_path: storagePath,
    public_url: publicUrl,
  })
}
