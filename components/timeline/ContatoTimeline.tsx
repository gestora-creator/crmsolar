'use client'

import { useTimelineByContato, flattenTimelinePages } from '@/lib/hooks/useTimeline'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Clock, MessageSquare, Mail, Phone, Calendar, Wrench, FileText, Eye, ClipboardList, Bot, StickyNote, Building2 } from 'lucide-react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

const TIPO_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  mensagem_whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-green-600 bg-green-50 border-green-200' },
  mensagem_email: { icon: Mail, label: 'E-mail', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  ligacao_telefone: { icon: Phone, label: 'Ligação', color: 'text-violet-600 bg-violet-50 border-violet-200' },
  reuniao: { icon: Calendar, label: 'Reunião', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  visita_tecnica: { icon: Wrench, label: 'Visita Técnica', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  relatorio_enviado: { icon: FileText, label: 'Relatório', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  relatorio_visualizado: { icon: Eye, label: 'Relatório Visto', color: 'text-teal-600 bg-teal-50 border-teal-200' },
  nota_interna: { icon: StickyNote, label: 'Nota', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  agente_acao: { icon: Bot, label: 'Agente IA', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function ContatoTimeline({ contatoId }: { contatoId: string }) {
  const { data: eventosData, isLoading } = useTimelineByContato(contatoId)
  const eventos = eventosData ? flattenTimelinePages(eventosData.pages) : []

  if (isLoading) return <LoadingState variant="table" columns={1} rows={4} />

  if (eventos.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-12 w-12" />}
        title="Sem interações registradas"
        description="As interações desta pessoa aparecerão aqui conforme forem registradas pelo sistema ou manualmente."
      />
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        {eventos.length} interaç{eventos.length !== 1 ? 'ões' : 'ão'}
      </p>
      {eventos.map((ev) => {
        const config = TIPO_CONFIG[ev.tipo_evento] || TIPO_CONFIG.nota_interna
        const Icon = config.icon
        return (
          <div key={ev.id} className={`flex gap-3 p-3 rounded-lg border ${config.color} transition-colors`}>
            <Icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{config.label}</Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">{formatDateTime(ev.ocorrido_em)}</span>
              </div>
              <p className="text-sm mt-1">{ev.resumo_chave}</p>
              {false && (
                <Link href={`/clientes/${""}`} className="flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:underline">
                  <Building2 className="h-3 w-3" /> {""}
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
