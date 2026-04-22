'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  BarChart3, Save, Loader2, AlertCircle, CheckCircle2,
  Building2, Zap, Search, Plus, X
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UCDestino {
  unidade: string
  nome_cliente: string
  tipo: string
  percentual: string
  externo?: boolean
}

interface Props {
  geradoraUnidade: string
  isAutoconsumo?: boolean
}

export function RateioGeradora({ geradoraUnidade, isAutoconsumo = false }: Props) {
  const [destinos, setDestinos] = useState<UCDestino[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const buscaRef = useRef<NodeJS.Timeout>()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/unidades/${encodeURIComponent(geradoraUnidade)}/rateio`)
      .then(r => r.json())
      .then(json => {
        setDestinos((json.beneficiarias || []).map((b: any) => ({
          unidade: b.unidade,
          nome_cliente: b.nome_cliente,
          tipo: b.tipo || 'Beneficiária',
          percentual: b.percentual_desta_geradora > 0 ? String(b.percentual_desta_geradora) : '',
          externo: b.externo || false,
        })))
      })
      .catch(() => toast.error('Erro ao carregar destinatárias'))
      .finally(() => setLoading(false))
  }, [geradoraUnidade])

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); setShowDropdown(false); return }
    clearTimeout(buscaRef.current)
    setBuscando(true)
    buscaRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/unidades/buscar?q=${encodeURIComponent(busca)}&excluir=${encodeURIComponent(geradoraUnidade)}`)
        const json = await res.json()
        const jaAdicionadas = new Set(destinos.map(d => d.unidade))
        setResultados((json.data || []).filter((r: any) => !jaAdicionadas.has(r.unidade)))
        setShowDropdown(true)
      } finally {
        setBuscando(false)
      }
    }, 300)
  }, [busca, destinos, geradoraUnidade])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const adicionarUC = (uc: any) => {
    setDestinos(prev => [...prev, {
      unidade: uc.unidade,
      nome_cliente: uc.nome_cliente,
      tipo: uc.tipo || 'Beneficiária',
      percentual: '',
      externo: true,
    }])
    setBusca('')
    setShowDropdown(false)
    setResultados([])
  }

  const removerUC = (unidade: string) => setDestinos(prev => prev.filter(d => d.unidade !== unidade))
  const setPercentual = (unidade: string, valor: string) =>
    setDestinos(prev => prev.map(d => d.unidade === unidade ? { ...d, percentual: valor } : d))

  const totalDistribuido = destinos.reduce((s, d) => s + (parseFloat(d.percentual) || 0), 0)
  const resto = Math.max(0, 100 - totalDistribuido)
  const excede = totalDistribuido > 100

  const handleSave = async () => {
    if (excede) { toast.error('Total não pode exceder 100%'); return }
    setSaving(true)
    try {
      const distribuicao = destinos.map(d => ({
        beneficiaria_unidade: d.unidade,
        percentual: parseFloat(d.percentual || '0') || 0,
      }))
      const res = await fetch(`/api/unidades/${encodeURIComponent(geradoraUnidade)}/rateio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribuicao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Rateio salvo! ${json.totalDistribuido}% distribuído, ${json.resto}% na geradora.`)
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar rateio')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-4">
      {isAutoconsumo && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>Geradora de <strong>autoconsumo</strong> — energia gerada é consumida localmente antes de compensar as destinatárias.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Distribuição de Rateio
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Define quanto % desta geradora vai para cada destinatária. O restante ({resto.toFixed(0)}%) fica na própria geradora.{' '}
            <span className="font-medium text-blue-600">Você pode adicionar UCs de qualquer cliente — filiais, sub-CNPJs, etc.</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Busca livre */}
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar e adicionar UC por número ou nome do cliente..."
                className="pl-8 h-8 text-sm"
              />
            </div>

            {showDropdown && resultados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                {resultados.map(r => {
                  const isGer = r.tipo === 'Geradora'
                  return (
                    <button key={r.unidade} type="button" onClick={() => adicionarUC(r)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left transition-colors border-b border-slate-100 last:border-0">
                      {isGer
                        ? <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                        : <Building2 className="h-3 w-3 text-violet-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{r.nome_cliente}</p>
                        <p className="text-[10px] font-mono text-slate-400">{r.unidade}</p>
                      </div>
                      <Badge variant="outline" className={cn(
                        'text-[9px] px-1 py-0 flex-shrink-0',
                        isGer ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-violet-50 text-violet-600 border-violet-200'
                      )}>
                        {isGer ? 'GER' : 'BEN'}
                      </Badge>
                      <Plus className="h-3 w-3 text-slate-400 flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            )}

            {showDropdown && resultados.length === 0 && !buscando && busca.length >= 2 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs text-muted-foreground">
                Nenhuma UC encontrada
              </div>
            )}
          </div>

          {/* Lista de destinatárias */}
          {destinos.length > 0 ? (
            <>
              <div className="grid grid-cols-[1fr_96px_28px] gap-2 px-1 pb-1 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Destinatária</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-right">% desta ger.</span>
                <span />
              </div>

              {destinos.map((d, i) => {
                const isGer = d.tipo === 'Geradora'
                return (
                  <div key={d.unidade} className="grid grid-cols-[1fr_96px_28px] gap-2 items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isGer
                          ? <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          : <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                        <span className="text-xs font-medium text-slate-700 truncate">{d.nome_cliente}</span>
                        {isGer && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200">GER</Badge>}
                        {d.externo && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">outro cliente</Badge>}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 ml-4">{d.unidade}</span>
                    </div>
                    <div className="relative">
                      <Input
                        type="number" min="0" max="100" step="1"
                        value={d.percentual}
                        onChange={e => setPercentual(d.unidade, e.target.value)}
                        className="pr-7 text-right font-mono text-sm h-8"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <button type="button" onClick={() => removerUC(d.unidade)}
                      className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="text-center py-5 border border-dashed border-slate-200 rounded-lg text-xs text-muted-foreground">
              <Building2 className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
              Use a busca acima para adicionar UCs destinatárias.
            </div>
          )}

          {/* Barra + totalizador */}
          {destinos.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                {destinos.map((d, i) => {
                  const pct = parseFloat(d.percentual || '0') || 0
                  if (pct <= 0) return null
                  const cores = ['bg-violet-400','bg-violet-500','bg-purple-400','bg-indigo-400','bg-blue-400']
                  return (
                    <div key={d.unidade}
                      className={cn('h-full transition-all', d.tipo === 'Geradora' ? 'bg-emerald-400' : cores[i % cores.length])}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                      title={`${d.nome_cliente}: ${pct}%`} />
                  )
                })}
                {resto > 0 && <div className="h-full bg-emerald-200 transition-all" style={{ width: `${resto}%` }} />}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Total:</span>
                  <span className={cn(
                    'font-mono font-bold text-sm px-2 py-0.5 rounded',
                    excede ? 'bg-red-100 text-red-700' :
                    totalDistribuido === 100 ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  )}>
                    {totalDistribuido.toFixed(0)}%
                  </span>
                  {!excede && resto > 0 && (
                    <span className="text-[11px] text-emerald-600 font-medium">+ {resto.toFixed(0)}% na geradora</span>
                  )}
                  {excede && <AlertCircle className="h-4 w-4 text-red-500" />}
                  {totalDistribuido === 100 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving || excede} className="gap-1.5 h-8">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? 'Salvando...' : 'Salvar Rateio'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
