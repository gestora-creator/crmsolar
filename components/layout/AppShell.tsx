'use client'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { useAuth } from '@/lib/hooks/useAuth'

// Força a remoção de Service Workers antigos que causam erro de cache
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister()
      console.log('Service Worker antigo removido com sucesso.')
    }

    // Se algum foi removido, recarrega a página uma única vez para limpar o estado
    if (registrations.length > 0) {
      window.location.reload()
    }
  })
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  useKeyboardShortcuts()

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
