'use client'

/**
 * useAuth — agora é um wrapper drop-in do AuthContext.
 *
 * Antes: cada chamada registrava um onAuthStateChange + um getSession
 * próprios. Com 6 componentes consumindo, isso gerava 12+ chamadas
 * concorrentes ao lock sb-auth-token do localStorage, disparando o
 * erro "not released within 5000ms" e travando refresh/auth no front.
 *
 * Agora: o AuthProvider faz 1 listener + 1 getSession. Este hook
 * apenas lê do context. API preservada: { user, loading, role,
 * roleLoading, permissions, logout }.
 */

import { useAuthContext, type AppRole } from '@/lib/auth/AuthProvider'

export type { AppRole }

export function useAuth() {
  return useAuthContext()
}
