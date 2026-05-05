'use client'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Força a remoção de Service Workers antigos que causam erro de cache
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    let unregisterCount = 0;
    for (const registration of registrations) {
      await registration.unregister()
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
  useKeyboardShortcuts()

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Skip to main content — acessibilidade teclado (WCAG 2.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-[var(--solar-secondary)] focus:px-4 focus:py-2 focus:text-white focus:shadow-lg focus:outline-none"
      >
        Ir para o conteúdo principal
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main id="main-content" className="flex-1 overflow-auto bg-background p-6" role="main">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
