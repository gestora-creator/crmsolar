'use client'

/**
 * ✅ Query Key Factory Pattern
 * 
 * Centraliza todas as query keys do React Query
 * Garante consistência e facilita invalidação inteligente
 * 
 * Referência: https://tanstack.com/query/latest/docs/react/important-defaults
 */

export const queryKeys = {
  // 👥 CLIENTES
  clientes: {
    all: ['clientes'] as const,
    lists: () => [...queryKeys.clientes.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.clientes.lists(), filters] as const,
    details: () => [...queryKeys.clientes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.clientes.details(), id] as const,
  },

  // 👤 CONTATOS
  contatos: {
    all: ['contatos'] as const,
    lists: () => [...queryKeys.contatos.all, 'list'] as const,
    list: (searchTerm?: string) => [...queryKeys.contatos.lists(), searchTerm] as const,
    details: () => [...queryKeys.contatos.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.contatos.details(), id] as const,
  },

  // 🔗 VÍNCULOS CLIENTE-CONTATO
  vinculos: {
    all: ['vinculos'] as const,
    byCliente: (clienteId: string) =>
      [...queryKeys.vinculos.all, 'por-cliente', clienteId] as const,
    byContato: (contatoId: string) =>
      [...queryKeys.vinculos.all, 'por-contato', contatoId] as const,
  },

  // 🏢 GRUPOS ECONÔMICOS
  grupos: {
    all: ['grupos-economicos'] as const,
    lists: () => [...queryKeys.grupos.all, 'list'] as const,
    list: (searchTerm?: string) => [...queryKeys.grupos.lists(), searchTerm] as const,
    clientesByGrupo: (grupoId: string) => [...queryKeys.grupos.all, 'clientes', grupoId] as const,
  },

  // 🏷️ TAGS
  tags: {
    all: ['tags'] as const,
  },

  // 🔧 DADOS TÉCNICOS
  tecnica: {
    all: ['tecnica'] as const,
    lists: () => [...queryKeys.tecnica.all, 'list'] as const,
    byCliente: (clienteId: string) => [...queryKeys.tecnica.all, 'cliente', clienteId] as const,
    byDocumento: (documento: string) => [...queryKeys.tecnica.all, 'documento', documento] as const,
  },

  // 📅 TIMELINE RELACIONAL
  timeline: {
    all: ['timeline'] as const,
    byCliente: (clienteId: string) => [...queryKeys.timeline.all, 'cliente', clienteId] as const,
    byContato: (contatoId: string) => [...queryKeys.timeline.all, 'contato', contatoId] as const,
  },

  // 📊 RELATÓRIOS
  relatorios: {
    all: ['relatorios'] as const,
    envios: () => [...queryKeys.relatorios.all, 'envios'] as const,
  },

  // 💰 OPORTUNIDADES
  oportunidades: {
    all: ['oportunidades'] as const,
    lists: () => [...queryKeys.oportunidades.all, 'list'] as const,
    list: (filter?: { searchTerm?: string; page?: number }) =>
      [...queryKeys.oportunidades.lists(), filter] as const,
    details: () => [...queryKeys.oportunidades.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.oportunidades.details(), id] as const,
  },

  // 📄 FATURAS
  faturas: {
    all: ['faturas'] as const,
    lists: () => [...queryKeys.faturas.all, 'list'] as const,
    list: (filter?: { searchTerm?: string; page?: number }) =>
      [...queryKeys.faturas.lists(), filter] as const,
  },
} as const

/**
 * 📋 USAGE EXAMPLES:
 * 
 * // Em useClientes.ts
 * queryKey: queryKeys.clientes.list(searchTerm, page, pageSize)
 * 
 * // Invalidar apenas listas
 * queryClient.invalidateQueries({ queryKey: queryKeys.clientes.lists() })
 * 
 * // Invalidar todas as variações de cliente
 * queryClient.invalidateQueries({ queryKey: queryKeys.clientes.all })
 * 
 * // Atualizar cache específico
 * queryClient.setQueryData(queryKeys.clientes.detail(id), newData)
 */
