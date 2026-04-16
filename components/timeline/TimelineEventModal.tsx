'use client'

import { useState, useEffect } from 'react'
import { useCreateTimelineEvent } from '@/lib/hooks/useTimeline'
import { useVinculosByCliente } from '@/lib/hooks/useVinculos'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TimelineTipoEvento } from '@/lib/supabase/database.types'
import { MessageSquare, Mail, Phone, Calendar, Wrench, StickyNote, RefreshCw, Star, Settings, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────
// Catálogo de tipos de evento (Etapa 3 da spec)
// ─────────────────────────────────────────────
export const TIPO_CONFIG: Record<TimelineTipoEvento, {
  label: string
  icon: React.ElementType
  color: string
  requiresRelacionamento: boolean
}> = {
  mensagem_whatsapp:   { label: 'Mensagem WhatsApp',    icon: MessageSquare, color: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',    requiresRelacionamento: true },
  mensagem_email:      { label: 'E-mail',               icon: Mail,          color: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',          requiresRelacionamento: true },
  ligacao_telefone:    { label: 'Ligação Telefônica',   icon: Phone,         color: 'text-violet-600 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800', requiresRelacionamento: true },
  reuniao:             { label: 'Reunião',               icon: Calendar,      color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',      requiresRelacionamento: true },
  visita_tecnica:      { label: 'Visita Técnica',        icon: Wrench,        color: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800', requiresRelacionamento: true },
  nota_interna:        { label: 'Nota Interna',          icon: StickyNote,    color: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-700',           requiresRelacionamento: false },
  followup:            { label: 'Follow-up',             icon: RefreshCw,     color: 'text-cyan-600 bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800',           requiresRelacionamento: true },
  pos_venda:           { label: 'Pós-Venda',             icon: Star,          color: 'text-pink-600 bg-pink-50 border-pink-200 dark:bg-pink-950/30 dark:border-pink-800',           requiresRelacionamento: true },
  evento_sistema:      { label: 'Evento do Sistema',    icon: Settings,      color: 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-950/30 dark:border-slate-700',      requiresRelacionamento: false },
  // Tipos legados — mantidos para retrocompatibilidade
  chamado_aberto:      { label: 'Chamado Aberto',        icon: Settings,      color: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',               requiresRelacionamento: true },
  chamado_encerrado:   { label: 'Chamado Encerrado',     icon: Settings,      color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800', requiresRelacionamento: true },
  relatorio_enviado:   { label: 'Relatório Enviado',     icon: Mail,          color: 'text-cyan-600 bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800',           requiresRelacionamento: true },
  relatorio_visualizado: { label: 'Relatório Visto',    icon: Mail,          color: 'text-teal-600 bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800',           requiresRelacionamento: true },
  pesquisa_respondida: { label: 'Pesquisa Respondida',  icon: Settings,      color: 'text-pink-600 bg-pink-50 border-pink-200 dark:bg-pink-950/30 dark:border-pink-800',           requiresRelacionamento: true },
  agente_acao:         { label: 'Agente IA',             icon: Settings,      color: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800', requiresRelacionamento: false },
  agente_resumo:       { label: 'Resumo IA',             icon: Settings,      color: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800', requiresRelacionamento: false },
}

// Tipos disponíveis para registro manual (excluir automáticos)
const TIPOS_MANUAIS: TimelineTipoEvento[] = [
  'nota_interna', 'ligacao_telefone', 'mensagem_whatsapp', 'mensagem_email',
  'reuniao', 'visita_tecnica', 'followup', 'pos_venda',
]

// ─────────────────────────────────────────────
// Helpers de data/hora
// ─────────────────────────────────────────────
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toMaxDatetimeLocal(): string {
  return toDatetimeLocalValue(new Date())
}

// ─────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────
interface TimelineEventModalProps {
  open: boolean
  onClose: () => void
  clienteId: string
  /** Se fornecido, pré-seleciona o relacionamento (contexto do contato) */
  contatoIdPreset?: string
  contatoNomePreset?: string
}

interface FormState {
  tipo_evento: TimelineTipoEvento
  contato_id: string
  data_hora: string
  resumo: string
}

export function TimelineEventModal({
  open,
  onClose,
  clienteId,
  contatoIdPreset,
  contatoNomePreset,
}: TimelineEventModalProps) {
  const createEvent = useCreateTimelineEvent()
  const { data: vinculos, isLoading: loadingVinculos } = useVinculosByCliente(clienteId)

  const [form, setForm] = useState<FormState>({
    tipo_evento: 'nota_interna',
    contato_id: contatoIdPreset ?? '',
    data_hora: toDatetimeLocalValue(new Date()),
    resumo: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  // Resetar form ao abrir
  useEffect(() => {
    if (open) {
      setForm({
        tipo_evento: 'nota_interna',
        contato_id: contatoIdPreset ?? '',
        data_hora: toDatetimeLocalValue(new Date()),
        resumo: '',
      })
      setErrors({})
    }
  }, [open, contatoIdPreset])

  const tipoConfig = TIPO_CONFIG[form.tipo_evento]
  const requiresRelacionamento = tipoConfig.requiresRelacionamento

  // Relacionamentos disponíveis
  const relacionamentos = (vinculos || []).map((v) => ({
    id: (v.contato as any)?.id ?? '',
    nome: (v.contato as any)?.nome_completo ?? '',
    cargo: (v.contato as any)?.cargo ?? '',
  })).filter((r) => r.id)

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    if (form.resumo.trim().length < 10) {
      newErrors.resumo = 'Mínimo de 10 caracteres'
    }
    if (requiresRelacionamento && !form.contato_id) {
      newErrors.contato_id = 'Selecione o relacionamento envolvido'
    }
    if (!form.data_hora) {
      newErrors.data_hora = 'Informe a data e hora'
    } else if (new Date(form.data_hora) > new Date()) {
      newErrors.data_hora = 'Não é permitida data futura'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return

    const relacionamentoSelecionado = relacionamentos.find((r) => r.id === form.contato_id)

    await createEvent.mutateAsync({
      cliente_id: clienteId,
      contato_id: form.contato_id || null,
      tipo_evento: form.tipo_evento,
      resumo_chave: form.resumo.trim(),
      ocorrido_em: new Date(form.data_hora).toISOString(),
      origem: 'manual',
      relacionamento_nome: contatoNomePreset ?? relacionamentoSelecionado?.nome,
    })

    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Registrar evento na timeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Tipo de Evento */}
          <div className="space-y-1.5">
            <Label className="text-sm">Tipo de evento <span className="text-destructive">*</span></Label>
            <Select
              value={form.tipo_evento}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo_evento: v as TimelineTipoEvento, contato_id: v === 'nota_interna' ? '' : f.contato_id }))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_MANUAIS.map((tipo) => {
                  const cfg = TIPO_CONFIG[tipo]
                  const Icon = cfg.icon
                  return (
                    <SelectItem key={tipo} value={tipo}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Relacionamento Envolvido — oculto para nota_interna */}
          {requiresRelacionamento && (
            <div className="space-y-1.5">
              <Label className="text-sm">
                Relacionamento envolvido <span className="text-destructive">*</span>
              </Label>
              {contatoIdPreset ? (
                <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {contatoNomePreset ?? 'Contato selecionado'}
                </div>
              ) : (
                <Select
                  value={form.contato_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, contato_id: v }))}
                  disabled={loadingVinculos}
                >
                  <SelectTrigger className={`h-9 ${errors.contato_id ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder={loadingVinculos ? 'Carregando...' : 'Selecione a pessoa'} />
                  </SelectTrigger>
                  <SelectContent>
                    {relacionamentos.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        Nenhum relacionamento vinculado
                      </SelectItem>
                    ) : (
                      relacionamentos.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          <span className="flex flex-col">
                            <span>{r.nome}</span>
                            {r.cargo && <span className="text-xs text-muted-foreground">{r.cargo}</span>}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {errors.contato_id && (
                <p className="text-xs text-destructive">{errors.contato_id}</p>
              )}
            </div>
          )}

          {/* Data e Hora */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Data e hora <span className="text-destructive">*</span>
            </Label>
            <input
              type="datetime-local"
              max={toMaxDatetimeLocal()}
              value={form.data_hora}
              onChange={(e) => setForm((f) => ({ ...f, data_hora: e.target.value }))}
              className={`flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${errors.data_hora ? 'border-destructive' : 'border-input'}`}
            />
            {errors.data_hora && (
              <p className="text-xs text-destructive">{errors.data_hora}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Permite retroagir — informe quando o evento realmente ocorreu
            </p>
          </div>

          {/* Resumo */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Resumo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={3}
              value={form.resumo}
              onChange={(e) => setForm((f) => ({ ...f, resumo: e.target.value }))}
              placeholder="Descreva o que ocorreu nesta interação... (mín. 10 caracteres)"
              className={errors.resumo ? 'border-destructive' : ''}
            />
            <div className="flex items-center justify-between">
              {errors.resumo ? (
                <p className="text-xs text-destructive">{errors.resumo}</p>
              ) : (
                <span />
              )}
              <span className={`text-xs ${form.resumo.trim().length < 10 ? 'text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {form.resumo.trim().length}/10 mín.
              </span>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={createEvent.isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={createEvent.isPending} className="gap-1.5">
            {createEvent.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Registrando...</>
            ) : (
              'Registrar →'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
