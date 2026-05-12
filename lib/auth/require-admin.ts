/**
 * Helper de auth para rotas admin (/api/admin/*).
 *
 * Valida:
 *   1. Usuário autenticado (JWT cookie do Supabase SSR).
 *   2. Role admin via tabela `user_roles` (ajustar nome se diferente).
 *
 * Uso em route handler:
 *   const guard = await requireAdmin()
 *   if (!guard.ok) return guard.response
 *   const { user } = guard
 *
 * Convenção: a tabela `user_roles` tem colunas (user_id uuid, role text).
 * Se o nome no projeto for diferente, ajustar `ROLE_TABLE`/`ROLE_COL`.
 */

import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const ROLE_TABLE = 'user_roles'
const ROLE_USER_COL = 'user_id'
const ROLE_COL = 'role'
const ADMIN_ROLES = new Set(['admin', 'owner', 'gestor'])

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Guard =
  | { ok: true; user: { id: string; email: string | null }; role: string }
  | { ok: false; response: NextResponse }

export async function requireAdmin(): Promise<Guard> {
  const ssr = await createSupabaseServer()
  const { data: { user } } = await ssr.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    }
  }

  // Lê role com service_role pra bypassar RLS — segurança garantida pelo
  // service role estar só no server.
  const { data: roles, error } = await admin
    .from(ROLE_TABLE)
    .select(ROLE_COL)
    .eq(ROLE_USER_COL, user.id)

  if (error) {
    // Se a tabela não existe (projeto sem roles ainda), nega por padrão.
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'role_check_failed', details: error.message },
        { status: 403 }
      ),
    }
  }

  const userRole = roles?.map(r => (r as Record<string, unknown>)[ROLE_COL] as string)
    .find(r => ADMIN_ROLES.has(r))

  if (!userRole) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    role: userRole,
  }
}
