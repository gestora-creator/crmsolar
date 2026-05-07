'use client'

import { useClientesByGrupo } from '@/lib/hooks/useGruposEconomicos'
import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, Users, ChevronDown, ChevronRight, Plus, UserPlus, Search, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDocument } from '@/lib/utils/normalize'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/hooks/query-keys'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

interface GrupoComClientesProps {
  grupoId: string
  grupoNome: string
  clienteAtualId?: string
}

export function GrupoComClientes({ grupoId, grupoNome, clienteAtualId }: GrupoComClientesProps) {
  const [expanded, setExpanded] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const [unlinkingId, setXingId] = useState<string | null>(null)
  const [showXSelfDialog, setShowXSelfDialog] = useState(false)
  const [showXOtherDialog, setShowXOtherDialog] = useState<{ id: string; nome: string } | null>(null)
  const [unlinkingSelf, setXingSelf] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: clientes = [], isLoading } = useClientesByGrupo(grupoId, expanded)
  const outrosClientes = clientes.filter((c: any) => c.id !== clienteAtualId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false)
        setSearchTerm('')
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const { data, error } = await supabase
          .from('crm_clientes')
          .select('id, razao_social, documento, tipo_cliente, grupo_economico_id')
          .or(`razao_social.ilike.%${searchTerm}%,documento.ilike.%${searchTerm}%`)
          .neq('grupo_economico_id', grupoId)
          .limit(10)
        if (!error && data) setSearchResults(data)
      } catch { /* silent */ }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, grupoId])

  const handleAddExisting = async (clienteId: string) => {
    setLinking(true)
    try {
      const { error } = await supabase
        .from('crm_clientes')
        .update({ grupo_economico_id: grupoId })
        .eq('id', clienteId)
      if (error) throw error
      toast.success('Cliente adicionado ao grupo')
      setShowSearch(false)
      setSearchTerm('')
      setSearchResults([])
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.clientesByGrupo(grupoId) })
    } catch {
      toast.error('Erro ao vincular cliente ao grupo')
    } finally { setLinking(false) }
  }

  // Desvincular outro cliente do grupo
  const handleXOther = async (clienteId: string) => {
    setXingId(clienteId)
    try {
      const { error } = await supabase
        .from('crm_clientes')
        .update({ grupo_economico_id: null })
        .eq('id', clienteId)
      if (error) throw error
      toast.success('Cliente desvinculado do grupo')
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.clientesByGrupo(grupoId) })
    } catch {
      toast.error('Erro ao desvincular cliente')
    } finally {
      setXingId(null)
      setShowXOtherDialog(null)
    }
  }

  // Desvincular o cliente atual do grupo
  const handleXSelf = async () => {
    if (!clienteAtualId) return
    setXingSelf(true)
    try {
      const { error } = await supabase
        .from('crm_clientes')
        .update({ grupo_economico_id: null })
        .eq('id', clienteAtualId)
      if (error) throw error
      toast.success('Cliente desvinculado do grupo econômico')
      queryClient.invalidateQueries({ queryKey: queryKeys.grupos.clientesByGrupo(grupoId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.clientes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.clientes.byId(clienteAtualId) })
      router.refresh()
    } catch {
      toast.error('Erro ao desvincular do grupo')
    } finally {
      setXingSelf(false)
      setShowXSelfDialog(false)
    }
  }

  const handleCreateFilial = () => {
    const params = new URLSearchParams({ tipo: 'PJ', grupo_id: grupoId, grupo_nome: grupoNome })
    router.push(`/clientes/novo?${params.toString()}`)
  }

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'ATIVO': return 'bg-gray-100 text-gray-700 border-gray-300'
      case 'INATIVO': return 'bg-gray-50 text-gray-600 border-gray-200'
      case 'PROSPECTO': return 'bg-slate-100 text-slate-700 border-slate-300'
      case 'SUSPENSO': return 'bg-stone-100 text-stone-700 border-stone-300'
      case 'BLOQUEADO': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-600 border-gray-200'
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Building2 className="h-4 w-4 text-blue-600" />
            <span>Grupo Econômico: {grupoNome}</span>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1 text-xs">
            <Users className="h-3 w-3" />
            {clientes.length} {clientes.length === 1 ? 'empresa' : 'empresas'}
          </Badge>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
            </div>
          ) : (
            <>
              {outrosClientes.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {outrosClientes.map((cliente: any) => (
                    <div key={cliente.id} className="group flex items-center gap-2 p-3 border rounded-lg hover:bg-accent transition-colors">
                      <Link href={`/clientes/${cliente.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{cliente.razao_social}</p>
                            {cliente.documento && (
                              <p className="text-xs text-muted-foreground mt-0.5">Doc: {formatDocument(cliente.documento)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            {cliente.tipo_cliente && <Badge variant="outline" className="text-xs">{cliente.tipo_cliente}</Badge>}
                            {cliente.status && <Badge variant="outline" className={`text-xs ${getStatusColor(cliente.status)}`}>{cliente.status}</Badge>}
                          </div>
                        </div>
                      </Link>
                      {/* Botão desvincular — aparece no hover */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                        title={`Desvincular ${cliente.razao_social} do grupo`}
                        disabled={unlinkingId === cliente.id}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setShowXOtherDialog({ id: cliente.id, nome: cliente.razao_social })
                        }}
                      >
                        {unlinkingId === cliente.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">Nenhuma outra empresa vinculada a este grupo</p>
              )}

              <div className="flex flex-col gap-2 pt-2 border-t">
                {/* Ações de adicionar */}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCreateFilial} className="flex-1">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Criar Filial
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)} className="flex-1">
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" />Adicionar Existente
                  </Button>
                </div>

                {/* Botão desvincular ESTE cliente */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border border-dashed border-red-200"
                  onClick={() => setShowXSelfDialog(true)}
                  disabled={unlinkingSelf}
                >
                  {unlinkingSelf ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Desvincular este cliente do grupo
                </Button>
              </div>

              {showSearch && (
                <div ref={searchRef} className="mt-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por razão social ou CNPJ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-8 text-sm" autoFocus />
                    {searchTerm && (
                      <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0" onClick={() => { setSearchTerm(''); setSearchResults([]) }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {searching && <p className="text-xs text-muted-foreground text-center py-2">Buscando...</p>}
                  {searchResults.length > 0 && (
                    <div className="border rounded-md max-h-48 overflow-auto">
                      {searchResults.map((result) => (
                        <button key={result.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between border-b last:border-b-0" onClick={() => handleAddExisting(result.id)} disabled={linking}>
                          <div>
                            <p className="font-medium">{result.razao_social}</p>
                            {result.documento && <p className="text-xs text-muted-foreground">{formatDocument(result.documento)}</p>}
                          </div>
                          <UserPlus className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                  {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum cliente encontrado</p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}

      {/* Dialog: desvincular ESTE cliente do grupo */}
      <ConfirmDialog
        open={showXSelfDialog}
        onOpenChange={setShowXSelfDialog}
        onConfirm={handleXSelf}
        title="Desvincular do Grupo Econômico"
        description={`Tem certeza que deseja desvincular este cliente do grupo "${grupoNome}"? O cliente não será excluído, apenas perderá a associação com o grupo.`}
        confirmText="Desvincular"
        cancelText="Cancelar"
        variant="destructive"
      />

      {/* Dialog: desvincular OUTRO cliente do grupo */}
      <ConfirmDialog
        open={!!showXOtherDialog}
        onOpenChange={(open) => { if (!open) setShowXOtherDialog(null) }}
        onConfirm={() => showXOtherDialog && handleXOther(showXOtherDialog.id)}
        title="Desvincular Cliente do Grupo"
        description={`Desvincular "${showXOtherDialog?.nome}" do grupo "${grupoNome}"? O cliente não será excluído.`}
        confirmText="Desvincular"
        cancelText="Cancelar"
        variant="destructive"
      />
    </Card>
  )
}
