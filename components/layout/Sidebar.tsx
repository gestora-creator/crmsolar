'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, FileText, MessageSquare, Tag, Zap, ChevronLeft, ChevronRight, Wrench, KeyRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/useAuth'

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  permissionKey?: string
  roles: Array<'admin' | 'limitada'>
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    permissionKey: 'dashboard',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Clientes',
    href: '/clientes',
    icon: Users,
    permissionKey: 'clientes',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Dados Técnicos',
    href: '/tecnica',
    icon: Wrench,
    permissionKey: 'tecnica',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Interações',
    href: '/interacoes',
    icon: MessageSquare,
    permissionKey: 'interacoes',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Tags',
    href: '/tags',
    icon: Tag,
    permissionKey: 'tags',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Faturas',
    href: '/faturas',
    icon: Zap,
    permissionKey: 'faturas',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Relatórios',
    href: '/relatorios',
    icon: FileText,
    permissionKey: 'relatorios',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Permissões',
    href: '/permicoes',
    icon: KeyRound,
    permissionKey: 'permicoes',
    roles: ['admin'],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { user, role, permissions } = useAuth()
  
  // Filtrar itens baseado em role e permissões
  const visibleNavItems = navItems.filter((item) => {
    // Se não tem a role necessária, não mostra
    if (!item.roles.includes(role)) return false
    
    // Se é admin, mostra tudo que tem permissão de role
    if (role === 'admin') return true
    
    // Se é limitada, verificar permissões individuais
    if (role === 'limitada' && item.permissionKey) {
      return permissions[item.permissionKey] === true
    }
    
    return false
  })

  useEffect(() => {
    // Inicializar sidebar collapsed state só uma vez
    setMounted(true)
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') {
      setIsCollapsed(true)
    }
  }, []) // Dependência vazia = roda só uma vez na montagem

  useEffect(() => {
    // Atualizar selected index quando pathname muda
    const activeIndex = visibleNavItems.findIndex(
      (item) => pathname === item.href || pathname.startsWith(item.href + '/')
    )
    if (activeIndex !== -1) {
      setSelectedIndex(activeIndex)
    }
  }, [pathname, visibleNavItems])

  useEffect(() => {
    // Salvar collapsed state no localStorage quando muda
    if (mounted) {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed))
    }
  }, [isCollapsed, mounted])

  const getUserName = () => {
    if (!user || !user.email) return 'Usuário'
    const emailName = user.email.split('@')[0]
    return emailName || 'Usuário'
  }

  return (
    <aside className={cn(
      'relative border-r border-border bg-card shadow-sm transition-all duration-300',
      isCollapsed ? 'w-16' : 'w-64'
    )}>
      <div className={cn(
        'relative flex items-center justify-between gap-3 border-b border-border px-6 py-6',
        isCollapsed && 'justify-center px-3'
      )}>
        {!isCollapsed && (
          <Link href="/dashboard" className="group cursor-pointer flex-1">
            <div className="flex items-baseline gap-1 transition-all duration-300 group-hover:scale-105 origin-left group-hover:drop-shadow-md logo-container">
                <span className="text-2xl font-light tracking-tight text-emerald-600 transition-all duration-300 group-hover:text-emerald-700">Solar</span>
                <span className="text-2xl font-bold tracking-tight text-foreground transition-all duration-300 group-hover:text-foreground">Energy</span>
                <span className="logo-badge ml-2 rounded-md bg-muted px-2.5 py-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground transition-all duration-300 group-hover:bg-foreground group-hover:text-background group-hover:shadow-md">CRM</span>
              </div>
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            console.log('Button clicked! Current collapsed state:', isCollapsed)
            setIsCollapsed(!isCollapsed)
          }}
          className={cn(
            'collapse-btn relative z-10 h-9 w-9 flex-shrink-0 rounded-md border border-border bg-background text-muted-foreground transition-all duration-300 hover:border-border hover:bg-accent hover:text-foreground active:scale-95 cursor-pointer',
            isCollapsed && 'mx-auto w-10 h-10'
          )}
          title={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          <div className="flex items-center justify-center w-full h-full">
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5 transition-transform duration-300" />
            ) : (
              <ChevronLeft className="h-5 w-5 transition-transform duration-300" />
            )}
          </div>
        </button>
      </div>
      <nav className="relative space-y-1 px-3 py-4">
        {/* Barra indicadora deslizante */}
        <div className={cn(
          'absolute left-3 right-3 h-9 rounded-lg bg-primary/8 transition-all duration-200 ease-in-out',
          'pointer-events-none border border-primary/30'
        )} style={{
          transform: `translateY(${selectedIndex * 44}px)`,
        }} />
        
        {visibleNavItems.map((item, index) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium',
                'transition-colors duration-200 ease-out group',
                'h-10',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
                isCollapsed && 'justify-center px-2'
              )}
              title={isCollapsed ? item.title : undefined}
            >
              <Icon className={cn(
                'h-5 w-5 flex-shrink-0 transition-all duration-200',
                isActive ? 'text-primary scale-110' : 'text-muted-foreground group-hover:text-foreground'
              )} />
              {!isCollapsed && <span className="truncate transition-all duration-200">{item.title}</span>}
              {isActive && !isCollapsed && (
                <div className="ml-auto h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          )
        })}
      </nav>
      
      {/* Indicador visual para sidebar colapsada */}
      {isCollapsed && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
          <div className="flex flex-col space-y-1">
            <div className="h-1 w-1 rounded-full bg-border"></div>
            <div className="h-1 w-1 rounded-full bg-border"></div>
            <div className="h-1 w-1 rounded-full bg-border"></div>
          </div>
        </div>
      )}

      {/* Seção do Usuário */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 border-t border-border bg-muted/40 p-3',
        isCollapsed && 'px-2'
      )}>
        <div className={cn(
          'flex items-center gap-2',
          isCollapsed && 'justify-center'
        )}>
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-slate-600 flex items-center justify-center text-white font-semibold text-xs">
            {getUserName().charAt(0).toUpperCase()}
          </div>
          
          {!isCollapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">{getUserName()}</p>
              <p className="truncate text-xs leading-tight text-muted-foreground">Sistema CRM</p>
              <p className="text-[0.6rem] leading-none text-muted-foreground/40 mt-1 font-medium tracking-wider uppercase">v1.3.public</p>
            </div>
          )}

        </div>
      </div>
    </aside>
  )
}
