'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Zap, Building2, Calendar, TrendingUp, Settings2, Info,
  Save, Loader2,
  History, BarChart3, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RateioGeradora } from './RateioGeradora'
import { RateioBeneficiaria } from './RateioBeneficiaria'

const PRAZO_OPTIONS = [
  { value: 'De 01 até 07', label: '01 – 07' },
  { value: 'De 08 até 15', label: '08 – 15' },
  { value: 'De 16 até 23', label: '16 – 23' },
  { value: 'De 24 até 30', label: '24 – 30' },
]

const TIPO_OPTIONS = [
  { value: 'Geradora', label: 'Geradora', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'Beneficiária', label: 'Beneficiária', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { value: 'Beneficiárias', label: 'Beneficiárias', color: 'bg-violet-100 text-violet-700 border-violet-200' },
]

interface UCFormData {
  nome_cliente: string
  documento: string
  unidade: string
  tipo: string
  rateio: string
  data_ativacao: string
  projetada: string
  prazo: string
  observacoes: string
  autoconsumo: boolean
  roi: string
  historico_gerado: string
  saldo_credito: string
  cliente_id: string
}

interface Props {
  initialData?: Partial<UCFormData>
  isEdit?: boolean
  onSave?: (data: UCFormData) => Promise<void>
}

export function UCForm({ initialData, isEdit = false, onSave }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'dados' | 'rateio' | 'historico'>('dados')

  const [form, setForm] = useState<UCFormData>({
    nome_cliente: '', documento: '', unidade: '', tipo: 'Beneficiária',
    rateio: '', data_ativacao: '', projetada: '',
    prazo: '', observacoes: '', autoconsumo: false,
    roi: '', historico_gerado: '', saldo_credito: '',
    cliente_id: '', ...initialData,
  })

  const isGeradora = form.tipo === 'Geradora'

  const set = (field: keyof UCFormData, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.unidade.trim()) { toast.error('Número da UC é obrigatório'); return }
    if (!form.nome_cliente.trim()) { toast.error('Nome do cliente é obrigatório'); return }

    setSaving(true)
    try {
      const payload = { ...form }
      if (onSave) {
        await onSave(payload)
      }
    } finally {
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'dados', label: 'Dados Gerais', icon: Info },
    { id: 'rateio', label: 'Rateio', icon: BarChart3 },
    { id: 'historico', label: 'Histórico', icon: History },
  ] as const

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* DADOS GERAIS */}
      {activeTab === 'dados' && (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Identificação da UC
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Número da UC <span className="text-red-500">*</span></Label>
                <Input
                  value={form.unidade}
                  onChange={e => set('unidade', e.target.value)}
                  placeholder="ex: 728.988.051-06"
                  disabled={isEdit}
                  className={isEdit ? 'bg-slate-50 font-mono' : 'font-mono'}
                />
                {isEdit && <p className="text-xs text-muted-foreground">A UC não pode ser alterada após criação.</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Tipo <span className="text-red-500">*</span></Label>
                <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_OPTIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', t.color)}>{t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Prazo de Leitura</Label>
                <Select value={form.prazo || 'none'} onValueChange={v => set('prazo', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar prazo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem prazo</SelectItem>
                    {PRAZO_OPTIONS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-500" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do Cliente <span className="text-red-500">*</span></Label>
                <Input
                  value={form.nome_cliente}
                  onChange={e => set('nome_cliente', e.target.value)}
                  placeholder="Nome ou razão social"
                />
              </div>
              <div className="space-y-1.5">
                <Label>CPF / CNPJ</Label>
                <Input
                  value={form.documento}
                  onChange={e => set('documento', e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className="font-mono"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Financeiro & Metas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data de Ativação</Label>
                <Input
                  value={form.data_ativacao}
                  onChange={e => set('data_ativacao', e.target.value)}
                  placeholder="ex: 24/12/2019"
                />
              </div>
              <div className="space-y-1.5">
                <Label>ROI Acumulado</Label>
                <Input
                  value={form.roi}
                  onChange={e => set('roi', e.target.value)}
                  placeholder="ex: R$ 866.273,56"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Geração Projetada</Label>
                <Textarea
                  value={form.projetada}
                  onChange={e => set('projetada', e.target.value)}
                  placeholder="ex: mes = 10.588&#10;ano = 127.056"
                  rows={2}
                  className="font-mono text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">Formato: <code>mes = VALOR</code> e <code>ano = VALOR</code></p>
              </div>

              <div className="space-y-1.5">
                <Label>Saldo de Crédito</Label>
                <Input
                  value={form.saldo_credito}
                  onChange={e => set('saldo_credito', e.target.value)}
                  placeholder="ex: 60 kWh"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Autoconsumo</Label>
                <div className="flex items-center gap-3 h-10">
                  <button
                    type="button"
                    onClick={() => set('autoconsumo', !form.autoconsumo)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      form.autoconsumo ? 'bg-emerald-500' : 'bg-slate-200'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow',
                      form.autoconsumo ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {form.autoconsumo ? 'Sim' : 'Não'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes}
                  onChange={e => set('observacoes', e.target.value)}
                  placeholder="Observações internas sobre esta UC..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* RATEIO */}
      {activeTab === 'rateio' && (
        <div className="space-y-4">
          {isGeradora && isEdit && form.unidade ? (
            // Geradora em modo edição: distribuição inteligente
            <RateioGeradora
              geradoraUnidade={form.unidade}
              isAutoconsumo={form.autoconsumo ?? false}
            />
          ) : isGeradora && !isEdit ? (
            // Geradora nova: aviso para salvar primeiro
            <div className="flex items-start gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <span>⚠️</span>
              <p>Salve a geradora primeiro para configurar a distribuição de rateio.</p>
            </div>
          ) : (
            // Beneficiária: visualização somente leitura
            <RateioBeneficiaria
              beneficiariaUnidade={form.unidade}
              rateioTotal={form.rateio}
            />
          )}
        </div>
      )}


      {/* HISTÓRICO */}
      {activeTab === 'historico' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-blue-500" />
                Histórico de Geração
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Registro mensal de energia gerada. Preenchido automaticamente pelo OCR das faturas.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.historico_gerado}
                onChange={e => set('historico_gerado', e.target.value)}
                placeholder={`Formato esperado:\nfev./2026 10.604 kWh\njan./2026 11.831 kWh\ndez./2025 12.045 kWh`}
                rows={12}
                className="font-mono text-xs resize-y"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Formato: <code>mes./YYYY quantidade kWh</code> por linha
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Botões de ação */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-[120px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar UC'}
        </Button>
      </div>
    </div>
  )
}
