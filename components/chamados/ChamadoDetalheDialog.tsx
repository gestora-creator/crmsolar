'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ExternalLink, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  STATUS_OPCOES,
  PRIORIDADE_OPCOES,
  statusLabel,
  statusBadgeClass,
  tipoLabel,
  prioridadeLabel,
  prioridadeBadgeClass,
  nomeCliente,
  formatarData,
} from './chamados-constants'

interface ChamadoDetalhe {
  id: string
  tipo: string
  status: string
  prioridade: string | null
  descricao: string
  resolucao: string | null
  atribuido_a: string | null
  jid: string | null
  link_agendamento: string | null
  sla_proxima_acao_em: string | null
  created_at: string | null
  updated_at: string | null
  resolvido_em: string | null
  cliente: {
    id: string
    razao_social: string | null
    nome_fantasia: string | null
    documento: string | null
    municipio?: string | null
    uf?: string | null
  } | null
  contato: {
    id: string
    nome_completo: string | null
    celular: string | null
    email: string | null
  } | null
}

export function ChamadoDetalheDialog({
  chamadoId,
  onClose,
  onSaved,
}: {
  chamadoId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chamado', chamadoId],
    enabled: !!chamadoId,
    queryFn: async (): Promise<ChamadoDetalhe> => {
      const res = await fetch(`/api/chamados/${chamadoId}`)
      if (!res.ok) throw new Error('Falha ao carregar chamado')
      const json = await res.json()
      return json.data as ChamadoDetalhe
    },
  })

  const [status, setStatus] = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [atribuidoA, setAtribuidoA] = useState('')
  const [resolucao, setResolucao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (data) {
      setStatus(data.status)
      setPrioridade(data.prioridade || 'normal')
      setAtribuidoA(data.atribuido_a || '')
      setResolucao(data.resolucao || '')
    }
  }, [data])

  async function salvar() {
    if (!chamadoId) return
    setSalvando(true)
    try {
      const res = await fetch(`/api/chamados/${chamadoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          prioridade,
          atribuido_a: atribuidoA.trim() || null,
          resolucao: resolucao.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'Falha ao salvar')
      }
      toast.success('Chamado atualizado.')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar chamado')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open={!!chamadoId}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhe do chamado</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar o chamado. Tente novamente.
          </p>
        )}

        {data && !isLoading && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{tipoLabel(data.tipo)}</Badge>
              <span
                className={`rounded-sm px-2 py-0.5 text-xs font-medium ${statusBadgeClass(data.status)}`}
              >
                {statusLabel(data.status)}
              </span>
              <span
                className={`rounded-sm px-2 py-0.5 text-xs font-medium ${prioridadeBadgeClass(data.prioridade)}`}
              >
                {prioridadeLabel(data.prioridade)}
              </span>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{nomeCliente(data.cliente)}</p>
              {data.cliente?.documento && (
                <p className="text-muted-foreground">{data.cliente.documento}</p>
              )}
              {data.contato?.nome_completo && (
                <p className="text-muted-foreground">
                  Contato: {data.contato.nome_completo}
                </p>
              )}
              {data.jid && (
                <a
                  href={`/atendimento?jid=${encodeURIComponent(data.jid)}`}
                  className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Abrir conversa no Atendimento
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <p className="mt-1 whitespace-pre-wrap text-sm">{data.descricao}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Criado em: {formatarData(data.created_at)}</span>
              <span>Atualizado: {formatarData(data.updated_at)}</span>
              {data.sla_proxima_acao_em && (
                <span>SLA próxima ação: {formatarData(data.sla_proxima_acao_em)}</span>
              )}
              {data.resolvido_em && (
                <span>Resolvido em: {formatarData(data.resolvido_em)}</span>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ch-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="ch-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPCOES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-prio">Prioridade</Label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger id="ch-prio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADE_OPCOES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-atrib">Atribuído a</Label>
              <Input
                id="ch-atrib"
                value={atribuidoA}
                onChange={(e) => setAtribuidoA(e.target.value)}
                placeholder="Nome do atendente responsável"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ch-resol">Resolução</Label>
              <Textarea
                id="ch-resol"
                value={resolucao}
                onChange={(e) => setResolucao(e.target.value)}
                placeholder="Descreva como o chamado foi resolvido (preencha ao marcar como Resolvido)."
                className="min-h-20"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || isLoading || !data}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
