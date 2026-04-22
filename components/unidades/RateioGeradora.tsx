'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  BarChart3, Save, Loader2, AlertCircle, CheckCircle2, Building2, Zap, Info
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UCDestino {
  unidade: string
  nome_cliente: string
  tipo: string
  documento: string | null
  percentual: string
}

interface Props {
  geradoraUnidade: string
  isAutoconsumo?: boolean
}

export function RateioGeradora({ geradoraUnidade, isAutoconsumo = false }: Props) {
  const [destinos, setDestinos] = useState<UCDestino[]>([])
  const [cnpjBase, setCnpjBase] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/unidades/${encodeURIComponent(geradoraUnidade)}/rateio`)
      .then(r => r.json())
      .then(json => {
        setCnpjBase(json.cnpj_base)
        setDestinos((json.beneficiarias || []).map((b: any) => ({
          unidade: b.unidade,
          nome_cliente: b.nome_cliente,
          tipo: b.tipo || 'Beneficiária',
          documento: b.documento,
          percentual: b.percentual_desta_geradora > 0
            ? String(b.percentual_desta_geradora)
            : '',
        })))
      })
      .catch(() => toast.error('Erro ao carregar UCs'))
      .finally(() => setLoading(false))
  }, [geradoraUnidade])

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

  // Agrupar por CNPJ das destinatárias para mostrar filiais agrupadas
  const porCnpjBase = destinos.reduce((acc, d) => {
    const base = d.documento ? d.documento.replace(/\D/g, '').slice(0, 8) : 'outros'
    if (!acc[base]) acc[base] = []
    acc[base].push(d)
    return acc
  }, {} as Record<string, UCDestino[]>)

  return (
    <div className="space-y-4">
      {/* Aviso regulatório */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>
          Pela regulação ANEEL, o rateio de créditos só é permitido entre UCs do <strong>mesmo CNPJ base</strong>{' '}
          (matriz e filiais com os mesmos 8 primeiros dígitos).
          {cnpjBase && <span className="font-mono ml-1 bg-blue-100 px-1 rounded">{cnpjBase.replace(/(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')}</span>}
        </p>
      </div>

      {isAutoconsumo && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
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
            Define quanto % desta geradora vai para cada UC.
            O restante ({resto.toFixed(0)}%) fica na própria geradora.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {destinos.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-xs text-muted-foreground">
              <Building2 className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
              <p>Nenhuma outra UC encontrada com o mesmo CNPJ base.</p>
              <p className="mt-1">Cadastre as filiais e vincule o mesmo CNPJ.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px] gap-2 px-1 pb-1 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Destinatária</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-right">% desta ger.</span>
              </div>

              {/* Linhas — agrupadas por CNPJ base quando há múltiplos */}
              {destinos.map((d) => {
                const isGer = d.tipo === 'Geradora'
                // Verifica se é do mesmo CNPJ base da geradora (filial) ou CNPJ idêntico
                const dBase = d.documento ? d.documento.replace(/\D/g, '').slice(0, 8) : null
                const isFilial = dBase && cnpjBase && dBase === cnpjBase &&
                  d.documento?.replace(/\D/g, '') !== '' // tem CNPJ diferente (filial)

                return (
                  <div key={d.unidade} className="grid grid-cols-[1fr_100px] gap-2 items-center py-0.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isGer
                          ? <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          : <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                        <span className="text-xs font-medium text-slate-700 truncate">{d.nome_cliente}</span>
                        {isGer && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200">GER</Badge>
                        )}
                        {d.documento && (
                          <span className="text-[9px] font-mono text-slate-400 hidden xl:inline">
                            {d.documento.replace(/\D/g, '').slice(8, 12) !== '0001' ? '(filial)' : '(matriz)'}
                          </span>
                        )}
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
                  </div>
                )
              })}

              {/* Barra de progresso */}
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
                        title={`${d.nome_cliente}: ${pct}%`}
                      />
                    )
                  })}
                  {resto > 0 && (
                    <div className="h-full bg-emerald-200 transition-all" style={{ width: `${resto}%` }}
                      title={`Geradora: ${resto.toFixed(0)}%`} />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Total:</span>
                    <span className={cn(
                      'font-mono font-bold text-sm px-2 py-0.5 rounded',
                      excede           ? 'bg-red-100 text-red-700' :
                      totalDistribuido === 100 ? 'bg-emerald-100 text-emerald-700' :
                                         'bg-slate-100 text-slate-700'
                    )}>
                      {totalDistribuido.toFixed(0)}%
                    </span>
                    {!excede && resto > 0 && (
                      <span className="text-[11px] text-emerald-600 font-medium">
                        + {resto.toFixed(0)}% na geradora
                      </span>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
