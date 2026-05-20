/**
 * Guard de auth para rotas de atendimento/chamados (/api/chamados/*).
 *
 * Libera acesso para:
 *   1. Usuários com role administrativa (admin/owner/gestor); OU
 *   2. Usuários com a permissão granular `atendimento` em user_roles.permissions.
 *
 * Mesmo critério que gateia a tela /atendimento no app — "admin + atendentes".
 *
 * Uso em route handler:
 *   const guard = await requireAtendimento()
 *   if (!guard.ok) return guard.response
 *   const { user } = guard
 */

import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_ROLES = new Set(['admin', 'owner', 'gestor'])
const PERMISSION_KEY = 'atendimento'

// Service role só no server — lê user_roles bypassando RLS.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Guard =
  | { ok: true; user: { id: string; email: string | null }; role: string }
  | { ok: false; response: NextResponse }

export async function requireAtendimento(): Promise<Guard> {
  const ssr = await createSupabaseServer()
  const { data: { user } } = await ssr.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    }
  }

  const { data: rows, error } = await admin
    .from('user_roles')
    .select('role, permissions')
    .eq('user_id', user.id)

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'role_check_failed', details: error.message },
        { status: 403 }
      ),
    }
  }

  let role = 'limitada'
  let allowed = false

  for (const r of rows ?? []) {
    const rec = r as { role?: string | null; permissions?: Record<string, unknown> | null }
    if (rec.role) {
      role = rec.role
      if (ADMIN_ROLES.has(rec.role)) allowed = true
    }
    if (rec.permissions && rec.permissions[PERMISSION_KEY]) allowed = true
  }

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    role,
  }
}
