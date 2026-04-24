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

type FileStatus = 'ok' | 'sem_uc' | 'sem_referencia' | 'erro_ocr' | 'erro'
type UploadResult = 'ok' | 'erro_upload'

interface FilePreview {
  file: File
  filename: string
  size: number
  codigo_cliente?: string | null
  numero_uc?: string | null
  nome_cliente?: string | null
  referencia?: string | null
  valor?: string | null
  status: FileStatus
  motivo?: string
  path?: string
  resultado?: UploadResult
  publicUrl?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_LABEL: Record<FileStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ok:             { label: 'Pronto',            color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  sem_uc:         { label: 'UC não encontrada', color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  sem_referencia: { label: 'Sem referência',    color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  erro_ocr:       { label: 'Erro OCR',          color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3.5 w-3.5" /> },
  erro:           { label: 'Erro',              color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3.5 w-3.5" /> },
}

export default function UploadMassaPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  const resetTudo = () => { setPreviews([]); setUploadDone(false) }

  const processFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Selecione apenas arquivos PDF'); return }
    setLoading(true); setPreviews([]); setUploadDone(false)

    const fd = new FormData()
    fd.append('action', 'preview')
    pdfs.forEach(f => fd.append('files', f))

    try {
      const res = await fetch('/api/monitor-faturas/upload-historico', { method: 'POST', body: fd })
      const { resultados } = await res.json()
      setPreviews(resultados.map((r: any, i: number) => ({ ...r, file: pdfs[i] })))
    } catch { toast.error('Erro ao analisar arquivos') }
    finally { setLoading(false) }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }, [processFiles])

  const handleUpload = async () => {
    const prontos = previews.filter(p => p.status === 'ok')
    if (!prontos.length) { toast.error('Nenhum arquivo pronto'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('action', 'upload')
    prontos.forEach(p => fd.append('files', p.file))
    try {
      const res = await fetch('/api/monitor-faturas/upload-historico', { method: 'POST', body: fd })
      const { resultados } = await res.json()
      setPreviews(prev => prev.map(p => {
        const r = resultados.find((r: any) => r.filename === p.filename)
        return r ? { ...p, resultado: r.resultado, motivo: r.motivo, publicUrl: r.publicUrl } : p
      }))
      const ok = resultados.filter((r: any) => r.resultado === 'ok').length
      const erros = resultados.filter((r: any) => r.resultado === 'erro_upload').length
      toast.success(`${ok} fatura(s) enviada(s)${erros ? ` · ${erros} erro(s)` : ''}`)
      setUploadDone(true)
    } catch { toast.error('Erro durante o upload') }
    finally { setUploading(false) }
  }

  const prontos = previews.filter(p => p.status === 'ok').length
  const comProblema = previews.filter(p => p.status !== 'ok').length

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
          O sistema lê cada PDF e extrai o <strong>Código do Cliente</strong> (ex: 10/2272721-8),
          depois encontra a UC correspondente no cadastro. Funciona com o nome original da Energisa.
        </p>
        <p className="text-xs text-violet-500">
          ⚡ Cada arquivo passa pelo OCR — pode levar alguns segundos por PDF.
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
        <p className="text-sm text-slate-400 mt-1">Qualquer nome de arquivo — o OCR identifica automaticamente</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lendo faturas com OCR...
        </div>
      )}

      {/* Preview */}
      {previews.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-600 font-medium">{prontos} pronto(s)</span>
              {comProblema > 0 && <span className="text-amber-600">{comProblema} com problema</span>}
              <span className="text-slate-400">{previews.length} total</span>
            </div>
            {!uploadDone ? (
              <Button
                onClick={handleUpload}
                disabled={uploading || prontos === 0}
                size="sm"
                className="gap-1.5 bg-violet-600 hover:bg-violet-700"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Enviando...' : `Enviar ${prontos} fatura(s)`}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={resetTudo}>Novo lote</Button>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Arquivo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Cód. Cliente</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">UC encontrada</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Mês ref.</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previews.map((p) => {
                  const cfg = STATUS_LABEL[p.status] ?? STATUS_LABEL['erro']
                  const uploadOk  = p.resultado === 'ok'
                  const uploadErr = p.resultado === 'erro_upload'
                  return (
                    <tr key={p.filename} className={uploadOk ? 'bg-emerald-50/30' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <div>
                            <p className="font-mono text-xs text-slate-700 max-w-[180px] truncate" title={p.filename}>{p.filename}</p>
                            <p className="text-xs text-slate-400">{formatBytes(p.size)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {p.codigo_cliente || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {p.numero_uc || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[130px] truncate">
                        {p.nome_cliente || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.referencia || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.resultado ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                            uploadOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            uploadErr ? 'bg-red-50 text-red-700 border-red-200' :
                                        'bg-slate-50 text-slate-500 border-slate-200'
                          )}>
                            {uploadOk ? <><CheckCircle2 className="h-3.5 w-3.5" /> Enviado</> :
                             <><XCircle className="h-3.5 w-3.5" /> Erro</>}
                          </span>
                        ) : (
                          <div>
                            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.color)}>
                              {cfg.icon} {cfg.label}
                            </span>
                            {p.motivo && p.status !== 'ok' && (
                              <p className="text-xs text-slate-400 mt-1 max-w-[180px] leading-tight">{p.motivo}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!p.resultado && (
                          <button onClick={() => setPreviews(prev => prev.filter(x => x.filename !== p.filename))}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {uploadOk && p.publicUrl && (
                          <a href={p.publicUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline">ver</a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {comProblema > 0 && !uploadDone && (
            <p className="text-xs text-slate-400">
              UC não encontrada = o Código do Cliente detectado pelo OCR não tem correspondência.
              Verifique se a UC está cadastrada com o campo <strong>Código do Cliente</strong> preenchido.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
