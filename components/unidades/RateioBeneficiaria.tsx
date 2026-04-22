'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FonteRateio {
  geradora_unidade: string
  nome_geradora: string
  percentual: number
}

interface Props {
  beneficiariaUnidade: string
  rateioTotal: string | null
}

export function RateioBeneficiaria({ beneficiariaUnidade, rateioTotal }: Props) {
  const [fontes, setFontes] = useState<FonteRateio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Buscar de quais geradoras esta beneficiária recebe
    fetch(`/api/unidades/${encodeURIComponent(beneficiariaUnidade)}/rateio-fontes`)
      .then(r => r.json())
      .then(json => setFontes(json.fontes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [beneficiariaUnidade])

  const total = fontes.reduce((s, f) => s + f.percentual, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-violet-500" />
          Rateio Recebido
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Percentual de energia recebida de cada geradora.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : fontes.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <p>Nenhuma geradora configurada para esta UC.</p>
            <p className="text-xs mt-1">Configure o rateio na geradora correspondente.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fontes.map((f, i) => (
              <div key={f.geradora_unidade} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-700 truncate">{f.nome_geradora}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 ml-4.5">{f.geradora_unidade}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${f.percentual}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-semibold text-emerald-700 w-10 text-right">
                    {f.percentual}%
                  </span>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-muted-foreground">Total recebido:</span>
              <span className={cn(
                'font-mono font-bold text-sm px-2 py-0.5 rounded',
                total === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
              )}>
                {total.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
