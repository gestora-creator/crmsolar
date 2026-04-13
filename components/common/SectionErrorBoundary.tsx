'use client'

import { Component, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-destructive/60 mx-auto mb-3" />
          <p className="text-sm font-medium text-destructive">
            {this.props.fallbackTitle || 'Erro ao carregar esta seção'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            {this.state.error?.message || 'Erro inesperado'}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
