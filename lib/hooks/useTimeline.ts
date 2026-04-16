'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { Database, TimelineTipoEvento, TimelineOrigem } from '@/lib/supabase/database.types'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

export type TimelineRow = Database['public']['Tables']['timeline_relacional']['Row']

export interface CreateTimelineEventInput {
  cliente_id: string
  contato_id?: string | null
  tipo_evento: TimelineTipoEvento
  resumo_chave: string
  ocorrido_em?: string
  canal?: string | null
  direcao?: string | null
  conteudo_longo?: string | null
  tom_conversa?: string | null
  metadata?: Record<string, unknown>
  origem?: TimelineOrigem
  agente_nome?: string
  agente_avatar_url?: string
  relacionamento_nome?: string
}

const PAGE_SIZE = 20

function validateEventInput(input: CreateTimelineEventInput): string | null {
  if (!input.resumo_chave || input.resumo_chave.trim().length < 10) {
    return 'O resumo deve ter pelo menos 10 caracteres'
  }
  if (input.tipo_evento !== 'nota_interna' && !input.contato_id) {
    return 'Selecione o relacionamento envolvido para este tipo de evento'
  }
  if (input.ocorrido_em) {
    const dt = new Date(input.ocorrido_em)
    if (isNaN(dt.getTime())) return 'Data/hora inválida'
    if (dt > new Date()) return 'Não é permitido registrar eventos com data futura'
  }
  return null
}

export function useTimelineByCliente(clienteId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.timeline.byCliente(clienteId),
    enabled: !!clienteId,
    staleTime: 2 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = (pageParam as number) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('timeline_relacional')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('ocorrido_em', { ascending: false })
        .range(from, to)
      if (error) throw error
      return {
        items: (data || []) as TimelineRow[],
        nextPage: data && data.length === PAGE_SIZE ? (pageParam as number) + 1 : undefined,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })
}

export function useTimelineByRelacionamento(contatoId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.timeline.byContato(contatoId),
    enabled: !!contatoId,
    staleTime: 2 * 60 * 1000,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = (pageParam as number) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('timeline_relacional')
        .select('*')
        .eq('contato_id', contatoId)
        .order('ocorrido_em', { ascending: false })
        .range(from, to)
      if (error) throw error
      return {
        items: (data || []) as TimelineRow[],
        nextPage: data && data.length === PAGE_SIZE ? (pageParam as number) + 1 : undefined,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })
}

export const useTimelineByContato = useTimelineByRelacionamento

export function useCreateTimelineEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateTimelineEventInput) => {
      const validationError = validateEventInput(input)
      if (validationError) throw new Error(validationError)

      const { data: { user } } = await supabase.auth.getUser()

      let relacionamentoNomeSnapshot = input.relacionamento_nome
      if (input.contato_id && !relacionamentoNomeSnapshot) {
        const { data: contato } = await supabase
          .from('crm_contatos')
          .select('nome_completo')
          .eq('id', input.contato_id)
          .single()
        relacionamentoNomeSnapshot = contato?.nome_completo ?? undefined
      }

      const payload = {
        cliente_id: input.cliente_id,
        contato_id: input.contato_id ?? null,
        tipo_evento: input.tipo_evento,
        resumo_chave: input.resumo_chave.trim(),
        ocorrido_em: input.ocorrido_em ?? new Date().toISOString(),
        canal: input.canal ?? null,
        direcao: input.direcao ?? (input.tipo_evento === 'nota_interna' ? 'interna' : null),
        conteudo_longo: input.conteudo_longo ?? null,
        tom_conversa: input.tom_conversa ?? null,
        metadata: input.metadata ?? {},
        origem: input.origem ?? 'manual',
        agente_id: user?.id ?? null,
        agente_nome: input.agente_nome ?? user?.user_metadata?.full_name ?? user?.email ?? 'Sistema',
        agente_avatar_url: input.agente_avatar_url ?? user?.user_metadata?.avatar_url ?? null,
        relacionamento_nome: relacionamentoNomeSnapshot ?? null,
        autor: input.agente_nome ?? user?.user_metadata?.full_name ?? user?.email ?? 'Sistema',
      }

      const { data, error } = await supabase
        .from('timeline_relacional')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return data as TimelineRow
    },

    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline.byCliente(data.cliente_id) })
      if (data.contato_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.timeline.byContato(data.contato_id) })
      }
      toast.success('Evento registrado na timeline')
    },

    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao registrar evento')
    },
  })
}

export function formatTimelineDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )
}

export function formatTimelineDateGroup(dateStr: string): string {
  const d = new Date(dateStr)
  const hoje = new Date()
  const diff = Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return `${diff} dias atrás`
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function getTimelineDateKey(dateStr: string): string {
  return new Date(dateStr).toDateString()
}

export function flattenTimelinePages(
  pages: Array<{ items: TimelineRow[]; nextPage?: number }>
): TimelineRow[] {
  return pages.flatMap((p) => p.items)
}

export function getAgentAvatarColor(agentId: string | null): string {
  const colors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
  ]
  if (!agentId) return colors[0]
  const hash = agentId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

export function getAgentInitial(name: string | null): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}
