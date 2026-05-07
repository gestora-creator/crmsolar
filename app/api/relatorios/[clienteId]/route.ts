import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clienteId: string }> }
) {
  const { clienteId } = await params

  try {
    // 1. Buscar nome_cliente na tabela base (é o nome usado no Storage)
    const { data: baseRows, error: baseError } = await supabase
      .from('base')
      .select('nome_cliente')
      .eq('cliente_id', clienteId)
      .limit(1)

    if (baseError) throw baseError

    // 2. Se não achou na base, tentar pelo grupo econômico
    let nomeCliente = baseRows?.[0]?.nome_cliente
    
    if (!nomeCliente) {
      // Buscar grupo econômico e tentar encontrar nome_cliente de qualquer membro
      const { data: cliente } = await supabase
        .from('crm_clientes')
        .select('grupo_economico_id')
        .eq('id', clienteId)
        .single()

      if (cliente?.grupo_economico_id) {
        const { data: grupoClientes } = await supabase
          .from('crm_clientes')
          .select('id')
          .eq('grupo_economico_id', cliente.grupo_economico_id)

        if (grupoClientes?.length) {
          const ids = grupoClientes.map(c => c.id)
          const { data: baseGrupo } = await supabase
            .from('base')
            .select('nome_cliente')
            .in('cliente_id', ids)
            .limit(1)

          nomeCliente = baseGrupo?.[0]?.nome_cliente
        }
      }
    }

    if (!nomeCliente) {
      return NextResponse.json({ data: [], count: 0 })
    }

    // 3. Construir o prefixo do storage (NOME_CLIENTE com espaços → underscores)
    const storagePrefix = nomeCliente
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\s]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()

    // 4. Listar arquivos no bucket relatorios
    const { data: files, error: storageError } = await supabase
      .storage
      .from('relatorios')
      .list(storagePrefix, {
        limit: 100,
        sortBy: { column: 'name', order: 'desc' }
      })

    if (storageError) throw storageError

    // 5. Construir URLs públicas e dados formatados
    const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/relatorios`
    
    const relatorios = (files || [])
      .filter(f => f.name.endsWith('.pdf'))
      .map(f => {
        // Parse mes-ano do nome: "04-2026.pdf" → { mes: "04", ano: "2026" }
        const match = f.name.match(/^(\d{2})-(\d{4})\.pdf$/)
        const mes = match ? match[1] : null
        const ano = match ? match[2] : null
        const MESES: Record<string, string> = {
          '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março',
          '04': 'Abril', '05': 'Maio', '06': 'Junho',
          '07': 'Julho', '08': 'Agosto', '09': 'Setembro',
          '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
        }

        return {
          nome_arquivo: f.name,
          url: `${baseUrl}/${storagePrefix}/${f.name}`,
          mes_referencia: mes && ano ? `${mes}-${ano}` : f.name.replace('.pdf', ''),
          mes_label: mes && ano ? `${MESES[mes] || mes}/${ano}` : f.name.replace('.pdf', ''),
          created_at: f.created_at,
          size: f.metadata?.size || null,
          nome_cliente: nomeCliente,
        }
      })
      .sort((a, b) => {
        // Ordenar por ano desc, depois mês desc
        return b.mes_referencia.localeCompare(a.mes_referencia)
      })

    return NextResponse.json({
      data: relatorios,
      count: relatorios.length,
      nome_cliente: nomeCliente,
      storage_prefix: storagePrefix,
    })
  } catch (err: any) {
    console.error('Erro ao buscar relatórios:', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao buscar relatórios', data: [], count: 0 },
      { status: 500 }
    )
  }
}
