'use client'

import { useRouter } from 'next/navigation'
import { useCreateContato } from '@/lib/hooks/useContatos'
import { ContatoForm } from '@/components/contatos/ContatoForm'
import { PageHeader } from '@/components/common/PageHeader'
import { ContatoFormData } from '@/lib/validators/contato'

const FORM_ID = 'contato-form'

export default function NovoContatoPage() {
  const router = useRouter()
  const createContato = useCreateContato()

  const handleSubmit = async (data: ContatoFormData) => {
    await createContato.mutateAsync(data)
    router.push('/contatos')
  }

  return (
    <div className="space-y-0">
      <PageHeader
        title={
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              <a href="/contatos" className="hover:underline">Relacionamentos</a>
              {' / '}Novo
            </p>
            <h1 className="text-lg font-semibold leading-tight">Novo Contato</h1>
          </div>
        }
        showSaveCancel
        formId={FORM_ID}
        saving={createContato.isPending}
        onCancel={() => router.push('/contatos')}
        saveLabel="Cadastrar"
      />
      <ContatoForm
        formId={FORM_ID}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/contatos')}
        loading={createContato.isPending}
      />
    </div>
  )
}
