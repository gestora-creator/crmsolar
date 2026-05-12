import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Middleware Supabase SSR — OBRIGATÓRIO para @supabase/ssr.
 *
 * Sem este arquivo, o cookie de sessão NÃO é renovado a cada request, o que
 * causa o erro "AuthApiError: Invalid Refresh Token: Refresh Token Not Found"
 * observado nos logs de produção (https://crmsolarenergy.netlify.app).
 *
 * Coloque este arquivo na RAIZ do projeto (mesmo nível de package.json), não dentro de /app.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: getUser() valida o token contra o Auth server e força refresh
  // se necessário. NÃO trocar por getSession() — esse último não revalida.
  const { data: { user }, error } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/'

  // Se o refresh falhou (token revogado/expirado/inválido) e a rota é protegida,
  // limpa cookies podres e redireciona para login — evita a cascata de 503s.
  if ((error || !user) && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('reason', 'session_expired')

    const redirect = NextResponse.redirect(url)
    // Limpar qualquer cookie sb-* deixado para trás
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) {
        redirect.cookies.delete(cookie.name)
      }
    }
    return redirect
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas EXCETO:
     * - _next/static (arquivos estáticos)
     * - _next/image  (otimização de imagem)
     * - favicon, robots, sitemap
     * - assets públicos (svg, png, jpg, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
