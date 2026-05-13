'use client'

/**
 * NovaConversaDialog — modal para iniciar uma conversa com um número
 * que ainda não tem sessão no CRM.
 *
 * Fluxo:
 *   1. Atendente clica em "Nova conversa" no header da sidebar
 *      (ou em "Iniciar Conversa" em /contatos/[id]).
 *   2. Preenche número (com DDD) + nome opcional + texto inicial
 *      — ou recebe os 2 primeiros já pré-preenchidos via props.
 *   3. Submit chama POST /api/atendimento/iniciar.
 *   4. Backend valida via Evolution chat/whatsappNumbers, envia a
 *      mensagem, cria a sessão atribuída ao atendente.
 *   5. onCreated recebe o jid retornado — caller decide se navega
 *      pra conversa, fecha o modal, etc.
 *
 * Modos:
 *   - Uncontrolled (default): caller só passa `trigger` (ou usa o
 *     trigger interno) e `onCreated`. O dialog gerencia seu próprio
 *     estado de abertura.
 *   - Controlled: caller passa `open` + `onOpenChange` para abrir
 *     o modal a partir de um botão externo, sem precisar de trigger.
 *
 * Props initialNumero/initialNome são aplicadas a cada nova abertura
 * — útil para "Iniciar Conversa" em /contatos/[id] onde o telefone
 * e o nome vêm do registro do relacionamento.
 *
 * Erros tratados: 400 inválido, 422 NUMBER_NOT_ON_WHATSAPP, 502 Evolution.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, MessageSquarePlus } from 'lucide-react'

export type NovaConversaDialogProps = {
  /** Callback ao criar a conversa com sucesso. Recebe o jid resultante. */
  onCreated?: (jid: string) => void
  /** Customizar o botão trigger interno. Ignorado em modo controlled. */
  trigger?: React.ReactNode
  /** Modo controlled: estado de abertura externo. */
  open?: boolean
  /** Modo controlled: callback ao mudar abertura. */
  onOpenChange?: (next: boolean) => void
  /** Valor inicial do campo número (normalizado — sem máscara). */
  initialNumero?: string
  /** Valor inicial do campo nome do contato. */
  initialNome?: string
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }

/** Normaliza qualquer entrada de telefone para apenas dígitos. */
function normalizePhone(input: string | null | undefined): string {
  return (input ?? '').replace(/\D/g, '')
}

export function NovaConversaDialog({
  onCreated,
  trigger,
  open: openProp,
  onOpenChange,
  initialNumero,
  initialNome,
}: NovaConversaDialogProps) {
  // Modo controlled detecta-se pelo open prop.
  const isControlled = openProp !== undefined
  const [openInternal, setOpenInternal] = useState(false)
  const open = isControlled ? openProp : openInternal

  const setOpen = (next: boolean) => {
    if (!isControlled) setOpenInternal(next)
    onOpenChange?.(next)
  }

  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [state, setState] = useState<SubmitState>({ kind: 'idle' })

  // Sempre que o modal abrir, re-sincroniza os valores iniciais.
  // Garante que abrir pra contato A e depois pra contato B preencha
  // com os dados de B, não com sobras de A.
  useEffect(() => {
    if (open) {
      setNumero(normalizePhone(initialNumero))
      setNome(initialNome ?? '')
      setMensagem('')
      setState({ kind: 'idle' })
    }
  }, [open, initialNumero, initialNome])

  const reset = () => {
    setNumero('')
    setNome('')
    setMensagem('')
    setState({ kind: 'idle' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state.kind === 'loading') return

    setState({ kind: 'loading' })

    try {
      const res = await fetch('/api/atendimento/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: numero.trim(),
          mensagem: mensagem.trim(),
          nome_contato: nome.trim() || undefined,
        }),
      })

      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean
        jid?: string
        error?: string
        code?: string
      }

      if (!res.ok || !body.success) {
        let msg = body.error || `Erro ${res.status}`
        if (body.code === 'NUMBER_NOT_ON_WHATSAPP') {
          msg = 'Número não está no WhatsApp. Confira o DDD e tente novamente.'
        }
        setState({ kind: 'error', message: msg })
        return
      }

      const jid = body.jid!
      onCreated?.(jid)
      setOpen(false)
      reset()
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erro inesperado',
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      {/* DialogTrigger só faz sentido em modo uncontrolled */}
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="default" size="sm">
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              Nova conversa
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar nova conversa</DialogTitle>
          <DialogDescription>
            Mande a primeira mensagem pra um número que ainda não tem sessão no CRM.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-conversa-numero">Número (com DDD)</Label>
            <Input
              id="nova-conversa-numero"
              type="tel"
              placeholder="11999999999"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
              autoComplete="off"
              disabled={state.kind === 'loading'}
            />
            <p className="text-xs text-muted-foreground">
              Use DDI + DDD + número. Ex: 5511999999999 (Brasil) ou 11999999999 (assumimos +55).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nova-conversa-nome">Nome do contato (opcional)</Label>
            <Input
              id="nova-conversa-nome"
              type="text"
              placeholder="João Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="off"
              disabled={state.kind === 'loading'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nova-conversa-mensagem">Primeira mensagem</Label>
            <Textarea
              id="nova-conversa-mensagem"
              placeholder="Oi! Aqui é da GoNova, sobre o seu sistema solar…"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              required
              rows={4}
              disabled={state.kind === 'loading'}
            />
          </div>

          {state.kind === 'error' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={state.kind === 'loading'}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={state.kind === 'loading'}>
              {state.kind === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando…
                </>
              ) : (
                'Enviar e iniciar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default NovaConversaDialog
