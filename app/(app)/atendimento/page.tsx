'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search, Send, Paperclip, Bot, User, Clock, Phone,
  ArrowLeft, Loader2, MessageSquare, UserCheck, AlertCircle,
  Image as ImageIcon, FileText, Mic, Video, MapPin, Check, CheckCheck,
  MoreVertical, XCircle, RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@supabase/supabase-js'

// Supabase client para Realtime
const supabaseRealtime = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

// ============================================================
// HELPERS
// ============================================================
function formatPhone(jid: string): string {
  const num = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
  if (num.length >= 12) {
    return `+${num.slice(0,2)} (${num.slice(2,4)}) ${num.slice(4,9)}-${num.slice(9)}`
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Bot }> = {
  bot: { label: 'Bot', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Bot },
  aguardando: { label: 'Na fila', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  humano: { label: 'Atendente', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: UserCheck },
  encerrado: { label: 'Encerrado', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: XCircle },
}

const MSG_TIPO_ICON: Record<string, typeof FileText> = {
  audio: Mic,
  image: ImageIcon,
  video: Video,
  document: FileText,
  location: MapPin,
}

// ============================================================
// COMPONENTE: Bolha de Mensagem
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
        {/* Remetente */}
        {!isIn && (
          <p className={cn(
            'text-[10px] font-semibold mb-0.5',
            msg.remetente === 'bot' ? 'text-blue-400' : 'text-emerald-400'
          )}>
            {msg.remetente === 'bot' ? '🤖 Bot' : `👤 ${msg.remetente_nome || 'Atendente'}`}
          </p>
        )}

        {/* Mídia */}
        {msg.media_url && msg.tipo === 'image' && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            <img
              src={msg.media_url}
              alt="Imagem"
              className="rounded-lg max-w-full max-h-[300px] object-cover mb-1"
            />
          </a>
        )}
        {msg.media_url && msg.tipo === 'audio' && (
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 mb-1">
            <Mic className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <div className="h-1 bg-muted rounded-full" />
              {msg.transcricao && (
                <p className="text-[10px] text-muted-foreground mt-1 italic">{msg.transcricao}</p>
              )}
            </div>
          </div>
        )}
        {msg.media_url && msg.tipo === 'document' && (
          <a
            href={msg.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 mb-1 hover:bg-muted/50 transition-colors"
          >
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="text-xs truncate">{msg.media_filename || 'Documento'}</span>
          </a>
        )}
        {msg.media_url && msg.tipo === 'video' && (
          <video src={msg.media_url} controls className="rounded-lg max-w-full max-h-[250px] mb-1" />
        )}

        {/* Texto */}
        {msg.conteudo && (
          <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
        )}

        {/* Hora + status */}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[9px] text-muted-foreground">
            {formatFullTime(msg.created_at)}
          </span>
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
// COMPONENTE: Item da lista de conversas
// ============================================================
function ConversationItem({
  session, isActive, onClick
}: {
  session: Session
  isActive: boolean
  onClick: () => void
}) {
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.bot
  const Icon = MSG_TIPO_ICON[session.ultima_msg_tipo || ''] || MessageSquare
  const preview = session.ultima_msg_tipo === 'audio'
    ? '🎤 Áudio'
    : session.ultima_msg_tipo === 'image'
      ? '📷 Imagem'
      : session.ultima_msg_tipo === 'document'
        ? '📄 Documento'
        : session.ultima_msg || ''

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-3 text-left transition-colors border-b border-border/50',
        isActive ? 'bg-muted/50' : 'hover:bg-muted/20'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-bold">
          {(session.nome_contato || '?')[0].toUpperCase()}
        </div>
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background',
          session.status === 'humano' ? 'bg-emerald-500' :
          session.status === 'aguardando' ? 'bg-amber-500' :
          session.status === 'bot' ? 'bg-blue-500' : 'bg-slate-500'
        )} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">
            {session.nome_contato || formatPhone(session.jid)}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
            {formatTime(session.ultima_msg_em)}
          </span>
        </div>
        {session.empresa && (
          <p className="text-[10px] text-muted-foreground truncate">{session.empresa}</p>
        )}
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate flex-1">{preview || 'Sem mensagens'}</p>
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
// PÁGINA PRINCIPAL
// ============================================================
export default function AtendimentoPage() {
  // Estado
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeJid, setActiveJid] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [inputText, setInputText] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Buscar conversas
  const fetchSessions = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter !== 'todos') params.set('status', statusFilter)
    if (searchTerm) params.set('busca', searchTerm)

    const res = await fetch(`/api/atendimento/conversas?${params}`)
    const json = await res.json()
    setSessions(json.conversas || [])
    setLoadingSessions(false)
  }, [statusFilter, searchTerm])

  // Buscar mensagens de uma conversa
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
    if (!inputText.trim() || !activeJid || sendingMessage) return

    const text = inputText.trim()
    setInputText('')
    setSendingMessage(true)

    try {
      const res = await fetch(`/api/atendimento/mensagens/${encodeURIComponent(activeJid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'text',
          conteudo: text,
          atendente_nome: 'Atendente', // TODO: pegar do auth
        }),
      })

      const json = await res.json()
      if (json.success && json.message) {
        setMessages(prev => [...prev, json.message])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } catch (err) {
      console.error('Erro ao enviar:', err)
    } finally {
      setSendingMessage(false)
      inputRef.current?.focus()
    }
  }

  // Ações de atendimento
  const handleAction = async (acao: string) => {
    if (!activeJid) return
    await fetch('/api/atendimento/conversas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acao,
        jid: activeJid,
        atendente_nome: 'Atendente', // TODO: pegar do auth
      }),
    })
    fetchSessions()
    if (activeJid) fetchMessages(activeJid)
  }

  // Selecionar conversa
  const selectConversation = (jid: string) => {
    setActiveJid(jid)
    fetchMessages(jid)
  }

  // Carregar sessões iniciais
  useEffect(() => { fetchSessions() }, [fetchSessions])

  // Realtime: novas mensagens
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('whatsapp_messages_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          const newMsg = payload.new as Message
          // Atualizar mensagens se é a conversa ativa
          if (newMsg.jid === activeJid) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
          }
          // Atualizar lista de sessões
          fetchSessions()
        }
      )
      .subscribe()

    return () => { supabaseRealtime.removeChannel(channel) }
  }, [activeJid, fetchSessions])

  // Realtime: mudanças de sessão
  useEffect(() => {
    const channel = supabaseRealtime
      .channel('whatsapp_sessions_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        () => { fetchSessions() }
      )
      .subscribe()

    return () => { supabaseRealtime.removeChannel(channel) }
  }, [fetchSessions])

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Contadores
  const counts = {
    todos: sessions.length,
    aguardando: sessions.filter(s => s.status === 'aguardando').length,
    humano: sessions.filter(s => s.status === 'humano').length,
    bot: sessions.filter(s => s.status === 'bot').length,
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ====== SIDEBAR: Lista de conversas ====== */}
      <div className={cn(
        'w-full md:w-[380px] flex-shrink-0 border-r border-border bg-card flex flex-col',
        activeJid ? 'hidden md:flex' : 'flex'
      )}>
        {/* Header */}
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
              placeholder="Buscar contato..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/30"
            />
          </div>
          {/* Filtros */}
          <div className="flex gap-1">
            {(['todos', 'aguardando', 'humano', 'bot'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded-md transition-colors font-medium',
                  statusFilter === f
                    ? f === 'aguardando' ? 'bg-amber-500/20 text-amber-400'
                      : f === 'humano' ? 'bg-emerald-500/20 text-emerald-400'
                      : f === 'bot' ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {f === 'todos' ? 'Todos' : f === 'aguardando' ? 'Fila' : f === 'humano' ? 'Ativos' : 'Bot'}
                {counts[f] > 0 && ` (${counts[f]})`}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="p-3 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            sessions.map(s => (
              <ConversationItem
                key={s.jid}
                session={s}
                isActive={s.jid === activeJid}
                onClick={() => selectConversation(s.jid)}
              />
            ))
          )}
        </div>
      </div>

      {/* ====== MAIN: Chat ====== */}
      {activeJid ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-card shrink-0">
            <div className="flex items-center gap-3">
              <button className="md:hidden" onClick={() => setActiveJid(null)}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-bold">
                {(activeSession?.nome_contato || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {activeSession?.nome_contato || formatPhone(activeJid)}
                </p>
                <div className="flex items-center gap-1.5">
                  {activeSession?.empresa && (
                    <span className="text-[10px] text-muted-foreground">{activeSession.empresa}</span>
                  )}
                  {activeSession && (
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', STATUS_CONFIG[activeSession.status]?.color)}>
                      {STATUS_CONFIG[activeSession.status]?.label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {activeSession?.status === 'aguardando' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30"
                  onClick={() => handleAction('assumir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Assumir
                </Button>
              )}
              {activeSession?.status === 'humano' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-amber-400 border-amber-500/30"
                  onClick={() => handleAction('devolver')}>
                  <Bot className="h-3 w-3 mr-1" /> Devolver ao Bot
                </Button>
              )}
              {activeSession?.status === 'bot' && (
                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-400 border-emerald-500/30"
                  onClick={() => handleAction('assumir')}>
                  <UserCheck className="h-3 w-3 mr-1" /> Assumir
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
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

          {/* Input */}
          {(activeSession?.status === 'humano') && (
            <div className="border-t border-border p-3 bg-card shrink-0">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem..."
                  className="min-h-[40px] max-h-[120px] resize-none text-sm bg-muted/30"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sendingMessage}
                  className="h-10 w-10 p-0 bg-emerald-600 hover:bg-emerald-700 shrink-0"
                >
                  {sendingMessage
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Enter para enviar · Shift+Enter para nova linha
              </p>
            </div>
          )}

          {/* Aviso quando é Bot ou Aguardando */}
          {activeSession?.status === 'bot' && (
            <div className="border-t border-border p-3 bg-blue-500/5 text-center">
              <p className="text-xs text-blue-400">
                🤖 Esta conversa está sendo atendida pelo bot. Clique em "Assumir" para atender.
              </p>
            </div>
          )}
          {activeSession?.status === 'aguardando' && (
            <div className="border-t border-border p-3 bg-amber-500/5 text-center">
              <p className="text-xs text-amber-400">
                ⏳ Cliente aguardando atendente. Clique em "Assumir" para atender.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Estado vazio — nenhuma conversa selecionada */
        <div className="hidden md:flex flex-1 items-center justify-center bg-muted/5">
          <div className="text-center">
            <MessageSquare className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-muted-foreground">Selecione uma conversa</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha uma conversa na lista para visualizar as mensagens
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
