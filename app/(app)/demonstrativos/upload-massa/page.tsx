'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sun, Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X, Trash2 } from 'lucide-react'

type ItemStatus = 'pendente' | 'processando' | 'sucesso' | 'erro' | 'aviso'

interface Item {
  id: string
  file: File
  status: ItemStatus
  uc?: string
  cliente?: string
  referencia?: string
  meses?: number
  beneficiarias?: string  // "3/3" ou "2/3"
  percentual?: number
  mensagem?: string
  nao_encontradas?: Array<{ uc_digits: string; percentual: number }>
}

let _id = 0
const nextId = () => `item-${++_id}-${Date.now()}`

export default function UploadMassaDemonstrativosPage() {
  const [items, setItems] = useState<Item[]>([])
  const [processing, setProcessing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [concorrencia, setConcorrencia] = useState(5)  // 5 simultâneos por padrão
  const fileInput = useRef<HTMLInputElement>(null)

  const adicionar = useCallback((files: FileList | File[]) => {
    const novos: Item[] = []
    for (const f of Array.from(files)) {
      if (f.type !== 'application/pdf') continue
      novos.push({ id: nextId(), file: f, status: 'pendente' })
    }
    if (novos.length) setItems(curr => [...curr, ...novos])
  }, [])

  const remover = (id: string) => setItems(curr => curr.filter(i => i.id !== id))
  const limparTudo = () => setItems([])

  const processar = async () => {
    if (processing) return
    setProcessing(true)

    // Fila de itens pendentes (snapshot agora pra evitar processar reentradas)
    const fila = items.filter(i => i.status === 'pendente' || i.status === 'erro').map(i => i.id)
    let cursor = 0

    // Função que processa UM item por id
    const processarUm = async (id: string) => {
      const item = items.find(i => i.id === id)
      if (!item) return

      setItems(curr => curr.map(i => i.id === id ? { ...i, status: 'processando' } : i))

      try {
        const fd = new FormData()
        fd.append('file', item.file)

        const resp = await fetch('/api/demonstrativos/upload', { method: 'POST', body: fd })
        const data = await resp.json()
        const wr = data.webhook_response

        if (resp.ok && wr?.status === 'ok') {
          const semBenef = wr.beneficiarias_nao_encontradas || []
          setItems(curr => curr.map(i => i.id === id ? {
            ...i,
            status: semBenef.length > 0 ? 'aviso' : 'sucesso',
            uc: wr.uc_geradora,
            cliente: wr.nome_cliente,
            referencia: wr.referencia,
            meses: wr.historico_meses,
            beneficiarias: `${wr.beneficiarias_aplicadas}/${wr.beneficiarias_extraidas}`,
            percentual: wr.percentual_total_aplicado,
            nao_encontradas: semBenef,
            mensagem: semBenef.length > 0 ? `${semBenef.length} beneficiária(s) não cadastrada(s)` : 'OK',
          } : i))
        } else {
          setItems(curr => curr.map(i => i.id === id ? {
            ...i,
            status: 'erro',
            mensagem: wr?.erro || data.error || `HTTP ${resp.status}`,
          } : i))
        }
      } catch (err: any) {
        setItems(curr => curr.map(i => i.id === id ? {
          ...i,
          status: 'erro',
          mensagem: err.message || 'erro desconhecido',
        } : i))
      }
    }

    // Worker pool: N workers tirando itens da fila até esvaziar
    const worker = async () => {
      while (true) {
        const idx = cursor++
        if (idx >= fila.length) return
        await processarUm(fila[idx])
      }
    }

    const N = Math.max(1, Math.min(10, concorrencia))
    await Promise.all(Array.from({ length: N }, () => worker()))

    setProcessing(false)
  }

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer?.files?.length) adicionar(e.dataTransfer.files)
  }

  const totalPendentes = items.filter(i => i.status === 'pendente').length
  const totalSucesso = items.filter(i => i.status === 'sucesso').length
  const totalAviso = items.filter(i => i.status === 'aviso').length
  const totalErro = items.filter(i => i.status === 'erro').length

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Sun className="h-6 w-6 text-amber-600" />
        <div>
          <h1 className="text-xl font-semibold">Upload em massa — Demonstrativos</h1>
          <p className="text-sm text-muted-foreground">
            Suba múltiplos PDFs de Demonstrativo de Compensação. O sistema atualiza o histórico de geração e o rateio de cada geradora automaticamente.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div
            onDragEnter={onDrag}
            onDragOver={onDrag}
            onDragLeave={onDrag}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
              dragActive ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-muted-foreground/30 hover:border-muted-foreground/50'
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Solte os PDFs aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground mt-1">Apenas PDFs de Demonstrativo de Compensação</p>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && adicionar(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline">Total: {items.length}</Badge>
              {totalPendentes > 0 && <Badge variant="outline" className="text-muted-foreground">Pendentes: {totalPendentes}</Badge>}
              {totalSucesso > 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">✓ Sucesso: {totalSucesso}</Badge>}
              {totalAviso > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">⚠ Avisos: {totalAviso}</Badge>}
              {totalErro > 0 && <Badge variant="destructive">✗ Erros: {totalErro}</Badge>}
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Paralelo:</span>
                <select
                  value={concorrencia}
                  onChange={e => setConcorrencia(parseInt(e.target.value))}
                  disabled={processing}
                  className="h-7 px-1.5 rounded border bg-background text-xs disabled:opacity-50"
                  title="Quantos PDFs processar ao mesmo tempo"
                >
                  {[1, 2, 3, 5, 8, 10].map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
              <Button variant="ghost" size="sm" onClick={limparTudo} disabled={processing} className="gap-1">
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
              <Button size="sm" onClick={processar} disabled={processing || totalPendentes === 0} className="gap-1.5">
                {processing ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5" /> Processar {totalPendentes > 0 ? `(${totalPendentes})` : ''}</>
                )}
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Geradora</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ref.</TableHead>
                    <TableHead className="text-right">Meses</TableHead>
                    <TableHead>Benefic.</TableHead>
                    <TableHead className="text-right">% aloc.</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.status === 'pendente' && <Badge variant="outline" className="text-xs">aguardando</Badge>}
                        {item.status === 'processando' && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> processando
                          </Badge>
                        )}
                        {item.status === 'sucesso' && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> ok
                          </Badge>
                        )}
                        {item.status === 'aviso' && (
                          <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 gap-1">
                            <AlertTriangle className="h-3 w-3" /> aviso
                          </Badge>
                        )}
                        {item.status === 'erro' && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <X className="h-3 w-3" /> erro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate max-w-[180px]" title={item.file.name}>{item.file.name}</span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{item.uc || '—'}</TableCell>
                      <TableCell className="text-xs">{item.cliente || '—'}</TableCell>
                      <TableCell className="text-xs">{item.referencia || '—'}</TableCell>
                      <TableCell className="text-xs text-right">{item.meses ?? '—'}</TableCell>
                      <TableCell className="text-xs">{item.beneficiarias || '—'}</TableCell>
                      <TableCell className="text-xs text-right">
                        {item.percentual != null ? `${item.percentual}%` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={item.mensagem}>
                        {item.mensagem || ''}
                      </TableCell>
                      <TableCell>
                        {item.status !== 'processando' && (
                          <Button variant="ghost" size="icon" onClick={() => remover(item.id)} className="h-6 w-6">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
