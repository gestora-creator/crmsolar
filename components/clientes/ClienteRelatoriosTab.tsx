'use client'

import { useState, useEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2, FileText, Download, ExternalLink, Calendar,
  Eye, ChevronDown, ChevronUp
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Relatorio {
  nome_arquivo: string
  url: string
  mes_referencia: string
  mes_label: string
  created_at: string
  size: number | null
  nome_cliente: string
}

interface Props {
  clienteId: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

// Agrupar relatórios por ano
function groupByYear(relatorios: Relatorio[]): Record<string, Relatorio[]> {
  return relatorios.reduce((acc, r) => {
    const match = r.mes_referencia.match(/\d{4}/)
    const ano = match ? match[0] : 'Outros'
    if (!acc[ano]) acc[ano] = []
    acc[ano].push(r)
    return acc
  }, {} as Record<string, Relatorio[]>)
}

export function ClienteRelatoriosTab({ clienteId }: Props) {
  const [relatorios, setRelatorios] = useState<Relatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())

  const fetchRelatorios = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/relatorios/${clienteId}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setRelatorios(json.data || [])
      // Expandir o ano mais recente por padrão
      if (json.data?.length > 0) {
        const match = json.data[0].mes_referencia.match(/\d{4}/)
        if (match) setExpandedYears(new Set([match[0]]))
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar relatórios')
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { fetchRelatorios() }, [fetchRelatorios])

  const toggleYear = (ano: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev)
      if (next.has(ano)) next.delete(ano)
      else next.add(ano)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando relatórios...</span>
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

  if (relatorios.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Nenhum Relatório</p>
        <p className="text-sm text-muted-foreground mt-1">
          Os relatórios enviados para este cliente aparecerão aqui.
        </p>
      </div>
    )
  }

  const grouped = groupByYear(relatorios)
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          <FileText className="h-3 w-3" /> {relatorios.length} relatório{relatorios.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista agrupada por ano */}
      <div className="space-y-3">
        {years.map(ano => {
          const items = grouped[ano]
          const isExpanded = expandedYears.has(ano)

          return (
            <div key={ano} className="rounded-xl border bg-card overflow-hidden">
              {/* Header do ano */}
              <button
                type="button"
                onClick={() => toggleYear(ano)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{ano}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {items.length}
                  </Badge>
                </div>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </button>

              {/* Lista de relatórios do ano */}
              {isExpanded && (
                <div className="divide-y divide-border">
                  {items.map(r => (
                    <div
                      key={r.mes_referencia}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                          <FileText className="h-4 w-4 text-red-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{r.mes_label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.nome_arquivo}
                            {r.size ? ` · ${formatFileSize(r.size)}` : ''}
                            {r.created_at ? ` · ${formatDate(r.created_at)}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                            <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
                          </Button>
                        </a>
                        <a href={r.url} download={r.nome_arquivo} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
