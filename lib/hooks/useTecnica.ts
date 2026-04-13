'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { ClienteTecnicaFormData } from '@/lib/validators/clienteTecnica'
import { queryKeys } from './query-keys'
import { toast } from 'sonner'

type TecnicaPayload = Partial<ClienteTecnicaFormData>

const sanitizeTecnicaPayload = (formData: TecnicaPayload): TecnicaPayload => {
  const payload: Record<string, unknown> = { ...formData }

  const nullableStringFields: Array<keyof ClienteTecnicaFormData> = [
    'razao_social', 'nome_planta', 'modalidade', 'classificacao',
    'data_install', 'venc_garantia', 'garantia_extendida',
    'tipo_local', 'marca_inverter', 'mod_inverter', 'serie_inverter',
    'marca_modulos', 'mod_modulos',
  ]

  const nullableNumberFields: Array<keyof ClienteTecnicaFormData> = [
    'potencia_usina_kwp', 'quant_inverter', 'quant_modulos',
  ]

  nullableStringFields.forEach((field) => {
    const value = payload[field]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      payload[field] = trimmed === '' ? null : trimmed
    }
  })

  nullableNumberFields.forEach((field) => {
    const value = payload[field]
    if (value === '' || value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
      payload[field] = null
    }
  })

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as TecnicaPayload
}

/**
 * Lista todos os clientes com seus dados técnicos (LEFT JOIN)
 */
export function useTecnicaList() {
  return useQuery({
    queryKey: queryKeys.tecnica.lists(),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: clientes, error } = await supabase
        .from('crm_clientes')
        .select(`
          id, razao_social, documento, telefone_principal, email_principal, updated_at,
          tecnica:crm_clientes_tecnica(
            id, nome_planta, modalidade, classificacao, tipo_local,
            possui_internet, data_install, venc_garantia, garantia_extendida,
            potencia_usina_kwp, quant_inverter, marca_inverter, mod_inverter,
            serie_inverter, quant_modulos, marca_modulos, mod_modulos
          )
        `)
        .order('updated_at', { ascending: false })

      if (error) throw error

      return (clientes || []).map((cliente: any) => {
        const tecnica = Array.isArray(cliente.tecnica) ? cliente.tecnica[0] : cliente.tecnica
        return {
          id: cliente.id,
          cliente_id: cliente.id,
          razao_social: cliente.razao_social,
          documento: cliente.documento,
          telefone_principal: cliente.telefone_principal,
          email_principal: cliente.email_principal,
          tecnica_id: tecnica?.id,
          nome_planta: tecnica?.nome_planta,
          modalidade: tecnica?.modalidade,
          classificacao: tecnica?.classificacao,
          tipo_local: tecnica?.tipo_local,
          possui_internet: tecnica?.possui_internet || false,
          data_install: tecnica?.data_install,
          venc_garantia: tecnica?.venc_garantia,
          garantia_extendida: tecnica?.garantia_extendida,
          potencia_usina_kwp: tecnica?.potencia_usina_kwp,
          quant_inverter: tecnica?.quant_inverter,
          marca_inverter: tecnica?.marca_inverter,
          mod_inverter: tecnica?.mod_inverter,
          serie_inverter: tecnica?.serie_inverter,
          quant_modulos: tecnica?.quant_modulos,
          marca_modulos: tecnica?.marca_modulos,
          mod_modulos: tecnica?.mod_modulos,
        }
      })
    },
  })
}

/**
 * Busca dados técnicos por cliente_id
 */
export function useTecnicaByCliente(clienteId: string) {
  return useQuery({
    queryKey: queryKeys.tecnica.byCliente(clienteId),
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .select('*')
        .eq('cliente_id', clienteId)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}

/**
 * Busca dados técnicos por documento
 */
export function useTecnicaByDocumento(documento: string) {
  return useQuery({
    queryKey: queryKeys.tecnica.byDocumento(documento),
    enabled: !!documento,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .select('*')
        .eq('documento', documento)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}

/**
 * Criar dados técnicos
 */
export function useCreateTecnica() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (formData: ClienteTecnicaFormData) => {
      const payload = sanitizeTecnicaPayload(formData)
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .insert(payload as any)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tecnica.all })
      toast.success('Dados técnicos salvos')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao salvar dados técnicos')
    },
  })
}

/**
 * Atualizar dados técnicos
 */
export function useUpdateTecnica() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data: formData }: { id: string; data: Partial<ClienteTecnicaFormData> }) => {
      const payload = sanitizeTecnicaPayload(formData)
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tecnica.all })
      toast.success('Dados técnicos atualizados')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao atualizar dados técnicos')
    },
  })
}

/**
 * Compatibilidade: hook legado que mapeia para os novos hooks
 * Usar os hooks individuais (useTecnicaList, useTecnicaByCliente, etc.) é preferível
 */
export function useTecnica() {
  const { data = [], isLoading, error: queryError } = useTecnicaList()

  const getTecnicaById = async (id: string) => {
    const { data, error } = await supabase
      .from('crm_clientes_tecnica')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return null
    return data
  }

  const getTecnicaByDocumento = async (documento: string) => {
    const { data, error } = await supabase
      .from('crm_clientes_tecnica')
      .select('*')
      .eq('documento', documento)
      .single()
    if (error) return null
    return data
  }

  const createTecnica = async (formData: ClienteTecnicaFormData) => {
    try {
      const payload = sanitizeTecnicaPayload(formData)
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .insert(payload as any)
        .select()
        .single()
      if (error) throw error
      return { data, error: null }
    } catch (err: any) {
      return { data: null, error: err.message }
    }
  }

  const updateTecnica = async (id: string, formData: Partial<ClienteTecnicaFormData>) => {
    try {
      const payload = sanitizeTecnicaPayload(formData)
      const { data, error } = await supabase
        .from('crm_clientes_tecnica')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return { data, error: null }
    } catch (err: any) {
      return { data: null, error: err.message }
    }
  }

  return {
    data,
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    getTecnicaById,
    getTecnicaByDocumento,
    createTecnica,
    updateTecnica,
  }
}
