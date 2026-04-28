'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Plus, Search, Zap, Building2, SunMedium, ChevronLeft, ChevronRight,
  Edit2, Trash2, MoreHorizontal, Loader2, AlertCircle
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface UC {
  unidade: string
  nome_cliente: string
  documento: string | null
  tipo: string | null
  rateio: string | null
  rateio_enviado: Record<string, number> | null  // geradora: { uc: % }
  rateio_recebido: Record<string, number> | null // beneficiária: { uc: % }
  data_ativacao: string | null
  caminho_fatura: string | null
  dados_extraidos: any
  roi: string | null
  cliente_id: string | null
  status_atual: 'ativa' | 'desativada' | 'pendente_ativacao' | null
  data_desativacao: string | null
}

const TIPO_STYLE: Record<string, { badge: string; dot: string }> = {
  'Geradora':    { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  'Beneficiária':{ badge: 'bg-violet-100 text-violet-700 border-violet-200',   dot: 'bg-violet-500' },
  'Beneficiárias':{ badge: 'bg-violet-100 text-violet-700 border-violet-200',  dot: 'bg-violet-500' },
}

const MES_MAP: Record<string, string> = {
  '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
  '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
  '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro'
}

function mesFaturaLabel(caminho: string | null): string {
  if (!caminho) return '—'
  const m = caminho.match(/(\d{2})-(\d{4})\.pdf/)
  return m ? `${m[1]}/${m[2]}` : '—'
}


// Componente auxiliar para exibir rateio corretamente
function RateioCell({ uc }: { uc: UC }) {
  const isGeradora = uc.tipo === 'Geradora'
  if (isGeradora && uc.rateio_enviado && Object.keys(uc.rateio_enviado).length > 0) {
    return <span className="text-[10px] text-emerald-600 font-medium">{Object.keys(uc.rateio_enviado).length} dest.</span>
  }
  if (!isGeradora && uc.rateio_recebido && Object.keys(uc.rateio_recebido).length > 0) {
    const total = Object.values(uc.rateio_recebido).reduce((s: number, v: number) => s + v, 0)
    return <span className="font-mono text-[11px] text-violet-600 font-semibold">{total.toFixed(0)}%</span>
  }
  if (uc.rateio && !uc.rateio.includes('=')) {
    return <span className="font-mono text-[11px] text-slate-600 font-medium">{uc.rateio.trim()}</span>
  }
  return <span className="text-slate-200">—</span>
}

export default function UnidadesPage() {
  const router = useRouter()
  const [ucs, setUcs] = useState<UC[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')
  const [page, setPage] = useState(0)
  const [deletingUc, setDeletingUc] = useState<string | null>(null)
  const PAGE_SIZE = 100

  const fetchUcs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(search && { search }),
        ...(tipoFilter && { tipo: tipoFilter }),
      })
      const res = await fetch(`/api/unidades?${params}`)
      const json = await res.json()
      setUcs(json.data || [])
      setTotal(json.count || 0)
    } catch {
      toast.error('Erro ao carregar unidades')
    } finally {
      setLoading(false)
    }
  }, [page, search, tipoFilter])

  useEffect(() => { fetchUcs() }, [fetchUcs])
  useEffect(() => { setPage(0) }, [search, tipoFilter])

  const handleDelete = async (unidade: string) => {
    if (!confirm(`Excluir a UC ${unidade}?`)) return
    setDeletingUc(unidade)
    try {
      const res = await fetch(`/api/unidades/${encodeURIComponent(unidade)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('UC excluída')
      fetchUcs()
    } catch {
      toast.error('Erro ao excluir UC')
    } finally {
      setDeletingUc(null)
    }
  }

  const geradoras = ucs.filter(u => u.tipo === 'Geradora').length
  const beneficiarias = ucs.filter(u => u.tipo !== 'Geradora').length
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      {/* ── Barra de topo ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 bg-white sticky top-0 z-10 flex-shrink-0">
        <h1 className="text-sm font-semibold text-slate-800">Unidades Consumidoras</h1>

        {/* Stats inline como chips */}
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
            <Zap className="h-2.5 w-2.5" />{total}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-200">
            <SunMedium className="h-2.5 w-2.5" />{geradoras} Ger.
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-medium border border-violet-200">
            <Building2 className="h-2.5 w-2.5" />{beneficiarias} Ben.
          </span>
        </div>

        <div className="flex-1" />

        {/* Busca */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="UC, cliente..."
            className="pl-7 h-7 text-xs"
          />
        </div>

        {/* Filtro */}
        <Select value={tipoFilter || 'todos'} onValueChange={v => setTipoFilter(v === 'todos' ? '' : v)}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="Geradora">Geradora</SelectItem>
            <SelectItem value="Beneficiária">Beneficiária</SelectItem>
          </SelectContent>
        </Select>

        <Link href="/unidades/nova">
          <Button size="sm" className="h-7 gap-1 text-xs px-2.5">
            <Plus className="h-3 w-3" /> Nova UC
          </Button>
        </Link>
      </div>

      {/* ── Tabela ── */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200">
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400 pl-5 w-48">UC</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cliente</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-28">Tipo</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-18 text-right pr-4">Rateio</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-28">Ativação</TableHead>
              <TableHead className="h-7 text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-20">Fatura</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-300" />
                </TableCell>
              </TableRow>
            ) : ucs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mx-auto mb-1 opacity-30" />
                  <p className="text-xs">Nenhuma UC encontrada</p>
                </TableCell>
              </TableRow>
            ) : ucs.map(uc => {
              const style = TIPO_STYLE[uc.tipo || '']
              const mesLabel = mesFaturaLabel(uc.caminho_fatura)
              const mesExtraido = uc.dados_extraidos?.mês
              const mesFatNum = uc.caminho_fatura?.match(/(\d{2})-\d{4}\.pdf/)?.[1]
              const dadosBatem = mesExtraido && mesFatNum &&
                mesExtraido.toLowerCase().includes(MES_MAP[mesFatNum] || '')
              const desativada = uc.status_atual === 'desativada'

              return (
                <TableRow
                  key={uc.unidade}
                  className={cn(
                    'h-8 cursor-pointer group hover:bg-slate-50/60 border-b border-slate-100/80',
                    desativada && 'opacity-60'
                  )}
                  onClick={() => router.push(`/unidades/${encodeURIComponent(uc.unidade)}`)}
                >
                  {/* UC + dot colorido */}
                  <TableCell className="py-0 pl-5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style?.dot || 'bg-slate-300')} />
                      <span className="font-mono text-[11px] text-slate-700 font-semibold tracking-tight">{uc.unidade}</span>
                    </div>
                  </TableCell>

                  {/* Cliente + doc */}
                  <TableCell className="py-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-xs font-medium text-slate-800 truncate">{uc.nome_cliente}</span>
                      {uc.documento && (
                        <span className="text-[10px] text-slate-400 font-mono hidden xl:inline flex-shrink-0">{uc.documento}</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Tipo / Status */}
                  <TableCell className="py-0">
                    {desativada ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-medium leading-none bg-slate-200 text-slate-600 border-slate-300">
                        Desativada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={cn(
                        'text-[10px] px-1.5 h-4 font-medium leading-none',
                        style?.badge || 'bg-slate-100 text-slate-600 border-slate-200'
                      )}>
                        {uc.tipo || '—'}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Rateio — lê de rateio_distribuicao via view */}
                  <TableCell className="py-0 text-right pr-4">
                    <RateioCell uc={uc} />
                  </TableCell>

                  {/* Ativação */}
                  <TableCell className="py-0">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {uc.data_ativacao ? uc.data_ativacao.trim() : <span className="text-slate-200">—</span>}
                    </span>
                  </TableCell>

                  {/* Fatura */}
                  <TableCell className="py-0">
                    <span className={cn(
                      'text-[10px] font-mono font-medium',
                      mesLabel === '—'    ? 'text-slate-200' :
                      dadosBatem          ? 'text-emerald-600' :
                      mesExtraido         ? 'text-amber-500' :
                                            'text-slate-500'
                    )}>
                      {mesLabel}
                    </span>
                  </TableCell>

                  {/* Ações */}
                  <TableCell className="py-0 pr-2" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all">
                          <MoreHorizontal className="h-3 w-3 text-slate-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem className="text-xs" onClick={() => router.push(`/unidades/${encodeURIComponent(uc.unidade)}`)}>
                          <Edit2 className="h-3 w-3 mr-1.5" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-xs text-red-600 focus:text-red-600"
                          onClick={() => handleDelete(uc.unidade)}
                          disabled={deletingUc === uc.unidade}
                        >
                          <Trash2 className="h-3 w-3 mr-1.5" />
                          {deletingUc === uc.unidade ? 'Excluindo...' : 'Excluir'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Rodapé ── */}
      <div className="flex items-center justify-between px-5 py-1.5 border-t border-slate-100 bg-white flex-shrink-0">
        <span className="text-[11px] text-slate-400">
          {loading ? '…' : total > 0
            ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total} UCs`
            : '0 UCs'
          }
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[11px] text-slate-400 px-1">{page + 1}/{totalPages}</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
