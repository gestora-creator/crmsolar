'use client'

import { useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface CacheData<T> {
  data: T | null
  timestamp: number
  sessionId: string | null
}

/**
 * Hook para cache que é automaticamente invalidado quando a sessão muda
 * Previne bugs onde dados da sessão anterior são exibidos após login/logout
 */
export function useSessionAwareCache<T>(duration: number = 3000) {
  const cacheRef = useRef<CacheData<T>>({
    data: null,
    timestamp: 0,
    sessionId: null,
  })

  const currentSessionRef = useRef<string | null>(null)

  // Rastrear mudanças de sessão
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const newSessionId = session?.user?.id || null

      // Se a sessão mudou, invalidar o cache
      if (newSessionId !== currentSessionRef.current) {
        console.log(
          `🔄 Sessão alterada (${currentSessionRef.current} → ${newSessionId}), cache invalidado`
        )
        cacheRef.current = {
          data: null,
          timestamp: 0,
          sessionId: null,
        }
        currentSessionRef.current = newSessionId
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const get = useCallback(
    (forceRefresh: boolean = false): T | null => {
      const now = new Date().getTime()
      const isExpired = now - cacheRef.current.timestamp > duration
      const isSessionInvalid =
        cacheRef.current.sessionId !== currentSessionRef.current

      if (
        !forceRefresh &&
        cacheRef.current.data &&
        !isExpired &&
        !isSessionInvalid
      ) {
        return cacheRef.current.data
      }

      return null
    },
    [duration]
  )

  const set = useCallback((data: T) => {
    cacheRef.current = {
      data,
      timestamp: new Date().getTime(),
      sessionId: currentSessionRef.current,
    }
  }, [])

  const clear = useCallback(() => {
    cacheRef.current = {
      data: null,
      timestamp: 0,
      sessionId: null,
    }
  }, [])

  return { get, set, clear }
}
