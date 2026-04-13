import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (typeof window !== 'undefined') {
      console.error('Supabase: variáveis de ambiente não configuradas (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)')
    }
    // Em build-time, usar valores vazios para não quebrar a compilação
    // Em runtime, o erro acima será logado
    return createBrowserClient<Database>(
      supabaseUrl || 'https://not-configured.supabase.co',
      supabaseAnonKey || 'not-configured'
    )
  }
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
}

// Singleton para manter compatibilidade com imports existentes
// Todos os client components podem continuar usando: import { supabase } from '@/lib/supabase/client'
export const supabase = createClient()
