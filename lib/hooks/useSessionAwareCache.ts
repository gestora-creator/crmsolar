'use client'

/**
 * Hook para cache que é automaticamente invalidado quando a sessão muda.
 * Previne bugs onde dados da sessão anterior são exibidos após login/logout.
 *
 * Refatorado em 2026-05-13: antes registrava um onAuthStateChange por
 * instância — contribuía com o erro "lock:sb-auth-token not released
 * within 5000ms". Agora lê o sessionId do AuthContext (1 listener
 * global compartilhado).
 */

import { useRef, useCallback, useEffect } from 'react'
import { useAuthContext } from '@/lib/auth/AuthProvider'

interface CacheData<T> {
  data: T | null
  timestamp: number
  sessionId: string | null
}

export function useSessionAwareCache<T>(duration: number = 3000) {
  const { sessionId } = useAuthContext()

  const cacheRef = useRef<CacheData<T>>({
    data: null,
    timestamp: 0,
    sessionId: null,
  })

  // Invalida o cache quando a sessão muda (sem registrar listener próprio)
  useEffect(() => {
    if (cacheRef.current.sessionId !== sessionId) {
      cacheRef.current = { data: null, timestamp: 0, sessionId: null }
    }
  }, [sessionId])

  const get = useCallback(
    (forceRefresh: boolean = false): T | null => {
      const now = Date.now()
      const isExpired = now - cacheRef.current.timestamp > duration
      const isSessionInvalid = cacheRef.current.sessionId !== sessionId

      if (!forceRefresh && cacheRef.current.data && !isExpired && !isSessionInvalid) {
        return cacheRef.current.data
      }
      return null
    },
    [duration, sessionId],
  )

  const set = useCallback((data: T) => {
    cacheRef.current = {
      data,
      timestamp: Date.now(),
      sessionId,
    }
  }, [sessionId])

  const clear = useCallback(() => {
    cacheRef.current = { data: null, timestamp: 0, sessionId: null }
  }, [])

  return { get, set, clear }
}
