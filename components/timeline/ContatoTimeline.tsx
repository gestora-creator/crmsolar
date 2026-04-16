'use client'

import { useState, useRef, useCallback } from 'react'
import {
  useTimelineByContato,
  flattenTimelinePages,
  formatTimelineDateGroup,
  getTimelineDateKey,
} from '@/lib/hooks/useTimeline'
import { TimelineEventModal } from './TimelineEventModal'
import { TimelineEventCard } from './TimelineEventCard'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { Clock, Plus, Loader2 } from 'lucide-react'

interface Props {
  contatoId: string
  /** clienteId é necessário para o modal saber onde registrar */
  clienteId?: string
  /** Nome do contato para pré-preencher no modal */
  contatoNome?: string
}

export function ContatoTimeline({ contatoId, clienteId, contatoNome }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const {
    data: eventosData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTimelineByContato(contatoId)

  const eventos = eventosData ? flattenTimelinePages(eventosData.pages) : []

  const grouped = eventos.reduce<Record<string, typeof eventos>>((acc, ev) => {
    const key = getTimelineDateKey(ev.ocorrido_em)
    if (!acc[key]) acc[key] = []
    acc[key].push(ev)
    return acc
  }, {})

  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect()
    if (!node || !hasNextPage) return
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { threshold: 0.1 })
    observerRef.current.observe(node)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) return <LoadingState variant="table" columns={1} rows={4} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {eventos.length} interaç{eventos.length !== 1 ? 'ões' : 'ão'}
          {hasNextPage && '+'}
        </p>
        {clienteId && (
          <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Registrar Evento
          </Button>
        )}
      </div>

      {eventos.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="Sem interações registradas"
          description="As interações desta pessoa aparecerão aqui conforme forem registradas."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([dateKey, dayEvents]) => (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground px-2">
                  {formatTimelineDateGroup(dayEvents[0].ocorrido_em)}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {dayEvents.map((ev) => (
                  <TimelineEventCard key={ev.id} event={ev} showRelacionamento={false} />
                ))}
              </div>
            </div>
          ))}
          <div ref={sentinelRef} className="h-4" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {clienteId && (
        <TimelineEventModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          clienteId={clienteId}
          contatoIdPreset={contatoId}
          contatoNomePreset={contatoNome}
        />
      )}
    </div>
  )
}
