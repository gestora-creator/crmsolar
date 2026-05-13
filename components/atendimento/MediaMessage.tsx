'use client'

/**
 * MediaMessage — render unificado de mídia em mensagens WhatsApp.
 *
 * Resolve a dor histórica: arquivos baixavam como `.enc` (URL Baileys
 * criptografada). Quando uma mensagem chega com message_id mas sem
 * media_url, o componente dispara em background o endpoint
 * /api/atendimento/midia/[id]/baixar — que descriptografa via Evolution
 * e sobe no Storage. O componente trata os 3 estados (loading, erro,
 * sucesso) e renderiza por tipo (image/video/audio/document/sticker).
 *
 * Cache local por message_id no escopo do módulo (sobrevive entre
 * renders, mas é descartado no full reload — suficiente).
 *
 * NÃO conhece a estrutura inteira da mensagem — recebe via prop o
 * mínimo necessário. Integração no app/(app)/atendimento/page.tsx
 * fica pro próximo commit (page.tsx tem 1615 linhas, prefiro PR
 * separado).
 */

import { useEffect, useState, useCallback } from 'react'
import { Download, FileText, AlertCircle, Loader2 } from 'lucide-react'

export type MediaMessageProps = {
  /** id numérico da linha em whatsapp_messages (bigint) */
  id: number
  /** tipo da mensagem — define o componente de render */
  tipo: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  /** URL já descriptografada se disponível. Quando ausente, dispara baixar. */
  media_url?: string | null
  media_mimetype?: string | null
  media_filename?: string | null
  /** legenda opcional (caption) */
  conteudo?: string | null
  /** classe extra pro container externo */
  className?: string
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; url: string; mimetype: string | null; filename: string | null }
  | { kind: 'error'; message: string }

const cache = new Map<number, { url: string; mimetype: string | null; filename: string | null }>()

async function fetchMediaUrl(id: number): Promise<{
  url: string
  mimetype: string | null
  filename: string | null
}> {
  const res = await fetch(`/api/atendimento/midia/${id}/baixar`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  const json = (await res.json()) as {
    url: string
    mimetype?: string | null
    filename?: string | null
  }
  return {
    url: json.url,
    mimetype: json.mimetype ?? null,
    filename: json.filename ?? null,
  }
}

export function MediaMessage(props: MediaMessageProps) {
  const { id, tipo, media_url, media_mimetype, media_filename, conteudo, className } = props

  const [state, setState] = useState<FetchState>(() => {
    if (media_url) return { kind: 'ok', url: media_url, mimetype: media_mimetype ?? null, filename: media_filename ?? null }
    const cached = cache.get(id)
    if (cached) return { kind: 'ok', ...cached }
    return { kind: 'idle' }
  })

  const triggerFetch = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const r = await fetchMediaUrl(id)
      cache.set(id, r)
      setState({ kind: 'ok', ...r })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Falha ao carregar mídia',
      })
    }
  }, [id])

  useEffect(() => {
    if (state.kind === 'idle') {
      void triggerFetch()
    }
  }, [state.kind, triggerFetch])

  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div
        className={
          'flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground ' +
          (className ?? '')
        }
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando mídia…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div
        className={
          'flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm ' +
          (className ?? '')
        }
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          Falha ao carregar mídia
        </div>
        <p className="text-xs text-muted-foreground">{state.message}</p>
        <button
          type="button"
          onClick={() => void triggerFetch()}
          className="self-start rounded bg-destructive/20 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/30"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // state.kind === 'ok'
  const { url, mimetype, filename } = state
  const mt = (mimetype || media_mimetype || '').toLowerCase()
  const renderTipo =
    tipo ||
    (mt.startsWith('image/') ? 'image' :
     mt.startsWith('video/') ? 'video' :
     mt.startsWith('audio/') ? 'audio' :
     'document')

  return (
    <div className={'flex flex-col gap-1 ' + (className ?? '')}>
      {renderTipo === 'image' || renderTipo === 'sticker' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={filename || 'imagem'}
          className="max-h-80 max-w-full rounded-md object-contain"
          loading="lazy"
        />
      ) : renderTipo === 'video' ? (
        <video src={url} controls className="max-h-80 max-w-full rounded-md" preload="metadata" />
      ) : renderTipo === 'audio' ? (
        <audio src={url} controls className="w-full" preload="metadata" />
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={filename || undefined}
          className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          <FileText className="h-4 w-4" />
          <span className="flex-1 truncate">{filename || 'documento'}</span>
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
      )}

      {conteudo && (
        <p className="text-sm whitespace-pre-wrap break-words">{conteudo}</p>
      )}
    </div>
  )
}

export default MediaMessage
