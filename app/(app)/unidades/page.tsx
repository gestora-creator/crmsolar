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
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  Plus, Search, Zap, Building2, SunMedium, ChevronLeft, ChevronRight,
  Edit2, Trash2, MoreHorizontal, Filter, Loader2, AlertCircle
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
  data_ativacao: string | null
  prazo: string | null
  caminho_fatura: string | null
  dados_extraidos: any
  roi: string | null
  cliente_id: string | null
}

const TIPO_BADGE: Record<string, string> = {
  'Geradora': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Beneficiária': 'bg-violet-100 text-violet-700 border-violet-200',
  'Beneficiárias': 'bg-violet-100 text-violet-700 border-violet-200',
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
  const PAGE_SIZE = 50

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
    if (!confirm(`Excluir a UC ${unidade}? Esta ação não pode ser desfeita.`)) return
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unidades Consumidoras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie todas as UCs cadastradas — geradoras e beneficiárias
          </p>
        </div>
        <Link href="/unidades/nova">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nova UC
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100">
              <Zap className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Total de UCs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <SunMedium className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-700">{geradoras}</p>
              <p className="text-xs text-muted-foreground">Geradoras</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-50">
              <Building2 className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-violet-700">{beneficiarias}</p>
              <p className="text-xs text-muted-foreground">Beneficiárias</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por UC, cliente ou documento..."
            className="pl-9"
          />
        </div>
        <Select value={tipoFilter || 'todos'} onValueChange={v => setTipoFilter(v === 'todos' ? '' : v)}>
          <SelectTrigger className="w-44">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="Geradora">Geradora</SelectItem>
            <SelectItem value="Beneficiária">Beneficiária</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <div className="rounded-lg overflow-hidden border-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="font-semibold text-xs uppercase tracking-wide">UC</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Cliente</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Tipo</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Rateio</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Prazo</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Ativação</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wide">Última Fatura</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : ucs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <AlertCircle className="h-5 w-5 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma UC encontrada</p>
                  </TableCell>
                </TableRow>
              ) : ucs.map(uc => {
                const mesFatura = uc.caminho_fatura
                  ? uc.caminho_fatura.match(/(\d{2}-\d{4})\.pdf/)?.[1] || '—'
                  : '—'
                const mesReferencia = uc.dados_extraidos?.mês || null

                return (
                  <TableRow
                    key={uc.unidade}
                    className="hover:bg-slate-50/50 cursor-pointer group"
                    onClick={() => router.push(`/unidades/${encodeURIComponent(uc.unidade)}`)}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-slate-700">
                      {uc.unidade}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{uc.nome_cliente}</p>
                        {uc.documento && (
                          <p className="text-xs text-muted-foreground font-mono">{uc.documento}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-xs font-medium',
                        TIPO_BADGE[uc.tipo || ''] || 'bg-slate-100 text-slate-600 border-slate-200'
                      )}>
                        {uc.tipo || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {uc.rateio ? (
                        uc.rateio.includes('=')
                          ? <span className="text-xs text-muted-foreground italic">Distribuído</span>
                          : <span className="font-mono text-xs">{uc.rateio}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {uc.prazo ? uc.prazo.replace('De ', '').replace(' até ', '–') : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {uc.data_ativacao ? uc.data_ativacao.trim() : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {mesReferencia ? (
                          <span className={cn(
                            'font-medium',
                            mesFatura !== '—' && mesReferencia.toLowerCase().includes(
                              mesFatura.split('-')[0] === '04' ? 'abril' :
                              mesFatura.split('-')[0] === '03' ? 'março' : ''
                            ) ? 'text-emerald-600' : 'text-amber-600'
                          )}>
                            {mesReferencia}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{mesFatura}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all">
                            <MoreHorizontal className="h-4 w-4 text-slate-500" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => router.push(`/unidades/${encodeURIComponent(uc.unidade)}`)}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => handleDelete(uc.unidade)}
                            disabled={deletingUc === uc.unidade}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
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

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-muted-foreground">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total} UCs
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
