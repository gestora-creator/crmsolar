import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Rotas públicas que não precisam de autenticação
const PUBLIC_ROUTES = ['/login', '/tv', '/api/tv']

// Rotas de API que têm sua própria autenticação via Bearer token
const API_ROUTES = ['/api/']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rotas públicas
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // APIs fazem sua própria autenticação via header Authorization
  if (API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Permitir assets estáticos
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/logo') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next()
  }

  // Criar response mutável para atualizar cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    // Sem config do Supabase, redirecionar para login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // Verificar sessão — isso também faz refresh do token se necessário
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Se não tem sessão válida, redirecionar para login
  if (error || !user) {
    const loginUrl = new URL('/login', request.url)
    // Preservar a URL original para redirect após login
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Proteger todas as rotas exceto as que começam com _next, api, ou são estáticas
    '/((?!_next/static|_next/image|favicon.ico|logo.svg).*)',
  ],
}
