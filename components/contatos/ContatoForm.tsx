'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { contatoSchema, ContatoFormData, PreferenciasClienteData } from '@/lib/validators/contato'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import { Save, Handshake, User, FileText, Plus, X, Instagram, Facebook, Linkedin, Mail, Phone, Clock, MessageSquare, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { ClientesVinculadosSection } from './ClientesVinculadosSection'

interface ContatoFormProps {
  initialData?: Partial<ContatoFormData>
  onSubmit: (data: ContatoFormData) => void | Promise<void>
  onCancel: () => void
  loading?: boolean
  hideClientsSection?: boolean
  /** Mostrar botões Salvar/Cancelar no rodapé do form (para uso em dialogs) */
  showActionButtons?: boolean
  /** ID do form para vincular ao PageHeader externo */
  formId?: string
}

export function ContatoForm({ initialData, onSubmit, onCancel, loading, hideClientsSection = false, showActionButtons = false, formId = "contato-form" }: ContatoFormProps) {
  // Debug: validar dados iniciais
  if (initialData && typeof window !== 'undefined') {
    // Garantir que clientes_vinculados seja sempre um array
    if (initialData.clientes_vinculados && !Array.isArray(initialData.clientes_vinculados)) {
      console.error('ERRO: clientes_vinculados não é um array:', initialData.clientes_vinculados)
      initialData.clientes_vinculados = []
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ContatoFormData>({
    resolver: zodResolver(contatoSchema) as any,
    defaultValues: {
      ...initialData,
      canal_relatorio: initialData?.canal_relatorio ?? null,
    },
  })

  const [redesSociais, setRedesSociais] = useState<Array<{ tipo: string; valor: string }>>(() => {
    try {
      return initialData?.pessoa_redes ? JSON.parse(initialData.pessoa_redes as string) : []
    } catch {
      return []
    }
  })
  const [novaRede, setNovaRede] = useState<{ tipo: string; valor: string }>({ tipo: 'instagram', valor: '' })
  const [adicionandoRede, setAdicionandoRede] = useState(false)

  const [clientesVinculados, setClientesVinculados] = useState<PreferenciasClienteData[]>(() => {
    const inicial = initialData?.clientes_vinculados
    // Garantir que sempre seja um array
    if (!inicial) return []
    if (!Array.isArray(inicial)) {
      console.error('clientes_vinculados não é um array:', inicial)
      return []
    }
    return inicial
  })

  // Estado de loading local - independente do prop loading
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Função para marcar alterações
  const markAsChanged = () => {
    setHasChanges(true)
  }

  // Atualizar dados de cliente vinculado
  const handleClienteUpdate = (clienteId: string, data: Partial<PreferenciasClienteData>) => {
    setClientesVinculados((prev) =>
      prev.map((cliente) =>
        cliente.cliente_id === clienteId ? { ...cliente, ...data } : cliente
      )
    )
    markAsChanged()
  }

  // Estados para auto-save global
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('global-auto-save') === 'true'
    }
    return false
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSavedData, setLastSavedData] = useState<string>('')
  
  // Observar mudanças no formulário
  const watchedValues = watch()
  const currentFormData = JSON.stringify({
    ...watchedValues,
    pessoa_redes: redesSociais,
    clientes_vinculados: clientesVinculados
  })

  // Hook para Ctrl+S salvar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (!isSubmitting) {
          handleSubmit(async (data: any) => {
            setIsSubmitting(true)
            try {
              await Promise.resolve(onSubmit({
                ...data,
                clientes_vinculados: clientesVinculados,
              }))
            } finally {
              setIsSubmitting(false)
            }
          })()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSubmit, onSubmit, isSubmitting, clientesVinculados])

  // Detectar mudanças no formulário
  useEffect(() => {
    if (!lastSavedData) {
      setLastSavedData(currentFormData)
      return
    }
    
    const changed = currentFormData !== lastSavedData
    setHasChanges(changed)
  }, [currentFormData, lastSavedData])

  // Atualizar configuração global quando mudar
  useEffect(() => {
    const handleStorageChange = () => {
      const globalAutoSave = localStorage.getItem('global-auto-save') === 'true'
      setAutoSaveEnabled(globalAutoSave)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // Salvar quando sair da página/aba (mais confiável)
  useEffect(() => {
    const handleSave = async () => {
      if (!autoSaveEnabled || !hasChanges || loading) return

      try {
        // Validar se os dados estão válidos antes de tentar salvar
        const formData = watch()
        if (!formData.nome_completo?.trim()) {
          return
        }

        const isValid = await new Promise((resolve) => {
          handleSubmit(
            () => resolve(true),
            () => resolve(false)
          )()
        })
        
        if (!isValid) {
          return
        }

        setAutoSaveStatus('saving')
        await new Promise((resolve, reject) => {
          handleSubmit(async (data: any) => {
            try {
              await onSubmit({
                ...data,
                clientes_vinculados: clientesVinculados,
              })
              setLastSavedData(currentFormData)
              setHasChanges(false)
              setAutoSaveStatus('saved')
              setTimeout(() => setAutoSaveStatus('idle'), 3000)
              resolve(true)
            } catch (error) {
              setAutoSaveStatus('idle')
              reject(error)
            }
          })()
        })
      } catch (error) {
      }
    }

    // Detectar quando o usuário sai da aba
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSave()
      }
    }

    // Detectar navegação interceptando clicks em links  
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      if (link && link.href && link.href !== window.location.href) {
        // Pequeno delay para permitir que o save complete
        setTimeout(handleSave, 10)
      }
    }

    // Detectar botão voltar/avançar
    const handlePopState = () => {
      handleSave()
    }

    // Detectar fechamento da aba
    const handleBeforeUnload = () => {
      if (autoSaveEnabled && hasChanges && !loading) {
        // Versão síncrona para beforeunload
        const formData = watch()
        if (formData.nome_completo?.trim()) {
          navigator.sendBeacon && navigator.sendBeacon('/api/auto-save', JSON.stringify(formData))
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('click', handleLinkClick, true)
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('click', handleLinkClick, true)
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [autoSaveEnabled, hasChanges, isSubmitting, handleSubmit, onSubmit, currentFormData, watch])

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (data) => {
        setIsSubmitting(true)
        try {
          await onSubmit({
            ...data,
            clientes_vinculados: clientesVinculados,
          })
        } catch (error) {
          console.error('Erro ao submeter formulário:', error)
        } finally {
          setIsSubmitting(false)
        }
      })}
      className="space-y-6"
    >
      <div className="space-y-5 p-6 bg-white rounded-lg border border-slate-300">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-lg">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Informações da Pessoa</h3>
            </div>
          </div>
          {hasChanges && autoSaveEnabled && (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              Será salvo ao sair
            </div>
          )}
        </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <Label htmlFor="nome_completo" className="text-sm font-bold text-slate-900">
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <Input 
                id="nome_completo" 
                placeholder="Ex: Maria Antonia Oliveira"
                className="h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                {...register('nome_completo')} 
              />
              {errors.nome_completo && (
                <p className="text-sm text-destructive">{errors.nome_completo.message}</p>
              )}
            </div>

            <div className="space-y-3">
              <Label htmlFor="apelido_relacionamento" className="text-sm font-bold text-slate-900">
                Apelido
              </Label>
              <Input 
                id="apelido_relacionamento" 
                placeholder="Ex: Maria, Noni, Toni..."
                className="h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                {...register('apelido_relacionamento')} 
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="celular" className="text-sm font-bold text-slate-900">
                Telefone / Celular
              </Label>
              <Input 
                id="celular" 
                type="tel"
                placeholder="Ex: (67) 99999-9999"
                className="h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                {...register('celular')}
                autoComplete="tel"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="email" className="text-sm font-bold text-slate-900">
                E-mail
              </Label>
              <Input 
                id="email" 
                type="email"
                placeholder="Ex: contato@exemplo.com"
                className="h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                {...register('email')}
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <X className="h-3 w-3" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label htmlFor="data_aniversario" className="text-sm font-bold text-slate-900">
                Data de Aniversário
              </Label>
              <Input 
                id="data_aniversario" 
                type="date" 
                className="h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                {...register('data_aniversario')} 
              />
            </div>

            <div className="space-y-3 lg:col-span-2">
              <Label className="text-sm font-bold text-slate-900">
                Redes Sociais
              </Label>

              {/* Lista de redes sociais com formulário inline */}
              <div className="flex flex-wrap gap-3 items-start content-start">
                {redesSociais.map((rede, index) => (
                  <div
                    key={index}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 hover:shadow-md transition-all"
                    title={rede.valor}
                  >
                    {rede.tipo === 'instagram' && <Instagram className="h-4 w-4 text-pink-600 flex-shrink-0" />}
                    {rede.tipo === 'facebook' && <Facebook className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                    {rede.tipo === 'linkedin' && <Linkedin className="h-4 w-4 text-blue-700 flex-shrink-0" />}
                    <span className="text-slate-700 whitespace-nowrap font-medium">{rede.valor}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const novasRedes = redesSociais.filter((_, i) => i !== index)
                        setRedesSociais(novasRedes)
                        setValue('pessoa_redes', novasRedes.length > 0 ? JSON.stringify(novasRedes) : '')
                        markAsChanged()
                      }}
                      className="ml-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Formulário inline como badge */}
                {adicionandoRede ? (
                  <div className="w-full p-4 rounded-xl bg-blue-50 border border-blue-300 space-y-3">
                    <Select value={novaRede.tipo} onValueChange={(value) => setNovaRede({ ...novaRede, tipo: value })}>
                      <SelectTrigger className="h-10 w-full text-sm bg-white rounded-lg border-slate-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={novaRede.valor}
                      onChange={(e) => setNovaRede({ ...novaRede, valor: e.target.value })}
                      placeholder={
                        novaRede.tipo === 'instagram'
                          ? '@usuario'
                          : novaRede.tipo === 'facebook'
                            ? '/pagina'
                            : '/company/empresa'
                      }
                      className="h-9 w-full text-sm bg-white rounded-lg border-slate-300"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (novaRede.valor.trim()) {
                            const novasRedes = [...redesSociais, novaRede]
                            setRedesSociais(novasRedes)
                            setValue('pessoa_redes', JSON.stringify(novasRedes))
                            setNovaRede({ tipo: 'instagram', valor: '' })
                            setAdicionandoRede(false)
                            markAsChanged()
                          }
                        }
                        if (e.key === 'Escape') {
                          setAdicionandoRede(false)
                          setNovaRede({ tipo: 'instagram', valor: '' })
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (novaRede.valor.trim()) {
                            const novasRedes = [...redesSociais, novaRede]
                            setRedesSociais(novasRedes)
                            setValue('pessoa_redes', JSON.stringify(novasRedes))
                            setNovaRede({ tipo: 'instagram', valor: '' })
                            setAdicionandoRede(false)
                            markAsChanged()
                          }
                        }}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm px-4 py-1.5 rounded-lg bg-white border border-blue-400 hover:bg-blue-50 transition-colors"
                      >
                        ✓ Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdicionandoRede(false)
                          setNovaRede({ tipo: 'instagram', valor: '' })
                        }}
                        className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdicionandoRede(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 border border-dashed border-blue-400 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </button>
                )}
              </div>
            </div>

          </div>
      </div>

      {/* Clientes Vinculados */}
      {!hideClientsSection && clientesVinculados.length > 0 && (
        <ClientesVinculadosSection
          clientes={clientesVinculados}
          onUpdate={handleClienteUpdate}
        />
      )}

      <div className="space-y-4 p-6 bg-white rounded-lg border border-slate-300">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-slate-50 rounded-lg">
            <FileText className="h-5 w-5 text-yellow-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Observações</h3>
        </div>
          <Textarea
            id="observacoes"
            rows={4}
            placeholder="Informações adicionais sobre o contato..."
            className="resize-none rounded-xl border-slate-200 focus:border-yellow-500 focus:ring-yellow-500 transition-all"
            {...register('observacoes')}
          />
      </div>

      {/* Botões de ação no rodapé (quando usado dentro de dialog) */}
      {showActionButtons && (
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || loading}
            className="bg-slate-900 hover:bg-slate-800 text-white border border-slate-900"
          >
            {(isSubmitting || loading) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Criar e Vincular
              </>
            )}
          </Button>
        </div>
      )}

    </form>
  )
}
