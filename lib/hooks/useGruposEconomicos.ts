'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

export interface GrupoEconomico {
  id: string
  nome: string
  descricao: string | null
  created_at: string
  updated_at: string
}

/**
 * Hook para listar grupos econômicos com cache React Query
 */
export function useGruposList(searchTerm = '') {
  return useQuery({
    queryKey: queryKeys.grupos.list(searchTerm),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from('grupos_economicos')
        .select('*')
        .order('nome', { ascending: true })

      if (searchTerm.trim()) {
        query = query.ilike('nome', `%${searchTerm.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as GrupoEconomico[]
    },
  })
}

/**
 * Hook para buscar clientes de um grupo específico com cache
 */
export function useClientesByGrupo(grupoId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.grupos.clientesByGrupo(grupoId),
    enabled: !!grupoId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clientes')
        .select('id, razao_social, documento, tipo_cliente, status, telefone_principal, email_principal')
        .eq('grupo_economico_id', grupoId)
        .order('razao_social', { ascending: true })

      if (error) throw error
      return data || []
    },
  })
}

/**
 * Mutation: Buscar ou criar grupo econômico via RPC atômico
 * Não cria automaticamente — só quando explicitamente chamado
 */
export function useFindOrCreateGrupo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (nome: string) => {
      const nomeTrimmed = nome.trim()
      if (!nomeTrimmed) throw new Error('Nome do grupo é obrigatório')

      const { data, error } = await supabase.rpc(
        'find_or_create_grupo_economico',
        { p_nome: nomeTrimmed }
      )

      if (error) throw error
      if (!data || data.length === 0) throw new Error('Falha ao criar grupo')

      return data[0] as GrupoEconomico
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.all })
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao processar grupo econômico')
    },
  })
}

/**
 * Mutation: Criar grupo econômico
 */
export function useCreateGrupo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ nome, descricao }: { nome: string; descricao?: string }) => {
      const { data, error } = await supabase
        .from('grupos_economicos')
        .insert({ nome: nome.trim(), descricao: descricao?.trim() })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('Já existe um grupo com este nome')
        }
        throw error
      }
      return data as GrupoEconomico
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.all })
      toast.success('Grupo econômico criado')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao criar grupo')
    },
  })
}

/**
 * Mutation: Deletar grupo econômico
 */
export function useDeleteGrupo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('grupos_economicos')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.clientes.all })
      toast.success('Grupo econômico excluído')
    },
    onError: () => {
      toast.error('Erro ao excluir grupo econômico')
    },
  })
}
