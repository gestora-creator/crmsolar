'use client'

import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Breadcrumb ou título do registro */
  title: ReactNode
  /** Subtítulo ou badges (cargo, telefone, etc) */
  subtitle?: ReactNode
  /** Conteúdo extra à esquerda (ex: badge de status) */
  badge?: ReactNode
  /** Ações à direita que NÃO são salvar/cancelar (ex: botão Excluir) */
  actions?: ReactNode
  /** ID do form ao qual os botões estão vinculados */
  formId?: string
  /** Mostrar botões Salvar / Cancelar */
  showSaveCancel?: boolean
  onCancel?: () => void
  onSave?: () => void
  saving?: boolean
  saveDisabled?: boolean
  saveLabel?: string
  /** Indicador de auto-save */
  autoSaveStatus?: 'idle' | 'saving' | 'saved'
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  formId,
  showSaveCancel = false,
  onCancel,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel = 'Salvar',
  autoSaveStatus = 'idle',
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        'border-b border-border',
        'px-6 py-3',
        '-mx-6 mb-6',
        className
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Lado esquerdo — título */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="truncate">{title}</div>
            {badge}
          </div>
          {subtitle && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">{subtitle}</div>
          )}
        </div>

        {/* Lado direito — ações */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Auto-save status */}
          {autoSaveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Salvo
            </span>
          )}

          {/* Ações customizadas (ex: Excluir) */}
          {actions}

          {/* Cancelar + Salvar */}
          {showSaveCancel && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={saving}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </Button>

              <Button
                type={formId ? 'submit' : 'button'}
                form={formId}
                size="sm"
                onClick={!formId ? onSave : undefined}
                disabled={saving || saveDisabled}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? 'Salvando...' : saveLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
