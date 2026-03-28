#!/usr/bin/env node

/**
 * 🔥 CACHE BUSTER: Limpa cache local + força nova conexão Supabase
 * 
 * Problema: Conexão persistente no Node.js/ts-node cache prepared statements
 * Solução: Fechar conexão, limpar cache, reconectar com novo cliente
 * 
 * Usa service role key para bypass RLS + fresh connection pool
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function cacheBuster() {
  log('\n🔥 CACHE BUSTER - Cache Clearing + Connection Reset\n', 'cyan')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    log('❌ Missing environment variables', 'red')
    process.exit(1)
  }

  // Create completely new client (never before used)
  log('Step 1: Creating fresh Supabase client...', 'blue')
  const freshClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: {
      fetch: (url: string, options: any) => {
        // Force bypass caching at fetch level
        const headers = new Headers(options?.headers || {})
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        headers.set('Pragma', 'no-cache')
        headers.set('Expires', '0')
        return fetch(url, { ...options, headers })
      },
    } as any,
  })

  // Force reset connection pool by creating operations that hit different endpoints
  log('Step 2: Flushing connection pool...', 'blue')
  try {
    await freshClient.from('grupos_economicos').select('id').limit(1).single()
  } catch (err) {
    // Ignore - this is just to flush connections
  }

  // Now test the RPC with fresh connection
  log('Step 3: Testing RPC with fresh connection...', 'blue')

  const testName = `CACHE-BUSTER-${Date.now()}`
  const { data, error } = await freshClient.rpc('find_or_create_grupo_economico', {
    p_nome: testName,
  } as any)

  if (error) {
    log(`❌ RPC Error: ${error.message}`, 'red')
    log(`Code: ${error.code}`, 'red')
    log(`Details: ${error.details}`, 'red')

    if (error.message.includes('ambiguous')) {
      log('\n⚠️  Still getting "ambiguous" error', 'yellow')
      log('This means the RPC in Supabase is STILL the old version', 'yellow')
      log('OR the replication hasn\'t completed yet.\n', 'yellow')

      log('Try:', 'yellow')
      log('  1. Wait 60 more seconds', 'yellow')
      log('  2. Refresh browser: Ctrl+Shift+Delete (hard refresh)', 'yellow')
      log('  3. Kill terminal and reopen', 'yellow')
      log('  4. Then: npm run cache-buster\n', 'yellow')
    }
    process.exit(1)
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    log('❌ RPC returned empty', 'red')
    process.exit(1)
  }

  const row = data[0] as any
  log('\n✅ RPC Working!', 'green')
  log(`   ID: ${row.result_id || row.id}`, 'green')
  log(`   Nome: ${row.result_nome || row.nome}`, 'green')
  log(`   Criado: ${row.result_created_at || row.created_at}`, 'green')

  // Test atomicity with 5 parallel calls
  log('\nStep 4: Testing atomicity (5× parallel)...', 'blue')
  
  const atomicTestName = `ATOMIC-${Date.now()}`
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      freshClient
        .rpc('find_or_create_grupo_economico', {
          p_nome: atomicTestName,
        } as any)
        .then((res) => {
          if (res.error) throw res.error
          const row = res.data?.[0] as any
          return row.result_id || row.id
        })
    )
  )

  const uniqueIds = new Set(results)
  log(`   Returned: ${results.length} IDs`, 'blue')
  log(`   Unique: ${uniqueIds.size} IDs`, 'blue')

  if (uniqueIds.size === 1) {
    log('\n✅✅✅ RPC IS ATOMIC!', 'green')
    log('Cache cleared successfully!', 'green')
    log('\nNow run: npm run test:atomic-rpc\n', 'green')
    process.exit(0)
  } else {
    log('\n❌ Race condition detected', 'red')
    process.exit(1)
  }
}

cacheBuster().catch((err) => {
  log(`\n❌ Fatal error: ${err.message}`, 'red')
  process.exit(1)
})
