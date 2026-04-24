'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FileText, CheckCircle2, XCircle, AlertCircle,
  ArrowLeft, Loader2, Trash2, Sparkles, Tag
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type FileStatus = 'ok' | 'sem_mes' | 'sem_uc' | 'sem_referencia' | 'erro_ocr' | 'erro'
type UploadResult = 'ok' | 'pulado' | 'erro_upload'
type Mode = 'padrao' | 'historico'

interface FilePreview {
  file: File
  filename: string
  size: number
  ucRaw?: string | null
  mesAno?: string | null
  unidade?: string | null
  nome_cliente?: string | null
  codigo_cliente?: string | null
  numero_uc?: string | null
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
  sem_mes:        { label: 'Sem mês',           color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  sem_uc:         { label: 'UC não encontrada', color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  sem_referencia: { label: 'Sem referência',    color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  erro_ocr:       { label: 'Erro OCR',          color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3.5 w-3.5" /> },
  erro:           { label: 'Erro',              color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3.5 w-3.5" /> },
}

export default function UploadMassaPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('padrao')
  const [dragging, setDragging] = useState(false)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  const resetTudo = () => { setPreviews([]); setUploadDone(false) }

  const processFiles = useCallback(async (files: File[], currentMode: Mode) => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Selecione apenas arquivos PDF'); return }
    setLoading(true); setPreviews([]); setUploadDone(false)

    const fd = new FormData()
    fd.append('action', 'preview')
    pdfs.forEach(f => fd.append('files', f))

    const endpoint = currentMode === 'historico'
      ? '/api/monitor-faturas/upload-historico'
      : '/api/monitor-faturas/upload-massa'

    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd })
      const { resultados } = await res.json()
      setPreviews(resultados.map((r: any, i: number) => ({ ...r, file: pdfs[i] })))
    } catch { toast.error('Erro ao analisar arquivos') }
    finally { setLoading(false) }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    processFiles(Array.from(e.dataTransfer.files), mode)
  }, [processFiles, mode])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files || []), mode)
    e.target.value = ''
  }, [processFiles, mode])

  const handleUpload = async () => {
    const prontos = previews.filter(p => p.status === 'ok')
    if (!prontos.length) { toast.error('Nenhum arquivo pronto'); return }
    setUploading(true)
    const fd = new FormData()
    fd.append('action', 'upload')
    prontos.forEach(p => fd.append('files', p.file))
    const endpoint = mode === 'historico'
      ? '/api/monitor-faturas/upload-historico'
      : '/api/monitor-faturas/upload-massa'
    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd })
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
      <div className="flex items-center gap-3">
        <Link href="/monitor-faturas">
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-500">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Upload de Faturas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Escolha o modo conforme o tipo de fatura</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {([
          { id: 'padrao', label: 'Padrão (com nome)', icon: Tag },
          { id: 'historico', label: 'Histórico (OCR automático)', icon: Sparkles },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setMode(id); resetTudo() }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Info */}
      {mode === 'padrao' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-blue-800">O nome do arquivo deve ter a UC e o mês de referência:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
            <div className="bg-white rounded border border-blue-200 p-2.5">
              <p className="text-xs font-medium text-blue-600 mb-1">✅ Formatos aceitos</p>
              <div className="space-y-1 font-mono text-xs text-slate-700">
                <p>728988051-06_04-2026.pdf</p>
                <p>665.868.051-44_04-2026.pdf</p>
                <p>1.316.247.051-48_04-2026.pdf</p>
              </div>
            </div>
            <div className="bg-white rounded border border-red-200 p-2.5">
              <p className="text-xs font-medium text-red-600 mb-1">❌ Não funciona</p>
              <div className="space-y-1 font-mono text-xs text-slate-400">
                <p>ENERGISAMS-ReFat-Matricula-...</p>
                <p>fatura_cliente_abril.pdf</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 text-sm space-y-1.5">
          <p className="font-medium text-violet-800 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" /> Modo Histórico — suba com qualquer nome
          </p>
          <p className="text-violet-700">
            A IA lê o PDF e encontra o <strong>Código do Cliente</strong> automaticamente (ex: 10/2272721-8),
            depois localiza a UC correspondente no banco. Ideal para faturas antigas direto da Energisa.
          </p>
          <p className="text-xs text-violet-500">
            ⚡ Cada arquivo passa pelo OCR — pode levar alguns segundos por PDF.
          </p>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          dragging
            ? mode === 'historico' ? 'border-violet-400 bg-violet-50' : 'border-blue-400 bg-blue-50'
            : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        )}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden" onChange={onFileInput} />
        {mode === 'historico'
          ? <Sparkles className={cn('h-10 w-10 mx-auto mb-3', dragging ? 'text-violet-500' : 'text-slate-400')} />
          : <Upload className={cn('h-10 w-10 mx-auto mb-3', dragging ? 'text-blue-500' : 'text-slate-400')} />
        }
        <p className="font-medium text-slate-700">Arraste os PDFs aqui ou clique para selecionar</p>
        <p className="text-sm text-slate-400 mt-1">
          {mode === 'historico' ? 'Qualquer nome — o OCR identifica automaticamente' : 'Nome deve conter UC e mês'}
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {mode === 'historico' ? 'Lendo faturas com OCR (pode demorar alguns segundos)...' : 'Analisando arquivos...'}
        </div>
      )}

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
                className={cn('gap-1.5', mode === 'historico' && 'bg-violet-600 hover:bg-violet-700')}
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
                  {mode === 'historico' && <th className="text-left px-4 py-2.5 font-medium text-slate-600">Cód. Cliente</th>}
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">UC</th>
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
                  const uc = mode === 'historico' ? p.numero_uc : p.unidade
                  const mes = mode === 'historico' ? p.referencia : p.mesAno
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
                      {mode === 'historico' && (
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          {p.codigo_cliente || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {uc || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[130px] truncate">
                        {p.nome_cliente || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {mes || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.resultado ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                            uploadOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            uploadErr ? 'bg-red-50 text-red-700 border-red-200' :
                                        'bg-slate-50 text-slate-500 border-slate-200'
                          )}>
                            {uploadOk  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Enviado</> :
                             uploadErr ? <><XCircle className="h-3.5 w-3.5" /> Erro</> : p.motivo}
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
              {mode === 'historico'
                ? 'UC não encontrada = o Código do Cliente detectado pelo OCR não tem correspondência. Verifique se a UC tem o campo "Código do Cliente" preenchido no cadastro.'
                : 'Arquivos com problema serão ignorados. Renomeie no formato UC_MM-YYYY e adicione novamente.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
