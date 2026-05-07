'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Loader2, Zap, SunMedium, Building2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UC {
  unidade: string
  nome_cliente: string
  documento: string | null
  tipo: string | null
  rateio: string | null
  rateio_enviado: Record<string, number> | null
  rateio_recebido: Record<string, number> | null
  data_ativacao: string | null
  caminho_fatura: string | null
  dados_extraidos: any
  roi: string | null
  saldo_credito: string | null
  cliente_id: string | null
  status_atual: 'ativa' | 'desativada' | 'pendente_ativacao' | null
  data_desativacao: string | null
  data_adesao: string | null
}

const TIPO_STYLE: Record<string, { badge: string; dot: string }> = {
  'Geradora':      { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Beneficiária':  { badge: 'bg-violet-100 text-violet-700 border-violet-200',   dot: 'bg-violet-500' },
  'Beneficiárias': { badge: 'bg-violet-100 text-violet-700 border-violet-200',   dot: 'bg-violet-500' },
}

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  'ativa':               { label: 'Ativa',     dot: 'bg-emerald-500', text: 'text-emerald-700' },
  'desativada':          { label: 'Desativada', dot: 'bg-slate-400',  text: 'text-slate-500' },
  'pendente_ativacao':   { label: 'Pendente',   dot: 'bg-amber-500',  text: 'text-amber-700' },
}

function mesFaturaLabel(caminho: string | null): string {
  if (!caminho) return '—'
  const m = caminho.match(/(\d{2})-(\d{4})\.pdf/)
  return m ? `${m[1]}/${m[2]}` : '—'
}

function RateioCell({ uc }: { uc: UC }) {
  const isGeradora = uc.tipo === 'Geradora'
  if (isGeradora && uc.rateio_enviado && Object.keys(uc.rateio_enviado).length > 0) {
    return <span className="text-[10px] text-emerald-600 font-medium">{Object.keys(uc.rateio_enviado).length} destinos</span>
  }
  if (!isGeradora && uc.rateio_recebido && Object.keys(uc.rateio_recebido).length > 0) {
    const total = Object.values(uc.rateio_recebido).reduce((s: number, v: number) => s + v, 0)
    return <span className="font-mono text-[11px] text-violet-600 font-semibold">{total.toFixed(0)}%</span>
  }
  if (uc.rateio && !uc.rateio.includes('=')) {
    return <span className="font-mono text-[11px] text-slate-600 font-medium">{uc.rateio.trim()}</span>
  }
  return <span className="text-muted-foreground/30">—</span>
}

interface Props {
  clienteId: string
  onCountChange?: (count: number) => void
}

export function ClienteUnidadesTab({ clienteId, onCountChange }: Props) {
  const [ucs, setUcs] = useState<UC[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUcs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/unidades?cliente_id=${clienteId}&limit=200`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setUcs(json.data || [])
      onCountChange?.(json.count || json.data?.length || 0)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar unidades')
    } finally {
      setLoading(false)
    }
  }, [clienteId, onCountChange])

  useEffect(() => { fetchUcs() }, [fetchUcs])

  const geradoras = ucs.filter(u => u.tipo === 'Geradora')
  const beneficiarias = ucs.filter(u => u.tipo !== 'Geradora')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando unidades...</span>
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

  if (ucs.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Zap className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Nenhuma Unidade Consumidora</p>
        <p className="text-sm text-muted-foreground mt-1">
          Este cliente não possui unidades consumidoras vinculadas.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats resumo */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          <Zap className="h-3 w-3" /> {ucs.length} UCs
        </span>
        {geradoras.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
            <SunMedium className="h-3 w-3" /> {geradoras.length} Geradora{geradoras.length > 1 ? 's' : ''}
          </span>
        )}
        {beneficiarias.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200">
            <Building2 className="h-3 w-3" /> {beneficiarias.length} Beneficiária{beneficiarias.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">UC</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Rateio</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo Crédito</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Última Fatura</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ucs.map((uc) => {
              const style = TIPO_STYLE[uc.tipo || ''] || TIPO_STYLE['Beneficiária']
              const status = STATUS_STYLE[uc.status_atual || ''] || STATUS_STYLE['ativa']

              return (
                <tr key={uc.unidade} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/unidades/${encodeURIComponent(uc.unidade)}`}
                      className="text-emerald-600 hover:text-emerald-700 hover:underline font-medium text-[13px] inline-flex items-center gap-1"
                    >
                      {uc.unidade}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-50" />
                    </Link>
                    {uc.data_ativacao && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Ativação: {uc.data_ativacao}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn('text-[10px] font-medium border', style.badge)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full mr-1', style.dot)} />
                      {uc.tipo || 'Beneficiária'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <RateioCell uc={uc} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {uc.saldo_credito || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground font-mono">
                      {mesFaturaLabel(uc.caminho_fatura)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', status.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                      {status.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
