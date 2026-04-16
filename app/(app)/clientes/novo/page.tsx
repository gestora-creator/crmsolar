'use client'

import { useRouter } from 'next/navigation'
import { useCreateCliente } from '@/lib/hooks/useClientes'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { PageHeader } from '@/components/common/PageHeader'
import { ClienteFormData } from '@/lib/validators/cliente'

const FORM_ID = 'cliente-form'

export default function NovoClientePage() {
  const router = useRouter()
  const createCliente = useCreateCliente()

  const handleSubmit = async (data: ClienteFormData) => {
    await createCliente.mutateAsync(data)
    router.push('/clientes')
  }

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
        showSaveCancel
        formId={FORM_ID}
        saving={createCliente.isPending}
        onCancel={() => router.push('/clientes')}
        saveLabel="Cadastrar"
      />
      <ClienteForm
        formId={FORM_ID}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/clientes')}
        loading={createCliente.isPending}
      />
    </div>
  )
}
