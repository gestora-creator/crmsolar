'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/database.types'
import { queryKeys } from './query-keys'

type Relatorio = Database['public']['Tables']['relatorio_envios']['Row']

export interface RelatorioWithDetails extends Relatorio {
  cliente?: {
    razao_social: string
  } | null
  contato?: {
    nome_completo: string
    celular?: string
    cargo?: string
  } | null
}

export function useRelatoriosList(filters?: {
  status_envio?: string
  viewed?: boolean
  cliente_id?: string
}) {
  return useQuery({
    queryKey: queryKeys.relatorios.envios(),
    queryFn: async () => {
      let query = supabase
        .from('relatorio_envios')
        .select(`
          *,
          cliente:crm_clientes(razao_social),
          contato:crm_contatos(nome_completo, celular, cargo)
        `)
        .order('created_at', { ascending: false })

      if (filters?.status_envio) {
        query = query.eq('status_envio', filters.status_envio)
      }

      if (filters?.viewed !== undefined) {
        query = query.eq('viewed', filters.viewed)
      }

      // plant_id: extrair de resultado_envio JSONB se necessário no futuro

      if (filters?.cliente_id) {
        query = query.eq('cliente_id', filters.cliente_id)
      }

      const { data, error } = await query

      if (error) {
        console.error('Erro ao buscar relatórios:', error)
        throw error
      }
      
      return (data || []) as unknown as RelatorioWithDetails[]
    },
    staleTime: 60000, // Cache por 60s
    gcTime: 5 * 60 * 1000, // 5 minutos
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.relatorios.all,
    queryFn: async () => {
      const [clientesResult, contatosResult, relatoriosResult, viewedResult] = await Promise.all([
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }),
        supabase.from('crm_contatos').select('id', { count: 'exact', head: true }),
        supabase.from('relatorio_envios').select('id', { count: 'exact', head: true }),
        supabase.from('relatorio_envios').select('id', { count: 'exact', head: true }).eq('viewed', true),
      ])

      return {
        totalClientes: clientesResult.count || 0,
        totalContatos: contatosResult.count || 0,
        totalEnvios: relatoriosResult.count || 0,
        enviosVisualizados: viewedResult.count || 0,
      }
    },
    staleTime: 2 * 60 * 1000, // Cache por 2 minutos (estatísticas mudam menos)
    gcTime: 10 * 60 * 1000, // 10 minutos
  })
}
