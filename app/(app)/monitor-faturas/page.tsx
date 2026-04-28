'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { RefreshCw, FileCheck, FileX, LayoutList, Percent, Download, Upload, FileText, X, Search, Clock, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import type { MonitorFaturasResult, RegistroFatura } from '@/app/api/monitor-faturas/route'

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]

const ANOS = ['2024', '2025', '2026']

type Filtro = 'todos' | 'com' | 'sem' | 'no_prazo' | 'atrasadas' | 'fora_escopo'

interface UploadState {
  registro: RegistroFatura
  file: File | null
  uploading: boolean
  error: string | null
  success: boolean
}

export default function MonitorFaturasPage() {
  const now = new Date()
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno] = useState(String(now.getFullYear()))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MonitorFaturasResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'geradora' | 'beneficiaria'>('todos')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const verificar = useCallback(async () => {
    setLoading(true)
    setError(null)
    setFiltro('todos')
    try {
      const res = await fetch(`/api/monitor-faturas?mes=${mes}-${ano}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Erro ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [mes, ano])

  const openUpload = (reg: RegistroFatura) => {
    setUploadState({ registro: reg, file: null, uploading: false, error: null, success: false })
  }

  const closeUpload = () => {
    if (uploadState?.uploading) return
    setUploadState(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (f && f.type !== 'application/pdf') {
      setUploadState(s => s ? { ...s, error: 'Apenas arquivos PDF são permitidos', file: null } : s)
      return
    }
    setUploadState(s => s ? { ...s, file: f, error: null } : s)
  }

  const handleUpload = async () => {
    if (!uploadState?.file) return
    setUploadState(s => s ? { ...s, uploading: true, error: null } : s)

    const fd = new FormData()
    fd.append('file', uploadState.file)
    fd.append('cliente', uploadState.registro.cliente)
    fd.append('uc', uploadState.registro.uc)
    fd.append('mes', mes)
    fd.append('ano', ano)

    try {
      const res = await fetch('/api/monitor-faturas/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
      setUploadState(s => s ? { ...s, uploading: false, success: true } : s)
      // Atualizar a linha na tabela local sem refetch completo
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          com_fatura: prev.com_fatura + 1,
          sem_fatura: prev.sem_fatura - 1,
          registros: prev.registros.map(r =>
            r.uc === uploadState.registro.uc && r.cliente === uploadState.registro.cliente
              ? { ...r, tem_fatura: true, download_url: json.public_url, caminho_fatura: json.public_url }
              : r
          ),
        }
      })
    } catch (err) {
      setUploadState(s => s ? { ...s, uploading: false, error: err instanceof Error ? err.message : 'Erro no upload' } : s)
    }
  }

  const mesLabel = MESES.find(m => m.value === mes)?.label ?? mes
  const pct = data && data.total_ucs > 0
    ? Math.round((data.com_fatura / data.total_ucs) * 100)
    : 0

  const registrosFiltrados: RegistroFatura[] = data?.registros.filter(r => {
    if (filtro === 'com' && !r.tem_fatura) return false
    if (filtro === 'sem' && r.tem_fatura) return false
    if (filtro === 'no_prazo') {
      if (r.tem_fatura) return false
      if (r.fora_escopo) return false
      const prazo = r.prazo
      if (!prazo) return false
      const match = prazo.match(/De\s*(\d+)\s*até\s*(\d+)/i)
      if (!match) return false
      const diaHoje = new Date().getDate()
      if (diaHoje > parseInt(match[2])) return false
    }
    if (filtro === 'atrasadas') {
      if (r.tem_fatura) return false
      if (r.fora_escopo) return false
      const prazo = r.prazo
      if (!prazo) return false
      const match = prazo.match(/De\s*(\d+)\s*até\s*(\d+)/i)
      if (!match) return false
      const diaHoje = new Date().getDate()
      if (diaHoje <= parseInt(match[2])) return false
    }
    if (filtro === 'fora_escopo' && !r.fora_escopo) return false
    if (filtroTipo !== 'todos' && r.tipo?.toLowerCase() !== filtroTipo) return false
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      if (!r.cliente.toLowerCase().includes(q) && !r.uc.toLowerCase().includes(q)) return false
    }
    return true
  }) ?? []

  // Preview do caminho que será usado no upload
  const uploadPath = uploadState
    ? `${uploadState.registro.cliente.toUpperCase().replace(/\s+/g, '_')}/${uploadState.registro.uc}/${mes}-${ano}.pdf`
    : ''

  return (
    <div className="flex flex-col gap-6 p-6">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Monitor de Faturas</h1>
          <p className="text-sm text-muted-foreground">
            Verifica quais faturas já entraram no storage para o mês selecionado
          </p>
        </div>
        <Link href="/monitor-faturas/upload-massa">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors">
            <Upload className="h-4 w-4 text-slate-500" />
            Upload em Massa
          </button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANOS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button onClick={verificar} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Verificando...' : 'Verificar'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !data && !error && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Selecione o mês e clique em Verificar
        </div>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total UCs</CardTitle>
                <LayoutList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold">{data.total_ucs}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recebidas</CardTitle>
                <FileCheck className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{data.com_fatura}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pendentes</CardTitle>
                <FileX className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-destructive">{data.sem_fatura}</p>
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">No Prazo</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{data.pendentes_no_prazo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">aguardando no prazo</p>
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-900">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">Atrasadas</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-destructive">{data.pendentes_atrasadas}</p>
                <p className="text-xs text-muted-foreground mt-0.5">fora do prazo</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cobertura</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-semibold ${
                  pct === 100 ? 'text-emerald-600 dark:text-emerald-400'
                  : pct >= 50 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-destructive'
                }`}>{pct}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Barra de progresso */}
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: pct === 100 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626',
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {mesLabel} {ano} — {data.com_fatura} de {data.total_ucs} UCs com fatura
            </p>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'todos',       label: `Todas (${data.total_ucs})`,                                  className: '' },
              { key: 'com',         label: `Recebidas (${data.com_fatura})`,                             className: 'text-emerald-700 dark:text-emerald-400' },
              { key: 'sem',         label: `Sem fatura (${data.sem_fatura})`,                            className: 'text-destructive' },
              { key: 'no_prazo',    label: `No Prazo (${data.pendentes_no_prazo})`,                      className: 'text-amber-600 dark:text-amber-400' },
              { key: 'atrasadas',   label: `Atrasadas (${data.pendentes_atrasadas})`,                    className: 'text-destructive' },
              { key: 'fora_escopo', label: `Fora do escopo (${(data as any).fora_escopo ?? 0})`,         className: 'text-slate-500' },
            ] as { key: Filtro; label: string; className: string }[]).map(tab => (
              <Button
                key={tab.key}
                variant={filtro === tab.key ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFiltro(tab.key)}
                className={`text-xs ${filtro !== tab.key ? tab.className : ''}`}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Busca + Filtro de Tipo */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por cliente ou UC..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v as typeof filtroTipo)}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="geradora">Geradora</SelectItem>
                <SelectItem value="beneficiaria">Beneficiária</SelectItem>
              </SelectContent>
            </Select>
            {(busca || filtroTipo !== 'todos') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground gap-1"
                onClick={() => { setBusca(''); setFiltroTipo('todos') }}
              >
                <X className="h-3 w-3" /> Limpar
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {registrosFiltrados.length} de {data?.total_ucs ?? 0}
            </span>
          </div>

          {/* Tabela */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider w-28">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Cliente</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-mono w-36">UC</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider w-28">Tipo</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Caminho</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider w-24 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  registrosFiltrados.map((reg, i) => (
                    <TableRow key={`${reg.uc}-${i}`} className={reg.fora_escopo ? 'opacity-60' : ''}>
                      <TableCell>
                        {reg.fora_escopo === 'desativada' ? (
                          <Badge variant="outline" className="text-xs bg-slate-200 text-slate-700 border-slate-300">
                            Desativada
                          </Badge>
                        ) : reg.fora_escopo === 'nao_aderiu' ? (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            Não aderiu
                          </Badge>
                        ) : (
                          <Badge
                            variant={reg.tem_fatura ? 'default' : 'destructive'}
                            className={reg.tem_fatura
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs'
                              : 'text-xs'
                            }
                          >
                            {reg.tem_fatura ? '✓ recebida' : '✗ pendente'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{reg.cliente}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{reg.uc}</TableCell>
                      <TableCell>
                        {reg.tipo ? (
                          <Badge variant="outline" className="text-xs capitalize">{reg.tipo}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">
                        {reg.caminho_fatura ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {reg.download_url && (
                            <a href={reg.download_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixar fatura">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          {!reg.tem_fatura && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Enviar fatura manualmente"
                              onClick={() => openUpload(reg)}
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            {registrosFiltrados.length} de {data.total_ucs} registros exibidos
          </p>
        </>
      )}

      {/* Modal de Upload */}
      <Dialog open={!!uploadState} onOpenChange={open => { if (!open) closeUpload() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Enviar fatura manualmente</DialogTitle>
          </DialogHeader>

          {uploadState && (
            <div className="flex flex-col gap-4 py-2">

              {/* Info do registro */}
              <div className="rounded-md bg-muted/50 px-4 py-3 space-y-1.5">
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground w-16 shrink-0">Cliente</span>
                  <span className="font-medium">{uploadState.registro.cliente}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground w-16 shrink-0">UC</span>
                  <span className="font-mono">{uploadState.registro.uc}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-muted-foreground w-16 shrink-0">Mês</span>
                  <span>{MESES.find(m => m.value === mes)?.label} {ano}</span>
                </div>
              </div>

              {/* Preview do caminho */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Será salvo em:</p>
                <p className="font-mono text-xs bg-muted rounded px-3 py-2 break-all">
                  faturas/{uploadPath}
                </p>
              </div>

              {/* Seletor de arquivo */}
              {!uploadState.success && (
                <div
                  className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadState.file ? (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-medium truncate max-w-[220px]">{uploadState.file.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setUploadState(s => s ? { ...s, file: null } : s); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        className="ml-1 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar o PDF</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              )}

              {/* Erro */}
              {uploadState.error && (
                <p className="text-sm text-destructive">{uploadState.error}</p>
              )}

              {/* Sucesso */}
              {uploadState.success && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <FileCheck className="h-4 w-4 shrink-0" />
                  Fatura enviada com sucesso!
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={closeUpload} disabled={uploadState?.uploading}>
              {uploadState?.success ? 'Fechar' : 'Cancelar'}
            </Button>
            {!uploadState?.success && (
              <Button
                onClick={handleUpload}
                disabled={!uploadState?.file || uploadState?.uploading}
                className="gap-2"
              >
                {uploadState?.uploading ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Enviar</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
