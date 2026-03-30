'use client'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { useAuth } from '@/lib/hooks/useAuth'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Força a remoção de Service Workers antigos que causam erro de cache
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    let unregisterCount = 0;
    for (const registration of registrations) {
      await registration.unregister()
      console.log('Service Worker antigo removido com sucesso.')
      unregisterCount++;
    }

    // Previne loop infinito de reload verificando o sessionStorage
    if (unregisterCount > 0 && !sessionStorage.getItem('sw_reloaded')) {
      sessionStorage.setItem('sw_reloaded', 'true');
      window.location.reload();
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
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
