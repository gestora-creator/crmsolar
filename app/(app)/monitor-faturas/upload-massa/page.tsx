'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FileText, CheckCircle2, XCircle, AlertCircle,
  ArrowLeft, Loader2, Trash2, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type FileStatus = 'aguardando' | 'processando' | 'ok' | 'sem_uc' | 'erro'

interface FileEntry {
  file: File
  filename: string
  size: number
  status: FileStatus
  codigo_cliente?: string | null
  numero_uc?: string | null
  nome_cliente?: string | null
  referencia?: string | null
  motivo?: string
  publicUrl?: string | null
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadMassaPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback((files: File[]) => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Selecione apenas arquivos PDF'); return }
    setEntries(prev => {
      const existentes = new Set(prev.map(e => e.filename))
      const novos: FileEntry[] = pdfs
        .filter(f => !existentes.has(f.name))
        .map(f => ({ file: f, filename: f.name, size: f.size, status: 'aguardando' }))
      return [...prev, ...novos]
    })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }, [addFiles])

  const remover = (filename: string) =>
    setEntries(prev => prev.filter(e => e.filename !== filename))

  const handleUpload = async () => {
    const pendentes = entries.filter(e => e.status === 'aguardando')
    if (!pendentes.length) { toast.error('Nenhum arquivo aguardando'); return }

    setUploading(true)

    const CONCORRENCIA = 10

    // Processar uma fatura individualmente
    const processar = async (entry: FileEntry) => {
      setEntries(prev => prev.map(e =>
        e.filename === entry.filename ? { ...e, status: 'processando' } : e
      ))
      try {
        const fd = new FormData()
        fd.append('action', 'upload')
        fd.append('files', entry.file)

        const res = await fetch('/api/monitor-faturas/upload-historico', { method: 'POST', body: fd })
        const { resultados } = await res.json()
        const r = resultados?.[0]

        setEntries(prev => prev.map(e =>
          e.filename === entry.filename ? {
            ...e,
            status:         r?.status === 'ok' ? 'ok' : r?.status === 'sem_uc' ? 'sem_uc' : 'erro',
            codigo_cliente: r?.codigo_cliente || null,
            numero_uc:      r?.numero_uc      || null,
            nome_cliente:   r?.nome_cliente   || null,
            referencia:     r?.referencia     || null,
            motivo:         r?.motivo         || null,
            publicUrl:      r?.publicUrl      || null,
          } : e
        ))
      } catch (err: any) {
        setEntries(prev => prev.map(e =>
          e.filename === entry.filename
            ? { ...e, status: 'erro', motivo: err?.message || 'falha de rede' } : e
        ))
      }
    }

    // Executar em lotes de CONCORRENCIA simultâneos
    for (let i = 0; i < pendentes.length; i += CONCORRENCIA) {
      const lote = pendentes.slice(i, i + CONCORRENCIA)
      await Promise.all(lote.map(processar))
    }

    setUploading(false)
    const ok = entries.filter(e => e.status === 'ok').length
    if (ok > 0) toast.success(`${ok} fatura(s) salva(s) com sucesso`)
  }

  const aguardando   = entries.filter(e => e.status === 'aguardando').length
  const processando  = entries.filter(e => e.status === 'processando').length
  const concluidos   = entries.filter(e => e.status === 'ok').length
  const comProblema  = entries.filter(e => ['sem_uc','erro'].includes(e.status)).length

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/monitor-faturas">
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Upload de Faturas Históricas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Suba com qualquer nome — a IA identifica a UC automaticamente pelo conteúdo do PDF
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm space-y-1.5">
        <p className="text-violet-700">
          O sistema lê cada PDF e extrai o <strong>Código do Cliente</strong> (ex: 10/2272721-8) ou a{' '}
          <strong>Unidade Consumidora</strong> (ex: 789.441.051-67), depois encontra a UC no cadastro.
          Funciona com o nome original da Energisa.
        </p>
        <p className="text-xs text-violet-500">
          ⚡ Cada arquivo passa pelo OCR via n8n — pode levar alguns segundos por PDF.
          Para subir a fatura de uma UC específica que você já sabe qual é, use a página da UC.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          dragging ? 'border-violet-400 bg-violet-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        )}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden" onChange={onFileInput} />
        <Sparkles className={cn('h-10 w-10 mx-auto mb-3', dragging ? 'text-violet-500' : 'text-slate-400')} />
        <p className="font-medium text-slate-700">Arraste os PDFs aqui ou clique para selecionar</p>
        <p className="text-sm text-slate-400 mt-1">Qualquer nome de arquivo — a IA identifica automaticamente</p>
      </div>

      {/* Lista + ações */}
      {entries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-sm flex-wrap">
              {aguardando > 0  && <span className="text-slate-500">{aguardando} aguardando</span>}
              {processando > 0 && <span className="text-blue-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{processando} processando</span>}
              {concluidos > 0  && <span className="text-emerald-600 font-medium">{concluidos} enviado(s)</span>}
              {comProblema > 0 && <span className="text-amber-600">{comProblema} com problema</span>}
            </div>
            <div className="flex gap-2">
              {aguardando > 0 && (
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  size="sm"
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                >
                  {uploading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                    : <><Upload className="h-4 w-4" /> Enviar {aguardando} fatura(s)</>
                  }
                </Button>
              )}
              {aguardando === 0 && concluidos + comProblema === entries.length && (
                <Button variant="outline" size="sm" onClick={() => setEntries([])}>
                  Novo lote
                </Button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Arquivo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Identificador</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">UC encontrada</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Mês ref.</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => (
                  <tr key={e.filename} className={e.status === 'ok' ? 'bg-emerald-50/30' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="font-mono text-xs text-slate-700 max-w-[180px] truncate" title={e.filename}>{e.filename}</p>
                          <p className="text-xs text-slate-400">{formatBytes(e.size)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {e.codigo_cliente || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {e.numero_uc || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[130px] truncate">
                      {e.nome_cliente || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {e.referencia || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {e.status === 'aguardando' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                          Aguardando
                        </span>
                      )}
                      {e.status === 'processando' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                          <Loader2 className="h-3 w-3 animate-spin" /> OCR...
                        </span>
                      )}
                      {e.status === 'ok' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Enviado
                        </span>
                      )}
                      {(e.status === 'sem_uc' || e.status === 'erro') && (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {e.status === 'sem_uc' ? 'UC não encontrada' : 'Erro'}
                          </span>
                          {e.motivo && <p className="text-xs text-slate-400 mt-1 max-w-[180px] leading-tight">{e.motivo}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.status === 'aguardando' && (
                        <button onClick={() => remover(e.filename)} className="p-1 rounded hover:bg-slate-100 text-slate-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {e.status === 'ok' && e.publicUrl && (
                        <a href={e.publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">ver</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comProblema > 0 && (
            <p className="text-xs text-slate-400">
              UC não encontrada = o identificador extraído pelo OCR não tem correspondência no cadastro.
              Verifique se a UC está cadastrada com o campo <strong>Código do Cliente</strong> preenchido.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
