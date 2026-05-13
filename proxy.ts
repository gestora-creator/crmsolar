import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'

const PUBLIC_ROUTES = ['/login', '/tv', '/api/tv', '/api/timeline']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas e APIs com auth própria
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida o token e força refresh quando necessário.
  // Tratamos dois cenários distintos:
  //  - error.name === 'AuthApiError': refresh token rejeitado pelo Auth
  //    (token revogado/expirado). Aí faz sentido marcar session_expired
  //    e limpar cookies sb-* podres.
  //  - !user com erro "missing": usuário simplesmente nunca logou.
  //    Redireciona pro /login limpo, SEM reason — caso contrário
  //    o login normal mostra "sessão expirou" pra quem nunca logou.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (!user && !pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'

    // Só marca session_expired quando o erro indica refresh falhado.
    // AuthSessionMissingError (sem sessão) NÃO conta — é "nunca logou".
    const isRefreshFailure =
      error?.name === 'AuthApiError' ||
      (error?.message?.toLowerCase().includes('refresh') ?? false)

    if (isRefreshFailure) {
      url.searchParams.set('reason', 'session_expired')
    }

    const redirect = NextResponse.redirect(url)

    // Só limpa cookies quando o problema é refresh inválido. Se simplesmente
    // não havia cookie, não há nada pra limpar (e limpar sem motivo pode
    // apagar cookies legítimos em outras situações).
    if (isRefreshFailure) {
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith('sb-')) {
          redirect.cookies.delete(cookie.name)
        }
      }
    }
    return redirect
  }

  supabaseResponse.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  supabaseResponse.headers.set('Pragma', 'no-cache')
  supabaseResponse.headers.set('Expires', '0')

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
