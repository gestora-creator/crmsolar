'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, UserCircle, Zap, MessageSquare, Crown, ChevronLeft, ChevronRight, ChevronDown, KeyRound, BarChart3, MonitorPlay, ExternalLink, Tag, ScanSearch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

type NavChild = {
  title: string
  href: string
  icon: LucideIcon
  external?: boolean
}

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  permissionKey?: string
  roles: Array<'admin' | 'limitada'>
  children?: NavChild[]
}

const navItems: NavItem[] = [
  {
    title: 'Dashboards',
    href: '/dashboard',
    icon: BarChart3,
    permissionKey: 'dashboard',
    roles: ['admin', 'limitada'],
    children: [
      { title: 'Visão Geral', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Faturas', href: '/faturas', icon: Zap },
      { title: 'Interações', href: '/interacoes', icon: MessageSquare },
      { title: 'Oportunidades', href: '/oportunidades', icon: Crown },
      { title: 'Monitor de Faturas', href: '/monitor-faturas', icon: ScanSearch },
      { title: 'Monitor de Envios', href: '/tv', icon: MonitorPlay, external: true },
    ],
  },
  {
    title: 'Clientes',
    href: '/clientes',
    icon: Users,
    permissionKey: 'clientes',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Relacionamentos',
    href: '/contatos',
    icon: UserCircle,
    permissionKey: 'clientes',
    roles: ['admin', 'limitada'],
  },
  {
    title: 'Tags',
    href: '/tags',
    icon: Tag,
    permissionKey: 'clientes',
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Dashboards']))
  const { user, role, permissions } = useAuth()
  
  const visibleNavItems = navItems.filter((item) => {
    if (!item.roles.includes(role)) return false
    if (role === 'admin') return true
    if (role === 'limitada' && item.permissionKey) {
      return permissions[item.permissionKey] === true
    }
    return false
  })

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setIsCollapsed(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('sidebar-collapsed', String(isCollapsed))
    }
  }, [isCollapsed, mounted])

  // Auto-expandir grupo quando sub-rota ativa
  useEffect(() => {
    visibleNavItems.forEach((item) => {
      if (item.children) {
        const isChildActive = item.children.some(
          (child) => pathname === child.href || pathname.startsWith(child.href + '/')
        )
        if (isChildActive) {
          setExpandedGroups((prev) => new Set([...prev, item.title]))
        }
      }
    })
  }, [pathname])

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  const getUserName = () => {
    if (!user || !user.email) return 'Usuário'
    return user.email.split('@')[0] || 'Usuário'
  }

  const isItemActive = (href: string) => 
    pathname === href || pathname.startsWith(href + '/')

  const renderNavLink = (
    title: string,
    href: string,
    Icon: LucideIcon,
    isActive: boolean,
    indent = false,
    external = false,
  ) => {
    const classes = cn(
      'relative flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm font-medium',
      'transition-colors duration-150 group h-9',
      isActive
        ? 'text-foreground bg-primary/8 border border-primary/20'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
      indent && 'ml-4 pl-3',
      isCollapsed && 'justify-center px-2 ml-0'
    )

    const content = (
      <>
        <Icon className={cn(
          'h-4 w-4 flex-shrink-0 transition-colors duration-150',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          indent && 'h-3.5 w-3.5'
        )} />
        {!isCollapsed && (
          <span className={cn('truncate', indent && 'text-[13px]')}>{title}</span>
        )}
        {external && !isCollapsed && (
          <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground opacity-50" />
        )}
        {isActive && !isCollapsed && !external && (
          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </>
    )

    if (external) {
      return (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
          title={isCollapsed ? `${title} (nova aba)` : undefined}
        >
          {content}
        </a>
      )
    }

    return (
      <Link key={href} href={href} className={classes} title={isCollapsed ? title : undefined}>
        {content}
      </Link>
    )
  }

  return (
    <aside className={cn(
      'relative flex flex-col border-r border-border bg-card transition-all duration-300 h-screen',
      isCollapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex items-center justify-between gap-3 border-b border-border px-5 py-5',
        isCollapsed && 'justify-center px-3'
      )}>
        {!isCollapsed && (
          <Link href="/dashboard" className="group cursor-pointer flex-1">
            <div className="flex items-baseline gap-1 transition-all duration-300 group-hover:scale-105 origin-left">
              <span className="text-xl font-light tracking-tight text-emerald-600">Solar</span>
              <span className="text-xl font-bold tracking-tight text-foreground">Energy</span>
              <span className="ml-2 rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CRM</span>
            </div>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'h-8 w-8 flex-shrink-0 rounded-md border border-border bg-background text-muted-foreground',
            'transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95 cursor-pointer',
            isCollapsed && 'mx-auto'
          )}
          title={isCollapsed ? 'Expandir' : 'Recolher'}
        >
          <div className="flex items-center justify-center w-full h-full">
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </div>
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 space-y-0.5 px-2.5 py-3 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          const hasChildren = item.children && item.children.length > 0
          const isGroupExpanded = expandedGroups.has(item.title)
          const isParentActive = hasChildren
            ? item.children!.some((c) => isItemActive(c.href))
            : isItemActive(item.href)

          if (hasChildren) {
            return (
              <div key={item.title} className="space-y-0.5">
                {/* Parent com toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (isCollapsed) {
                      // Em modo colapsado, navegar para o primeiro filho
                      window.location.href = item.children![0].href
                    } else {
                      toggleGroup(item.title)
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg px-3.5 py-2 text-sm font-medium',
                    'transition-colors duration-150 h-9',
                    isParentActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    isCollapsed && 'justify-center px-2'
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isParentActive ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  {!isCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{item.title}</span>
                      <ChevronDown className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                        isGroupExpanded && 'rotate-180'
                      )} />
                    </>
                  )}
                </button>

                {/* Children */}
                {!isCollapsed && isGroupExpanded && (
                  <div className="space-y-0.5 pb-1">
                    {item.children!.map((child) => {
                      const ChildIcon = child.icon
                      return renderNavLink(
                        child.title,
                        child.href,
                        ChildIcon,
                        isItemActive(child.href),
                        true,
                        child.external || false
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return renderNavLink(item.title, item.href, Icon, isItemActive(item.href))
        })}
      </nav>

      {/* Usuário */}
      <div className={cn(
        'border-t border-border bg-muted/30 p-3',
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
              <p className="truncate text-sm font-medium leading-tight text-foreground">{getUserName()}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {role === 'admin' ? 'Administrador' : 'Acesso limitado'}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
