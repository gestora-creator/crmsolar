/**
 * Helper de auth via getSession() — sub-milissegundo, sem fanout.
 *
 * DIFERENCA vs requireUser():
 *   - requireSession(): le cookie + valida assinatura JWT no Node. Zero chamadas
 *     ao Auth API. Custo: ~0ms.
 *   - requireUser():    chama /auth/v1/user remoto. Revalida que o user ainda
 *     existe (detecta revogacao imediata). Custo: ~100ms + bate em rate limit.
 *
 * QUANDO USAR CADA UM:
 *   - requireSession()  → 95% dos casos. Rotas de leitura/listagem normais.
 *   - requireUser()     → admin, role check, acoes destrutivas, suspeita de
 *                         revogacao recente. Use com moderacao.
 *
 * MOTIVO HISTORICO (2026-05-18, task #39):
 *   O patch anterior aplicou requireUser() em 17 handlers e gerou fanout no
 *   Auth API (cada page faz 5-10 fetches paralelos × 17 endpoints =
 *   stampede). Causou sessoes expirando em producao. requireSession() valida
 *   JWT localmente e elimina esse vetor.
 *
 * RISCO ACEITO:
 *   Se um admin REVOGAR uma sessao no Supabase Dashboard agora, o usuario
 *   revogado continua acessando /api/* protegidos por requireSession() ate o
 *   token expirar (default 1h). Para B2B CRM e aceitavel — revogacao manual
 *   e rara. Para acoes criticas (delete conta, mudar role) use requireUser().
 */

import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

type Guard =
  | { ok: true; user: { id: string; email: string | null } }
  | { ok: false; response: NextResponse }

export async function requireSession(): Promise<Guard> {
  try {
    const ssr = await createSupabaseServer()
    const { data: { session } } = await ssr.auth.getSession()
    if (!session?.user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
      }
    }
    return {
      ok: true,
      user: { id: session.user.id, email: session.user.email ?? null },
    }
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    }
  }
}
