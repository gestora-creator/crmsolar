'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export type AppRole = 'admin' | 'limitada'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AppRole>('limitada')
  const [roleLoading, setRoleLoading] = useState(true)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const router = useRouter()

  useEffect(() => {
    let isMounted = true

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
        const { data, error } = await (supabase as any)
          .from('user_roles')
          .select('role, permissions')
          .eq('user_id', userId)
          .maybeSingle()

        if (!isMounted) return

        if (error && (error.message?.includes('does not exist') || error.code === '42P01')) {
          console.warn('Tabela user_roles não encontrada. Usando role padrão: admin')
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
          return
        }

        const roleValue = (data as { role?: AppRole; permissions?: Record<string, boolean> } | null)?.role
        const userPermissions =
          (data as { role?: AppRole; permissions?: Record<string, boolean> } | null)?.permissions || {}

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
          console.warn('Erro ao buscar role, usando padrão:', err)
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
        } = await supabase.auth.getSession()
        if (!isMounted) return
        await applySession(session?.user ?? null)
      } catch {
        if (isMounted) {
          setUser(null)
          setRole('limitada')
          setPermissions({})
          setRoleLoading(false)
          setLoading(false)
        }
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
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
