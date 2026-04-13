'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useContatosList } from '@/lib/hooks/useContatos'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { SearchInput } from '@/components/common/SearchInput'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingState } from '@/components/common/LoadingState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, UserCircle, ChevronLeft, ChevronRight, Users, Loader2, AlertCircle } from 'lucide-react'
import { formatPhoneBR } from '@/lib/utils/normalize'
import { formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

export default function ContatosPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 400)
  const [page, setPage] = useState(0)
  const pageSize = 30

  const {
    data,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useContatosList({
    searchTerm: debouncedSearch,
    page,
    pageSize,
  })

  const contatos = data?.contatos || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / pageSize)

  const showFullSkeleton = isPending && !data
  const showErrorNoData = isError && !data
  const errorMessage =
    error instanceof Error ? error.message : String(error ?? 'Erro ao carregar contatos')

  // Resetar página ao mudar busca
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Relacionamentos</h1>
          <p className="text-muted-foreground">Buscar e gerenciar contatos vinculados a clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/contatos/novo">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Nova Pessoa
            </Button>
          </Link>
        </div>
      </div>

      <Card className={cn(
        'border border-gray-200 overflow-hidden',
        isFetching && !showFullSkeleton && !showErrorNoData && 'relative'
      )}>
        {isFetching && !showFullSkeleton && !showErrorNoData && (
          <div className="h-1 w-full bg-muted" role="progressbar">
            <div className="h-full w-1/3 animate-pulse bg-primary/70" />
          </div>
        )}

        <CardHeader className="bg-gray-50/50 border-b">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nome, celular, e-mail, cargo ou apelido..."
          />
        </CardHeader>

        <CardContent className="p-0">
          {isError && data && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <span>{errorMessage}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                <Loader2 className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </div>
          )}

          {showErrorNoData ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Não foi possível carregar os contatos</p>
                <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void refetch()}>
                <Loader2 className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </div>
          ) : showFullSkeleton ? (
            <div className="p-4">
              <LoadingState variant="table" columns={5} rows={8} />
            </div>
          ) : !contatos || contatos.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<UserCircle className="h-12 w-12" />}
                title="Nenhuma pessoa encontrada"
                description={
                  searchTerm
                    ? 'Tente ajustar os termos da sua busca'
                    : 'Comece criando sua primeira pessoa'
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold">Nome</TableHead>
                    <TableHead className="font-semibold">Cargo</TableHead>
                    <TableHead className="font-semibold">Celular</TableHead>
                    <TableHead className="font-semibold">E-mail</TableHead>
                    <TableHead className="font-semibold">Atualizado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contatos.map((contato) => (
                    <TableRow
                      key={contato.id}
                      className="group cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => router.push(`/contatos/${contato.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                          {contato.nome_completo}
                        </div>
                        {contato.apelido_relacionamento && (
                          <div className="text-xs text-muted-foreground">
                            {contato.apelido_relacionamento}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {contato.cargo && (
                          <Badge variant="outline" className="text-xs">{contato.cargo}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatPhoneBR(contato.celular)}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{contato.email}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(contato.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginação */}
              {total > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50/30">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>
                      Mostrando {page * pageSize + 1} a {Math.min((page + 1) * pageSize, total)} de{' '}
                      {total} pessoa{total !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Anterior
                      </Button>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium px-3 py-1 bg-gray-100 text-gray-700 rounded">
                          {page + 1}
                        </span>
                        <span className="text-sm text-muted-foreground">de {totalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
