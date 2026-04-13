import { useClientesByGrupo } from '@/lib/hooks/useGruposEconomicos'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Users, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { formatDocument } from '@/lib/utils/normalize'

interface GrupoComClientesProps {
  grupoId: string
  grupoNome: string
}

export function GrupoComClientes({ grupoId, grupoNome }: GrupoComClientesProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: clientes = [], isLoading } = useClientesByGrupo(grupoId, expanded)

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'ATIVO': return 'bg-gray-100 text-gray-700 border-gray-300'
      case 'INATIVO': return 'bg-gray-50 text-gray-600 border-gray-200'
      case 'PROSPECTO': return 'bg-slate-100 text-slate-700 border-slate-300'
      case 'SUSPENSO': return 'bg-stone-100 text-stone-700 border-stone-300'
      case 'BLOQUEADO': return 'bg-red-50 text-red-700 border-red-200'
      default: return 'bg-gray-50 text-gray-600 border-gray-200'
    }
  }

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Building2 className="h-5 w-5 text-blue-600" />
            <span>{grupoNome}</span>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {expanded ? clientes.length : '...'}
          </Badge>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
            </div>
          ) : clientes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum cliente vinculado a este grupo
            </p>
          ) : (
            <div className="space-y-2">
              {clientes.map((cliente: any) => (
                <Link
                  key={cliente.id}
                  href={`/clientes/${cliente.id}`}
                  className="block p-3 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{cliente.razao_social}</p>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        {cliente.documento && (
                          <span>Doc: {formatDocument(cliente.documento)}</span>
                        )}
                        {cliente.telefone_principal && (
                          <span>Tel: {cliente.telefone_principal}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {cliente.tipo_cliente && (
                        <Badge variant="outline">{cliente.tipo_cliente}</Badge>
                      )}
                      {cliente.status && (
                        <Badge variant="outline" className={getStatusColor(cliente.status)}>
                          {cliente.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
