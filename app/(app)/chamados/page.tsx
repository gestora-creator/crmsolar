'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { RefreshCw, Search, Ticket } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import { ChamadoDetalheDialog } from '@/components/chamados/ChamadoDetalheDialog'
import {
  STATUS_OPCOES,
  TIPO_OPCOES,
  PRIORIDADE_OPCOES,
  statusLabel,
  statusBadgeClass,
  tipoLabel,
  prioridadeLabel,
  prioridadeBadgeClass,
  nomeCliente,
  formatarData,
  type ChamadoListItem,
} from '@/components/chamados/chamados-constants'

const TODOS = '__all__'
const PAGE_SIZE = 50

interface ChamadosResposta {
  data: ChamadoListItem[]
  page: number
  pageSize: number
  total: number
}

export default function ChamadosPage() {
  const queryClient = useQueryClient()

  const [status, setStatus] = useState(TODOS)
  const [tipo, setTipo] = useState(TODOS)
  const [prioridade, setPrioridade] = useState(TODOS)
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const buscaDebounced = useDebounce(busca, 300)

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['chamados', { status, tipo, prioridade, q: buscaDebounced, page }],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ChamadosResposta> => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      if (status !== TODOS) params.set('status', status)
      if (tipo !== TODOS) params.set('tipo', tipo)
      if (prioridade !== TODOS) params.set('prioridade', prioridade)
      if (buscaDebounced.trim()) params.set('q', buscaDebounced.trim())
      const res = await fetch(`/api/chamados?${params.toString()}`)
      if (!res.ok) throw new Error('Falha ao carregar chamados')
      return (await res.json()) as ChamadosResposta
    },
  })

  const chamados = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function resetParaPrimeiraPagina<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPage(1)
    }
  }

  function limparFiltros() {
    setStatus(TODOS)
    setTipo(TODOS)
    setPrioridade(TODOS)
    setBusca('')
    setPage(1)
  }

  const temFiltro =
    status !== TODOS || tipo !== TODOS || prioridade !== TODOS || busca.trim() !== ''

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-xl font-bold text-foreground">Chamados</h1>
          {!isLoading && (
            <span className="text-sm text-muted-foreground">
              ({total} {total === 1 ? 'chamado' : 'chamados'})
            </span>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Atualizar lista de chamados"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPage(1)
            }}
            placeholder="Buscar na descrição..."
            className="pl-9"
            aria-label="Buscar chamados pela descrição"
          />
        </div>

        <Select value={status} onValueChange={resetParaPrimeiraPagina(setStatus)}>
          <SelectTrigger aria-label="Filtrar por status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {STATUS_OPCOES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipo} onValueChange={resetParaPrimeiraPagina(setTipo)}>
          <SelectTrigger aria-label="Filtrar por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os tipos</SelectItem>
            {TIPO_OPCOES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={prioridade} onValueChange={resetParaPrimeiraPagina(setPrioridade)}>
          <SelectTrigger aria-label="Filtrar por prioridade">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as prioridades</SelectItem>
            {PRIORIDADE_OPCOES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela / estados */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar os chamados.
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : chamados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Ticket className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              Nenhum chamado encontrado
            </p>
            <p className="text-sm text-muted-foreground">
              {temFiltro
                ? 'Nenhum chamado corresponde aos filtros aplicados.'
                : 'Os chamados abertos pelo atendimento aparecerão aqui.'}
            </p>
            {temFiltro && (
              <Button variant="ghost" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden lg:table-cell">Descrição</TableHead>
                <TableHead className="hidden sm:table-cell">Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chamados.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(c.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir chamado ${tipoLabel(c.tipo)} de ${nomeCliente(c.cliente)}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedId(c.id)
                    }
                  }}
                >
                  <TableCell className="font-medium">{tipoLabel(c.tipo)}</TableCell>
                  <TableCell className="max-w-[180px] truncate">
                    {nomeCliente(c.cliente)}
                  </TableCell>
                  <TableCell className="hidden max-w-[320px] truncate text-muted-foreground lg:table-cell">
                    {c.descricao}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span
                      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${prioridadeBadgeClass(c.prioridade)}`}
                    >
                      {prioridadeLabel(c.prioridade)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${statusBadgeClass(c.status)}`}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                    {formatarData(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Paginação */}
      {!isLoading && !isError && chamados.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <ChamadoDetalheDialog
        chamadoId={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['chamados'] })
        }}
      />
    </div>
  )
}
