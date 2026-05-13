'use client'

/**
 * MediaPreview — componente unificado de mídia. Recebe mimetype + url
 * + filename e renderiza o player/preview adequado.
 *
 * Cobre os 5 casos do briefing (image, pdf, audio, video, outros) e
 * MANTÉM as features avançadas que já existiam inline no page.tsx:
 *   - PDF: iframe inline com preview real (não só "ícone + abrir")
 *   - Office (docx/xlsx/pptx): Office Web Viewer
 *   - Sticker (image/webp): render quadrado sem bubble
 *   - Image: lazy loading + clique pra ampliar
 *   - Audio: <audio controls> nativo (versão simples; AudioPlayer custom
 *     com velocidade+transcricao continua sendo um componente separado
 *     usado pelo page.tsx)
 *
 * Status: PRONTO PARA USO em novas telas (galeria, anexos do cliente,
 * preview de proposta, etc). A migração do render inline do page.tsx
 * para este componente fica para PR separado dedicado, pois exige
 * refactor cuidadoso do MessageBubble (200+ linhas) e teste de
 * regressão em todos os 5 tipos.
 */

import { useState } from 'react'
import { Download, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MediaPreviewProps {
  /** URL renderizável da mídia (Storage Supabase, data: URL, etc) */
  url: string
  /** MIME type — usado para escolher o render correto */
  mimetype: string
  /** Nome original do arquivo (usado no atributo `download`) */
  filename?: string | null
  /** Texto/legenda opcional renderizada abaixo da mídia */
  caption?: string | null
  /** Classes extras no container externo */
  className?: string
  /** Tamanho máximo de imagens (default 240px conforme briefing) */
  maxImageWidth?: number
}

function classifyMime(mt: string): 'image' | 'video' | 'audio' | 'pdf' | 'office' | 'other' {
  const m = (mt || '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m.includes('pdf')) return 'pdf'
  if (
    m.includes('word') || m.includes('msword') ||
    m.includes('sheet') || m.includes('excel') ||
    m.includes('presentation') || m.includes('powerpoint')
  ) return 'office'
  return 'other'
}

function officeDocMeta(mt: string): { color: string; label: string } {
  const m = mt.toLowerCase()
  if (m.includes('pdf')) return { color: 'text-rose-500 bg-rose-500/10', label: 'PDF' }
  if (m.includes('word') || m.includes('msword')) return { color: 'text-blue-500 bg-blue-500/10', label: 'DOC' }
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return { color: 'text-emerald-500 bg-emerald-500/10', label: 'XLS' }
  if (m.includes('presentation') || m.includes('powerpoint')) return { color: 'text-orange-500 bg-orange-500/10', label: 'PPT' }
  return { color: 'text-muted-foreground bg-muted', label: 'DOC' }
}

export function MediaPreview({
  url,
  mimetype,
  filename,
  caption,
  className,
  maxImageWidth = 240,
}: MediaPreviewProps) {
  const kind = classifyMime(mimetype)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* IMAGE — incl. sticker (image/webp) */}
      {kind === 'image' && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename || 'imagem'}
            loading="lazy"
            onClick={() => setExpanded(true)}
            className="cursor-zoom-in rounded-lg object-cover max-h-[300px]"
            style={{ maxWidth: `${maxImageWidth}px` }}
          />
          {expanded && (
            <div
              role="dialog"
              aria-modal="true"
              onClick={() => setExpanded(false)}
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={filename || 'imagem ampliada'}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}
        </>
      )}

      {/* VIDEO */}
      {kind === 'video' && (
        <video
          src={url}
          controls
          preload="metadata"
          className="rounded-lg max-w-full max-h-[300px]"
        />
      )}

      {/* AUDIO — versão simples. AudioPlayer custom (velocidade + transcricao)
          é componente separado, usado pelo page.tsx para mensagens. */}
      {kind === 'audio' && (
        <audio src={url} controls preload="metadata" className="w-full" />
      )}

      {/* PDF — iframe inline (preview real) + link "Abrir" com download attribute */}
      {kind === 'pdf' && (
        <div className="max-w-[420px]">
          <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
            <iframe
              src={`${url}#view=FitH&toolbar=0&navpanes=0`}
              title={filename || 'PDF'}
              className="w-full h-[280px] bg-white"
            />
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={filename || 'documento.pdf'}
            className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', 'text-rose-500 bg-rose-500/10')}>
              <FileText className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium truncate">{filename || 'documento.pdf'}</p>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>
        </div>
      )}

      {/* OFFICE — preview via Office Web Viewer (suporta docx/xlsx/pptx público) */}
      {kind === 'office' && (() => {
        const meta = officeDocMeta(mimetype)
        const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
        return (
          <div className="max-w-[420px]">
            <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
              <iframe
                src={officeUrl}
                title={filename || 'Documento'}
                className="w-full h-[280px] bg-white"
              />
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download={filename || 'documento'}
              className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', meta.color)}>
                <FileText className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate">{filename || 'documento'}</p>
              </div>
              <Download className="h-3 w-3 text-muted-foreground" />
            </a>
          </div>
        )
      })()}

      {/* OTHER — ícone genérico + nome */}
      {kind === 'other' && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={filename || 'arquivo'}
          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate">{filename || 'arquivo'}</span>
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
      )}

      {caption && (
        <p className="text-sm whitespace-pre-wrap break-words">{caption}</p>
      )}
    </div>
  )
}

export default MediaPreview
