'use client'

import { TIPO_CONFIG } from './TimelineEventModal'
import type { TimelineRow } from '@/lib/hooks/useTimeline'
import { getAgentAvatarColor, getAgentInitial } from '@/lib/hooks/useTimeline'
import { formatTimelineDateTime } from '@/lib/hooks/useTimeline'
import { User, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface TimelineEventCardProps {
  event: TimelineRow
  /** Exibe linha do relacionamento (true no contexto de Cliente) */
  showRelacionamento?: boolean
}

export function TimelineEventCard({ event, showRelacionamento = false }: TimelineEventCardProps) {
  const config = TIPO_CONFIG[event.tipo_evento] ?? TIPO_CONFIG.nota_interna
  const Icon = config.icon
  const isIA = event.origem === 'automatico' || event.origem === 'agente_ia' ||
    event.tipo_evento === 'agente_acao' || event.tipo_evento === 'agente_resumo'

  return (
    <div className={`rounded-lg border p-3.5 transition-colors ${config.color}`}>
      {/* Header: ícone + badge + data/hora */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {config.label}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatTimelineDateTime(event.ocorrido_em)}
        </span>
      </div>

      {/* Resumo */}
      <p className="text-sm leading-relaxed">{event.resumo_chave}</p>

      {/* Conteúdo longo colapsado */}
      {event.conteudo_longo && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t leading-relaxed">
          {event.conteudo_longo}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-black/5 dark:border-white/10">
        {/* Relacionamento — só no contexto do Cliente */}
        {showRelacionamento && event.relacionamento_nome ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            {event.relacionamento_nome}
          </span>
        ) : (
          <span />
        )}

        {/* Agente que registrou */}
        <div className="flex items-center gap-1.5">
          {isIA ? (
            <>
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <Bot className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span className="text-[10px] text-muted-foreground">Solar Energy IA</span>
            </>
          ) : event.agente_avatar_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.agente_avatar_url}
                alt={event.agente_nome ?? ''}
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="text-[10px] text-muted-foreground">{event.agente_nome}</span>
            </>
          ) : (
            <>
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-white text-[9px] font-semibold ${getAgentAvatarColor(event.agente_id)}`}>
                {getAgentInitial(event.agente_nome)}
              </div>
              <span className="text-[10px] text-muted-foreground">{event.agente_nome ?? 'Sistema'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
