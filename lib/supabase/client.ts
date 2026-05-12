// SUBSTITUI: lib/supabase/client.ts
// Mudanças vs versão atual:
//   1. Listener GLOBAL único de auth (não 7 por componente) — corta stampede em /user
//    2. Trata TOKEN_REFRESHED sem sessão como erro fatal → signOut + redirect
//    3. storageKey explícito evita colisão com outros apps no mesmo domínio
//   4. Singleton lazy correto (evita múltiplas instâncias em HMR)

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

// Singleton — uma única instância por janela do browser.
// Evita múltiplos GoTrueClient (causa de loops de refresh em HMR/Next dev).
declare global {
  // eslint-disable-next-line no-var
  var __gonova_supabase__: ReturnType<typeof createBrowserClient<Database>> | undefined
}

export function createClient() {
  if (typeof window !== 'undefined' && globalThis.__gonova_supabase__) {
    return globalThis.__gonova_supabase__
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.error(
        'Supabase: variáveis de ambiente ausentes — NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY'
      )
    }
    return createBrowserClient<Database>(
      supabaseUrl || 'https://not-configured.supabase.co',
      supabaseAnonKey || 'not-configured',
      {
        auth: {
          storageKey: 'gonova-crm-auth',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    )
  }

  const client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'gonova-crm-auth', // <- chave única; evita colisão entre apps
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })

  // Listener GLOBAL único — registrado uma vez, não a cada hook.
  // Reduz drasticamente as chamadas em /user que estão saturando o GoTrue.
  if (typeof window !== 'undefined' && !globalThis.__gonova_supabase__) {
    client.auth.onAuthStateChange((event, session) => {
      // Refresh falhou (sessão removida pelo SDK) → token revogado/expirado
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('[Auth] Refresh token inválido — encerrando sessão')
        void client.auth.signOut().finally(() => {
          // Limpa qualquer estado residual e força recarregar pela página de login
          try {
            localStorage.removeItem('gonova-crm-auth')
          } catch {}
          if (!location.pathname.startsWith('/login')) {
            location.href = '/login?reason=session_expired'
          }
        })
      }

      if (event === 'SIGNED_OUT' && !location.pathname.startsWith('/login')) {
        location.href = '/login'
      }
    })

    globalThis.__gonova_supabase__ = client
  }

  return client
}

export const supabase = createClient()
