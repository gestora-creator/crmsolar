'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/database.types'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

type Vinculo = Database['public']['Tables']['crm_clientes_contatos']['Row']
type VinculoInsert = Database['public']['Tables']['crm_clientes_contatos']['Insert']

export interface VinculoWithDetails extends Vinculo {
  contato: {
    id: string
    nome_completo: string
    cargo: string | null
    celular: string | null
    email: string | null
    canal_relatorio: string[] | null
  }
}

export function useVinculosByCliente(clienteId: string) {
  return useQuery({
    queryKey: queryKeys.vinculos.byCliente(clienteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clientes_contatos')
        .select(`
          *,
          contato:crm_contatos(id, nome_completo, cargo, celular, email, canal_relatorio)
        `)
        .eq('cliente_id', clienteId)
        .order('contato_principal', { ascending: false })

      if (error) throw error
      return data as unknown as VinculoWithDetails[]
    },
    enabled: !!clienteId,
  })
}

export function useVinculosByContato(contatoId: string) {
  return useQuery({
    queryKey: queryKeys.vinculos.byContato(contatoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clientes_contatos')
        .select(`
          *,
          cliente:crm_clientes(id, razao_social, tipo_cliente)
        `)
        .eq('contato_id', contatoId)

      if (error) throw error
      return data
    },
    enabled: !!contatoId,
  })
}

export function useCreateVinculo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vinculo: VinculoInsert) => {
      console.log('🔵 useCreateVinculo - Dados recebidos:', vinculo)
      
      // Criar o vínculo
      const { data: vinculoData, error: vinculoError } = await supabase
        .from('crm_clientes_contatos')
        .insert(vinculo)
        .select()
        .single()

      if (vinculoError) {
        console.error('🔴 Erro ao criar vínculo:', vinculoError)
        console.error('🔴 Erro código:', vinculoError.code)
        console.error('🔴 Erro mensagem:', vinculoError.message)
        console.error('🔴 Erro detalhes:', vinculoError.details)
        console.error('🔴 Erro hint:', vinculoError.hint)
        throw vinculoError
      }

      console.log('🟢 Vínculo criado com sucesso:', vinculoData)

      // Tentar criar registro em relatorio_envios (não falha se houver erro aqui)
      try {
        // Verificar se já existe registro em relatorio_envios para este cliente/contato
        const { data: existingRelatorio, error: checkError } = await supabase
          .from('relatorio_envios')
          .select('id')
          .eq('cliente_id', vinculo.cliente_id)
          .eq('contato_id', vinculo.contato_id)
          .maybeSingle()

        if (checkError) {
          console.warn('⚠️ Aviso ao verificar relatório:', checkError.message)
        } else if (!existingRelatorio) {
          // Buscar informações do contato para criar registro em relatorio_envios
          const { data: contatoData, error: contatoError } = await supabase
            .from('crm_contatos')
            .select('nome_completo')
            .eq('id', vinculo.contato_id)
            .single()

          if (contatoError) {
            console.warn('⚠️ Aviso ao buscar contato para relatório:', contatoError.message)
          } else if (contatoData) {
            // Definir nome_falado_dono baseado se é contato principal ou não
            const nomeFaladoDono = vinculo.contato_principal 
              ? contatoData.nome_completo 
              : `${contatoData.nome_completo} (Contato-Vinculado)`

            // Criar registro na tabela relatorio_envios
            const { error: relatorioError } = await supabase
              .from('relatorio_envios')
              .insert({
                cliente_id: vinculo.cliente_id,
                contato_id: vinculo.contato_id,
                nome_falado_dono: nomeFaladoDono,
                status_envio: 'pendente',
                viewed: false,
              })

            if (relatorioError) {
              console.warn('⚠️ Aviso ao criar relatório de envio:', relatorioError.message)
              // Não falhar a operação principal por causa do relatório
            } else {
              console.log('🟢 Relatório de envio criado')
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Aviso na criação do relatório:', error)
        // Não falhar a operação principal por causa do relatório
      }

      return vinculoData
    },
    onSuccess: (newVinculo, variables) => {
      console.log('✅ onSuccess - Vínculo retornado')
      
      // Invalidate impacted queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.byCliente(variables.cliente_id),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.byContato(variables.contato_id),
      })

      // Also invalidate client detail and contact detail queries
      // since they may display linked contacts and clients
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.detail(variables.cliente_id),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.contatos.detail(variables.contato_id),
      })

      toast.success('Contato vinculado com sucesso')
    },
    onError: (error: any) => {
      console.error('🔴 onError capturado:', error)
      if (error.code === '23505') {
        toast.error('Este contato já está vinculado a este cliente')
      } else {
        const message = error?.message || 'Erro ao vincular contato'
        toast.error(message)
      }
    },
  })
}

export function useDeleteVinculo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Primeiro, buscar o vínculo para obter cliente_id e contato_id
      const { data: vinculo, error: fetchError } = await supabase
        .from('crm_clientes_contatos')
        .select('cliente_id, contato_id')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      // Deletar o vínculo
      const { error } = await supabase
        .from('crm_clientes_contatos')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Remover registro correspondente em relatorio_envios
      if (vinculo) {
        await (supabase as any)
          .from('relatorio_envios')
          .delete()
          .eq('cliente_id', vinculo.cliente_id)
          .eq('contato_id', vinculo.contato_id)
      }
    },
    onSuccess: (_, deleteId, context: any) => {
      // The mutation needs to return clienteId and contatoId to invalidate correctly
      // For now, invalidate all vinculo queries (broader but ensures consistency)
      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.all,
      })
      
      toast.success('Vínculo removido com sucesso')
    },
    onError: (error) => {
      toast.error('Erro ao remover vínculo')
      console.error(error)
    },
  })
}

export function useSetContatoPrincipal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ vinculoId, clienteId }: { vinculoId: string; clienteId: string }) => {
      // Buscar o vínculo para obter o contato_id do novo principal
      const { data: vinculoPrincipal, error: fetchError } = await supabase
        .from('crm_clientes_contatos')
        .select('contato_id')
        .eq('id', vinculoId)
        .single()

      if (fetchError) throw fetchError

      // Buscar todos os vínculos do cliente para atualizar relatorio_envios
      const { data: todosVinculos } = await supabase
        .from('crm_clientes_contatos')
        .select('contato_id, crm_contatos(nome_completo)')
        .eq('cliente_id', clienteId)

      // Primeiro, desmarcar todos os contatos principais do cliente
      const { error: updateError } = await (supabase as any)
        .from('crm_clientes_contatos')
        .update({ contato_principal: false })
        .eq('cliente_id', clienteId)

      if (updateError) throw updateError

      // Depois, marcar o vínculo específico como principal
      const { error: setPrincipalError } = await (supabase as any)
        .from('crm_clientes_contatos')
        .update({ contato_principal: true })
        .eq('id', vinculoId)

      if (setPrincipalError) throw setPrincipalError

      // Atualizar nome_falado_dono na tabela relatorio_envios
      if (todosVinculos) {
        for (const vinculo of todosVinculos) {
          const contato = vinculo.crm_contatos as any
          if (contato) {
            const isPrincipal = vinculo.contato_id === vinculoPrincipal.contato_id
            const nomeFaladoDono = isPrincipal 
              ? contato.nome_completo 
              : `${contato.nome_completo} (Contato-Vinculado)`

            await (supabase as any)
              .from('relatorio_envios')
              .update({ nome_falado_dono: nomeFaladoDono })
              .eq('cliente_id', clienteId)
              .eq('contato_id', vinculo.contato_id)
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.vinculos.byCliente(variables.clienteId),
      })
      
      toast.success('Contato principal definido')
    },
    onError: (error) => {
      toast.error('Erro ao definir contato principal')
      console.error(error)
    },
  })
}
