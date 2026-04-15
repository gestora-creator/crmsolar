'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RefreshCw, FileCheck, FileX, LayoutList, Percent } from 'lucide-react'
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

type Filtro = 'todos' | 'com' | 'sem'

export default function MonitorFaturasPage() {
  const now = new Date()
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno] = useState(String(now.getFullYear()))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MonitorFaturasResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      const json: MonitorFaturasResult = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [mes, ano])

  const mesLabel = MESES.find(m => m.value === mes)?.label ?? mes
  const pct = data && data.total_ucs > 0
    ? Math.round((data.com_fatura / data.total_ucs) * 100)
    : 0

  const registrosFiltrados: RegistroFatura[] = data?.registros.filter(r => {
    if (filtro === 'com') return r.tem_fatura
    if (filtro === 'sem') return !r.tem_fatura
    return true
  }) ?? []

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Monitor de Faturas</h1>
        <p className="text-sm text-muted-foreground">
          Verifica quais faturas já entraram no storage para o mês selecionado
        </p>
      </div>

      {/* Seletor de mês + botão */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANOS.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={verificar} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Verificando...' : 'Verificar'}
        </Button>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Estado vazio */}
      {!loading && !data && !error && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Selecione o mês e clique em Verificar
        </div>
      )}

      {/* Resultados */}
      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total UCs
                </CardTitle>
                <LayoutList className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold">{data.total_ucs}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recebidas
                </CardTitle>
                <FileCheck className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {data.com_fatura}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pendentes
                </CardTitle>
                <FileX className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-semibold text-destructive">
                  {data.sem_fatura}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cobertura
                </CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-semibold ${
                  pct === 100 ? 'text-emerald-600 dark:text-emerald-400'
                  : pct >= 50 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-destructive'
                }`}>
                  {pct}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Barra de progresso */}
          <div className="space-y-1.5">
            <Progress value={pct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {mesLabel} {ano} — {data.com_fatura} de {data.total_ucs} UCs com fatura no storage
            </p>
          </div>

          {/* Tabs de filtro */}
          <div className="flex gap-2">
            {([
              { key: 'todos', label: `Todas (${data.total_ucs})` },
              { key: 'com',   label: `Recebidas (${data.com_fatura})` },
              { key: 'sem',   label: `Pendentes (${data.sem_fatura})` },
            ] as { key: Filtro; label: string }[]).map(tab => (
              <Button
                key={tab.key}
                variant={filtro === tab.key ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFiltro(tab.key)}
                className="text-xs"
              >
                {tab.label}
              </Button>
            ))}
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
                  <TableHead className="text-xs uppercase tracking-wider">Arquivo no storage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  registrosFiltrados.map((reg, i) => (
                    <TableRow key={`${reg.uc}-${i}`}>
                      <TableCell>
                        <Badge
                          variant={reg.tem_fatura ? 'default' : 'destructive'}
                          className={reg.tem_fatura
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs'
                            : 'text-xs'
                          }
                        >
                          {reg.tem_fatura ? '✓ recebida' : '✗ pendente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{reg.cliente}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{reg.uc}</TableCell>
                      <TableCell>
                        {reg.tipo ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {reg.tipo}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-xs">
                        {reg.arquivo ?? '—'}
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
    </div>
  )
}
