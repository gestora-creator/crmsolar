// Cliente Supabase browser-side — usado por todos os componentes 'use client'.
//
// IMPORTANTE: NÃO setar `storageKey` custom aqui. O @supabase/ssr usa essa
// chave como nome do cookie SSR; alterá-la quebra a leitura do cookie no
// proxy.ts (que usa createServerClient sem storageKey, esperando o nome
// padrão sb-<project>-auth-token). Causou loop /login?reason=session_expired
// em 13/05/2026 — não repetir.

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

// Singleton por janela — evita múltiplos GoTrueClient (causa de loops de
// refresh em HMR/Next dev) e centraliza o listener global de auth.
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
      supabaseAnonKey || 'not-configured'
    )
  }

  const client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

  // Listener GLOBAL único — registrado uma vez, não a cada hook que monta.
  // Reduz drasticamente as chamadas em /user e centraliza o tratamento de
  // TOKEN_REFRESHED sem sessão (= refresh falhou → logout limpo).
  if (typeof window !== 'undefined' && !globalThis.__gonova_supabase__) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('[Auth] Refresh token inválido — encerrando sessão')
        void client.auth.signOut().finally(() => {
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
