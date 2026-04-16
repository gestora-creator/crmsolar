'use client'

import { useState } from 'react'
import { useTimelineByCliente, useCreateTimelineEvent, flattenTimelinePages, formatTimelineDateTime, formatTimelineDateGroup, getTimelineDateKey } from '@/lib/hooks/useTimeline'
import type { TimelineTipoEvento } from '@/lib/supabase/database.types'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  MessageSquare, Mail, Phone, Calendar, Wrench, FileText, Eye,
  ClipboardList, Bot, StickyNote, Plus, Clock, ArrowDownLeft,
  ArrowUpRight, Minus, User
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const TIPO_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  mensagem_whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-green-600 bg-green-50 border-green-200' },
  mensagem_email: { icon: Mail, label: 'E-mail', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ligacao_telefone: { icon: Phone, label: 'Ligação', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  reuniao: { icon: Calendar, label: 'Reunião', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  visita_tecnica: { icon: Wrench, label: 'Visita Técnica', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  chamado_aberto: { icon: ClipboardList, label: 'Chamado Aberto', color: 'text-red-600 bg-red-50 border-red-200' },
  chamado_encerrado: { icon: ClipboardList, label: 'Chamado Encerrado', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  relatorio_enviado: { icon: FileText, label: 'Relatório Enviado', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  relatorio_visualizado: { icon: Eye, label: 'Relatório Visto', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  pesquisa_respondida: { icon: ClipboardList, label: 'Pesquisa', color: 'text-pink-600 bg-pink-50 border-pink-200' },
  nota_interna: { icon: StickyNote, label: 'Nota Interna', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  agente_acao: { icon: Bot, label: 'Agente IA', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  agente_resumo: { icon: Bot, label: 'Resumo IA', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
}

const DIRECAO_ICON: Record<string, LucideIcon> = {
  entrada: ArrowDownLeft,
  saida: ArrowUpRight,
  interna: Minus,
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateGroup(dateStr: string) {
  const d = new Date(dateStr)
  const hoje = new Date()
  const diff = Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `${diff} dias atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

interface Props {
  clienteId: string
}

export function ClienteTimeline({ clienteId }: Props) {
  const { data: eventos, isLoading } = useTimelineByCliente(clienteId)
  const createEvent = useCreateTimelineEvent()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newEvent, setNewEvent] = useState<{ tipo_evento: TimelineTipoEvento; resumo_chave: string }>({ tipo_evento: 'nota_interna', resumo_chave: '' })

  const handleAddEvent = () => {
    if (!newEvent.resumo_chave.trim()) return
    createEvent.mutate({
      cliente_id: clienteId,
      tipo_evento: newEvent.tipo_evento,
      resumo_chave: newEvent.resumo_chave.trim(),
      canal: 'sistema',
      direcao: 'interna',
      origem: 'manual',
    }, {
      onSuccess: () => {
        setShowAddDialog(false)
        setNewEvent({ tipo_evento: 'nota_interna' as TimelineTipoEvento, resumo_chave: '' })
      },
    })
  }

  if (isLoading) return <LoadingState variant="table" columns={1} rows={5} />

  // Agrupar por data
  const grouped = (eventos || []).reduce((acc, ev) => {
    const dateKey = new Date(ev.ocorrido_em).toDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(ev)
    return acc
  }, {} as Record<string, typeof eventos>)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {eventos?.length || 0} evento{(eventos?.length || 0) !== 1 ? 's' : ''} registrado{(eventos?.length || 0) !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Registrar Evento
        </Button>
      </div>

      {!eventos || eventos.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="Timeline vazia"
          description="Os eventos de interação com este cliente aparecerão aqui conforme forem registrados pelo sistema, agentes ou manualmente."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateKey, dayEvents]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground px-2">
                  {formatDateGroup(dayEvents![0].ocorrido_em)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2">
                {dayEvents!.map((ev) => {
                  const config = TIPO_CONFIG[ev.tipo_evento] || TIPO_CONFIG.nota_interna
                  const Icon = config.icon
                  const DirecaoIcon = ev.direcao ? DIRECAO_ICON[ev.direcao] : null

                  return (
                    <div key={ev.id} className={`flex gap-3 p-3 rounded-lg border ${config.color} transition-colors`}>
                      <div className="flex-shrink-0 mt-0.5">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {config.label}
                          </Badge>
                          {DirecaoIcon && <DirecaoIcon className="h-3 w-3 text-muted-foreground" />}
                          {ev.tom_conversa && (
                            <span className="text-[10px] text-muted-foreground">{ev.tom_conversa}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatDateTime(ev.ocorrido_em)}
                          </span>
                        </div>
                        <p className="text-sm mt-1 leading-relaxed">{ev.resumo_chave}</p>
                        {false && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            {""}
                          </div>
                        )}
                        {ev.conteudo_longo && (
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed border-t pt-2">
                            {ev.conteudo_longo}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de registro manual */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Evento na Timeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newEvent.tipo_evento}
                onChange={(e) => setNewEvent(prev => ({ ...prev, tipo_evento: e.target.value as TimelineTipoEvento }))}
              >
                <option value="nota_interna">Nota Interna</option>
                <option value="ligacao_telefone">Ligação Telefônica</option>
                <option value="mensagem_whatsapp">Mensagem WhatsApp</option>
                <option value="mensagem_email">E-mail</option>
                <option value="reuniao">Reunião</option>
                <option value="visita_tecnica">Visita Técnica</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Resumo</Label>
              <Input
                value={newEvent.resumo_chave}
                onChange={(e) => setNewEvent(prev => ({ ...prev, resumo_chave: e.target.value }))}
                placeholder="Descreva brevemente o evento..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddEvent()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddEvent} disabled={!newEvent.resumo_chave.trim() || createEvent.isPending}>
              {createEvent.isPending ? 'Salvando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
