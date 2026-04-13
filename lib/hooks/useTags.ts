import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tagName: string) => {
      if (!tagName || tagName.trim() === '') {
        throw new Error('Nome da tag não pode ser vazio')
      }
      
      const { data, error } = await supabase
        .from('crm_tags')
        .insert({ nome: tagName.trim() })
        .select()
        .single()
      
      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          throw new Error('Esta tag já existe')
        }
        throw error
      }
      
      return data
    },
    onSuccess: (newTag) => {
      // Update tags list with new entry
      queryClient.setQueryData(queryKeys.tags.all, (oldTags: any) => {
        return oldTags ? [...oldTags, { name: newTag.nome, count: 0 }] : [{ name: newTag.nome, count: 0 }]
      })
      
      toast.success('Tag criada com sucesso!')
    },
    onError: (error: Error) => {
      console.error('Erro ao criar tag:', error)
      toast.error(error.message || 'Erro ao criar tag')
    },
  })
}

// Para ativar a versão otimizada (RPC), aplique esta função no Supabase:
//
// create or replace function get_tag_counts()
// returns table(nome text, count bigint)
// language sql stable as $$
//   select t.nome, count(c.id)
//   from crm_tags t
//   left join crm_clientes c on c.tags @> array[t.nome]
//   group by t.nome
//   order by count desc, t.nome asc;
// $$;

export function useAllTags() {
  return useQuery({
    queryKey: queryKeys.tags.all,
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
    queryFn: async () => {
      // Tenta usar RPC otimizado (evita full-table scan de crm_clientes)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_tag_counts')

      if (!rpcError && rpcData) {
        return (rpcData as Array<{ nome: string; count: number }>).map(row => ({
          name: row.nome,
          count: Number(row.count),
        }))
      }

      // Fallback: busca manual (usa se a função RPC ainda não foi criada)
      const { data: tags, error: tagsError } = await supabase
        .from('crm_tags')
        .select('nome')
        .order('nome')

      if (tagsError) throw tagsError

      const { data: clientes, error: clientesError } = await supabase
        .from('crm_clientes')
        .select('tags')
        .not('tags', 'is', null)

      if (clientesError) throw clientesError

      const tagCounts = new Map<string, number>()
      clientes?.forEach((cliente) => {
        cliente.tags?.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        })
      })

      return tags?.map(tag => ({
        name: tag.nome,
        count: tagCounts.get(tag.nome) || 0,
      })).sort((a, b) => b.count - a.count) || []
    },
  })
}

export function useRenameTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      // Atualiza o nome na tabela crm_tags
      const { error: updateError } = await supabase
        .from('crm_tags')
        .update({ nome: newName })
        .eq('nome', oldName)

      if (updateError) {
        if (updateError.code === '23505') {
          throw new Error('Já existe uma tag com este nome')
        }
        throw updateError
      }

      // Busca todos os clientes que têm a tag antiga
      const { data: clientes, error: fetchError } = await supabase
        .from('crm_clientes')
        .select('id, tags')
        .contains('tags', [oldName])

      if (fetchError) throw fetchError

      // Atualiza cada cliente
      const updates = clientes?.map(async (cliente) => {
        const updatedTags = cliente.tags?.map((tag: string) => 
          tag === oldName ? newName : tag
        )

        const { error } = await supabase
          .from('crm_clientes')
          .update({ tags: updatedTags })
          .eq('id', cliente.id)

        if (error) throw error
      })

      await Promise.all(updates || [])
    },
    onSuccess: () => {
      // Invalidate both tags and client lists (tags were updated on clients)
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.all,
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.lists(),
        exact: false,
      })
      
      toast.success('Tag renomeada com sucesso!')
    },
    onError: (error: any) => {
      console.error('Erro ao renomear tag:', error)
      toast.error(error.message || 'Erro ao renomear tag')
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (tagName: string) => {
      // Busca todos os clientes que têm essa tag
      const { data: clientes, error: fetchError } = await supabase
        .from('crm_clientes')
        .select('id, tags')
        .contains('tags', [tagName])

      if (fetchError) throw fetchError

      // Remove a tag de cada cliente
      const updates = clientes?.map(async (cliente) => {
        const updatedTags = cliente.tags?.filter((tag: string) => tag !== tagName)

        const { error } = await supabase
          .from('crm_clientes')
          .update({ tags: updatedTags })
          .eq('id', cliente.id)

        if (error) throw error
      })

      await Promise.all(updates || [])

      // Remove a tag da tabela crm_tags
      const { error: deleteError } = await supabase
        .from('crm_tags')
        .delete()
        .eq('nome', tagName)

      if (deleteError) throw deleteError
    },
    onSuccess: () => {
      // Invalidate both tags and client lists (tags were removed from clients)
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.all,
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.clientes.lists(),
        exact: false,
      })
      
      toast.success('Tag excluída com sucesso!')
    },
    onError: (error) => {
      console.error('Erro ao excluir tag:', error)
      toast.error('Erro ao excluir tag')
    },
  })
}

export function useClientesByTag(tagName: string | null) {
  type ClienteByTagRow = {
    id: string
    razao_social: string
    tipo_cliente: string | null
    documento: string | null
    tags: string[] | null
  }

  return useQuery({
    queryKey: ['clientes-by-tag', tagName],
    queryFn: async () => {
      if (!tagName) return [] as ClienteByTagRow[]

      const { data, error } = await supabase
        .from('crm_clientes')
        .select('id, razao_social, tipo_cliente, documento, tags')
        .contains('tags', [tagName])
        .order('razao_social')
        .returns<ClienteByTagRow[]>()

      if (error) throw error
      return data || []
    },
    enabled: !!tagName,
  })
}
