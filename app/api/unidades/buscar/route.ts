import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Busca livre de UCs — usado para adicionar destinatárias de qualquer cliente
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const excluir = searchParams.get('excluir') || '' // UC a excluir da busca (a própria geradora)

  if (q.length < 2) return NextResponse.json({ data: [] })

  const { data } = await supabase
    .from('base')
    .select('unidade, nome_cliente, tipo, documento')
    .or(`unidade.ilike.%${q}%,nome_cliente.ilike.%${q}%`)
    .neq('unidade', excluir)
    .limit(10)

  return NextResponse.json({ data: data || [] })
}
