'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'

type FileStatus = 'ok' | 'sem_mes' | 'sem_uc' | 'erro'
type UploadResult = 'ok' | 'pulado' | 'erro_upload'

interface FilePreview {
  file: File
  filename: string
  size: number
  ucRaw: string | null
  mesAno: string | null
  unidade: string | null
  nome_cliente: string | null
  status: FileStatus
  // após upload:
  resultado?: UploadResult
  motivo?: string
  publicUrl?: string
}

const STATUS_CONFIG: Record<FileStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ok:       { label: 'Pronto',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  sem_mes:  { label: 'Sem mês',    color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  sem_uc:   { label: 'UC não encontrada', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertCircle className="h-3.5 w-3.5" /> },
  erro:     { label: 'Erro',        color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="h-3.5 w-3.5" /> },
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadMassaPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [previews, setPreviews] = useState<FilePreview[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)

  const processFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Selecione apenas arquivos PDF'); return }

    setLoading(true)
    setPreviews([])
    setUploadDone(false)

    const fd = new FormData()
    fd.append('action', 'preview')
    pdfs.forEach(f => fd.append('files', f))

    try {
      const res = await fetch('/api/monitor-faturas/upload-massa', { method: 'POST', body: fd })
      const { resultados } = await res.json()

      const merged: FilePreview[] = resultados.map((r: any, i: number) => ({
        ...r,
        file: pdfs[i],
      }))
      setPreviews(merged)
    } catch {
      toast.error('Erro ao analisar arquivos')
    } finally {
      setLoading(false)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    processFiles(files)
  }, [processFiles])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    processFiles(files)
    e.target.value = ''
  }, [processFiles])

  const removeFile = (filename: string) => {
    setPreviews(prev => prev.filter(p => p.filename !== filename))
  }

  const handleUpload = async () => {
    const prontos = previews.filter(p => p.status === 'ok')
    if (!prontos.length) { toast.error('Nenhum arquivo pronto para upload'); return }

    setUploading(true)
    const fd = new FormData()
    fd.append('action', 'upload')
    prontos.forEach(p => fd.append('files', p.file))

    try {
      const res = await fetch('/api/monitor-faturas/upload-massa', { method: 'POST', body: fd })
      const { resultados } = await res.json()

      setPreviews(prev => prev.map(p => {
        const r = resultados.find((r: any) => r.filename === p.filename)
        return r ? { ...p, resultado: r.resultado, motivo: r.motivo, publicUrl: r.publicUrl } : p
      }))

      const ok = resultados.filter((r: any) => r.resultado === 'ok').length
      const erros = resultados.filter((r: any) => r.resultado === 'erro_upload').length
      toast.success(`${ok} fatura(s) enviada(s) com sucesso${erros ? ` · ${erros} erro(s)` : ''}`)
      setUploadDone(true)
    } catch {
      toast.error('Erro durante o upload')
    } finally {
      setUploading(false)
    }
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
          <h1 className="text-xl font-semibold">Upload em Massa de Faturas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            O sistema detecta automaticamente a UC e o mês pelo nome do arquivo
          </p>
        </div>
      </div>

      {/* Formatos suportados */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2">
        <p className="font-medium text-blue-800">Como renomear os arquivos antes de subir:</p>
        <p className="text-blue-700">O nome do arquivo deve conter o <strong>número da UC</strong> (como aparece no sistema) e o <strong>mês de referência</strong>.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <div className="bg-white rounded border border-blue-200 p-2.5">
            <p className="text-xs font-medium text-blue-600 mb-1">✅ Formatos aceitos</p>
            <div className="space-y-1 font-mono text-xs text-slate-700">
              <p>728988051-06_04-2026.pdf</p>
              <p>1.316.247.051-48_04-2026.pdf</p>
              <p>04-2026_728988051-06.pdf</p>
            </div>
          </div>
          <div className="bg-white rounded border border-red-200 p-2.5">
            <p className="text-xs font-medium text-red-600 mb-1">❌ Não funciona</p>
            <div className="space-y-1 font-mono text-xs text-slate-400">
              <p>ENERGISAMS-ReFat-Matricula-...</p>
              <p>fatura_cliente_abril.pdf</p>
              <p>documento.pdf</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-blue-600 mt-1">
          O número da UC está na sua conta de energia ou na coluna <strong>Unidade</strong> do sistema.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf" className="hidden" onChange={onFileInput} />
        <Upload className={`h-10 w-10 mx-auto mb-3 ${dragging ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="font-medium text-slate-700">Arraste os PDFs aqui</p>
        <p className="text-sm text-slate-400 mt-1">ou clique para selecionar múltiplos arquivos</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analisando arquivos...
        </div>
      )}

      {/* Preview table */}
      {previews.length > 0 && (
        <div className="space-y-3">
          {/* Resumo */}
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-600 font-medium">{prontos} pronto(s)</span>
              {comProblema > 0 && <span className="text-amber-600">{comProblema} com problema</span>}
              <span className="text-slate-400">{previews.length} total</span>
            </div>
            {!uploadDone && (
              <Button
                onClick={handleUpload}
                disabled={uploading || prontos === 0}
                size="sm"
                className="gap-1.5"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Enviando...' : `Enviar ${prontos} fatura(s)`}
              </Button>
            )}
            {uploadDone && (
              <Button variant="outline" size="sm" onClick={() => { setPreviews([]); setUploadDone(false) }}>
                Novo lote
              </Button>
            )}
          </div>

          {/* Tabela */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Arquivo</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">UC detectada</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Cliente</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Mês</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previews.map((p) => {
                  const cfg = STATUS_CONFIG[p.status]
                  const uploadOk = p.resultado === 'ok'
                  const uploadErr = p.resultado === 'erro_upload'
                  const pulado = p.resultado === 'pulado'

                  return (
                    <tr key={p.filename} className={uploadOk ? 'bg-emerald-50/30' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <div>
                            <p className="font-mono text-xs text-slate-700 max-w-[220px] truncate" title={p.filename}>
                              {p.filename}
                            </p>
                            <p className="text-xs text-slate-400">{formatBytes(p.size)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {p.unidade || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {p.nome_cliente || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {p.mesAno || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.resultado ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                            uploadOk  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            uploadErr ? 'bg-red-50 text-red-700 border-red-200' :
                                        'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                            {uploadOk  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Enviado</> :
                             uploadErr ? <><XCircle className="h-3.5 w-3.5" /> Erro</> :
                                         p.motivo}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!p.resultado && (
                          <button
                            onClick={() => removeFile(p.filename)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400"
                          >
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

          {/* Legenda dos problemas */}
          {comProblema > 0 && !uploadDone && (
            <p className="text-xs text-slate-400">
              Arquivos com problema serão ignorados no upload. Renomeie-os seguindo os formatos acima e adicione novamente.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
