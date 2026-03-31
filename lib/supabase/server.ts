import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll pode falhar em Server Components (read-only)
            // Isso é seguro — o middleware cuida do refresh
          }
        },
      },
    }
  )
}

/**
 * Client com SERVICE_ROLE_KEY para operações admin (bypass RLS)
 */
export async function createSupabaseAdmin() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Silenciar em contextos read-only
          }
        },
      },
    }
  )
}
