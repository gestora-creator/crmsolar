'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/database.types'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

type TimelineRow = Database['public']['Tables']['timeline_relacional']['Row']
type TimelineInsert = Database['public']['Tables']['timeline_relacional']['Insert']

export function useTimelineByCliente(clienteId: string) {
  return useQuery({
    queryKey: queryKeys.timeline.byCliente(clienteId),
    enabled: !!clienteId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timeline_relacional')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('ocorrido_em', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data || []) as TimelineRow[]
    },
  })
}

export function useTimelineByContato(contatoId: string) {
  return useQuery({
    queryKey: queryKeys.timeline.byContato(contatoId),
    enabled: !!contatoId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timeline_relacional')
        .select('*')
        .eq('contato_id', contatoId)
        .order('ocorrido_em', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data || []) as TimelineRow[]
    },
  })
}

export function useCreateTimelineEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (event: TimelineInsert) => {
      const { data, error } = await supabase
        .from('timeline_relacional')
        .insert(event)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline.byCliente(data.cliente_id) })
      if (data.contato_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.timeline.byContato(data.contato_id) })
      }
      toast.success('Evento registrado na timeline')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao registrar evento')
    },
  })
}
