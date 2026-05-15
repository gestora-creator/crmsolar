/**
 * Helper de auth basica: exige usuario autenticado (sem checagem de role).
 *
 * Uso em route handler:
 *   const guard = await requireUser()
 *   if (!guard.ok) return guard.response
 *   const { user } = guard
 *
 * Para rotas que precisam de admin/role, usar requireAdmin().
 */

import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

type Guard =
  | { ok: true; user: { id: string; email: string | null } }
  | { ok: false; response: NextResponse }

export async function requireUser(): Promise<Guard> {
  try {
    const ssr = await createSupabaseServer()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
      }
    }
    return { ok: true, user: { id: user.id, email: user.email ?? null } }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    }
  }
}
