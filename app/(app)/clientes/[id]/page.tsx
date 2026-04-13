'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useClienteById, useUpdateCliente, useDeleteCliente } from '@/lib/hooks/useClientes'
import { useVinculosByCliente, useDeleteVinculo, useSetContatoPrincipal } from '@/lib/hooks/useVinculos'
import { ClienteForm } from '@/components/clientes/ClienteForm'
import { ClienteContactsPanel } from '@/components/clientes/ClienteContactsPanel'
import { ClienteTecnicaForm } from '@/components/tecnica/ClienteTecnicaForm'
import { ClienteTimeline } from '@/components/timeline/ClienteTimeline'
import { SectionErrorBoundary } from '@/components/common/SectionErrorBoundary'
import { LoadingState } from '@/components/common/LoadingState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trash2, Star, Users, Wrench, FileText, ClipboardList, Clock } from 'lucide-react'
import { Breadcrumb } from '@/components/common/Breadcrumb'
import { ClienteFormData } from '@/lib/validators/cliente'
import { toast } from 'sonner'

export default function ClienteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clienteId = params.id as string

  const { data: cliente, isLoading } = useClienteById(clienteId)
  const { data: vinculos } = useVinculosByCliente(clienteId)
  const updateCliente = useUpdateCliente()
  const deleteCliente = useDeleteCliente()
  const deleteVinculo = useDeleteVinculo()
  const setContatoPrincipal = useSetContatoPrincipal()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  if (isLoading) {
    return <LoadingState />
  }

  if (!cliente) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Cliente não encontrado</p>
      </div>
    )
  }

  const handleUpdate = async (data: ClienteFormData) => {
    await updateCliente.mutateAsync({ id: clienteId, data })
  }

  const handleDelete = async () => {
    await deleteCliente.mutateAsync(clienteId)
    router.push('/clientes')
  }

  const handleToggleFavorito = async () => {
    await updateCliente.mutateAsync({
      id: clienteId,
      data: { favorito: !cliente.favorito }
    })
  }

  const handleDeleteVinculo = async (vinculoId: string) => {
    await deleteVinculo.mutateAsync(vinculoId)
  }

  const handleSetPrincipal = async (vinculoId: string) => {
    await setContatoPrincipal.mutateAsync({ vinculoId, clienteId })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Breadcrumb crumbs={[{ label: 'Clientes', href: '/clientes' }, { label: cliente.razao_social || 'Cliente' }]} />
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-3xl font-bold">{cliente.razao_social}</h1>
            {cliente.status === 'BLOQUEADO' && (
              <Badge variant="destructive">BLOQUEADO</Badge>
            )}
            <Button variant="ghost" size="icon" onClick={handleToggleFavorito}>
              <Star className={`h-5 w-5 ${cliente.favorito ? 'fill-yellow-500 text-yellow-500' : ''}`} />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{cliente.tipo_cliente === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</Badge>
            {cliente.status && <Badge variant="secondary">{cliente.status}</Badge>}
            {cliente.documento && <span className="text-sm text-muted-foreground">{cliente.documento}</span>}
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
          <TabsTrigger
            value="dados"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Dados Cadastrais
          </TabsTrigger>
          <TabsTrigger
            value="relacionamentos"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
          >
            <Users className="h-4 w-4 mr-2" />
            Relacionamentos
            {(vinculos?.length || 0) > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">{vinculos?.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="tecnica"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
          >
            <Wrench className="h-4 w-4 mr-2" />
            Dados Técnicos
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
          >
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger
            value="relatorios"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-2"
          >
            <FileText className="h-4 w-4 mr-2" />
            Relatórios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro no formulário de dados">
            <ClienteForm
              initialData={cliente as any}
              onSubmit={handleUpdate}
              onCancel={() => router.push('/clientes')}
              loading={updateCliente.isPending}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="relacionamentos" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro ao carregar relacionamentos">
            <ClienteContactsPanel
              clienteId={clienteId}
              vinculos={vinculos || []}
              onDeleteVinculo={handleDeleteVinculo}
              onSetPrincipal={handleSetPrincipal}
            />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="tecnica" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro ao carregar dados técnicos">
            <ClienteTecnicaForm clienteId={clienteId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <SectionErrorBoundary fallbackTitle="Erro ao carregar timeline">
            <ClienteTimeline clienteId={clienteId} />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-6">
          <div className="rounded-xl border bg-card p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Relatórios</p>
            <p className="text-sm text-muted-foreground mt-1">
              Os relatórios enviados para este cliente aparecerão aqui quando a funcionalidade for ativada.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Excluir Cliente"
        description="Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        variant="destructive"
      />
    </div>
  )
}
