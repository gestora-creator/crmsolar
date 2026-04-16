'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useContatoById, useUpdateContato, useDeleteContato } from '@/lib/hooks/useContatos'
import { ContatoForm } from '@/components/contatos/ContatoForm'
import { ClientesVinculadosSection } from '@/components/contatos/ClientesVinculadosSection'
import { ContatoTimeline } from '@/components/timeline/ContatoTimeline'
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary'
import { LoadingState } from '@/components/common/LoadingState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Trash2, ClipboardList, Users, Clock, Handshake } from 'lucide-react'
import { ContatoFormData, PreferenciasClienteData } from '@/lib/validators/contato'

const FORM_ID = 'contato-form'

export default function ContatoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contatoId = params.id as string

  const { data: contato, isLoading } = useContatoById(contatoId)
  const updateContato = useUpdateContato()
  const deleteContato = useDeleteContato()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('dados')
  const [clientesVinculados, setClientesVinculados] = useState<PreferenciasClienteData[]>([])

  useEffect(() => {
    if (contato?.clientes_vinculados) setClientesVinculados(contato.clientes_vinculados)
  }, [contato?.clientes_vinculados])

  if (isLoading) return <LoadingState />

  if (!contato) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Contato não encontrado</p>
      </div>
    )
  }

  const handleUpdate = async (data: ContatoFormData) => {
    await updateContato.mutateAsync({ id: contatoId, data: { ...data, clientes_vinculados: clientesVinculados } })
  }

  const handleDelete = async () => {
    await deleteContato.mutateAsync(contatoId)
    router.push('/contatos')
  }

  const handleClienteUpdate = (clienteId: string, data: Partial<PreferenciasClienteData>) => {
    setClientesVinculados(prev => prev.map(c => c.cliente_id === clienteId ? { ...c, ...data } : c))
  }

  return (
    <div className="space-y-0">
      {/* Header sticky */}
      <PageHeader
        title={
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              <a href="/contatos" className="hover:underline">Relacionamentos</a>
              {' / '}
              {contato.nome_completo}
            </p>
            <h1 className="text-lg font-semibold leading-tight">{contato.nome_completo}</h1>
          </div>
        }
        subtitle={
          <div className="flex items-center gap-2">
            {contato.cargo && <Badge variant="outline" className="text-xs">{contato.cargo}</Badge>}
            {contato.celular && <span className="text-xs text-muted-foreground">{contato.celular}</span>}
          </div>
        }
        actions={
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
          </Button>
        }
        showSaveCancel={activeTab === 'dados'}
        formId={FORM_ID}
        saving={updateContato.isPending}
        onCancel={() => router.back()}
        saveLabel="Salvar"
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
          {[
            { value: 'dados',    icon: ClipboardList, label: 'Dados Pessoais' },
            { value: 'vinculos', icon: Users,         label: 'Clientes Vinculados', count: clientesVinculados.length },
            { value: 'timeline', icon: Clock,         label: 'Timeline' },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{tab.count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dados" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro no formulário">
            <ContatoForm
              formId={FORM_ID}
              initialData={contato as any}
              onSubmit={handleUpdate}
              onCancel={() => router.back()}
              loading={updateContato.isPending}
              hideClientsSection
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="vinculos" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro ao carregar vínculos">
            {clientesVinculados.length > 0 ? (
              <ClientesVinculadosSection clientes={clientesVinculados} onUpdate={handleClienteUpdate} />
            ) : (
              <Card className="p-8 text-center">
                <Handshake className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Nenhum cliente vinculado</p>
                <p className="text-sm text-muted-foreground mt-1">Adicione clientes para este contato na página de clientes.</p>
              </Card>
            )}
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro ao carregar timeline">
            <ContatoTimeline
              contatoId={contatoId}
              clienteId={clientesVinculados[0]?.cliente_id}
              contatoNome={contato.nome_completo}
            />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Excluir Contato"
        description="Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        variant="destructive"
      />
    </div>
  )
}
