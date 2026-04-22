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
  Plus, Trash2, Save, Loader2, AlertCircle, CheckCircle2,
  History, BarChart3, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface RateioLinha {
  fragmento: string
  percentual: string
}

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

// Parser de rateio no formato "UC=PERCENTUAL%" (Geradora)
function parseRateioGeradoras(raw: string): RateioLinha[] {
  if (!raw || !raw.includes('=')) return [{ fragmento: '', percentual: '' }]
  return raw.split(/[\n|]+/).map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split('=')
    return { fragmento: parts[0]?.trim() || '', percentual: parts[1]?.trim().replace('%','') || '' }
  })
}

function serializeRateioGeradoras(linhas: RateioLinha[]): string {
  return linhas.filter(l => l.fragmento || l.percentual)
    .map(l => `${l.fragmento}=${l.percentual}%`).join('\n')
}

function somaRateio(linhas: RateioLinha[]): number {
  return linhas.reduce((acc, l) => acc + (parseFloat(l.percentual) || 0), 0)
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

  // Rateio estruturado (para Geradora)
  const [rateioLinhas, setRateioLinhas] = useState<RateioLinha[]>(() =>
    parseRateioGeradoras(initialData?.rateio || '')
  )

  const isGeradora = form.tipo === 'Geradora'
  const somaTotal = somaRateio(rateioLinhas)

  const set = (field: keyof UCFormData, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.unidade.trim()) { toast.error('Número da UC é obrigatório'); return }
    if (!form.nome_cliente.trim()) { toast.error('Nome do cliente é obrigatório'); return }

    setSaving(true)
    try {
      const payload = { ...form }
      // Para Geradora: serializar rateio estruturado
      if (isGeradora && rateioLinhas.length > 0) {
        payload.rateio = serializeRateioGeradoras(rateioLinhas)
      }
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
                <Select value={form.prazo} onValueChange={v => set('prazo', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar prazo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem prazo</SelectItem>
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
          {isGeradora ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  Distribuição de Rateio — Geradora
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Defina qual percentual de energia vai para cada UC beneficiária.
                  O total deve somar 100%.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-[1fr_120px_36px] gap-2 px-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fragmento da UC Beneficiária</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">% Rateio</span>
                  <span />
                </div>

                {rateioLinhas.map((linha, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2 items-center">
                    <Input
                      value={linha.fragmento}
                      onChange={e => {
                        const novas = [...rateioLinhas]
                        novas[i] = { ...novas[i], fragmento: e.target.value }
                        setRateioLinhas(novas)
                      }}
                      placeholder="ex: 1998023 (parte da UC)"
                      className="font-mono text-sm"
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        min="0" max="100"
                        value={linha.percentual}
                        onChange={e => {
                          const novas = [...rateioLinhas]
                          novas[i] = { ...novas[i], percentual: e.target.value }
                          setRateioLinhas(novas)
                        }}
                        className="pr-7 text-right font-mono"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRateioLinhas(rateioLinhas.filter((_, j) => j !== i))}
                      disabled={rateioLinhas.length === 1}
                      className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Total */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRateioLinhas([...rateioLinhas, { fragmento: '', percentual: '' }])}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar UC
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Total:</span>
                    <span className={cn(
                      'font-mono font-bold text-sm px-2 py-0.5 rounded',
                      somaTotal === 100 ? 'bg-emerald-100 text-emerald-700' :
                      somaTotal > 100 ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    )}>
                      {somaTotal.toFixed(0)}%
                    </span>
                    {somaTotal === 100
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      : <AlertCircle className="h-4 w-4 text-amber-500" />
                    }
                  </div>
                </div>

                {/* Preview do formato salvo */}
                {rateioLinhas.some(l => l.fragmento) && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Preview do campo rateio:</p>
                    <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap">
                      {serializeRateioGeradoras(rateioLinhas)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-violet-500" />
                  Rateio — Beneficiária
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Percentual de energia recebida da geradora.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 max-w-[200px]">
                  <div className="relative flex-1">
                    <Input
                      value={form.rateio}
                      onChange={e => set('rateio', e.target.value)}
                      placeholder="ex: 45"
                      className="pr-7 text-right font-mono"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
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
