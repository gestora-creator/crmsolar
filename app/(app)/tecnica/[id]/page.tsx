'use client'

import { useParams, useRouter } from 'next/navigation'
import { ClienteTecnicaForm } from '@/components/tecnica/ClienteTecnicaForm'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingState } from '@/components/common/LoadingState'
import { useTecnicaByClienteId, useUpsertTecnica } from '@/lib/hooks/useTecnica'

const FORM_ID = 'tecnica-form'

export default function TecnicaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clienteId = params.id as string

  const { data: tecnica, isLoading } = useTecnicaByClienteId(clienteId)
  const upsertTecnica = useUpsertTecnica()

  if (isLoading) return <LoadingState />

  return (
    <div className="space-y-0">
      <PageHeader
        title={
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              <a href="/tecnica" className="hover:underline">Dados Técnicos</a>
              {' / '}Editar
            </p>
            <h1 className="text-lg font-semibold leading-tight">Dados Técnicos</h1>
          </div>
        }
        showSaveCancel
        formId={FORM_ID}
        saving={upsertTecnica.isPending}
        onCancel={() => router.push(`/clientes/${clienteId}`)}
        saveLabel="Salvar"
      />
      <ClienteTecnicaForm
        formId={FORM_ID}
        clienteId={clienteId}
        onCancel={() => router.push(`/clientes/${clienteId}`)}
      />
    </div>
  )
}
