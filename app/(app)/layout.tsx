'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/lib/hooks/useAuth'
import { useNavigationTimeout } from '@/lib/hooks/useNavigationTimeout'

const AUTH_LOADING_FAILSAFE_MS = 12000

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading, role, roleLoading, permissions } = useAuth()
  
  // Ativar timeout global de navegação
  useNavigationTimeout()
  const [authTimeoutReached, setAuthTimeoutReached] = useState(false)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403) return false
              return failureCount < 2
            },
            staleTime: 5 * 60 * 1000,  // 5 minutos - dados permanecem fresh
            gcTime: 10 * 60 * 1000,     // 10 minutos - manter na memória
          },
        },
      })
  )

  useEffect(() => {
    if (!loading && !roleLoading) {
      setAuthTimeoutReached(false)
      return
    }

    const timer = setTimeout(() => {
      setAuthTimeoutReached(true)
      router.replace('/login')
    }, AUTH_LOADING_FAILSAFE_MS)

    return () => clearTimeout(timer)
  }, [loading, roleLoading, router])

  useEffect(() => {
    if (loading || roleLoading) return

    if (!user) {
      router.replace('/login')
      return
    }

    // Se for role limitada, verificar permissões
    if (role === 'limitada') {
      // Pegar primeira parte da rota (ex: /clientes/123 -> clientes)
      const routeSegment = pathname.split('/')[1]

      // Rotas que nunca devem ser bloqueadas (evita loops de redirect)
      const alwaysAllowed = ['sem-acesso', 'loading']
      if (alwaysAllowed.includes(routeSegment)) return

      // Mapear TODAS as rotas para suas chaves de permissão reais
      // Deve espelhar os permissionKey do Sidebar e AVAILABLE_PERMISSIONS
      const permissionAlias: Record<string, string> = {
        // Sub-rotas do Dashboard Hub
        leads: 'faturas',
        oportunidades: 'dashboard',
        'monitor-faturas': 'dashboard',
        demonstrativos: 'dashboard',
        // Rotas que compartilham permissão de "clientes"
        unidades: 'clientes',
        contatos: 'clientes',
        'grupos-economicos': 'clientes',
      }
      const permKey = permissionAlias[routeSegment] || routeSegment

      // Se não tem permissão para essa seção, redirecionar para primeira permitida
      if (!permissions[permKey]) {
        // Ordem preferencial de redirecionamento (mais útil primeiro)
        const preferredOrder = ['dashboard', 'clientes', 'faturas', 'tags', 'relatorios', 'tecnica', 'interacoes']
        const firstAllowedRoute = preferredOrder.find(key => permissions[key]) 
          || Object.keys(permissions).find(key => permissions[key])

        if (firstAllowedRoute) {
          router.replace(`/${firstAllowedRoute}`)
        } else {
          // Sem permissões, redirecionar para mensagem de acesso negado
          router.replace('/sem-acesso')
        }
      }
    }
  }, [loading, roleLoading, user, role, permissions, pathname, router])

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {authTimeoutReached ? 'Redirecionando para login...' : 'Carregando...'}
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>{children}</AppShell>
      <Toaster />
    </QueryClientProvider>
  )
}
