'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Zap, FileText, ExternalLink, Calendar, Loader2 } from 'lucide-react'
import { UCForm } from '@/components/unidades/UCForm'
import { UCUpload } from '@/components/unidades/UCUpload'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface HistoricoItem {
  mes_ano: string
  url: string
  tipo: string
  created_at: string
}

const MES_NOME: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

export default function EditarUCPage({ params }: { params: Promise<{ unidade: string }> }) {
  const { unidade } = use(params)
  const router = useRouter()
  const ucDecodificada = decodeURIComponent(unidade)

  const [uc, setUc] = useState<any>(null)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/unidades/${unidade}`)
      .then(r => r.json())
      .then(json => {
        setUc(json.uc)
        setHistorico(json.historico || [])
      })
      .catch(() => toast.error('Erro ao carregar UC'))
      .finally(() => setLoading(false))
  }, [unidade])

  const handleSave = async (data: any) => {
    const res = await fetch(`/api/unidades/${unidade}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || 'Erro ao salvar')
      throw new Error(json.error)
    }
    toast.success('UC atualizada com sucesso!')
    router.push('/unidades')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!uc) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>UC não encontrada.</p>
        <Link href="/unidades" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Voltar para Unidades
        </Link>
      </div>
    )
  }

  const faturas = historico.filter(h => h.tipo === 'fatura')
    .sort((a, b) => {
      const [ma, ya] = a.mes_ano.split('-').map(Number)
      const [mb, yb] = b.mes_ano.split('-').map(Number)
      return (yb - ya) || (mb - ma)
    })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/unidades">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-700 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Unidades
          </button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-mono font-medium text-slate-700">{ucDecodificada}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-lg border',
            uc.tipo === 'Geradora'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-violet-50 border-violet-200'
          )}>
            <Zap className={cn(
              'h-5 w-5',
              uc.tipo === 'Geradora' ? 'text-emerald-600' : 'text-violet-600'
            )} />
          </div>
          <div>
            <h1 className="text-xl font-semibold font-mono">{ucDecodificada}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground">{uc.nome_cliente}</p>
              <Badge variant="outline" className={cn(
                'text-xs',
                uc.tipo === 'Geradora'
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-violet-100 text-violet-700 border-violet-200'
              )}>
                {uc.tipo || 'Sem tipo'}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico de faturas - card lateral resumido */}
      {faturas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Faturas no Storage
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {faturas.length} arquivo{faturas.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {faturas.map(f => {
                const [mes, ano] = f.mes_ano.split('-')
                return (
                  <a
                    key={f.mes_ano}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition-colors text-xs font-medium text-slate-700 group"
                  >
                    <Calendar className="h-3 w-3 text-slate-400 group-hover:text-blue-500" />
                    {MES_NOME[mes]}/{ano}
                    <ExternalLink className="h-2.5 w-2.5 text-slate-300 group-hover:text-blue-400" />
                  </a>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload de novas faturas */}
      <UCUpload
        unidade={ucDecodificada}
        onUploadComplete={() => {
          // Recarrega o histórico de faturas
          fetch(`/api/unidades/${unidade}`)
            .then(r => r.json())
            .then(json => setHistorico(json.historico || []))
        }}
      />

      {/* Formulário de edição */}
      <UCForm
        initialData={uc}
        isEdit
        onSave={handleSave}
      />
    </div>
  )
}
