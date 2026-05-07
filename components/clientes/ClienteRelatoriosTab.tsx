'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Loader2, FileText, BarChart3, Receipt, ExternalLink
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface Props {
  clienteId: string
}

const MESES_FULL: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
}

// Estilos por tipo de documento
const DOC_STYLE = {
  relatorio: {
    label: 'Relatório',
    shortLabel: 'Relatório',
    icon: BarChart3,
    bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
  },
  fatura: {
    label: 'Fatura',
    shortLabel: 'Fatura',
    icon: Receipt,
    bg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
  },
  demonstrativo: {
    label: 'Demonstrativo',
    shortLabel: 'Demon.',
    icon: FileText,
    bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-500',
  },
}

function ucShort(uc: string): string {
  // Pegar últimos dígitos significativos para display compacto
  const nums = uc.replace(/[^0-9]/g, '')
  return nums.length > 6 ? '…' + nums.slice(-6) : uc
}

export function ClienteRelatoriosTab({ clienteId }: Props) {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [meses, setMeses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/relatorios/${clienteId}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setDocs(json.data || [])
      setMeses(json.meses || [])
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  // Filtrar por tipo
  const filtered = useMemo(() => {
    if (filtroTipo === 'todos') return docs
    return docs.filter(d => d.tipo === filtroTipo)
  }, [docs, filtroTipo])

  // Agrupar por mês
  const grouped = useMemo(() => {
    const map: Record<string, DocItem[]> = {}
    for (const d of filtered) {
      if (!map[d.mes_ref]) map[d.mes_ref] = []
      map[d.mes_ref].push(d)
    }
    // Ordenar docs dentro de cada mês: relatorio → fatura → demonstrativo
    const ordem = { relatorio: 0, fatura: 1, demonstrativo: 2 }
    for (const items of Object.values(map)) {
      items.sort((a, b) => {
        const cmp = (ordem[a.tipo] || 9) - (ordem[b.tipo] || 9)
        if (cmp !== 0) return cmp
        return (a.unidade || '').localeCompare(b.unidade || '')
      })
    }
    return map
  }, [filtered])

  // Meses ordenados (mais recente primeiro)
  const sortedMonths = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const [ma, ya] = a.split('-')
      const [mb, yb] = b.split('-')
      return yb.localeCompare(ya) || mb.localeCompare(ma)
    })
  }, [grouped])

  // Contadores
  const counts = useMemo(() => ({
    relatorio: docs.filter(d => d.tipo === 'relatorio').length,
    fatura: docs.filter(d => d.tipo === 'fatura').length,
    demonstrativo: docs.filter(d => d.tipo === 'demonstrativo').length,
  }), [docs])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando documentos...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Nenhum Documento</p>
        <p className="text-sm text-muted-foreground mt-1">
          Relatórios, faturas e demonstrativos aparecerão aqui quando disponíveis.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header: contadores + filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {counts.relatorio > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
              <BarChart3 className="h-3 w-3" /> {counts.relatorio}
            </span>
          )}
          {counts.fatura > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
              <Receipt className="h-3 w-3" /> {counts.fatura}
            </span>
          )}
          {counts.demonstrativo > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
              <FileText className="h-3 w-3" /> {counts.demonstrativo}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{docs.length} arquivos · {sortedMonths.length} meses</span>
        </div>

        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="relatorio">Relatórios</SelectItem>
            <SelectItem value="fatura">Faturas</SelectItem>
            <SelectItem value="demonstrativo">Demonstrativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista por mês — cada mês é uma linha */}
      <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
        {sortedMonths.map(mesRef => {
          const items = grouped[mesRef]
          const [mes, ano] = mesRef.split('-')
          const mesLabel = `${MESES_FULL[mes] || mes} ${ano}`

          return (
            <div key={mesRef} className="px-4 py-3">
              {/* Mês */}
              <p className="text-sm font-semibold mb-2">{mesLabel}</p>

              {/* Documentos em linha */}
              <div className="flex flex-wrap gap-1.5">
                {items.map((d, idx) => {
                  const style = DOC_STYLE[d.tipo]
                  const Icon = style.icon
                  const isGeradora = d.tipo_uc === 'Geradora'

                  // Label do chip
                  let chipLabel = style.shortLabel
                  if (d.unidade) {
                    const ucLabel = ucShort(d.unidade)
                    chipLabel = `${style.shortLabel} ${isGeradora ? '⚡' : ''} ${ucLabel}`
                  }

                  return (
                    <a
                      key={`${d.tipo}-${d.unidade || ''}-${idx}`}
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer',
                        style.bg, style.text
                      )}
                      title={`${style.label}${d.unidade ? ` — UC ${d.unidade}` : ''}\n${d.nome_arquivo}`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[180px]">{chipLabel}</span>
                      <ExternalLink className="h-2.5 w-2.5 opacity-50 shrink-0" />
                    </a>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && docs.length > 0 && (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhum documento do tipo selecionado.</p>
        </div>
      )}
    </div>
  )
}
