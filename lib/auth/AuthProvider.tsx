'use client'

/**
 * AuthProvider — centraliza auth state em UM listener + UMA chamada
 * inicial de getSession, expondo o estado via React Context.
 *
 * Resolve o erro "lock:sb-auth-token not released within 5000ms" que
 * ocorria quando 6+ componentes consumiam useAuth(), cada um
 * registrando seu próprio onAuthStateChange e chamando getSession()
 * no mount. Em StrictMode dobrava.
 *
 * API exposta é compatível com o useAuth() anterior — drop-in.
 * Componentes que faziam:
 *   const { user, role, loading, ... } = useAuth()
 * continuam funcionando sem alteração.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'

export type AppRole = 'admin' | 'limitada'

type UserRoleRow = { role?: AppRole; permissions?: Record<string, boolean> } | null

const AUTH_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout em ${label} (${timeoutMs}ms)`))
    }, timeoutMs)
    promise.then(resolve).catch(reject).finally(() => clearTimeout(timer))
  })
}

// =====================================================================
// Context
// =====================================================================
export interface AuthContextValue {
  user: User | null
  loading: boolean
  role: AppRole
  roleLoading: boolean
  permissions: Record<string, boolean>
  /** ID da sessão atual (== user.id ou null) — útil pra cache invalidation */
  sessionId: string | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// =====================================================================
// Provider
// =====================================================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AppRole>('admin')
  const [roleLoading, setRoleLoading] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})

  // Guarda contra rerun em StrictMode (dev)
  const bootstrappedRef = useRef(false)

  const resolveRole = useCallback(async (
    userId: string | null,
    isRefresh = false,
  ) => {
    if (!userId) {
      setRole('admin')
      setPermissions({})
      setRoleLoading(false)
      return
    }

    try {
      const roleQuery = supabase
        .from('user_roles')
        .select('role, permissions')
        .eq('user_id', userId)
        .maybeSingle() as unknown as Promise<{
          data: UserRoleRow
          error: { message?: string; code?: string } | null
        }>

      const { data, error } = await withTimeout(roleQuery, AUTH_TIMEOUT_MS, 'consulta de role')

      if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
        setRole('admin')
        setPermissions({})
        setRoleLoading(false)
        return
      }

      if (error) throw error

      const roleValue = data?.role
      const userPermissions = data?.permissions || {}

      if (!data) {
        setRole('admin')
        setPermissions({})
      } else if (roleValue === 'admin' || roleValue === 'limitada') {
        setRole(roleValue)
        setPermissions(userPermissions)
      } else {
        setRole('admin')
        setPermissions({})
      }
      setRoleLoading(false)
    } catch (err) {
      // Em refresh, preservar role/permissions atuais (evita redirect transitório)
      if (!isRefresh) {
        setRole('admin')
        setPermissions({})
      }
      setRoleLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true

    let isMounted = true
    let isBootstrapping = true

    // UMA chamada inicial de getSession
    void (async () => {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'getSession')
        if (!isMounted) return
        setUser(session?.user ?? null)
        await resolveRole(session?.user?.id ?? null)
      } catch {
        if (isMounted) {
          setUser(null)
          setRole('admin')
          setPermissions({})
          setRoleLoading(false)
        }
      } finally {
        if (isMounted) setLoading(false)
        isBootstrapping = false
      }
    })()

    // UM listener global de auth state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      if (isBootstrapping) return  // bootstrap já cuida do estado inicial
      setUser(session?.user ?? null)
      await resolveRole(session?.user?.id ?? null, true)
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [resolveRole])

  const logout = useCallback(async () => {
    try {
      setUser(null)
      setRole('admin')
      setPermissions({})
      setRoleLoading(false)
      await supabase.auth.signOut({ scope: 'global' })
      router.push('/login')
    } catch (err) {
      console.error('Erro ao fazer logout:', err)
      router.push('/login')
    }
  }, [router])

  const value: AuthContextValue = {
    user,
    loading,
    role,
    roleLoading,
    permissions,
    sessionId: user?.id ?? null,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// =====================================================================
// Hook de consumo — substitui useAuth() antigo (drop-in compatível)
// =====================================================================
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthContext deve ser usado dentro de <AuthProvider>')
  }
  return ctx
}
