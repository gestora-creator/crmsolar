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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase as supabaseRealtime } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'

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

// Insere mensagem em ordem estável por (created_at, id) com dedupe por id.
// Resolve race entre resposta do POST e evento Realtime, e mantém ordem
// quando bot+cliente respondem no mesmo segundo.
function insertSorted(prev: Message[], msg: Message): Message[] {
  if (prev.some(m => m.id === msg.id)) return prev
  const next = [...prev, msg]
  next.sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
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
  audio: Mic, image: ImageIcon, video: Video, document: FileText, location: MapPin,
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
// COMPONENTE: Bolha de mensagem
// ============================================================
function MessageBubble({ msg }: { msg: Message }) {
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

  return (
    <div className={cn('flex mb-2', isIn ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2 relative',
        isIn
          ? 'bg-card border border-border rounded-tl-sm'
          : msg.remetente === 'bot'
            ? 'bg-blue-600/20 border border-blue-500/30 rounded-tr-sm'
            : 'bg-emerald-600/20 border border-emerald-500/30 rounded-tr-sm'
      )}>
        {!isIn && (
          <p className={cn(
            'text-[10px] font-semibold mb-0.5',
            msg.remetente === 'bot' ? 'text-blue-400' : 'text-emerald-400'
          )}>
            {msg.remetente === 'bot' ? '🤖 Bot' : `👤 ${msg.remetente_nome || 'Atendente'}`}
          </p>
        )}

        {msg.media_url && msg.tipo === 'image' && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={msg.media_url} alt="Imagem" className="rounded-lg max-w-full max-h-[300px] object-cover mb-1" />
          </a>
        )}
        {msg.media_url && msg.tipo === 'audio' && (
          <div className="flex flex-col gap-1 mb-1 min-w-[220px]">
            <audio src={msg.media_url} controls preload="metadata" className="w-full h-8" />
            {msg.transcricao && (
              <p className="text-[10px] text-muted-foreground italic px-1">
                <Mic className="inline h-3 w-3 mr-1" />{msg.transcricao}
              </p>
            )}
          </div>
        )}
        {!msg.media_url && msg.tipo === 'audio' && msg.transcricao && (
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 mb-1">
            <Mic className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-[10px] text-muted-foreground italic flex-1">
              {msg.transcricao}
              <span className="block text-[9px] not-italic mt-0.5 opacity-70">áudio sendo processado…</span>
            </p>
          </div>
        )}
        {msg.media_url && msg.tipo === 'document' && (() => {
          const m = (msg.media_mimetype || '').toLowerCase()
          const meta =
            m.includes('pdf') ? { color: 'text-rose-400 bg-rose-500/10', label: 'PDF' } :
            m.includes('word') || m.includes('msword') ? { color: 'text-blue-400 bg-blue-500/10', label: 'DOC' } :
            m.includes('sheet') || m.includes('excel') || m.includes('csv') ? { color: 'text-emerald-400 bg-emerald-500/10', label: 'XLS' } :
            m.includes('presentation') || m.includes('powerpoint') ? { color: 'text-orange-400 bg-orange-500/10', label: 'PPT' } :
            { color: 'text-muted-foreground bg-muted', label: 'DOC' }
          return (
            <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-muted/30 rounded-lg px-2.5 py-2 mb-1 hover:bg-muted/50 transition-colors">
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
        {msg.media_url && msg.tipo === 'video' && (
          <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-[250px] mb-1" preload="metadata" />
        )}

        {msg.conteudo && <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>}

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[9px] text-muted-foreground">{formatFullTime(msg.created_at)}</span>
          {!isIn && (
            msg.status === 'read'
              ? <CheckCheck className="h-3 w-3 text-blue-400" />
              : msg.status === 'delivered'
                ? <CheckCheck className="h-3 w-3 text-muted-foreground" />
                : <Check className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
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
  const preview = session.ultima_msg_tipo === 'audio'    ? '🎤 Áudio'
                : session.ultima_msg_tipo === 'image'    ? '📷 Imagem'
                : session.ultima_msg_tipo === 'document' ? '📄 Documento'
                : session.ultima_msg || ''

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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    const text = inputText.trim()
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
  const handleAction = async (acao: 'assumir' | 'devolver' | 'encerrar') => {
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
      acao === 'assumir'  ? 'Conversa assumida' :
      acao === 'devolver' ? 'Devolvida ao bot'  :
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
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
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
  }, [activeJid, fetchSessions])

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
            <Button size="sm" variant="ghost" onClick={fetchSessions} className="h-7 w-7 p-0">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
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
          <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
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
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input — só aparece quando não é supervisor e o status permite */}
          {activeSession?.status === 'humano' && !isSupervisor && (
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
                Enter para enviar · Shift+Enter para nova linha · Anexos até 50MB
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
