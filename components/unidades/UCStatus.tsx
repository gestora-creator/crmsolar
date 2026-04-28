'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CircleCheck, CircleSlash, Loader2, History, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusHistorico {
  id: string
  status: 'ativa' | 'desativada' | 'pendente_ativacao'
  data_inicio: string
  data_fim: string | null
  motivo: string | null
  criado_por: string | null
  criado_em: string
}

interface StatusResponse {
  status_atual: 'ativa' | 'desativada' | 'pendente_ativacao'
  data_desativacao: string | null
  historico: StatusHistorico[]
}

interface Props {
  unidade: string
}

const hoje = () => new Date().toISOString().split('T')[0]

const formatarData = (iso: string | null) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${a}`
}

export function UCStatus({ unidade }: Props) {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [historicoOpen, setHistoricoOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // form do modal
  const [acao, setAcao] = useState<'desativar' | 'reativar'>('desativar')
  const [dataAcao, setDataAcao] = useState(hoje())
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/unidades/${encodeURIComponent(unidade)}/status`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar status')
      setData(json)
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar status')
    } finally {
      setLoading(false)
    }
  }, [unidade])

  useEffect(() => {
    if (unidade) carregar()
  }, [unidade, carregar])

  const abrirDialog = (a: 'desativar' | 'reativar') => {
    setAcao(a)
    setDataAcao(hoje())
    setMotivo('')
    setDialogOpen(true)
  }

  const submeter = async () => {
    if (!dataAcao) {
      toast.error('Informe a data')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/unidades/${encodeURIComponent(unidade)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          data: dataAcao,
          motivo: motivo.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro')
      toast.success(acao === 'desativar' ? 'UC desativada' : 'UC reativada')
      setDialogOpen(false)
      await carregar()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando status…
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const isAtiva = data.status_atual === 'ativa'

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {isAtiva ? (
              <CircleCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <CircleSlash className="h-4 w-4 text-slate-500" />
            )}
            Status da UC
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge
                className={cn(
                  isAtiva
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-slate-200 text-slate-700 border-slate-300'
                )}
              >
                {isAtiva ? 'Ativa' : 'Desativada'}
              </Badge>
              {!isAtiva && data.data_desativacao && (
                <span className="text-xs text-muted-foreground">
                  desde {formatarData(data.data_desativacao)}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {isAtiva ? (
                <Button variant="outline" size="sm" onClick={() => abrirDialog('desativar')}>
                  Desativar
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => abrirDialog('reativar')}>
                  Reativar
                </Button>
              )}
            </div>
          </div>

          {data.historico.length > 0 && (
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setHistoricoOpen(v => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="h-3 w-3" />
                Histórico ({data.historico.length})
                {historicoOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {historicoOpen && (
                <div className="mt-3 space-y-2">
                  {data.historico.map(h => (
                    <div
                      key={h.id}
                      className="text-xs flex items-start gap-3 py-2 border-b last:border-0"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          h.status === 'ativa' && 'border-emerald-200 text-emerald-700',
                          h.status === 'desativada' && 'border-slate-300 text-slate-600'
                        )}
                      >
                        {h.status}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium">
                          {formatarData(h.data_inicio)} → {h.data_fim ? formatarData(h.data_fim) : 'vigente'}
                        </div>
                        {h.motivo && <div className="text-muted-foreground">{h.motivo}</div>}
                        {h.criado_por && (
                          <div className="text-muted-foreground italic">por {h.criado_por}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acao === 'desativar' ? 'Desativar UC' : 'Reativar UC'}</DialogTitle>
            <DialogDescription>
              {acao === 'desativar'
                ? 'Esta UC deixará de participar do rateio a partir da data informada. Ela continuará aparecendo nos relatórios dos meses anteriores em que estava ativa.'
                : 'Esta UC voltará a participar do rateio a partir da data informada.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="data-acao">Data</Label>
              <Input
                id="data-acao"
                type="date"
                value={dataAcao}
                onChange={e => setDataAcao(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="motivo">Motivo (opcional)</Label>
              <Textarea
                id="motivo"
                placeholder={acao === 'desativar' ? 'ex: cliente saiu do programa' : 'ex: voltou ao programa'}
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={submeter} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
