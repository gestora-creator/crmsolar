import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MESES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março',
  '04': 'Abril', '05': 'Maio', '06': 'Junho',
  '07': 'Julho', '08': 'Agosto', '09': 'Setembro',
  '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
}

interface DocItem {
  tipo: 'relatorio' | 'fatura' | 'demonstrativo'
  url: string
  nome_arquivo: string
  mes_ref: string
  mes_label: string
  ano: string
  unidade: string | null
  tipo_uc: string | null
  created_at: string | null
  size: number | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clienteId: string }> }
) {
  const { clienteId } = await params
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  try {
    // 1. Buscar nome_cliente e UCs na tabela base
    const { data: baseRows } = await supabase
      .from('base')
      .select('nome_cliente, unidade, tipo, cliente_id')
      .eq('cliente_id', clienteId)

    let nomeCliente: string | null = null
    let ucs: { unidade: string; tipo: string }[] = []

    if (baseRows?.length) {
      nomeCliente = baseRows[0].nome_cliente
      ucs = baseRows.map(r => ({ unidade: r.unidade, tipo: r.tipo || 'Beneficiária' }))
    }

    // 2. Fallback: grupo econômico
    if (!nomeCliente) {
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
          const { data: baseGrupo } = await supabase
            .from('base')
            .select('nome_cliente, unidade, tipo, cliente_id')
            .in('cliente_id', grupoClientes.map(c => c.id))

          if (baseGrupo?.length) {
            nomeCliente = baseGrupo[0].nome_cliente
            ucs = baseGrupo.map(r => ({ unidade: r.unidade, tipo: r.tipo || 'Beneficiária' }))
          }
        }
      }
    }

    if (!nomeCliente) {
      return NextResponse.json({ data: [], count: 0, meses: [] })
    }

    // 3. Construir prefixo do storage
    const storagePrefix = nomeCliente
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\s]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()

    // Mapa UC → tipo
    const ucTipoMap = new Map(ucs.map(u => [u.unidade, u.tipo]))
    const docs: DocItem[] = []

    // 4a. RELATÓRIOS (NOME/MM-YYYY.pdf)
    const { data: relFiles } = await supabase.storage
      .from('relatorios')
      .list(storagePrefix, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    for (const f of (relFiles || []).filter(f => f.name.endsWith('.pdf'))) {
      const match = f.name.match(/^(\d{2})-(\d{4})\.pdf$/)
      if (!match) continue
      const [, mes, ano] = match
      docs.push({
        tipo: 'relatorio',
        url: `${baseUrl}/storage/v1/object/public/relatorios/${storagePrefix}/${f.name}`,
        nome_arquivo: f.name,
        mes_ref: `${mes}-${ano}`,
        mes_label: `${MESES[mes] || mes}/${ano}`,
        ano,
        unidade: null,
        tipo_uc: null,
        created_at: f.created_at,
        size: f.metadata?.size || null,
      })
    }

    // 4b. FATURAS e DEMONSTRATIVOS (NOME/UC/MM-YYYY.pdf)
    for (const bucket of ['faturas', 'demonstrativos'] as const) {
      const tipoDoc = bucket === 'faturas' ? 'fatura' : 'demonstrativo'

      const { data: ucFolders } = await supabase.storage
        .from(bucket)
        .list(storagePrefix, { limit: 200 })

      if (!ucFolders?.length) continue

      for (const folder of ucFolders) {
        // Pastas não têm id no Supabase Storage list
        if (folder.id) continue
        const ucFolder = folder.name

        const { data: pdfs } = await supabase.storage
          .from(bucket)
          .list(`${storagePrefix}/${ucFolder}`, {
            limit: 100,
            sortBy: { column: 'name', order: 'desc' }
          })

        if (!pdfs?.length) continue

        // Mapear pasta → UC conhecida
        const ucClean = ucFolder.replace(/[^0-9]/g, '')
        let ucMatch: string | null = null
        let tipoUC: string | null = null

        for (const [uc, tipo] of ucTipoMap) {
          if (uc.replace(/[^0-9]/g, '') === ucClean) {
            ucMatch = uc
            tipoUC = tipo
            break
          }
        }

        for (const pdf of pdfs.filter(f => f.name.endsWith('.pdf'))) {
          const match = pdf.name.match(/^(\d{2})-(\d{4})\.pdf$/)
          if (!match) continue
          const [, mes, ano] = match
          docs.push({
            tipo: tipoDoc,
            url: `${baseUrl}/storage/v1/object/public/${bucket}/${storagePrefix}/${ucFolder}/${pdf.name}`,
            nome_arquivo: pdf.name,
            mes_ref: `${mes}-${ano}`,
            mes_label: `${MESES[mes] || mes}/${ano}`,
            ano,
            unidade: ucMatch || ucFolder,
            tipo_uc: tipoUC,
            created_at: pdf.created_at,
            size: pdf.metadata?.size || null,
          })
        }
      }
    }

    // 5. Deduplicar (mesma UC com/sem traço pode gerar dupla)
    const seen = new Set<string>()
    const dedupDocs = docs.filter(d => {
      const key = `${d.tipo}|${d.mes_ref}|${(d.unidade || '').replace(/[^0-9]/g, '')}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 6. Ordenar: mais recente primeiro, tipo (relatorio → fatura → demonstrativo)
    dedupDocs.sort((a, b) => {
      const [ma, ya] = a.mes_ref.split('-')
      const [mb, yb] = b.mes_ref.split('-')
      const cmp = yb.localeCompare(ya) || mb.localeCompare(ma)
      if (cmp !== 0) return cmp
      const ordem = { relatorio: 0, fatura: 1, demonstrativo: 2 }
      return (ordem[a.tipo] || 9) - (ordem[b.tipo] || 9)
    })

    // 7. Lista de meses para filtro
    const mesesSet = new Set(dedupDocs.map(d => d.mes_ref))
    const meses = Array.from(mesesSet).sort((a, b) => {
      const [ma, ya] = a.split('-')
      const [mb, yb] = b.split('-')
      return yb.localeCompare(ya) || mb.localeCompare(ma)
    })

    return NextResponse.json({
      data: dedupDocs,
      count: dedupDocs.length,
      meses,
      nome_cliente: nomeCliente,
    })
  } catch (err: any) {
    console.error('Erro ao buscar documentos:', err)
    return NextResponse.json(
      { error: err.message || 'Erro ao buscar documentos', data: [], count: 0, meses: [] },
      { status: 500 }
    )
  }
}
