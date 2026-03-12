import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Warn if using placeholder values
if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('⚠️ Supabase environment variables not configured. Some features may not work.')
}

export function createClient() {
  return createBrowserClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key'
  )
}

// Singleton para manter compatibilidade com imports existentes
// Todos os client components podem continuar usando: import { supabase } from '@/lib/supabase/client'
export const supabase = createClient()
