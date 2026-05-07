'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Zap } from 'lucide-react'
import { UCForm } from '@/components/unidades/UCForm'
import { Suspense } from 'react'

function NovaUCContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Ler dados do cliente vindos pela URL (quando criado a partir da aba Unidades do cliente)
  const clienteId = searchParams.get('cliente_id') || ''
  const nomeCliente = searchParams.get('nome_cliente') || ''
  const documento = searchParams.get('documento') || ''

  const initialData = {
    ...(clienteId && { cliente_id: clienteId }),
    ...(nomeCliente && { nome_cliente: nomeCliente }),
    ...(documento && { documento }),
  }

  const backUrl = clienteId ? `/clientes/${clienteId}` : '/unidades'
  const backLabel = clienteId ? 'Voltar ao Cliente' : 'Unidades'

  const handleSave = async (data: any) => {
    const res = await fetch('/api/unidades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || 'Erro ao criar UC')
      throw new Error(json.error)
    }
    toast.success(`UC ${data.unidade} criada com sucesso!`)
    // Voltar para o cliente ou para a lista de unidades
    router.push(backUrl)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backUrl}>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-700 transition-colors">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Nova UC</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
          <Zap className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Nova Unidade Consumidora</h1>
          <p className="text-sm text-muted-foreground">
            {nomeCliente
              ? `Cadastrar UC para ${nomeCliente}`
              : 'Cadastre uma geradora ou beneficiária'}
          </p>
        </div>
      </div>

      <UCForm initialData={initialData} onSave={handleSave} />
    </div>
  )
}

export default function NovaUCPage() {
  return (
    <Suspense fallback={<div className="p-6">Carregando...</div>}>
      <NovaUCContent />
    </Suspense>
  )
}
