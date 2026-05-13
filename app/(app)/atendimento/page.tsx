'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search, Send, Paperclip, Bot, Clock,
  ArrowLeft, Loader2, MessageSquare, UserCheck, AlertCircle,
  Image as ImageIcon, FileText, Mic, Video, MapPin, Check, CheckCheck,
  MoreVertical, XCircle, RefreshCw, Trash2, Eye, ShieldAlert,
  Play, Pause, Copy, Reply, ArrowDown,
  MessageSquarePlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase as supabaseRealtime } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'
import NovaConversaDialog from '@/components/atendimento/NovaConversaDialog'
import { isUsableMediaUrl } from '@/lib/whatsapp/evolution-types'

// ============================================================
// TIPOS
// ============================================================
interface Session {
  jid: string
  status: string
  cliente_id: string | null
  contato_id: string | null
  nome_contato: string | null
  foto_url: string | null
  atendente_id: string | null
  atendente_nome: string | null
  atendente_email: string | null
  atendente_avatar_url: string | null
  motivo_escalacao: string | null
  ultima_msg_em: string | null
  escalado_em: string | null
  total_msgs_nao_lidas: number
  empresa?: string | null
  ultima_msg?: string | null
  ultima_msg_tipo?: string | null
}

interface Message {
  id: number
  jid: string
  direcao: string
  tipo: string
  conteudo: string | null
  media_url: string | null
  media_mimetype: string | null
  media_filename: string | null
  remetente: string
  remetente_nome: string | null
  transcricao: string | null
  descricao_ia: string | null
  status: string
  lida: boolean
  created_at: string
  enviado_em: string | null
}

type Aba = 'todos' | 'espera' | 'andamento' | 'meus'

// ============================================================
// HELPERS
// ============================================================
function formatPhone(jid: string): string {
  const num = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
  if (num.length >= 12) {
    return `+${num.slice(0, 2)} (${num.slice(2, 4)}) ${num.slice(4, 9)}-${num.slice(9)}`
  }
  return num
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Formata data como WhatsApp: 'Hoje', 'Ontem' ou 'dd/mm/yyyy'
function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Hoje'
  if (sameDay(d, yest)) return 'Ontem'
  // Se for da semana corrente, mostra o nome do dia
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'long' })
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Determina se duas mensagens devem ser agrupadas (mesmo remetente, mesmo lado, dentro de 60s)
function shouldGroupWithPrev(curr: Message, prev: Message | null): boolean {
  if (!prev) return false
  if (curr.remetente === 'sistema' || prev.remetente === 'sistema') return false
  if (curr.direcao !== prev.direcao) return false
  if (curr.remetente !== prev.remetente) return false
  const dt = new Date((curr as any).enviado_em || curr.created_at).getTime() - new Date((prev as any).enviado_em || prev.created_at).getTime()
  return dt >= 0 && dt < 60_000
}

// Determina se a separação entre msgs cruza um dia
function isDifferentDay(curr: Message, prev: Message | null): boolean {
  if (!prev) return true
  const a = new Date((prev as any).enviado_em || prev.created_at)
  const b = new Date((curr as any).enviado_em || curr.created_at)
  return a.getFullYear() !== b.getFullYear()
      || a.getMonth() !== b.getMonth()
      || a.getDate() !== b.getDate()
}

// Insere mensagem em ordem estável por (created_at, id) com dedupe por id.
// Resolve race entre resposta do POST e evento Realtime, e mantém ordem
// quando bot+cliente respondem no mesmo segundo.

// Placeholders default do WhatsApp/Evolution quando midia vem sem caption
const WPP_PLACEHOLDERS = new Set([
  '[documentmessage]', '[imagemessage]', '[audiomessage]',
  '[videomessage]', '[stickermessage]', '[locationmessage]',
  '[contactmessage]', '[ptt]'
])
function cleanContent(raw: string | null | undefined): string {
  if (!raw) return ''
  const t = raw.trim()
  if (WPP_PLACEHOLDERS.has(t.toLowerCase())) return ''
  return t
}

// Determina se o mimetype eh um PDF embedavel
function isPdf(mt: string | null | undefined): boolean {
  return !!mt && mt.toLowerCase().includes('pdf')
}

// Determina se a mensagem e uma figurinha (sticker) — pode chegar como
// tipo='sticker' (ideal) ou como tipo='image' com mimetype image/webp
// (caso o n8n SDR ainda nao distinga stickers de imagens).
function isSticker(msg: { tipo: string; media_mimetype: string | null }): boolean {
  if (msg.tipo === 'sticker') return true
  if (msg.tipo === 'image' && (msg.media_mimetype || '').toLowerCase().includes('webp')) return true
  return false
}

// Determina se a midia ainda esta em transito (sem URL OU com URL
// crua do WhatsApp/Baileys que o browser nao consegue renderizar).
// Realtime atualiza quando chega URL utilizavel do Storage Supabase.
function isMediaPending(msg: { tipo: string; media_url: string | null; transcricao: string | null }): boolean {
  if (!msg) return false
  const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker']
  if (!mediaTypes.includes(msg.tipo)) return false
  // Pendente quando URL ausente OU ainda eh URL crua (.enc / whatsapp.net)
  return !isUsableMediaUrl(msg.media_url)
}

// Formata segundos em mm:ss
function formatDuration(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function insertSorted(prev: Message[], msg: Message): Message[] {
  if (prev.some(m => m.id === msg.id)) return prev
  const next = [...prev, msg]
  const ts = (m: Message) => new Date((m as any).enviado_em || m.created_at).getTime()
  next.sort((a, b) => {
    const ta = ts(a), tb = ts(b)
    return ta !== tb ? ta - tb : a.id - b.id
  })
  return next
}


function initials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  bot:        { label: 'Bot',       color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',     icon: Bot },
  aguardando: { label: 'Em espera', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',  icon: Clock },
  humano:     { label: 'Em andamento', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: UserCheck },
  encerrado:  { label: 'Encerrado', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',  icon: XCircle },
}

const MSG_TIPO_ICON: Record<string, typeof FileText> = {
  audio: Mic, image: ImageIcon, video: Video, document: FileText, location: MapPin, sticker: ImageIcon,
}

// ============================================================
// COMPONENTE: Avatar do atendente (badge sobreposto)
// ============================================================
function AttendantBadge({ session }: { session: Session }) {
  if (!session.atendente_id) return null
  const name = session.atendente_nome || 'Atendente'
  return (
    <div
      className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-card overflow-hidden bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-[8px] font-bold text-white"
      title={`Atendendo: ${name}`}
    >
      {session.atendente_avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={session.atendente_avatar_url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  )
}

// ============================================================
// COMPONENTE: Player de audio customizado
// ============================================================
// Player com play/pause, barra clicavel, tempo, ciclo de velocidade
// (1x -> 1.25x -> 1.5x -> 2x) e toggle de transcricao IA quando existe.
const SPEED_CYCLE = [1, 1.25, 1.5, 2] as const
type Speed = (typeof SPEED_CYCLE)[number]

function AudioPlayer({
  src,
  variant,
  transcricao,
}: {
  src: string
  variant: 'in' | 'out'
  transcricao: string | null
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState<Speed>(1)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnd = () => { setPlaying(false); setCurrentTime(0) }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.pause()
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }

  const cycleSpeed = () => {
    const idx = SPEED_CYCLE.indexOf(speed)
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const bar = progressRef.current
    if (!audio || !bar || !duration) return
    const rect = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = pct * duration
    setCurrentTime(audio.currentTime)
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  // Cores conforme bolha (in = cinza, out = azul/verde)
  const accent = variant === 'in'
    ? 'bg-foreground/70'
    : 'bg-current opacity-80'
  const trackBg = variant === 'in' ? 'bg-foreground/10' : 'bg-current/20'

  return (
    <div className="flex flex-col gap-1.5 mb-1 min-w-[240px] max-w-[320px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80',
            variant === 'in' ? 'bg-foreground/10 text-foreground' : 'bg-current/20',
          )}
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>

        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div
            ref={progressRef}
            onClick={seek}
            className={cn('h-1.5 rounded-full cursor-pointer relative overflow-hidden', trackBg)}
          >
            <div
              className={cn('h-full rounded-full transition-[width]', accent)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] opacity-70 leading-none">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 transition-opacity hover:opacity-80',
            variant === 'in' ? 'bg-foreground/10 text-foreground' : 'bg-current/20',
          )}
          title="Velocidade de reprodução"
          aria-label={`Velocidade ${speed}x`}
        >
          {speed}x
        </button>
      </div>

      {transcricao && (
        <button
          type="button"
          onClick={() => setShowTranscript(v => !v)}
          className="self-start inline-flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100 transition-opacity"
        >
          <Mic className="h-3 w-3" />
          {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição'}
        </button>
      )}
      {transcricao && showTranscript && (
        <p className="text-[11px] italic opacity-80 px-1 leading-snug">
          {transcricao}
        </p>
      )}
    </div>
  )
}

// ============================================================
// COMPONENTE: Skeleton de midia em transito
// ============================================================
// Mostrado quando a mensagem chega via webhook mas a media_url ainda
// nao foi preenchida pelo upload paralelo (1-3s tipico).
// Apos 5s, oferece botao "Tentar recuperar" que chama o endpoint
// /api/atendimento/recuperar-midia/[id] -> Evolution -> Storage -> DB.
function MediaPendingSkeleton({ msgId, tipo, createdAt }: { msgId: number; tipo: string; createdAt: string }) {
  const Icon = MSG_TIPO_ICON[tipo] || FileText
  const label =
    tipo === 'audio' ? 'áudio' :
    tipo === 'image' ? 'imagem' :
    tipo === 'video' ? 'vídeo' :
    tipo === 'sticker' ? 'figurinha' :
    'documento'

  const [showRetry, setShowRetry] = useState(false)
  const [recovering, setRecovering] = useState(false)
  // Garante que o auto-trigger v3.1 dispara no máximo uma vez por instância
  const autoTriggeredRef = useRef(false)

  useEffect(() => {
    const ageMs = Date.now() - new Date(createdAt).getTime()
    const remaining = Math.max(0, 5000 - ageMs)
    if (remaining === 0) { setShowRetry(true); return }
    const t = setTimeout(() => setShowRetry(true), remaining)
    return () => clearTimeout(t)
  }, [createdAt])

  // Auto-trigger v3.1: ao montar, agenda POST /midia/[id]/baixar após 1.5s.
  // Realtime do Supabase atualiza media_url -> bolha re-renderiza com o
  // player/imagem real. Falha silenciosa: deixa o botão "Tentar recuperar"
  // aparecer aos 5s normalmente (fallback manual preservado).
  useEffect(() => {
    if (autoTriggeredRef.current) return
    const ageMs = Date.now() - new Date(createdAt).getTime()
    // Se a msg já passou de 1.5s, dispara imediatamente; senão, agenda o resto.
    const delay = Math.max(0, 1500 - ageMs)
    const t = setTimeout(() => {
      autoTriggeredRef.current = true
      fetch(`/api/atendimento/midia/${msgId}/baixar`, { method: 'POST' })
        .catch(() => { /* silencioso — fallback manual aos 5s */ })
    }, delay)
    return () => clearTimeout(t)
  }, [msgId, createdAt])

  const handleRecover = async () => {
    if (recovering) return
    setRecovering(true)
    try {
      // Usa o endpoint v3.1; o legado /recuperar-midia/[id] continua disponível
      const res = await fetch(`/api/atendimento/midia/${msgId}/baixar`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(json?.error || 'Falha ao recuperar mídia')
      } else if (json.alreadyRecovered) {
        toast.info('Mídia já estava disponível — atualizando…')
      } else {
        toast.success(`${label[0].toUpperCase()}${label.slice(1)} recuperada`)
      }
      // Realtime UPDATE atualiza a bolha sozinho. Nada mais a fazer aqui.
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao recuperar mídia')
    } finally {
      setRecovering(false)
    }
  }

  return (
    <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2 mb-1 min-w-[240px]">
      <div className={cn(
        'h-8 w-8 rounded bg-muted/50 flex items-center justify-center shrink-0',
        !showRetry && 'animate-pulse',
      )}>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        {showRetry ? (
          <>
            <p className="text-[10px] text-muted-foreground italic">{label} indisponível</p>
            <button
              type="button"
              onClick={handleRecover}
              disabled={recovering}
              className="text-[10px] text-blue-400 hover:underline mt-0.5 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {recovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {recovering ? 'recuperando…' : 'Tentar recuperar'}
            </button>
          </>
        ) : (
          <div className="animate-pulse">
            <div className="h-2 bg-muted/50 rounded w-3/4 mb-1.5" />
            <p className="text-[10px] text-muted-foreground italic">carregando {label}…</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// COMPONENTE: Separador de data ("Hoje", "Ontem", "12/05/2026")
// ============================================================
function DateSeparator({ dateStr }: { dateStr: string }) {
  return (
    <div className="flex justify-center my-3 sticky top-1 z-10">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-card/95 backdrop-blur px-3 py-1 rounded-full border border-border shadow-sm">
        {formatDateSeparator(dateStr)}
      </span>
    </div>
  )
}

// ============================================================
// COMPONENTE: Linha "novas mensagens"
// ============================================================
function NewMessagesLine() {
  return (
    <div className="flex items-center gap-2 my-2 text-emerald-400">
      <div className="flex-1 h-px bg-emerald-500/30" />
      <span className="text-[10px] uppercase tracking-wider font-semibold">novas mensagens</span>
      <div className="flex-1 h-px bg-emerald-500/30" />
    </div>
  )
}

// ============================================================
// COMPONENTE: Bolha de mensagem
// ============================================================
function MessageBubble({
  msg, grouped, onReply, onScrollToReply, replyTarget,
}: {
  msg: Message
  grouped?: boolean
  onReply?: (m: Message) => void
  onScrollToReply?: (id: number) => void
  replyTarget?: Message | null
}) {
  const isIn = msg.direcao === 'in'
  const isSystem = msg.remetente === 'sistema'

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[10px] text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {msg.conteudo}
        </span>
      </div>
    )
  }

  const handleCopy = () => {
    const txt = (msg.conteudo || msg.transcricao || '').trim()
    if (!txt) return
    navigator.clipboard.writeText(txt).then(() => toast.success('Copiado'))
  }

  return (
    <div
      id={`msg-${msg.id}`}
      data-message-id={msg.id}
      className={cn('group flex relative scroll-mt-20 transition-colors', grouped ? 'mb-0.5' : 'mb-2', isIn ? 'justify-start' : 'justify-end')}
    >
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2 relative',
        isIn
          ? 'bg-card border border-border'
          : msg.remetente === 'bot'
            ? 'bg-blue-600/20 border border-blue-500/30'
            : 'bg-emerald-600/20 border border-emerald-500/30',
        // Variação de canto: bolha agrupada perde o "rabinho"
        !grouped && isIn && 'rounded-tl-sm',
        !grouped && !isIn && 'rounded-tr-sm',
      )}>
        {/* Citação (reply): se essa mensagem é uma resposta a outra */}
        {replyTarget && (
          <button
            type="button"
            onClick={() => onScrollToReply?.(replyTarget.id)}
            className={cn(
              'block w-full text-left mb-1.5 pl-2 py-1 rounded border-l-2 hover:bg-muted/30 transition-colors',
              isIn ? 'border-blue-400 bg-muted/20' : 'border-emerald-400 bg-card/40',
            )}
          >
            <p className="text-[10px] font-semibold opacity-80 mb-0.5">
              {replyTarget.direcao === 'in' ? '↩ Cliente' : `↩ ${replyTarget.remetente_nome || 'Atendente'}`}
            </p>
            <p className="text-[11px] opacity-70 line-clamp-2">
              {(replyTarget.conteudo || replyTarget.transcricao || `[${replyTarget.tipo}]`).slice(0, 120)}
            </p>
          </button>
        )}

        {!isIn && !grouped && (
          <p className={cn(
            'text-[10px] font-semibold mb-0.5',
            msg.remetente === 'bot' ? 'text-blue-400' : 'text-emerald-400'
          )}>
            {msg.remetente === 'bot' ? '🤖 Bot' : `👤 ${msg.remetente_nome || 'Atendente'}`}
          </p>
        )}

        {/* Skeleton de midia em transito (webhook chegou, upload ainda nao terminou) */}
        {isMediaPending(msg) && msg.tipo !== 'audio' && (
          <MediaPendingSkeleton msgId={msg.id} tipo={msg.tipo} createdAt={msg.created_at} />
        )}

        {/* Sticker (figurinha): renderizada como imagem pequena, sem caption */}
        {isUsableMediaUrl(msg.media_url) && isSticker(msg) && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="inline-block mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={msg.media_url}
              alt="Figurinha"
              className="h-[140px] w-[140px] object-contain"
              style={{ background: 'transparent' }}
            />
          </a>
        )}

        {isUsableMediaUrl(msg.media_url) && msg.tipo === 'image' && !isSticker(msg) && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt="Imagem" className="rounded-lg max-w-full max-h-[300px] object-cover mb-1" />
          </a>
        )}

        {/* Audio: player customizado com velocidade + transcricao toggle */}
        {isUsableMediaUrl(msg.media_url) && msg.tipo === 'audio' && (
          <AudioPlayer
            src={msg.media_url}
            variant={isIn ? 'in' : 'out'}
            transcricao={msg.transcricao}
          />
        )}
        {!isUsableMediaUrl(msg.media_url) && msg.tipo === 'audio' && (
          msg.transcricao ? (
            <div className="flex flex-col gap-1 mb-1 min-w-[240px]">
              <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                <Mic className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-[10px] text-muted-foreground italic flex-1">
                  {msg.transcricao}
                  <span className="block text-[9px] not-italic mt-0.5 opacity-70">áudio sendo processado…</span>
                </p>
              </div>
              <MediaPendingSkeleton msgId={msg.id} tipo="audio" createdAt={msg.created_at} />
            </div>
          ) : (
            <MediaPendingSkeleton msgId={msg.id} tipo="audio" createdAt={msg.created_at} />
          )
        )}
        {isUsableMediaUrl(msg.media_url) && msg.tipo === 'document' && (() => {
          const m = (msg.media_mimetype || '').toLowerCase()
          const meta =
            m.includes('pdf') ? { color: 'text-rose-400 bg-rose-500/10', label: 'PDF' } :
            m.includes('word') || m.includes('msword') ? { color: 'text-blue-400 bg-blue-500/10', label: 'DOC' } :
            m.includes('sheet') || m.includes('excel') || m.includes('csv') ? { color: 'text-emerald-400 bg-emerald-500/10', label: 'XLS' } :
            m.includes('presentation') || m.includes('powerpoint') ? { color: 'text-orange-400 bg-orange-500/10', label: 'PPT' } :
            { color: 'text-muted-foreground bg-muted', label: 'DOC' }

          // PDF: pre-visualizacao inline via iframe nativo do navegador
          if (isPdf(msg.media_mimetype)) {
            return (
              <div className="mb-1 max-w-[420px]">
                <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
                  <iframe
                    src={`${msg.media_url}#view=FitH&toolbar=0&navpanes=0`}
                    title={msg.media_filename || 'PDF'}
                    className="w-full h-[280px] bg-white"
                  />
                </div>
                <a
                  href={msg.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={msg.media_filename || 'documento.pdf'}
                  className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', meta.color)}>
                    <FileText className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{msg.media_filename || 'documento.pdf'}</p>
                  </div>
                  <span className="text-[10px] text-blue-400">Abrir</span>
                </a>
              </div>
            )
          }

          // Office (DOC/XLS/PPT): preview via Office Web Viewer (gratuito, suporta xlsx/docx/pptx publicos)
          const isOffice = m.includes('word') || m.includes('msword')
            || m.includes('sheet') || m.includes('excel')
            || m.includes('presentation') || m.includes('powerpoint')
          if (isOffice) {
            const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(msg.media_url)}`
            return (
              <div className="mb-1 max-w-[420px]">
                <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
                  <iframe
                    src={officeUrl}
                    title={msg.media_filename || 'Documento'}
                    className="w-full h-[280px] bg-white"
                  />
                </div>
                <a
                  href={msg.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={msg.media_filename || 'documento'}
                  className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', meta.color)}>
                    <FileText className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{msg.media_filename || 'documento'}</p>
                  </div>
                  <span className="text-[10px] text-blue-400">Baixar</span>
                </a>
              </div>
            )
          }

          // Demais formatos: card clicavel
          return (
            <a
              href={msg.media_url}
              target="_blank"
              rel="noopener noreferrer"
              download={msg.media_filename || 'Documento'}
              className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2 mb-1 hover:bg-muted/50 transition-colors"
            >
              <div className={cn('h-9 w-9 rounded flex flex-col items-center justify-center shrink-0', meta.color)}>
                <FileText className="h-4 w-4" />
                <span className="text-[8px] font-bold leading-none mt-0.5">{meta.label}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{msg.media_filename || 'Documento'}</p>
                <p className="text-[10px] text-muted-foreground">Clique para abrir</p>
              </div>
            </a>
          )
        })()}
        {isUsableMediaUrl(msg.media_url) && msg.tipo === 'video' && (
          <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-[250px] mb-1" preload="metadata" />
        )}

        {(() => {
          const c = cleanContent(msg.conteudo)
          return c ? <p className="text-sm whitespace-pre-wrap break-words">{c}</p> : null
        })()}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[9px] text-muted-foreground">{formatFullTime(msg.created_at)}</span>
          {!isIn && (
            msg.status === 'read'
              ? <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label="Lida" />
              : msg.status === 'delivered'
                ? <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Entregue" />
                : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Enviada" />
          )}
        </div>
      </div>

      {/* Hover actions — copiar / responder */}
      {onReply && (
        <div className={cn(
          'absolute top-0 -translate-y-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 z-10',
          isIn ? 'left-2' : 'right-2',
        )}>
          <button
            type="button"
            onClick={handleCopy}
            className="h-6 w-6 rounded-full bg-card border border-border hover:bg-muted shadow flex items-center justify-center"
            title="Copiar texto"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onReply(msg)}
            className="h-6 w-6 rounded-full bg-card border border-border hover:bg-muted shadow flex items-center justify-center"
            title="Responder"
          >
            <Reply className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// COMPONENTE: Item da lista
// ============================================================
function ConversationItem({
  session, isActive, onClick,
}: {
  session: Session; isActive: boolean; onClick: () => void
}) {
  const cleanLast = (session.ultima_msg || '').trim()
  const isPlaceholder = WPP_PLACEHOLDERS.has(cleanLast.toLowerCase())
  const preview = session.ultima_msg_tipo === 'audio'    ? '🎤 Áudio'
                : session.ultima_msg_tipo === 'sticker'  ? '🎟️ Figurinha'
                : session.ultima_msg_tipo === 'image'    ? '📷 Imagem'
                : session.ultima_msg_tipo === 'video'    ? '🎬 Vídeo'
                : session.ultima_msg_tipo === 'document' ? '📄 Documento'
                : isPlaceholder ? ''
                : cleanLast

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-3 text-left transition-colors border-b border-border/50',
        isActive ? 'bg-muted/50' : 'hover:bg-muted/20',
      )}
    >
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
          {session.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.foto_url} alt="" className="h-full w-full object-cover" />
          ) : (
            (session.nome_contato || '?')[0].toUpperCase()
          )}
        </div>
        <div className={cn(
          'absolute -top-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-background',
          session.status === 'humano' ? 'bg-emerald-500' :
          session.status === 'aguardando' ? 'bg-amber-500' :
          session.status === 'bot' ? 'bg-blue-500' : 'bg-slate-500'
        )} />
        <AttendantBadge session={session} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{session.nome_contato || formatPhone(session.jid)}</p>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatTime(session.ultima_msg_em)}</span>
        </div>
        {session.empresa && <p className="text-[10px] text-muted-foreground truncate">{session.empresa}</p>}
        <div className="flex items-center justify-between mt-0.5 gap-2">
          <p className="text-xs text-muted-foreground truncate flex-1">{preview || 'Sem mensagens'}</p>
          {session.atendente_nome && (
            <span className="text-[9px] text-purple-400 truncate max-w-[80px]">{session.atendente_nome}</span>
          )}
          {session.total_msgs_nao_lidas > 0 && (
            <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[9px] bg-emerald-500 text-white shrink-0">
              {session.total_msgs_nao_lidas}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}

// ============================================================
// COMPONENTE: Preview de anexo pendente
// ============================================================
function PendingMediaPreview({
  media, onClear,
}: {
  media: {
    url: string; tipo: 'image' | 'audio' | 'video' | 'document'
    mimetype: string; filename: string; size: number; previewUrl?: string
  }
  onClear: () => void
}) {
  const sizeLabel = media.size > 1024 * 1024
    ? `${(media.size / 1024 / 1024).toFixed(1)} MB`
    : `${(media.size / 1024).toFixed(0)} KB`
  const playableSrc = media.previewUrl || media.url

  const docMeta = (() => {
    const m = media.mimetype.toLowerCase()
    if (m.includes('pdf')) return { color: 'text-rose-400 bg-rose-500/10', label: 'PDF' }
    if (m.includes('word') || m.includes('msword')) return { color: 'text-blue-400 bg-blue-500/10', label: 'DOC' }
    if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return { color: 'text-emerald-400 bg-emerald-500/10', label: 'XLS' }
    if (m.includes('presentation') || m.includes('powerpoint')) return { color: 'text-orange-400 bg-orange-500/10', label: 'PPT' }
    return { color: 'text-muted-foreground bg-muted', label: 'DOC' }
  })()

  return (
    <div className="mb-2 rounded-md bg-muted/40 border border-border overflow-hidden">
      <div className="flex items-start gap-3 p-2">
        {media.tipo === 'image' && media.previewUrl && (
          <a href={media.previewUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media.previewUrl} alt="preview" className="h-20 w-20 object-cover rounded-md hover:opacity-90 transition-opacity" />
          </a>
        )}
        {media.tipo === 'video' && (
          <video src={playableSrc} controls className="h-20 w-32 object-cover rounded-md shrink-0 bg-black" preload="metadata" />
        )}
        {media.tipo === 'audio' && (
          <div className="h-20 w-20 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
            <Mic className="h-8 w-8 text-blue-400" />
          </div>
        )}
        {media.tipo === 'document' && (
          <div className={cn('h-20 w-20 rounded-md flex flex-col items-center justify-center shrink-0', docMeta.color)}>
            <FileText className="h-7 w-7" />
            <span className="text-[10px] font-bold mt-1">{docMeta.label}</span>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
          <div>
            <p className="text-xs font-medium truncate">{media.filename}</p>
            <p className="text-[10px] text-muted-foreground">{media.tipo} · {sizeLabel}</p>
          </div>
          {media.tipo === 'audio' && (
            <audio src={playableSrc} controls preload="metadata" className="w-full mt-1 h-8" />
          )}
          {media.tipo === 'document' && (
            <a href={media.url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:underline mt-1 inline-flex items-center gap-1 self-start">
              <FileText className="h-3 w-3" /> Visualizar antes de enviar
            </a>
          )}
        </div>
        <button onClick={onClear} className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center shrink-0" title="Remover anexo">
          <XCircle className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// PÁGINA PRINCIPAL
// ============================================================
export default function AtendimentoPage() {
  const { user } = useAuth()

  // Estado
  const [sessions, setSessions] = useState<Session[]>([])
  const [totals, setTotals] = useState({ todos: 0, espera: 0, andamento: 0, meus: 0 })
  const [activeJid, setActiveJid] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [inputText, setInputText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [aba, setAba] = useState<Aba>('todos')
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null)
  const [deleting, setDeleting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // UX WhatsApp: reply/quote, auto-scroll inteligente, contador de novas
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadBelow, setUnreadBelow] = useState(0)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const lastSeenIdRef = useRef<number | null>(null)
  const [newSeparatorId, setNewSeparatorId] = useState<number | null>(null)

  // Anexo pendente
  const [pendingMedia, setPendingMedia] = useState<{
    url: string; tipo: 'image' | 'audio' | 'video' | 'document'
    mimetype: string; filename: string; size: number; previewUrl?: string
  } | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Modo supervisor: a sessão ativa pertence a OUTRO atendente
  const isSupervisor = useMemo(
    () => !!(activeSession?.atendente_id && user?.id && activeSession.atendente_id !== user.id),
    [activeSession, user],
  )
  // É o dono da conversa
  const isOwner = useMemo(
    () => !!(activeSession?.atendente_id && user?.id && activeSession.atendente_id === user.id),
    [activeSession, user],
  )

  // Buscar conversas
  const fetchSessions = useCallback(async () => {
    const params = new URLSearchParams()
    params.set('aba', aba)
    if (searchTerm) params.set('busca', searchTerm)

    const res = await fetch(`/api/atendimento/conversas?${params}`)
    const json = await res.json()
    setSessions(json.conversas || [])
    setTotals(json.totals || { todos: 0, espera: 0, andamento: 0, meus: 0 })
    setLoadingSessions(false)
  }, [aba, searchTerm])

  // Buscar mensagens
  const fetchMessages = useCallback(async (jid: string) => {
    setLoadingMessages(true)
    const res = await fetch(`/api/atendimento/mensagens/${encodeURIComponent(jid)}`)
    const json = await res.json()
    setMessages(json.messages || [])
    setActiveSession(json.session)
    setLoadingMessages(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  // Enviar mensagem
  const handleSend = async () => {
    if (!activeJid || sendingMessage) return
    if (isSupervisor) {
      toast.error('Modo supervisor: não é possível enviar mensagens em conversa de outro atendente. Use "Assumir" primeiro.')
      return
    }

    const hasText = inputText.trim().length > 0
    const hasMedia = !!pendingMedia
    if (!hasText && !hasMedia) return

    let text = inputText.trim()
    // Se for reply, prefixa citação estilo WhatsApp para o cliente ver no chat dele também
    if (replyingTo) {
      const quoted = (replyingTo.conteudo || replyingTo.transcricao || `[${replyingTo.tipo}]`)
        .split('\n')
        .slice(0, 3)
        .map(l => '> ' + l)
        .join('\n')
      text = quoted + '\n\n' + text
    }
    const media = pendingMedia
    setInputText('')
    setPendingMedia(null)
    setSendingMessage(true)

    try {
      const payload: Record<string, any> = {}
      if (hasMedia && media) {
        payload.tipo = media.tipo
        payload.media_url = media.url
        payload.media_filename = media.filename
        payload.media_mimetype = media.mimetype
        if (hasText) payload.conteudo = text
      } else {
        payload.tipo = 'text'
        payload.conteudo = text
      }

      const res = await fetch(`/api/atendimento/mensagens/${encodeURIComponent(activeJid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json.success && json.message) {
        setMessages(prev => insertSorted(prev, json.message))
        setReplyingTo(null)  // limpa citacao apos enviar com sucesso
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      } else if (json.error) {
        setUploadError(json.error)
      }
    } catch (err) {
      console.error('Erro ao enviar:', err)
      setUploadError('Falha ao enviar mensagem')
    } finally {
      setSendingMessage(false)
      if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl)
      inputRef.current?.focus()
    }
  }

  const triggerFilePicker = () => {
    if (uploadingMedia || sendingMessage || isSupervisor) return
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeJid) return
    if (file.size > 50 * 1024 * 1024) { setUploadError('Arquivo excede 50MB'); return }

    setUploadError(null); setUploadingMedia(true)

    const isPreviewable = file.type.startsWith('image/') || file.type.startsWith('audio/') || file.type.startsWith('video/')
    const previewUrl = isPreviewable ? URL.createObjectURL(file) : undefined

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('jid', activeJid)
      const res = await fetch('/api/atendimento/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setUploadError(json.error || 'Falha no upload')
        return
      }
      setPendingMedia({
        url: json.url, tipo: json.tipo, mimetype: json.mimetype,
        filename: json.filename, size: json.size, previewUrl,
      })
    } catch (err: any) {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setUploadError(err.message || 'Falha no upload')
    } finally {
      setUploadingMedia(false)
    }
  }

  const clearPendingMedia = () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl)
    setPendingMedia(null); setUploadError(null)
  }

  // Ações
  const handleAction = async (acao: 'assumir' | 'devolver' | 'encerrar' | 'reabrir') => {
    if (!activeJid) return
    const res = await fetch('/api/atendimento/conversas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, jid: activeJid }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      toast.error(j?.error || `Falha em "${acao}"`)
      return
    }
    toast.success(
      acao === 'assumir'  ? 'Conversa assumida'      :
      acao === 'devolver' ? 'Devolvida ao bot'       :
      acao === 'reabrir'  ? 'Atendimento reaberto'   :
                            'Atendimento encerrado'
    )
    fetchSessions()
    if (activeJid) fetchMessages(activeJid)
  }

  // Excluir (hard delete)
  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/atendimento/conversas?jid=${encodeURIComponent(confirmDelete.jid)}`,
        { method: 'DELETE' },
      )
      const json = await res.json()
      if (!res.ok || json?.success === false) {
        toast.error(json?.error || 'Falha ao excluir')
      } else {
        toast.success(`Conversa excluída (${json.mensagens_qtd} mensagens removidas)`)
        if (activeJid === confirmDelete.jid) {
          setActiveJid(null); setActiveSession(null); setMessages([])
        }
        fetchSessions()
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao excluir')
    } finally {
      setDeleting(false); setConfirmDelete(null)
    }
  }

  const selectConversation = (jid: string) => {
    setActiveJid(jid); fetchMessages(jid)
  }

  // Inicial
  useEffect(() => { fetchSessions() }, [fetchSessions])

  // Realtime: mensagens
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('whatsapp_messages_realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.jid === activeJid) {
            setMessages(prev => insertSorted(prev, newMsg))
            // Auto-scroll só se usuario está perto do fim (UX WhatsApp)
            if (isAtBottom) {
              setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
            }
          }
          fetchSessions()
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          const updMsg = payload.new as Message
          if (updMsg.jid === activeJid) {
            setMessages(prev => prev.map(m => (m.id === updMsg.id ? { ...m, ...updMsg } : m)))
          }
        })
      .subscribe()
    return () => { supabaseRealtime.removeChannel(channel) }
  }, [activeJid, fetchSessions, isAtBottom])

  // Realtime: sessões
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('whatsapp_sessions_realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        (payload) => {
          fetchSessions()
          // se a conversa ativa foi atualizada, refresca o cabeçalho
          if (activeJid && (payload.new as any)?.jid === activeJid) {
            setActiveSession((payload.new as Session) || null)
          }
          // se foi deletada, limpa
          if (activeJid && payload.eventType === 'DELETE' && (payload.old as any)?.jid === activeJid) {
            setActiveJid(null); setActiveSession(null); setMessages([])
          }
        })
      .subscribe()
    return () => { supabaseRealtime.removeChannel(channel) }
  }, [activeJid, fetchSessions])

  // ===========================================================
  // UX: detecta se usuario está perto do fim da lista
  // ===========================================================
  useEffect(() => {
    const el = messagesScrollRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      const atBottom = dist < 80
      setIsAtBottom(atBottom)
      if (atBottom) setUnreadBelow(0)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [activeJid])

  // Quando troca de conversa, marca a "linha de novas" no último id atual e reseta
  useEffect(() => {
    if (!activeJid) return
    setReplyingTo(null)
    setUnreadBelow(0)
    setNewSeparatorId(null)
    lastSeenIdRef.current = null
  }, [activeJid])

  // Quando chegar nova mensagem 'in' e usuario nao esta no fim → conta + posiciona separador
  useEffect(() => {
    if (messages.length === 0) return
    const lastIn = [...messages].reverse().find(m => m.direcao === 'in')
    if (!lastIn) return
    if (isAtBottom) {
      lastSeenIdRef.current = lastIn.id
      setNewSeparatorId(null)
      return
    }
    if (lastSeenIdRef.current && lastIn.id > lastSeenIdRef.current) {
      // primeira nao-vista vira o separador
      if (!newSeparatorId) {
        // ache a primeira mensagem 'in' apos lastSeenIdRef
        const firstUnseen = messages.find(m => m.direcao === 'in' && m.id > (lastSeenIdRef.current as number))
        if (firstUnseen) setNewSeparatorId(firstUnseen.id)
      }
      const incoming = messages.filter(m => m.direcao === 'in' && m.id > (lastSeenIdRef.current as number)).length
      setUnreadBelow(incoming)
    } else if (!lastSeenIdRef.current) {
      lastSeenIdRef.current = lastIn.id
    }
  }, [messages, isAtBottom, newSeparatorId])

  const scrollToMessage = useCallback((id: number) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    setTimeout(() => setHighlightId(prev => prev === id ? null : prev), 1500)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setUnreadBelow(0)
    setNewSeparatorId(null)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && replyingTo) {
      e.preventDefault()
      setReplyingTo(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const ABAS: { id: Aba; label: string; count: number; activeColor: string }[] = [
    { id: 'todos',     label: 'Todos',        count: totals.todos,     activeColor: 'bg-muted text-foreground' },
    { id: 'espera',    label: 'Em espera',    count: totals.espera,    activeColor: 'bg-amber-500/20 text-amber-400' },
    { id: 'andamento', label: 'Andamento',    count: totals.andamento, activeColor: 'bg-emerald-500/20 text-emerald-400' },
    { id: 'meus',      label: 'Meus',         count: totals.meus,      activeColor: 'bg-purple-500/20 text-purple-400' },
  ]

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ====== SIDEBAR ====== */}
      <div className={cn(
        'w-full md:w-[380px] flex-shrink-0 border-r border-border bg-card flex flex-col',
        activeJid ? 'hidden md:flex' : 'flex',
      )}>
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-500" /> Atendimento
            </h1>
            <div className="flex items-center gap-1">
              <NovaConversaDialog
                onCreated={(jid) => selectConversation(jid)}
                trigger={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    aria-label="Nova conversa"
                    title="Nova conversa"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchSessions}
                className="h-7 w-7 p-0"
                aria-label="Atualizar lista"
                title="Atualizar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar contato, telefone ou atendente…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/30"
            />
          </div>
          {/* Abas (Todos / Em espera / Andamento / Meus) */}
          <div className="flex gap-1">
            {ABAS.map(t => (
              <button
                key={t.id}
                onClick={() => setAba(t.id)}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded-md transition-colors font-medium px-1',
                  aba === t.id ? t.activeColor : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                {t.label}{t.count > 0 && ` (${t.count})`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="p-3 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            sessions.map(s => (
              <ConversationItem key={s.jid} session={s} isActive={s.jid === activeJid} onClick={() => selectConversation(s.jid)} />
            ))
          )}
        </div>
      </div>

      {/* ====== MAIN ====== */}
      {activeJid ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header da conversa */}
          <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-card shrink-0">
            <div className="flex items-center gap-3">
              <button className="md:hidden" onClick={() => setActiveJid(null)}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                {activeSession?.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeSession.foto_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (activeSession?.nome_contato || '?')[0].toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{activeSession?.nome_contato || formatPhone(activeJid)}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activeSession?.empresa && <span className="text-[10px] text-muted-foreground">{activeSession.empresa}</span>}
                  {activeSession && (
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', STATUS_CONFIG[activeSession.status]?.color)}>
                      {STATUS_CONFIG[activeSession.status]?.label}
                    </Badge>
                  )}
                  {activeSession?.atendente_nome && (
                    <span className="text-[9px] text-purple-400">
                      Atendendo: <span className="font-medium">{activeSession.atendente_nome}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeSession?.status === 'aguardando' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30" onClick={() => handleAction('assumir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Assumir
                </Button>
              )}
              {activeSession?.status === 'humano' && isOwner && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-amber-400 border-amber-500/30" onClick={() => handleAction('devolver')}>
                  <Bot className="h-3 w-3 mr-1" /> Devolver ao Bot
                </Button>
              )}
              {activeSession?.status === 'humano' && isSupervisor && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30" onClick={() => handleAction('assumir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Assumir
                </Button>
              )}
              {activeSession?.status === 'bot' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30" onClick={() => handleAction('assumir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Assumir
                </Button>
              )}
              {activeSession?.status === 'humano' && isOwner && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction('encerrar')}>
                  Marcar como resolvido
                </Button>
              )}
              {activeSession?.status === 'encerrado' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30" onClick={() => handleAction('reabrir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Reabrir atendimento
                </Button>
              )}

              {/* Menu de ações: Excluir e mais */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Ações</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => activeJid && fetchMessages(activeJid)}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Atualizar mensagens
                  </DropdownMenuItem>
                  {isSupervisor && (
                    <DropdownMenuItem disabled className="text-purple-400">
                      <Eye className="h-4 w-4 mr-2" /> Em modo supervisor
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-500 focus:text-rose-500"
                    onClick={() => activeSession && setConfirmDelete(activeSession)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir conversa…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Banner Modo Supervisor */}
          {isSupervisor && (
            <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/30 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-purple-400 shrink-0" />
              <p className="text-xs text-purple-300 flex-1">
                <span className="font-semibold">Modo supervisor — somente leitura.</span>{' '}
                Esta conversa está com <span className="font-medium">{activeSession?.atendente_nome}</span>.
                Clique em <span className="font-medium">Assumir</span> para tomar a frente.
              </p>
              <Badge className="text-[9px] bg-purple-500/30 text-purple-200 border-purple-500/40">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                ao vivo
              </Badge>
            </div>
          )}

          {/* Mensagens */}
          <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 space-y-0.5 relative">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">Nenhuma mensagem neste chat</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null
                const grouped = shouldGroupWithPrev(msg, prev)
                const showDate = isDifferentDay(msg, prev)
                const showNewLine = newSeparatorId === msg.id
                const isHighlighted = highlightId === msg.id
                return (
                  <div key={msg.id}>
                    {showDate && <DateSeparator dateStr={msg.created_at} />}
                    {showNewLine && <NewMessagesLine />}
                    <div className={cn(
                      'transition-[background] duration-700 rounded-md',
                      isHighlighted && 'bg-amber-400/10 ring-2 ring-amber-400/40'
                    )}>
                      <MessageBubble
                        msg={msg}
                        grouped={grouped}
                        onReply={setReplyingTo}
                        onScrollToReply={scrollToMessage}
                      />
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />

            {/* Botao flutuante "scroll to bottom" — aparece quando usuario subiu */}
            {!isAtBottom && (
              <button
                type="button"
                onClick={scrollToBottom}
                className="sticky bottom-4 ml-auto flex items-center gap-1.5 px-3 h-9 rounded-full bg-card border border-border shadow-lg hover:bg-muted transition-colors text-xs"
                title="Ir para a última mensagem"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                {unreadBelow > 0 && (
                  <span className="bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {unreadBelow > 99 ? '99+' : unreadBelow}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Input — só aparece quando não é supervisor e o status permite */}
          {(activeSession?.status === 'humano' || activeSession?.status === 'encerrado') && !isSupervisor && (
            <div className="border-t border-border p-3 bg-card shrink-0">
              {uploadError && (
                <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-rose-500/10 border border-rose-500/30">
                  <p className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> {uploadError}
                  </p>
                  <button onClick={() => setUploadError(null)} className="text-rose-400 hover:text-rose-300">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {pendingMedia && <PendingMediaPreview media={pendingMedia} onClear={clearPendingMedia} />}

              {/* Preview de citação (reply) */}
              {replyingTo && (
                <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-md bg-muted/40 border-l-2 border-emerald-500">
                  <Reply className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-emerald-400">
                      Respondendo {replyingTo.direcao === 'in' ? 'cliente' : (replyingTo.remetente_nome || 'atendente')}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">
                      {(replyingTo.conteudo || replyingTo.transcricao || `[${replyingTo.tipo}]`).slice(0, 140)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center shrink-0"
                    title="Cancelar resposta (Esc)"
                  >
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              )}

              {activeSession?.status === 'encerrado' && (
                <div className="mb-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-300 flex-1">
                    Atendimento encerrado. Enviar uma mensagem irá{' '}
                    <span className="font-medium">reabrir o atendimento</span> com você como responsável.
                  </p>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected}
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                />
                <Button type="button" variant="outline" size="sm" onClick={triggerFilePicker}
                  disabled={uploadingMedia || sendingMessage} className="h-10 w-10 p-0 shrink-0" title="Anexar arquivo">
                  {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Textarea
                  ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={pendingMedia ? 'Adicione uma legenda (opcional)…' : 'Digite sua mensagem...'}
                  className="min-h-[40px] max-h-[120px] resize-none text-sm bg-muted/30" rows={1}
                />
                <Button onClick={handleSend} disabled={(!inputText.trim() && !pendingMedia) || sendingMessage || uploadingMedia}
                  className="h-10 w-10 p-0 bg-emerald-600 hover:bg-emerald-700 shrink-0">
                  {sendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Enter para enviar · Shift+Enter para nova linha · Esc para cancelar resposta · Anexos até 50MB
              </p>
            </div>
          )}

          {/* Avisos por status */}
          {activeSession?.status === 'bot' && (
            <div className="border-t border-border p-3 bg-blue-500/5 text-center">
              <p className="text-xs text-blue-400">
                🤖 Esta conversa está sendo atendida pelo bot. Clique em &quot;Assumir&quot; para atender.
              </p>
            </div>
          )}
          {activeSession?.status === 'aguardando' && (
            <div className="border-t border-border p-3 bg-amber-500/5 text-center">
              <p className="text-xs text-amber-400">
                ⏳ Cliente aguardando atendente. Clique em &quot;Assumir&quot; para atender.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-muted/5">
          <div className="text-center max-w-sm">
            <MessageSquare className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-muted-foreground">Moderação de atendimentos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Monitore em tempo real as respostas que seus agentes estão enviando aos seus clientes,
              assuma a conversa se necessário, ou aguarde um agente solicitar sua ajuda.
            </p>
          </div>
        </div>
      )}

      {/* Diálogo: confirmar exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Trash2 className="h-5 w-5" /> Excluir conversa
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                Esta ação <span className="font-semibold text-rose-500">apaga permanentemente</span>{' '}
                a sessão e todas as mensagens de{' '}
                <span className="font-medium">
                  {confirmDelete?.nome_contato || (confirmDelete && formatPhone(confirmDelete.jid))}
                </span>.
              </span>
              <span className="block">
                Um registro de auditoria fica em <code className="text-[11px]">whatsapp_sessions_audit</code>{' '}
                com quem executou e o snapshot da conversa, mas as mensagens em si não podem ser recuperadas.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
