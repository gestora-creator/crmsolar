/**
 * Middleware global de auth (Next.js App Router + @supabase/ssr).
 *
 * Decisao arquitetural (2026-05-18, task #39): defesa em profundidade.
 * Antes a auth era feita endpoint-por-endpoint via requireUser/requireAdmin.
 * Agora o middleware bloqueia tudo que nao esta na whitelist publica
 * ANTES de chegar no route handler. requireUser/requireAdmin continuam
 * existindo nos handlers como segunda camada (uns logam, outros checam
 * role admin) — nao remover.
 *
 * Whitelist intencional (rotas publicas ou com auth propria):
 *   - /login           → pagina de login (publica)
 *   - /                → app/page.tsx faz redirect inteligente baseado em sessao
 *   - /api/timeline    → webhook n8n; valida Bearer service_role internamente
 *   - /api/receita     → proxy publico da Receita Federal (sem PII)
 *   - /api/tv          → TV no escritorio (metricas agregadas)
 *   - /api/monitor-faturas/health → health check
 *
 * Para tudo o mais:
 *   - /api/*           → 401 JSON se sem user
 *   - /(app)/*         → redirect para /login?redirect=<path>
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS_EXACT = new Set<string>([
  '/',
  '/login',
])

const PUBLIC_PATH_PREFIXES = [
  '/api/timeline',
  '/api/receita',
  '/api/tv',
  '/api/monitor-faturas/health',
]

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS_EXACT.has(pathname)) return true
  return PUBLIC_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return res
  }

  // Sem auth — bifurca por tipo de rota
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Pagina protegida → redirect pro login com retorno
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('redirect', pathname + (req.nextUrl.search || ''))
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    /*
     * Aplica em tudo, exceto:
     *   - _next/static (arquivos JS/CSS bundlados)
     *   - _next/image (otimizador de imagens)
     *   - favicon.ico, robots.txt, sitemap.xml
     *   - arquivos com extensao de imagem/font/audio
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|webm)$).*)',
  ],
}
