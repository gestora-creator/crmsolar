'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle2, XCircle, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FileResult {
  file: File
  filename: string
  mesAno: string | null
  resultado?: 'ok' | 'sem_mes' | 'erro'
  motivo?: string
  publicUrl?: string
}

interface Props {
  unidade: string
  onUploadComplete?: () => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Extrai mês/ano do nome para preview local (mesma lógica do backend)
const MESES: Record<string, string> = {
  jan: '01', janeiro: '01', fev: '02', fevereiro: '02',
  mar: '03', março: '03', marco: '03', abr: '04', abril: '04',
  mai: '05', maio: '05', jun: '06', junho: '06',
  jul: '07', julho: '07', ago: '08', agosto: '08',
  set: '09', setembro: '09', out: '10', outubro: '10',
  nov: '11', novembro: '11', dez: '12', dezembro: '12',
}

function extractMesAno(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '').toLowerCase()
  const numMatch = name.match(/(?<![0-9])(0[1-9]|1[0-2])[-_](20\d{2})(?![0-9])/)
  if (numMatch) return `${numMatch[1]}-${numMatch[2]}`
  const anoMatch = name.match(/(20\d{2})/)
  if (anoMatch) {
    const ano = anoMatch[1]
    for (const [nome, num] of Object.entries(MESES)) {
      if (name.includes(nome)) return `${num}-${ano}`
    }
  }
  return null
}

const MES_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
}

function mesLabel(mesAno: string | null) {
  if (!mesAno) return null
  const [m, a] = mesAno.split('-')
  return `${MES_LABEL[m] || m}/${a}`
}

export function UCUpload({ unidade, onUploadComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileResult[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback((incoming: File[]) => {
    const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Apenas arquivos PDF'); return }

    const novos: FileResult[] = pdfs.map(f => ({
      file: f,
      filename: f.name,
      mesAno: extractMesAno(f.name),
    }))
    setFiles(prev => {
      // evitar duplicatas pelo nome
      const existentes = new Set(prev.map(p => p.filename))
      return [...prev, ...novos.filter(n => !existentes.has(n.filename))]
    })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const remover = (filename: string) =>
    setFiles(prev => prev.filter(f => f.filename !== filename))

  const prontos = files.filter(f => f.mesAno && !f.resultado)
  const semMes = files.filter(f => !f.mesAno && !f.resultado)

  const handleUpload = async () => {
    if (!prontos.length) { toast.error('Nenhum arquivo com mês identificado'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      prontos.forEach(f => fd.append('files', f.file))

      const res = await fetch(`/api/unidades/${encodeURIComponent(unidade)}/upload`, {
        method: 'POST', body: fd,
      })
      const json = await res.json()

      setFiles(prev => prev.map(f => {
        const r = json.resultados?.find((r: any) => r.filename === f.filename)
        return r ? { ...f, resultado: r.resultado, motivo: r.motivo, publicUrl: r.publicUrl } : f
      }))

      const ok = json.resultados?.filter((r: any) => r.resultado === 'ok').length || 0
      if (ok > 0) {
        toast.success(`${ok} fatura${ok > 1 ? 's' : ''} enviada${ok > 1 ? 's' : ''}!`)
        onUploadComplete?.()
      }
    } catch {
      toast.error('Erro durante o upload')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-500" />
          Upload de Faturas
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Nomeie o arquivo com o mês/ano e arraste aqui.{' '}
          <span className="font-medium text-slate-600">Ex: 04-2026.pdf · abril-2026.pdf · fatura_04_2026.pdf</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-lg py-6 text-center cursor-pointer transition-colors',
            dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          )}
        >
          <input ref={inputRef} type="file" multiple accept=".pdf"
            className="hidden" onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = '' }} />
          <Upload className={cn('h-6 w-6 mx-auto mb-1.5', dragging ? 'text-blue-500' : 'text-slate-300')} />
          <p className="text-xs font-medium text-slate-600">Arraste os PDFs aqui</p>
          <p className="text-[11px] text-slate-400 mt-0.5">ou clique para selecionar</p>
        </div>

        {/* Lista de arquivos */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map(f => {
              const label = mesLabel(f.mesAno)
              const ok = f.resultado === 'ok'
              const erro = f.resultado === 'erro'
              const semM = !f.mesAno

              return (
                <div key={f.filename} className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                  ok ? 'bg-emerald-50 border-emerald-200' :
                  erro ? 'bg-red-50 border-red-200' :
                  semM ? 'bg-amber-50 border-amber-200' :
                  'bg-white border-slate-200'
                )}>
                  <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />

                  <span className="flex-1 font-mono truncate text-slate-700" title={f.filename}>
                    {f.filename}
                  </span>

                  <span className="text-slate-400 flex-shrink-0">{formatBytes(f.file.size)}</span>

                  {/* Badge do mês */}
                  {label && !f.resultado && (
                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                      {label}
                    </span>
                  )}
                  {semM && !f.resultado && (
                    <span className="flex items-center gap-1 text-amber-600 flex-shrink-0">
                      <AlertCircle className="h-3 w-3" /> sem mês
                    </span>
                  )}
                  {ok && (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium flex-shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {label}
                    </span>
                  )}
                  {erro && (
                    <span className="flex items-center gap-1 text-red-600 flex-shrink-0">
                      <XCircle className="h-3 w-3" /> erro
                    </span>
                  )}

                  {!f.resultado && (
                    <button onClick={() => remover(f.filename)}
                      className="p-0.5 rounded hover:bg-slate-100 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  {ok && f.publicUrl && (
                    <a href={f.publicUrl} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:underline flex-shrink-0">ver</a>
                  )}
                </div>
              )
            })}

            {/* Aviso sem mês */}
            {semMes.length > 0 && (
              <p className="text-[11px] text-amber-600 px-1">
                ⚠️ {semMes.length} arquivo{semMes.length > 1 ? 's' : ''} sem mês identificado — renomeie e adicione novamente.
              </p>
            )}

            {/* Botão */}
            {prontos.length > 0 && (
              <Button onClick={handleUpload} disabled={uploading}
                size="sm" className="w-full gap-1.5 h-8 mt-1">
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                  : <><Upload className="h-3.5 w-3.5" /> Enviar {prontos.length} fatura{prontos.length > 1 ? 's' : ''}</>
                }
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
