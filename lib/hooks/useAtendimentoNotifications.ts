'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

const STORAGE_KEY = 'atendimento-notif-prefs'
const SHOWN_TOAST_KEY = 'atendimento-notif-toast-shown'

type Prefs = {
  sound: boolean
  browser: boolean
}

function getPrefs(): Prefs {
  if (typeof window === 'undefined') return { sound: true, browser: true }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { sound: true, browser: true, ...JSON.parse(raw) }
  } catch {}
  return { sound: true, browser: true }
}

export function setNotifPrefs(prefs: Partial<Prefs>) {
  if (typeof window === 'undefined') return
  const merged = { ...getPrefs(), ...prefs }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
}

/**
 * Solicita permissão de notificação do navegador (precisa ser chamado
 * em resposta a clique do usuário).
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function notificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function hasShownIntroToast(): boolean {
  if (typeof window === 'undefined') return true
  return sessionStorage.getItem(SHOWN_TOAST_KEY) === '1'
}
export function markIntroToastShown() {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SHOWN_TOAST_KEY, '1')
}

/** Beep curto via Web Audio API — não exige asset externo. */
function playBeep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.value = 0.08
    o.start()
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
    o.stop(ctx.currentTime + 0.45)
    setTimeout(() => ctx.close(), 700)
  } catch {}
}

function fireDesktopNotification(body: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification('Cliente em espera — CRM', {
      body,
      icon: '/favicon.ico',
      tag: 'atendimento-aguardando',
    })
    n.onclick = () => {
      try { window.focus() } catch {}
      try { window.location.assign('/atendimento') } catch {}
      n.close()
    }
  } catch {}
}

/**
 * Mantém em tempo real a contagem de sessões com status 'aguardando'.
 * Toca som + dispara notificação do navegador quando uma NOVA conversa
 * entra nesse estado (não dispara para itens que já estavam ali no load).
 */
export function useAtendimentoNotifications() {
  const [count, setCount] = useState(0)
  const seenJids = useRef<Set<string>>(new Set())
  const isFirstLoad = useRef(true)

  // Carga inicial
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => Promise<{ data: { jid: string }[] | null; error: { message?: string } | null }>
          }
        }
      })
        .from('whatsapp_sessions')
        .select('jid')
        .eq('status', 'aguardando')
      if (cancelled) return
      const jids = (data || []).map((d) => d.jid)
      seenJids.current = new Set(jids)
      setCount(jids.length)
      // Marca fim do load ao final de um tick para evitar racing com primeiros eventos
      setTimeout(() => { isFirstLoad.current = false }, 1000)
      if (error) console.warn('useAtendimentoNotifications init:', error.message)
    })()
    return () => { cancelled = true }
  }, [])

  // Realtime: detecta entradas em 'aguardando' e saídas
  useEffect(() => {
    const channel = supabase
      .channel('atendimento-notif-global')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sessions' },
        (payload) => {
          const newRow = payload.new as { jid: string; status: string; nome_contato?: string | null } | null
          const oldRow = payload.old as { jid: string; status: string } | null

          const enteredWaiting =
            (payload.eventType === 'INSERT' && newRow?.status === 'aguardando') ||
            (payload.eventType === 'UPDATE' && newRow?.status === 'aguardando' && oldRow?.status !== 'aguardando')

          const leftWaiting =
            (payload.eventType === 'UPDATE' && oldRow?.status === 'aguardando' && newRow?.status !== 'aguardando') ||
            (payload.eventType === 'DELETE' && oldRow?.status === 'aguardando')

          if (enteredWaiting && newRow) {
            if (!seenJids.current.has(newRow.jid)) {
              seenJids.current.add(newRow.jid)
              setCount(c => c + 1)
              if (!isFirstLoad.current) {
                const prefs = getPrefs()
                if (prefs.sound) playBeep()
                if (prefs.browser) fireDesktopNotification(
                  `${newRow.nome_contato || 'Um cliente'} está aguardando atendimento humano.`
                )
              }
            }
          } else if (leftWaiting && (oldRow || newRow)) {
            const jid = (newRow?.jid || oldRow?.jid) as string
            if (seenJids.current.has(jid)) {
              seenJids.current.delete(jid)
              setCount(c => Math.max(0, c - 1))
            }
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const requestPermission = useCallback(async () => {
    const r = await ensureNotificationPermission()
    if (r === 'granted') {
      setNotifPrefs({ browser: true })
    }
    return r
  }, [])

  return { count, requestPermission }
}
