'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { FileUp, Sun, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
  unidade: string
  nomeCliente: string
}

interface UploadResult {
  storage_path?: string
  public_url?: string
  webhook_response?: {
    status?: string
    uc_geradora?: string
    nome_cliente?: string
    referencia?: string
    historico_meses?: number
    beneficiarias_aplicadas?: number
    beneficiarias_extraidas?: number
    beneficiarias_nao_encontradas?: Array<{ uc_digits: string; percentual: number }>
    percentual_total_aplicado?: number
    avisos?: string[]
    erro?: string
  }
  error?: string
}

export function UCDemonstrativoUpload({ unidade, nomeCliente }: Props) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [mesRef, setMesRef] = useState('')   // opcional: MM/YYYY
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setMesRef('')
    setResult(null)
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleClose = () => {
    if (uploading) return
    setOpen(false)
    setTimeout(reset, 300)
  }

  const handleSubmit = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('cliente', nomeCliente)
      fd.append('uc_geradora', unidade)
      if (mesRef) fd.append('mes_referencia', mesRef)

      const resp = await fetch('/api/demonstrativos/upload', { method: 'POST', body: fd })
      const data: UploadResult = await resp.json()
      if (!resp.ok) {
        setError(data.error || `Erro ${resp.status}`)
        setResult(data)
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e.message || 'Erro inesperado')
    } finally {
      setUploading(false)
    }
  }

  const wr = result?.webhook_response

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-600" />
            Demonstrativo de Compensação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Suba o PDF do Demonstrativo de Compensação de Energia Injetada da Energisa.
            O sistema atualiza automaticamente o histórico de geração e o rateio entre as beneficiárias.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="gap-1.5"
          >
            <FileUp className="h-3.5 w-3.5" />
            Subir Demonstrativo
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-600" />
              Demonstrativo da geradora {unidade}
            </DialogTitle>
          </DialogHeader>

          {!result && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Arquivo PDF</label>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="mt-1 block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:cursor-pointer hover:file:bg-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Mês de referência <span className="text-muted-foreground/70">(opcional — ex: 03/2026)</span>
                </label>
                <input
                  type="text"
                  value={mesRef}
                  onChange={e => setMesRef(e.target.value)}
                  placeholder="03/2026"
                  disabled={uploading}
                  className="mt-1 block w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Se não informado, o sistema extrai do próprio PDF.
                </p>
              </div>

              {error && (
                <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {result && wr && (
            <div className="space-y-3">
              {wr.status === 'ok' ? (
                <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Demonstrativo processado
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">UC:</span> {wr.uc_geradora}</div>
                    <div><span className="text-muted-foreground">Referência:</span> {wr.referencia}</div>
                    <div><span className="text-muted-foreground">Meses gravados:</span> <strong>{wr.historico_meses}</strong></div>
                    <div><span className="text-muted-foreground">% alocada:</span> <strong>{wr.percentual_total_aplicado}%</strong></div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Beneficiárias:</span>{' '}
                      <strong>{wr.beneficiarias_aplicadas}/{wr.beneficiarias_extraidas}</strong> aplicadas
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Falha no processamento
                  </div>
                  <p className="mt-1 text-xs text-destructive/90">{wr.erro || result.error}</p>
                </div>
              )}

              {wr.beneficiarias_nao_encontradas && wr.beneficiarias_nao_encontradas.length > 0 && (
                <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Beneficiárias não cadastradas — rateio parcial
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    {wr.beneficiarias_nao_encontradas.map((b, i) => (
                      <div key={i} className="text-[11px] flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] py-0 h-4">{b.percentual}%</Badge>
                        <span className="font-mono">{b.uc_digits}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                    Cadastre essas UCs e suba o demonstrativo de novo pra completar o rateio.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {!result && (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose} disabled={uploading}>Cancelar</Button>
                <Button size="sm" onClick={handleSubmit} disabled={!file || uploading} className="gap-1.5">
                  {uploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando…</>
                  ) : (
                    <><FileUp className="h-3.5 w-3.5" /> Processar</>
                  )}
                </Button>
              </>
            )}
            {result && (
              <>
                <Button variant="ghost" size="sm" onClick={reset}>Subir outro</Button>
                <Button size="sm" onClick={handleClose}>Fechar</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
