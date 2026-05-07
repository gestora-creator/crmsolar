'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useGruposList, useFindOrCreateGrupo, useDeleteGrupo, GrupoEconomico } from '@/lib/hooks/useGruposEconomicos'
import { Building2, Plus, X, Trash2, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { toast } from 'sonner'

interface GrupoEconomicoSelectorProps {
  value?: string | null
  grupoNome?: string | null
  onChange: (grupoId: string | null, grupoNome: string | null) => void
  disabled?: boolean
  error?: string
}

export function GrupoEconomicoSelector({ 
  value, 
  grupoNome,
  onChange, 
  disabled = false,
  error 
}: GrupoEconomicoSelectorProps) {
  const [inputValue, setInputValue] = useState(grupoNome || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showCreateConfirm, setShowCreateConfirm] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const { data: grupos = [], isLoading } = useGruposList()
  const findOrCreate = useFindOrCreateGrupo()
  const deleteGrupo = useDeleteGrupo()

  const filteredGrupos = useMemo(() => {
    if (!inputValue.trim()) return grupos.slice(0, 10)
    const searchTerm = inputValue.toLowerCase().trim()
    return grupos.filter(grupo => 
      grupo.nome.toLowerCase().includes(searchTerm)
    )
  }, [inputValue, grupos])

  const hasExactMatch = useMemo(() => {
    if (!inputValue.trim()) return false
    return grupos.some(g => g.nome.toLowerCase() === inputValue.trim().toLowerCase())
  }, [inputValue, grupos])

  // Está vinculado a um grupo?
  const isLinked = !!value && !!grupoNome

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
        setShowCreateConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (grupoNome && grupoNome !== inputValue) {
      setInputValue(grupoNome)
    }
  }, [grupoNome])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setShowSuggestions(true)
    setShowCreateConfirm(false)
    
    if (!newValue.trim()) {
      onChange(null, null)
    }
  }

  const handleSelectGrupo = (grupo: GrupoEconomico) => {
    setInputValue(grupo.nome)
    onChange(grupo.id, grupo.nome)
    setShowSuggestions(false)
    setShowCreateConfirm(false)
  }

  const handleCreateNew = async () => {
    if (!inputValue.trim()) return
    
    try {
      const grupo = await findOrCreate.mutateAsync(inputValue)
      if (grupo) {
        setInputValue(grupo.nome)
        onChange(grupo.id, grupo.nome)
        setShowCreateConfirm(false)
        setShowSuggestions(false)
        toast.success(`Grupo "${grupo.nome}" criado`)
      }
    } catch {
      // Error handled by mutation
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim() && !hasExactMatch) {
        setShowCreateConfirm(true)
        setShowSuggestions(false)
      } else if (filteredGrupos.length === 1) {
        handleSelectGrupo(filteredGrupos[0])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setShowCreateConfirm(false)
    }
  }

  const handleBlur = () => {
    setTimeout(() => {
      if (!showCreateConfirm) {
        setShowSuggestions(false)
      }
    }, 200)
  }

  // Desvincular — limpa o grupo sem excluí-lo
  const handleX = () => {
    setInputValue('')
    onChange(null, null)
    setShowCreateConfirm(false)
    toast.success('Grupo econômico desvinculado')
  }

  // Limpar campo de busca
  const handleClear = () => {
    setInputValue('')
    onChange(null, null)
    setShowCreateConfirm(false)
    inputRef.current?.focus()
  }

  const handleDelete = async () => {
    if (!value) return
    try {
      await deleteGrupo.mutateAsync(value)
      setInputValue('')
      onChange(null, null)
      setShowDeleteDialog(false)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="grupo_economico" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-blue-600" />
        Grupo Econômico
      </Label>
      
      <div className="relative" ref={wrapperRef}>
        {/* Estado vinculado: mostra chip com ações */}
        {isLinked && !showSuggestions ? (
          <div className="flex items-center gap-2 p-2 border rounded-md bg-blue-50/50 border-blue-200">
            <Building2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-blue-900 flex-1 truncate">{grupoNome}</span>
            
            {!disabled && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Desvincular */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleX}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-orange-600 hover:bg-orange-50"
                  title="Desvincular do grupo (não exclui o grupo)"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Desvincular
                </Button>
                {/* Excluir grupo */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-50"
                  title="Excluir grupo econômico permanentemente"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir
                </Button>
                {/* Trocar grupo */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setInputValue('')
                    onChange(null, null)
                    setShowSuggestions(true)
                    setTimeout(() => inputRef.current?.focus(), 100)
                  }}
                  className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title="Trocar de grupo"
                >
                  Trocar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Campo de busca */}
            <div className="relative">
              <Input
                ref={inputRef}
                id="grupo_economico"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="Buscar ou criar grupo econômico..."
                disabled={disabled}
                className={error ? 'border-red-500' : ''}
              />
              
              {inputValue && !disabled && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-6 w-6 p-0 hover:bg-transparent"
                    title="Limpar"
                  >
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                </div>
              )}
            </div>

            {/* Dropdown de sugestões */}
            {showSuggestions && !disabled && !showCreateConfirm && (
              <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-72 overflow-auto">
                {isLoading ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">Carregando...</div>
                ) : (
                  <div className="py-1">
                    {/* Botão CRIAR NOVO — sempre visível quando tem texto digitado sem match exato */}
                    {inputValue.trim() && !hasExactMatch && (
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 border-b bg-blue-50/30 font-medium text-blue-700"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setShowCreateConfirm(true)
                          setShowSuggestions(false)
                        }}
                      >
                        <div className="p-1 rounded bg-blue-100">
                          <Plus className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <span>Criar novo grupo: <strong>&quot;{inputValue.trim()}&quot;</strong></span>
                      </button>
                    )}

                    {/* Lista de grupos existentes */}
                    {filteredGrupos.length > 0 ? (
                      filteredGrupos.map((grupo) => (
                        <button
                          key={grupo.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleSelectGrupo(grupo)
                          }}
                        >
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{grupo.nome}</span>
                          {value === grupo.id && (
                            <Check className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))
                    ) : !inputValue.trim() ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Digite para buscar ou criar um grupo
                      </div>
                    ) : null}

                    {/* Mensagem quando não encontra e já tem o botão criar no topo */}
                    {inputValue.trim() && filteredGrupos.length === 0 && hasExactMatch === false && (
                      <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                        Nenhum grupo existente encontrado
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Painel de confirmação de criação */}
            {showCreateConfirm && !disabled && (
              <div className="absolute z-50 w-full mt-1 bg-background border border-blue-300 rounded-md shadow-lg p-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Criar o grupo <strong>&quot;{inputValue.trim()}&quot;</strong>?
                </p>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowCreateConfirm(false)
                      setInputValue(grupoNome || '')
                      setShowSuggestions(true)
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateNew}
                    disabled={findOrCreate.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {findOrCreate.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1" />
                    )}
                    {findOrCreate.isPending ? 'Criando...' : 'Criar Grupo'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Excluir Grupo Econômico"
        description={`Excluir "${grupoNome}" permanentemente? Todos os clientes vinculados perderão a associação com este grupo.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
      />
    </div>
  )
}
