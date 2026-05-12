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
  // Capturamos o erro para identificar refresh token inválido (AuthApiError)
  // e fazer logout limpo, evitando a cascata de 401/503 documentada em
  // 12/05/2026 (Invalid Refresh Token: Refresh Token Not Found).
  const { data: { user }, error } = await supabase.auth.getUser()

  if ((error || !user) && !pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (error) url.searchParams.set('reason', 'session_expired')

    const redirect = NextResponse.redirect(url)
    // Limpa cookies sb-* podres — se o refresh falhou, eles estão inválidos
    // e mantê-los gera loop de tentativa de refresh no próximo request.
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-')) {
        redirect.cookies.delete(cookie.name)
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
