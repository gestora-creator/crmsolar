'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Loader2, FileText, Download, Eye, Calendar,
  ChevronDown, ChevronUp, SunMedium, Building2, BarChart3, Receipt
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

const TIPO_CONFIG = {
  relatorio: {
    label: 'Relatório Mensal',
    icon: BarChart3,
    bgIcon: 'bg-emerald-50 border-emerald-100',
    colorIcon: 'text-emerald-600',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  fatura: {
    label: 'Fatura',
    icon: Receipt,
    bgIcon: 'bg-amber-50 border-amber-100',
    colorIcon: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  demonstrativo: {
    label: 'Demonstrativo',
    icon: FileText,
    bgIcon: 'bg-blue-50 border-blue-100',
    colorIcon: 'text-blue-600',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
  },
}

const UC_TIPO_STYLE: Record<string, { badge: string; icon: typeof SunMedium }> = {
  'Geradora': { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: SunMedium },
  'Beneficiária': { badge: 'bg-violet-50 text-violet-700 border-violet-200', icon: Building2 },
  'Beneficiárias': { badge: 'bg-violet-50 text-violet-700 border-violet-200', icon: Building2 },
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ucShort(uc: string): string {
  // Encurtar UC longa para exibição: "1.214.300.051-84" → já é curto
  return uc.length > 20 ? uc.slice(0, 17) + '…' : uc
}

export function ClienteRelatoriosTab({ clienteId }: Props) {
  const [docs, setDocs] = useState<DocItem[]>([])
  const [meses, setMeses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroMes, setFiltroMes] = useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/relatorios/${clienteId}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setDocs(json.data || [])
      setMeses(json.meses || [])
      // Expandir o mês mais recente
      if (json.meses?.length) {
        setExpandedMonths(new Set([json.meses[0]]))
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar documentos')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  // Filtrar
  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (filtroMes !== 'todos' && d.mes_ref !== filtroMes) return false
      if (filtroTipo !== 'todos' && d.tipo !== filtroTipo) return false
      return true
    })
  }, [docs, filtroMes, filtroTipo])

  // Agrupar por mês
  const grouped = useMemo(() => {
    const map: Record<string, DocItem[]> = {}
    for (const d of filtered) {
      if (!map[d.mes_ref]) map[d.mes_ref] = []
      map[d.mes_ref].push(d)
    }
    return map
  }, [filtered])

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

  const toggleMonth = (mes: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(mes)) next.delete(mes)
      else next.add(mes)
      return next
    })
  }

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
      {/* Header com contadores e filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {counts.relatorio > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
              <BarChart3 className="h-3 w-3" /> {counts.relatorio} Relatório{counts.relatorio !== 1 ? 's' : ''}
            </span>
          )}
          {counts.fatura > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
              <Receipt className="h-3 w-3" /> {counts.fatura} Fatura{counts.fatura !== 1 ? 's' : ''}
            </span>
          )}
          {counts.demonstrativo > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
              <FileText className="h-3 w-3" /> {counts.demonstrativo} Demonstrativo{counts.demonstrativo !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="relatorio">Relatórios</SelectItem>
              <SelectItem value="fatura">Faturas</SelectItem>
              <SelectItem value="demonstrativo">Demonstrativos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {meses.map(m => {
                const [mes, ano] = m.split('-')
                const MESES_CURTO: Record<string, string> = {
                  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
                  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
                  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez'
                }
                return <SelectItem key={m} value={m}>{MESES_CURTO[mes] || mes}/{ano}</SelectItem>
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista agrupada por mês */}
      <div className="space-y-3">
        {sortedMonths.map(mesRef => {
          const items = grouped[mesRef]
          const isExpanded = expandedMonths.has(mesRef)
          const [mes, ano] = mesRef.split('-')
          const MESES_FULL: Record<string, string> = {
            '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
            '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
            '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
          }
          const mesLabel = `${MESES_FULL[mes] || mes} ${ano}`

          // Contar tipos dentro do mês
          const relCount = items.filter(i => i.tipo === 'relatorio').length
          const fatCount = items.filter(i => i.tipo === 'fatura').length
          const demCount = items.filter(i => i.tipo === 'demonstrativo').length

          return (
            <div key={mesRef} className="rounded-xl border bg-card overflow-hidden">
              {/* Header do mês */}
              <button
                type="button"
                onClick={() => toggleMonth(mesRef)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{mesLabel}</span>
                  <div className="flex items-center gap-1.5">
                    {relCount > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                        {relCount} rel
                      </Badge>
                    )}
                    {fatCount > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-200">
                        {fatCount} fat
                      </Badge>
                    )}
                    {demCount > 0 && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200">
                        {demCount} dem
                      </Badge>
                    )}
                  </div>
                </div>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </button>

              {/* Documentos do mês */}
              {isExpanded && (
                <div className="divide-y divide-border">
                  {items.map((d, idx) => {
                    const cfg = TIPO_CONFIG[d.tipo]
                    const Icon = cfg.icon
                    const ucStyle = d.tipo_uc ? UC_TIPO_STYLE[d.tipo_uc] : null

                    return (
                      <div
                        key={`${d.tipo}-${d.unidade || ''}-${idx}`}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/10 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn('p-1.5 rounded-lg border shrink-0', cfg.bgIcon)}>
                            <Icon className={cn('h-3.5 w-3.5', cfg.colorIcon)} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 shrink-0', cfg.badgeClass)}>
                                {cfg.label}
                              </Badge>
                              {d.unidade && ucStyle && (
                                <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 shrink-0 font-mono', ucStyle.badge)}>
                                  {d.tipo_uc === 'Geradora' ? '⚡' : '🏢'} {ucShort(d.unidade)}
                                </Badge>
                              )}
                              {d.unidade && !ucStyle && (
                                <span className="text-[10px] text-muted-foreground font-mono truncate">
                                  UC {ucShort(d.unidade)}
                                </span>
                              )}
                            </div>
                            {d.size && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatSize(d.size)}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <a href={d.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                              <Eye className="h-3 w-3 mr-1" /> Ver
                            </Button>
                          </a>
                          <a href={d.url} download={d.nome_arquivo} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                              <Download className="h-3 w-3" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && docs.length > 0 && (
        <div className="rounded-xl border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Nenhum documento encontrado para o filtro selecionado.</p>
        </div>
      )}
    </div>
  )
}
