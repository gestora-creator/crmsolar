'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCreateCliente } from '@/lib/hooks/useClientes'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PageHeader } from '@/components/common/PageHeader'
import { ClienteFormData } from '@/lib/validators/cliente'
import { Button } from '@/components/ui/button'
import { Building2, User } from 'lucide-react'

const FORM_ID = 'cliente-form'

export default function NovoClientePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tipo = (searchParams.get('tipo') as 'PF' | 'PJ') || null
  const grupoId = searchParams.get('grupo_id') || null
  const grupoNome = searchParams.get('grupo_nome') || null
  const createCliente = useCreateCliente()

  const handleSubmit = async (data: ClienteFormData) => {
    await createCliente.mutateAsync(data)
    router.push('/clientes')
  }

  // Tela de seleção PF/PJ antes do form
  if (!tipo) {
    return (
      <div className="space-y-0">
        <PageHeader
          title={
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                <a href="/clientes" className="hover:underline">Clientes</a>
                {' / '}Novo
              </p>
              <h1 className="text-lg font-semibold leading-tight">Novo Cliente</h1>
            </div>
          }
          onCancel={() => router.push('/clientes')}
        />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Qual o tipo de cliente?</h2>
              <p className="text-sm text-muted-foreground mt-1">Selecione antes de preencher os dados</p>
            </div>
            <div className="flex gap-4 justify-center">
              <Button
                variant="outline"
                size="lg"
                className="h-24 w-40 flex-col gap-2"
                onClick={() => {
                  const params = new URLSearchParams({ tipo: 'PJ' })
                  if (grupoId) { params.set('grupo_id', grupoId) }
                  if (grupoNome) { params.set('grupo_nome', grupoNome) }
                  router.push(`/clientes/novo?${params.toString()}`)
                }}
              >
                <Building2 className="h-8 w-8 text-blue-600" />
                <span className="font-medium">Pessoa Jurídica</span>
                <span className="text-xs text-muted-foreground">CNPJ</span>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-24 w-40 flex-col gap-2"
                onClick={() => {
                  const params = new URLSearchParams({ tipo: 'PF' })
                  if (grupoId) { params.set('grupo_id', grupoId) }
                  if (grupoNome) { params.set('grupo_nome', grupoNome) }
                  router.push(`/clientes/novo?${params.toString()}`)
                }}
              >
                <User className="h-8 w-8 text-violet-600" />
                <span className="font-medium">Pessoa Física</span>
                <span className="text-xs text-muted-foreground">CPF</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <PageHeader
        title={
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              <a href="/clientes" className="hover:underline">Clientes</a>
              {' / '}{tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              {grupoNome && ` / Filial de ${grupoNome}`}
            </p>
            <h1 className="text-lg font-semibold leading-tight">
              {grupoNome ? `Nova Filial — ${grupoNome}` : 'Novo Cliente'}
            </h1>
          </div>
        }
        showSaveCancel
        formId={FORM_ID}
        saving={createCliente.isPending}
        onCancel={() => router.push('/clientes')}
        saveLabel="Cadastrar"
      />
      <ClienteForm
        formId={FORM_ID}
        initialData={{ 
          tipo_cliente: tipo,
          ...(grupoId ? { grupo_economico_id: grupoId, grupo_economico_nome: grupoNome } : {})
        }}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/clientes')}
        loading={createCliente.isPending}
      />
    </div>
  )
}
