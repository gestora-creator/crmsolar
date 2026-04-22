'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Zap } from 'lucide-react'
import { UCForm } from '@/components/unidades/UCForm'

export default function NovaUCPage() {
  const router = useRouter()

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
    router.push('/unidades')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/unidades">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-700 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Unidades
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
          <p className="text-sm text-muted-foreground">Cadastre uma geradora ou beneficiária</p>
        </div>
      </div>

      <UCForm onSave={handleSave} />
    </div>
  )
}
