'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'limitada'
type UserRoleRow = { role?: AppRole; permissions?: Record<string, boolean> } | null

const AUTH_TIMEOUT_MS = 8000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout em ${label} (${timeoutMs}ms)`))
    }, timeoutMs)

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer))
  })
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AppRole>('limitada')
  const [roleLoading, setRoleLoading] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const router = useRouter()

  useEffect(() => {
    let isMounted = true
    let isBootstrapping = true

    const resolveRole = async (userId: string | null) => {
      if (!isMounted || !userId) {
        if (isMounted) {
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
        }
        return
      }

      try {
        const roleQuery = ((supabase)
          .from('user_roles')
          .select('role, permissions')
          .eq('user_id', userId)
          .maybeSingle()) as unknown as Promise<{
          data: UserRoleRow
          error: { message?: string; code?: string } | null
        }>

        const { data, error } = await withTimeout(
          roleQuery,
          AUTH_TIMEOUT_MS,
          'consulta de role'
        )

        if (!isMounted) return

        if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
          return
        }

        if (error) {
          throw error
        }

        const roleValue = data?.role
        const userPermissions = data?.permissions || {}

        if (roleValue === 'admin' || roleValue === 'limitada') {
          setRole(roleValue)
          setPermissions(userPermissions)
        } else {
          setRole('limitada')
          setPermissions({})
        }
        setRoleLoading(false)
      } catch (err) {
        if (isMounted) {
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
        }
      }
    }

    const applySession = async (sessionUser: User | null) => {
      setUser(sessionUser)
      await resolveRole(sessionUser?.id ?? null)
      if (isMounted) {
        setLoading(false)
      }
    }

    // Sessão imediata (evita depender só de getUser(), que pode demorar ou travar no refresh)
    void (async () => {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'getSession')
        if (!isMounted) return
        await applySession(session?.user ?? null)
      } catch (error) {
        if (isMounted) {
          setUser(null)
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
          setLoading(false)
        }
      } finally {
        isBootstrapping = false
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      if (isBootstrapping) return
      await applySession(session?.user ?? null)
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const logout = async () => {
    try {
      setUser(null)
      setRole('limitada')
      setPermissions({})
      setRoleLoading(false)

      await supabase.auth.signOut({ scope: 'global' })

      router.push('/login')
    } catch (error: unknown) {
      console.error('Erro ao fazer logout:', error)
      router.push('/login')
    }
  }

  return { user, loading, role, roleLoading, permissions, logout }
}
