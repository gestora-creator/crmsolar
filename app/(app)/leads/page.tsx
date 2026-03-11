'use client'

import {
  ArrowDown,
  ArrowUp,
  Crown,
  DollarSign,
  Filter,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============================================================
// Cores douradas / Aura
// ============================================================
const GOLD = {
  primary: '#d4a017',
  light: '#f5d35e',
  dark: '#b8860b',
  glow: 'rgba(212, 160, 23, 0.15)',
  border: 'rgba(212, 160, 23, 0.3)',
  gradient: 'linear-gradient(135deg, #f5d35e 0%, #d4a017 50%, #b8860b 100%)',
}

interface LeadUC {
  cliente: string
  cpfCnpj: string | null
  uc: string
  tipo: 'geradora' | 'beneficiaria'
  faturado: number
  mesReferente: string | null
  classificacao: string | null
  endereco: string | null
  injetado: number | null
  consumo: number | null
  saldoAcumulado: number | null
}

interface Metricas {
  totalLeads: number
  totalGeradoras: number
  totalBeneficiarias: number
  somaFaturado: number
  mediaFaturado: number
  maiorFaturado: number
}

interface ApiResponse {
  leads: LeadUC[]
  total: number
  metricas: Metricas
}

const ITEMS_POR_PAGINA = 20

export default function LeadsPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'geradora' | 'beneficiaria'>('todos')
  const [valorMin, setValorMin] = useState('')
  const [valorMax, setValorMax] = useState('')
  const [sortField, setSortField] = useState<'faturado' | 'cliente'>('faturado')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(0)
  const [selectedLead, setSelectedLead] = useState<LeadUC | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }

      const timestamp = new Date().getTime()
      const response = await fetch(`/api/leads?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`
        try {
          const errBody = await response.json()
          errMsg = errBody.error || errMsg
        } catch {}
        throw new Error(errMsg)
      }

      const apiData: ApiResponse = await response.json()
      setData(apiData)
      setLastUpdate(new Date())
      setError(null)
    } catch (err) {
      console.error('Erro ao buscar leads:', err)
      setError('Erro ao carregar dados. Tentando novamente…')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const formatNumber = (num: number | null) => {
    if (num === null) return '—'
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num)
  }

  const filteredLeads = useMemo(() => {
    if (!data?.leads) return []

    let result = [...data.leads]

    // Filtro de busca
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (l) =>
          l.cliente.toLowerCase().includes(q) ||
          l.uc.toLowerCase().includes(q) ||
          (l.cpfCnpj && l.cpfCnpj.toLowerCase().includes(q))
      )
    }

    // Filtro de tipo
    if (tipoFilter !== 'todos') {
      result = result.filter((l) => l.tipo === tipoFilter)
    }

    // Filtro de valor mínimo
    const min = valorMin ? parseFloat(valorMin.replace(/[^\d.,]/g, '').replace(',', '.')) : null
    if (min !== null && !isNaN(min)) {
      result = result.filter((l) => l.faturado >= min)
    }

    // Filtro de valor máximo
    const max = valorMax ? parseFloat(valorMax.replace(/[^\d.,]/g, '').replace(',', '.')) : null
    if (max !== null && !isNaN(max)) {
      result = result.filter((l) => l.faturado <= max)
    }

    // Ordenação
    result.sort((a, b) => {
      if (sortField === 'faturado') {
        return sortDirection === 'desc' ? b.faturado - a.faturado : a.faturado - b.faturado
      }
      const cmp = a.cliente.localeCompare(b.cliente)
      return sortDirection === 'desc' ? -cmp : cmp
    })

    return result
  }, [data?.leads, searchQuery, tipoFilter, valorMin, valorMax, sortField, sortDirection])

  const paginatedLeads = useMemo(() => {
    const start = pagina * ITEMS_POR_PAGINA
    return filteredLeads.slice(start, start + ITEMS_POR_PAGINA)
  }, [filteredLeads, pagina])

  const totalPaginas = Math.ceil(filteredLeads.length / ITEMS_POR_PAGINA)

  useEffect(() => {
    setPagina(0)
  }, [searchQuery, tipoFilter, valorMin, valorMax])

  const toggleSort = (field: 'faturado' | 'cliente') => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'faturado' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ field }: { field: 'faturado' | 'cliente' }) => {
    if (sortField !== field) return null
    return sortDirection === 'desc' ? (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    )
  }

  // Métricas filtradas
  const metricasFiltradas = useMemo(() => {
    const soma = filteredLeads.reduce((s, l) => s + l.faturado, 0)
    return {
      total: filteredLeads.length,
      geradoras: filteredLeads.filter((l) => l.tipo === 'geradora').length,
      beneficiarias: filteredLeads.filter((l) => l.tipo === 'beneficiaria').length,
      soma,
      media: filteredLeads.length > 0 ? soma / filteredLeads.length : 0,
    }
  }, [filteredLeads])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-t-transparent"
            style={{ borderColor: `${GOLD.light} transparent ${GOLD.primary} ${GOLD.dark}` }}
          />
          <p className="text-sm text-muted-foreground">Carregando leads…</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => { setLoading(true); void fetchData() }} className="mt-4">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 p-0">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
            style={{ background: GOLD.gradient }}
          >
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span style={{ color: GOLD.dark }}>Leads</span>
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Faturado acima de R$ 1.000
              </span>
            </h1>
            {lastUpdate && (
              <p className="text-xs text-muted-foreground">
                Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setLoading(true); void fetchData() }}
          className="gap-2"
          style={{ borderColor: GOLD.border, color: GOLD.dark }}
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {/* Total Leads */}
        <Card
          className="relative overflow-hidden border"
          style={{ borderColor: GOLD.border, background: GOLD.glow }}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total de Leads</p>
                <p className="text-2xl font-bold" style={{ color: GOLD.dark }}>
                  {metricasFiltradas.total}
                </p>
              </div>
              <Sparkles className="h-8 w-8" style={{ color: GOLD.primary, opacity: 0.5 }} />
            </div>
          </CardContent>
          <div
            className="absolute bottom-0 left-0 h-1 w-full"
            style={{ background: GOLD.gradient }}
          />
        </Card>

        {/* Geradoras */}
        <Card className="relative overflow-hidden border" style={{ borderColor: GOLD.border }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Geradoras</p>
                <p className="text-2xl font-bold text-amber-600">
                  {metricasFiltradas.geradoras}
                </p>
              </div>
              <Sun className="h-8 w-8 text-amber-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Beneficiárias */}
        <Card className="relative overflow-hidden border" style={{ borderColor: GOLD.border }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Beneficiárias</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {metricasFiltradas.beneficiarias}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Soma Faturado */}
        <Card className="relative overflow-hidden border" style={{ borderColor: GOLD.border }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Faturado</p>
                <p className="text-lg font-bold" style={{ color: GOLD.dark }}>
                  {formatCurrency(metricasFiltradas.soma)}
                </p>
              </div>
              <DollarSign className="h-8 w-8" style={{ color: GOLD.primary, opacity: 0.5 }} />
            </div>
          </CardContent>
        </Card>

        {/* Média Faturado */}
        <Card className="relative overflow-hidden border" style={{ borderColor: GOLD.border }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Média / Lead</p>
                <p className="text-lg font-bold" style={{ color: GOLD.dark }}>
                  {formatCurrency(metricasFiltradas.media)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8" style={{ color: GOLD.primary, opacity: 0.5 }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border" style={{ borderColor: GOLD.border }}>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Busca */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente, UC ou CPF/CNPJ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                style={{ borderColor: GOLD.border }}
              />
            </div>

            {/* Tipo */}
            <Select
              value={tipoFilter}
              onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}
            >
              <SelectTrigger className="w-[160px]" style={{ borderColor: GOLD.border }}>
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="geradora">Geradoras</SelectItem>
                <SelectItem value="beneficiaria">Beneficiárias</SelectItem>
              </SelectContent>
            </Select>

            {/* Valor mínimo */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">R$ de</span>
              <Input
                type="text"
                placeholder="1.000"
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                className="w-[100px]"
                style={{ borderColor: GOLD.border }}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <Input
                type="text"
                placeholder="∞"
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                className="w-[100px]"
                style={{ borderColor: GOLD.border }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card
        className="flex-1 overflow-hidden border"
        style={{ borderColor: GOLD.border }}
      >
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base" style={{ color: GOLD.dark }}>
                Unidades com faturamento acima de R$ 1.000
              </CardTitle>
              <CardDescription>
                {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} encontrado{filteredLeads.length !== 1 ? 's' : ''}
                {filteredLeads.length !== data?.total ? ` (de ${data?.total} total)` : ''}
              </CardDescription>
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => p - 1)}
                  style={{ borderColor: GOLD.border }}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  {pagina + 1} / {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= totalPaginas - 1}
                  onClick={() => setPagina((p) => p + 1)}
                  style={{ borderColor: GOLD.border }}
                >
                  Próximo
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="max-h-[calc(100vh-420px)] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow
                  className="border-b"
                  style={{ borderColor: GOLD.border, background: GOLD.glow }}
                >
                  <TableHead
                    className="cursor-pointer select-none font-semibold"
                    style={{ color: GOLD.dark }}
                    onClick={() => toggleSort('cliente')}
                  >
                    Cliente <SortIcon field="cliente" />
                  </TableHead>
                  <TableHead className="font-semibold" style={{ color: GOLD.dark }}>
                    UC
                  </TableHead>
                  <TableHead className="font-semibold" style={{ color: GOLD.dark }}>
                    Tipo
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right font-semibold"
                    style={{ color: GOLD.dark }}
                    onClick={() => toggleSort('faturado')}
                  >
                    Faturado <SortIcon field="faturado" />
                  </TableHead>
                  <TableHead className="text-right font-semibold" style={{ color: GOLD.dark }}>
                    Injetado (kWh)
                  </TableHead>
                  <TableHead className="text-right font-semibold" style={{ color: GOLD.dark }}>
                    Consumo (kWh)
                  </TableHead>
                  <TableHead className="font-semibold" style={{ color: GOLD.dark }}>
                    Mês Ref.
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Crown className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">
                          Nenhum lead encontrado com os filtros atuais
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLeads.map((lead, idx) => (
                    <TableRow
                      key={`${lead.uc}-${idx}`}
                      className="cursor-pointer transition-colors hover:bg-amber-50/50 dark:hover:bg-amber-950/10"
                      style={{ borderColor: GOLD.border }}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <TableCell className="max-w-[200px]">
                        <div className="font-medium truncate">{lead.cliente}</div>
                        {lead.cpfCnpj && (
                          <div className="text-xs text-muted-foreground truncate">
                            {lead.cpfCnpj}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                          {lead.uc}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs font-semibold',
                            lead.tipo === 'geradora'
                              ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                              : 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'
                          )}
                        >
                          {lead.tipo === 'geradora' ? '☀️ Geradora' : '⚡ Beneficiária'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className="font-bold text-base"
                          style={{ color: GOLD.dark }}
                        >
                          {formatCurrency(lead.faturado)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {lead.injetado ? formatNumber(lead.injetado) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {lead.consumo ? formatNumber(lead.consumo) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.mesReferente || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de detalhes */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" style={{ color: GOLD.primary }} />
              <span>Detalhes do Lead</span>
            </DialogTitle>
            <DialogDescription>Informações completas da unidade</DialogDescription>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              {/* Info principal */}
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: GOLD.border, background: GOLD.glow }}
              >
                <h3 className="font-semibold text-lg">{selectedLead.cliente}</h3>
                {selectedLead.cpfCnpj && (
                  <p className="text-sm text-muted-foreground">{selectedLead.cpfCnpj}</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-semibold',
                      selectedLead.tipo === 'geradora'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                        : 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'
                    )}
                  >
                    {selectedLead.tipo === 'geradora' ? '☀️ Geradora' : '⚡ Beneficiária'}
                  </Badge>
                  <code className="rounded bg-muted px-2 py-0.5 text-sm font-mono">
                    UC {selectedLead.uc}
                  </code>
                </div>
              </div>

              {/* Valor destaque */}
              <div
                className="flex items-center justify-center rounded-lg p-4"
                style={{ background: GOLD.gradient }}
              >
                <div className="text-center">
                  <p className="text-xs font-medium text-white/80">Valor Faturado</p>
                  <p className="text-3xl font-black text-white">
                    {formatCurrency(selectedLead.faturado)}
                  </p>
                </div>
              </div>

              {/* Grid de dados */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3" style={{ borderColor: GOLD.border }}>
                  <p className="text-xs text-muted-foreground">Injetado</p>
                  <p className="font-semibold">
                    {selectedLead.injetado ? `${formatNumber(selectedLead.injetado)} kWh` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: GOLD.border }}>
                  <p className="text-xs text-muted-foreground">Consumo</p>
                  <p className="font-semibold">
                    {selectedLead.consumo ? `${formatNumber(selectedLead.consumo)} kWh` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: GOLD.border }}>
                  <p className="text-xs text-muted-foreground">Saldo Acumulado</p>
                  <p className="font-semibold">
                    {selectedLead.saldoAcumulado ? `${formatNumber(selectedLead.saldoAcumulado)} kWh` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: GOLD.border }}>
                  <p className="text-xs text-muted-foreground">Mês Referência</p>
                  <p className="font-semibold">{selectedLead.mesReferente || '—'}</p>
                </div>
              </div>

              {/* Classificação e endereço */}
              {(selectedLead.classificacao || selectedLead.endereco) && (
                <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: GOLD.border }}>
                  {selectedLead.classificacao && (
                    <div>
                      <p className="text-xs text-muted-foreground">Classificação</p>
                      <p className="text-sm">{selectedLead.classificacao}</p>
                    </div>
                  )}
                  {selectedLead.endereco && (
                    <div>
                      <p className="text-xs text-muted-foreground">Endereço</p>
                      <p className="text-sm">{selectedLead.endereco}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
