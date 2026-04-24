'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Trash2, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface FileResult {
  file: File
  filename: string
  mesAno: string          // sempre preenchido: do nome ou do seletor
  resultado?: 'ok' | 'erro'
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

// Gera lista de meses dos últimos 3 anos + próximos 2 meses
function gerarMeses(): { value: string; label: string }[] {
  const meses = []
  const hoje = new Date()
  // 36 meses atrás até 2 meses à frente
  for (let delta = -35; delta <= 2; delta++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + delta, 1)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    meses.push({
      value: `${mm}-${yyyy}`,
      label: `${LABELS[d.getMonth()]}/${yyyy}`,
    })
  }
  return meses.reverse() // mais recente primeiro
}

// Tenta extrair mês/ano do nome do arquivo
const MESES_MAP: Record<string, string> = {
  jan:'01',janeiro:'01',fev:'02',fevereiro:'02',mar:'03','março':'03',marco:'03',
  abr:'04',abril:'04',mai:'05',maio:'05',jun:'06',junho:'06',
  jul:'07',julho:'07',ago:'08',agosto:'08',set:'09',setembro:'09',
  out:'10',outubro:'10',nov:'11',novembro:'11',dez:'12',dezembro:'12',
}

function extractMesAno(filename: string): string | null {
  const name = filename.replace(/\.pdf$/i, '').toLowerCase()
  const m1 = name.match(/(?<![0-9])(0[1-9]|1[0-2])[-_](20\d{2})(?![0-9])/)
  if (m1) return `${m1[1]}-${m1[2]}`
  const m2 = name.match(/(?<![0-9])(20\d{2})[-_](0[1-9]|1[0-2])(?![0-9])/)
  if (m2) return `${m2[2]}-${m2[1]}`
  const anoM = name.match(/(20\d{2})/)
  if (anoM) {
    for (const [nome, num] of Object.entries(MESES_MAP)) {
      if (name.includes(nome)) return `${num}-${anoM[1]}`
    }
  }
  return null
}

function mesLabel(mesAno: string) {
  const [m, a] = mesAno.split('-')
  const LABELS = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${LABELS[parseInt(m)] || m}/${a}`
}

const MESES_OPTIONS = gerarMeses()

// Mês padrão = mês atual
function mesAtual() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

export function UCUpload({ unidade, onUploadComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [mesSelecionado, setMesSelecionado] = useState<string>(mesAtual())
  const [files, setFiles] = useState<FileResult[]>([])
  const [uploading, setUploading] = useState(false)

  const addFiles = useCallback((incoming: File[]) => {
    const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) { toast.error('Apenas arquivos PDF'); return }

    setFiles(prev => {
      const existentes = new Set(prev.map(p => p.filename))
      const novos: FileResult[] = pdfs
        .filter(f => !existentes.has(f.name))
        .map(f => ({
          file: f,
          filename: f.name,
          // Tenta extrair do nome, senão usa o seletor
          mesAno: extractMesAno(f.name) || mesSelecionado,
        }))
      return [...prev, ...novos]
    })
  }, [mesSelecionado])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const remover = (filename: string) =>
    setFiles(prev => prev.filter(f => f.filename !== filename))

  // Atualiza mês de um arquivo específico
  const updateMes = (filename: string, mes: string) =>
    setFiles(prev => prev.map(f => f.filename === filename ? { ...f, mesAno: mes } : f))

  const prontos = files.filter(f => !f.resultado)

  const handleUpload = async () => {
    if (!prontos.length) { toast.error('Nenhum arquivo para enviar'); return }
    setUploading(true)
    let totalOk = 0

    for (const f of prontos) {
      try {
        // Renomear o arquivo para o backend detectar o mês
        const renamed = new File([f.file], `${f.mesAno}.pdf`, { type: 'application/pdf' })
        const fd = new FormData()
        fd.append('files', renamed)

        const res = await fetch(`/api/unidades/${encodeURIComponent(unidade)}/upload`, {
          method: 'POST', body: fd,
        })

        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setFiles(prev => prev.map(p => p.filename === f.filename
            ? { ...p, resultado: 'erro', motivo: json?.error || `Erro ${res.status}` } : p))
          continue
        }

        const r = json?.resultados?.[0]
        setFiles(prev => prev.map(p => p.filename === f.filename
          ? { ...p, resultado: r?.resultado === 'ok' ? 'ok' : 'erro', motivo: r?.motivo, publicUrl: r?.publicUrl } : p))
        if (r?.resultado === 'ok') totalOk++
      } catch (e: any) {
        setFiles(prev => prev.map(p => p.filename === f.filename
          ? { ...p, resultado: 'erro', motivo: e?.message || 'erro' } : p))
      }
    }

    setUploading(false)
    if (totalOk > 0) {
      toast.success(`${totalOk} fatura${totalOk > 1 ? 's' : ''} enviada${totalOk > 1 ? 's' : ''}!`)
      onUploadComplete?.()
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
          Suba a fatura e selecione o mês de referência
        </p>
      </CardHeader>
      <CardContent className="space-y-3">

        {/* Seletor de mês padrão */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-600 font-medium">Mês de referência:</span>
          <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
            <SelectTrigger className="h-7 w-32 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES_OPTIONS.map(m => (
                <SelectItem key={m.value} value={m.value} className="text-xs font-mono">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-400">aplicado a novos arquivos</span>
        </div>

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
          <p className="text-[11px] text-slate-400 mt-0.5">qualquer nome de arquivo</p>
        </div>

        {/* Lista de arquivos */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map(f => {
              const ok   = f.resultado === 'ok'
              const erro = f.resultado === 'erro'
              return (
                <div key={f.filename} className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                  ok   ? 'bg-emerald-50 border-emerald-200' :
                  erro ? 'bg-red-50 border-red-200' :
                         'bg-white border-slate-200'
                )}>
                  <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 font-mono truncate text-slate-700 min-w-0" title={f.filename}>
                    {f.filename}
                  </span>
                  <span className="text-slate-400 flex-shrink-0 text-[10px]">{formatBytes(f.file.size)}</span>

                  {/* Seletor de mês por arquivo (se não enviado ainda) */}
                  {!f.resultado && (
                    <Select value={f.mesAno} onValueChange={v => updateMes(f.filename, v)}>
                      <SelectTrigger className="h-6 w-24 text-[10px] font-mono px-2 border-blue-200 bg-blue-50 text-blue-700 flex-shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MESES_OPTIONS.map(m => (
                          <SelectItem key={m.value} value={m.value} className="text-xs font-mono">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {ok && (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium flex-shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {mesLabel(f.mesAno)}
                    </span>
                  )}
                  {erro && (
                    <span className="flex items-center gap-1 text-red-600 flex-shrink-0" title={f.motivo}>
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
