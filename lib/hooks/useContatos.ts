'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/database.types'
import { normalizeDigits, normalizeEmail, normalizeText } from '@/lib/utils/normalize'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

type Contato = Database['public']['Tables']['crm_contatos']['Row']
type ContatoInsert = Database['public']['Tables']['crm_contatos']['Insert']
type ContatoUpdate = Database['public']['Tables']['crm_contatos']['Update']

export interface ContatoListFilters {
  searchTerm?: string
  page?: number
  pageSize?: number
}

export function useContatosList(filters: ContatoListFilters = {}) {
  const { searchTerm = '', page = 0, pageSize = 30 } = filters

  return useQuery({
    queryKey: queryKeys.contatos.list(JSON.stringify({ searchTerm, page, pageSize })),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('crm_contatos')
        .select('*', { count: 'exact' })
        .order('nome_completo', { ascending: true })
        .range(from, to)

      if (searchTerm.trim()) {
        const term = searchTerm.trim()
        query = query.or(
          `nome_completo.ilike.%${term}%,celular.ilike.%${term}%,email.ilike.%${term}%,cargo.ilike.%${term}%,apelido_relacionamento.ilike.%${term}%`
        )
      }

      const { data, error, count } = await query

      if (error) throw error
      return {
        contatos: (data || []) as Contato[],
        total: count || 0,
      }
    },
  })
}

export function useContatoById(id: string) {
  return useQuery({
    queryKey: queryKeys.contatos.detail(id),
    queryFn: async () => {
      // Buscar dados do contato
      const { data, error } = await supabase
        .from('crm_contatos')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // Buscar clientes vinculados com preferências
      const { data: vinculos, error: vinculosError } = await supabase
        .from('crm_clientes_contatos')
        .select(`
          cliente_id,
          contato_principal,
          cargo_no_cliente,
          observacoes_relacionamento,
          crm_clientes (
            razao_social,
            tipo_cliente,
            grupo_whatsapp
          )
        `)
        .eq('contato_id', id)

      if (vinculosError) {
      }

      // Formatar clientes vinculados
      const clientes_vinculados = (vinculos || []).map((v: any) => ({
        cliente_id: v.cliente_id,
        cliente_nome: v.crm_clientes?.razao_social || '',
        tipo_cliente: v.crm_clientes?.tipo_cliente || '',
        grupo_whatsapp: v.crm_clientes?.grupo_whatsapp || null,
        contato_principal: v.contato_principal || false,
        cargo_no_cliente: v.cargo_no_cliente,
        observacoes_relacionamento: v.observacoes_relacionamento,
      }))

      return {
        ...data,
        clientes_vinculados,
      } as Contato & { clientes_vinculados: any[] }
    },
    enabled: !!id,
  })
}

export function useCreateContato() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (contato: ContatoInsert) => {
      
      // Normalizar canal_relatorio: null se vazio, array caso contrário
      const canaisRelatorio = Array.isArray(contato.canal_relatorio) && contato.canal_relatorio.length > 0 
        ? contato.canal_relatorio 
        : null
      
      // Calcular autorizacao_mensagem baseado em canal_relatorio
      const autorizacao = canaisRelatorio !== null && canaisRelatorio.length > 0

      // Remover campos virtuais que não existem na tabela crm_contatos
      const { clientes_vinculados: _cv, ...contatoData } = contato as any

      const normalized: any = {
        ...contatoData,
        nome_completo: normalizeText(contatoData.nome_completo) || '',
        apelido_relacionamento: normalizeText(contatoData.apelido_relacionamento),
        cargo: normalizeText(contatoData.cargo),
        celular: normalizeDigits(contatoData.celular),
        email: normalizeEmail(contatoData.email),
        data_aniversario: contatoData.data_aniversario && contatoData.data_aniversario.trim() !== '' ? contatoData.data_aniversario : null,
        pessoa_site: normalizeText(contatoData.pessoa_site),
        pessoa_redes: contatoData.pessoa_redes || null,
        observacoes: normalizeText(contatoData.observacoes),
        autorizacao_mensagem: autorizacao,
        canal_relatorio: canaisRelatorio,
      }

      
      // Validar campo obrigatório
      if (!normalized.nome_completo || normalized.nome_completo.trim() === '') {
        throw new Error('Nome completo é obrigatório')
      }

      const { data, error } = await supabase
        .from('crm_contatos')
        .insert(normalized)
        .select()
        .single()

      if (error) {
        console.error('🔴 Erro do Supabase:', error)
        console.error('🔴 Erro código:', error.code)
        console.error('🔴 Erro mensagem:', error.message)
        console.error('🔴 Erro detalhes:', error.details)
        console.error('🔴 Erro hint:', error.hint)
        throw new Error(error.message || 'Erro ao criar contato')
      }
      
      return data
    },
    onSuccess: (newContato) => {
      // Add new contact to cache WITHOUT refetch
      queryClient.setQueryData(
        queryKeys.contatos.detail(newContato.id),
        newContato
      )

      // Only invalidate list queries (not individual pages/searches)
      queryClient.invalidateQueries({
        queryKey: queryKeys.contatos.lists(),
        exact: false,
      })

      toast.success('Contato criado com sucesso')
    },
    onError: (error: any) => {
      console.error('🔴 onError capturado:', error)
      const message = error?.message || 'Erro ao criar contato'
      toast.error(message)
    },
  })
}

export function useUpdateContato() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      // Separar clientes_vinculados dos dados principais
      const { clientes_vinculados, ...contatoData } = data
      
      // Normalizar canal_relatorio: null se vazio, array caso contrário
      const canaisRelatorio = Array.isArray(contatoData.canal_relatorio) && contatoData.canal_relatorio.length > 0 
        ? contatoData.canal_relatorio 
        : null
      
      // Calcular autorizacao_mensagem baseado em canal_relatorio
      const autorizacao = canaisRelatorio !== null && canaisRelatorio.length > 0

      const normalized: any = {
        ...contatoData,
        nome_completo: contatoData.nome_completo ? normalizeText(contatoData.nome_completo) || '' : undefined,
        apelido_relacionamento: normalizeText(contatoData.apelido_relacionamento),
        cargo: normalizeText(contatoData.cargo),
        celular: normalizeDigits(contatoData.celular),
        email: normalizeEmail(contatoData.email),
        data_aniversario: contatoData.data_aniversario && contatoData.data_aniversario.trim() !== '' ? contatoData.data_aniversario : null,
        pessoa_site: normalizeText(contatoData.pessoa_site),
        pessoa_redes: contatoData.pessoa_redes || null,
        observacoes: normalizeText(contatoData.observacoes),
        autorizacao_mensagem: autorizacao,
        canal_relatorio: canaisRelatorio,
        updated_at: new Date().toISOString(),
      }

      // Atualizar contato
      const { data: updated, error } = await (supabase as any)
        .from('crm_contatos')
        .update(normalized)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('🔴 Erro ao atualizar contato:', error)
        throw new Error(error.message || 'Erro ao atualizar contato')
      }

      // Atualizar preferências dos clientes vinculados
      if (clientes_vinculados && Array.isArray(clientes_vinculados) && clientes_vinculados.length > 0) {
        try {
          // Preparar dados para batch update com mapeamento explícito
          const updates = clientes_vinculados.map((cliente) => ({
            cliente_id: cliente.cliente_id,
            contato_id: id,
            contato_principal: cliente.contato_principal ?? false,
            cargo_no_cliente: cliente.cargo_no_cliente || null,
            observacoes_relacionamento: cliente.observacoes_relacionamento || null,
          }))


          // Fazer upsert em batch
          const { error: batchError } = await supabase
            .from('crm_clientes_contatos')
            .upsert(updates, { onConflict: 'cliente_id,contato_id' })

          if (batchError) {
            console.error('🔴 Erro ao atualizar preferências:', batchError)
            console.error('   Código:', batchError.code)
            console.error('   Mensagem:', batchError.message)
            console.error('   Detalhes:', batchError.details)
            throw batchError
          }
          
        } catch (err) {
          console.error('🔴 Erro ao salvar preferências:', err)
          throw err
        }
      }

      return updated
    },
    onSuccess: (updatedContato, variables) => {
      // Update the contact detail cache with fresh data
      queryClient.setQueryData(
        queryKeys.contatos.detail(variables.id),
        updatedContato
      )

      // Invalidate all list queries to refetch with updated data
      queryClient.invalidateQueries({
        queryKey: queryKeys.contatos.lists(),
        exact: false,
      })

      toast.success('Contato atualizado com sucesso')
    },
    onError: (error: any) => {
      console.error('🔴 Erro ao atualizar:', error)
      const message = error?.message || 'Erro ao atualizar contato'
      toast.error(message)
    },
  })
}

export function useDeleteContato() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_contatos')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: (_, id) => {
      // Remove contact from all related cache entries
      queryClient.removeQueries({
        queryKey: queryKeys.contatos.detail(id),
      })

      // Invalidate all list queries to refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.contatos.lists(),
        exact: false,
      })

      toast.success('Contato excluído com sucesso')
    },
    onError: (error) => {
      toast.error('Erro ao excluir contato')
      console.error(error)
    },
  })
}
