'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { BarChart3, Save, Loader2, AlertCircle, CheckCircle2, Building2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Beneficiaria {
  unidade: string
  nome_cliente: string
  tipo: string
  percentual_desta_geradora: number
}

interface Props {
  geradoraUnidade: string
  isAutoconsumo?: boolean
}

export function RateioGeradora({ geradoraUnidade, isAutoconsumo = false }: Props) {
  const [beneficiarias, setBeneficiarias] = useState<Beneficiaria[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/unidades/${encodeURIComponent(geradoraUnidade)}/rateio`)
      .then(r => r.json())
      .then(json => {
        setBeneficiarias(json.beneficiarias || [])
        // Inicializar valores com os percentuais já salvos
        const init: Record<string, string> = {}
        for (const b of json.beneficiarias || []) {
          init[b.unidade] = b.percentual_desta_geradora > 0
            ? String(b.percentual_desta_geradora)
            : ''
        }
        setValores(init)
      })
      .catch(() => toast.error('Erro ao carregar beneficiárias'))
      .finally(() => setLoading(false))
  }, [geradoraUnidade])

  const totalDistribuido = Object.values(valores).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const resto = Math.max(0, 100 - totalDistribuido)
  const excede = totalDistribuido > 100

  const handleSave = async () => {
    if (excede) {
      toast.error('O total distribuído não pode exceder 100%')
      return
    }
    setSaving(true)
    try {
      const distribuicao = beneficiarias.map(b => ({
        beneficiaria_unidade: b.unidade,
        percentual: parseFloat(valores[b.unidade] || '0') || 0,
      }))

      const res = await fetch(`/api/unidades/${encodeURIComponent(geradoraUnidade)}/rateio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribuicao }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast.success(`Rateio salvo! ${json.totalDistribuido}% distribuído, ${json.resto}% na geradora.`)

      // Atualizar os percentuais exibidos
      setBeneficiarias(prev => prev.map(b => ({
        ...b,
        percentual_desta_geradora: parseFloat(valores[b.unidade] || '0') || 0,
      })))
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

  if (beneficiarias.length === 0) return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        <Building2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p>Nenhuma outra UC encontrada para este cliente.</p>
        <p className="text-xs mt-1">Cadastre as beneficiárias/geradoras e vincule ao mesmo cliente.</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {isAutoconsumo && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>Esta é uma geradora de <strong>autoconsumo</strong>. A energia gerada é consumida localmente antes de ser compensada nas beneficiárias.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            Distribuição de Rateio
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Define quanto % desta geradora vai para cada UC destinatária
            (beneficiárias ou outras geradoras que recebem créditos).
            O restante ({resto.toFixed(0)}%) fica na própria geradora.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px] gap-3 px-1 pb-1 border-b border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Destinatária</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 text-right">% desta ger.</span>
          </div>

          {/* Linhas */}
          {beneficiarias.map(b => {
            const isGer = b.tipo === 'Geradora'
            return (
            <div key={b.unidade} className="grid grid-cols-[1fr_100px] gap-3 items-center py-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {isGer
                    ? <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                  }
                  <span className="text-xs font-medium text-slate-700 truncate">{b.nome_cliente}</span>
                  {isGer && (
                    <span className="text-[9px] font-medium bg-emerald-100 text-emerald-600 px-1 py-0.5 rounded flex-shrink-0">GER</span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-slate-400 ml-4">{b.unidade}</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={valores[b.unidade] ?? ''}
                  onChange={e => setValores(prev => ({ ...prev, [b.unidade]: e.target.value }))}
                  className="pr-7 text-right font-mono text-sm h-8"
                  placeholder="0"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          )})}

          {/* Barra de progresso visual */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
              {beneficiarias.map((b, i) => {
                const pct = parseFloat(valores[b.unidade] || '0') || 0
                const total = Math.min(totalDistribuido, 100)
                if (pct <= 0) return null
                const colors = ['bg-violet-400', 'bg-violet-500', 'bg-violet-600', 'bg-purple-400', 'bg-purple-500', 'bg-indigo-400']
                return (
                  <div
                    key={b.unidade}
                    className={cn('h-full transition-all', colors[i % colors.length])}
                    style={{ width: `${(pct / Math.max(total, 1)) * Math.min(total, 100)}%` }}
                    title={`${b.nome_cliente}: ${pct}%`}
                  />
                )
              })}
              {/* Resto na geradora */}
              {resto > 0 && (
                <div
                  className="h-full bg-emerald-300 transition-all"
                  style={{ width: `${resto}%` }}
                  title={`Geradora (autoconsumo/próprio): ${resto.toFixed(0)}%`}
                />
              )}
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {beneficiarias.map((b, i) => {
                const pct = parseFloat(valores[b.unidade] || '0') || 0
                if (pct <= 0) return null
                const colors = ['text-violet-600', 'text-violet-700', 'text-purple-600', 'text-indigo-600']
                return (
                  <span key={b.unidade} className={cn('text-[10px] font-medium', colors[i % colors.length])}>
                    {b.nome_cliente.split(' ')[0]}: {pct}%
                  </span>
                )
              })}
              {resto > 0 && (
                <span className="text-[10px] font-medium text-emerald-600">
                  <Zap className="h-2.5 w-2.5 inline mr-0.5" />Geradora: {resto.toFixed(0)}%
                </span>
              )}
            </div>

            {/* Totalizador */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Total distribuído:</span>
                <span className={cn(
                  'font-mono font-bold text-sm px-2 py-0.5 rounded',
                  excede           ? 'bg-red-100 text-red-700' :
                  totalDistribuido === 100 ? 'bg-emerald-100 text-emerald-700' :
                                     'bg-slate-100 text-slate-700'
                )}>
                  {totalDistribuido.toFixed(0)}%
                </span>
                {excede && <AlertCircle className="h-4 w-4 text-red-500" />}
                {totalDistribuido === 100 && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || excede}
                className="gap-1.5 h-8"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Salvando...' : 'Salvar Rateio'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
