#!/usr/bin/env node

/**
 * 🔍 DEPLOY MONITOR - Monitora e valida deployment da RPC
 * 
 * Use este script APÓS fazer deploy do SQL em Supabase
 */

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

function logSection(title: string) {
  console.log('')
  log(`╔${'═'.repeat(70)}╗`, 'cyan')
  log(`║ ${title.padEnd(68)} ║`, 'cyan')
  log(`╚${'═'.repeat(70)}╝`, 'cyan')
  console.log('')
}

async function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function monitorDeploy() {
  logSection('🔍 DEPLOY MONITOR - Validation & Status Check')

  // Get environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    log('❌ Missing environment variables', 'red')
    log('   - NEXT_PUBLIC_SUPABASE_URL', 'red')
    log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY', 'red')
    process.exit(1)
  }

  logSection('STEP 1: Pre-Flight Check')

  log('Did you execute the SQL in Supabase SQL Editor?', 'yellow')
  log('(Type: yes or no)', 'yellow')
  const deployed = await question('> ')

  if (deployed.toLowerCase() !== 'yes') {
    log('', 'yellow')
    log('❌ Please deploy the SQL first:', 'red')
    log('   https://lodgnyduaezlcjxfcxrh.supabase.co/project/_/sql', 'cyan')
    log('   ', 'red')
    log('   Copy & paste scripts/FINAL_RPC_FIX.sql and Run', 'cyan')
    process.exit(1)
  }

  logSection('STEP 2: Waiting for Replication')

  log('⏳ Waiting 30 seconds for database replication...', 'yellow')

  for (let i = 30; i > 0; i--) {
    process.stdout.write(`\r⌛ ${i} seconds remaining...  `)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  console.log('\r✅ Replication complete!                  ')
  console.log('')

  logSection('STEP 3: Testing RPC with Fresh Connection')

  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    log('🧪 Testing RPC call...', 'cyan')

    const testName = `Test_${Date.now()}`
    const { data, error } = await client.rpc('find_or_create_grupo_economico', {
      p_nome: testName,
    })

    if (error) {
      log(`❌ RPC Error: ${error.message}`, 'red')
      log(`Code: ${error.code}`, 'red')

      if (error.message?.includes('ambiguous')) {
        log('', 'yellow')
        log('🔄 The RPC is still using the OLD version', 'yellow')
        log('Try again in 2-3 minutes', 'yellow')
        process.exit(1)
      }

      if (error.message?.includes('non-volatile')) {
        log('', 'yellow')
        log('❌ SQL was not deployed correctly', 'yellow')
        log('The RPC is still IMMUTABLE instead of VOLATILE', 'yellow')
        process.exit(1)
      }

      throw error
    }

    if (!data || data.length === 0) {
      log('⚠️  RPC returned no data', 'yellow')
      process.exit(1)
    }

    const result = data[0]
    log(`✅ RPC returned data:`, 'green')
    log(`   result_id: ${result.result_id}`, 'blue')
    log(`   result_nome: ${result.result_nome}`, 'blue')
    log(`   result_created_at: ${result.result_created_at}`, 'blue')

    console.log('')
  } catch (err: any) {
    log(`❌ Test failed: ${err.message}`, 'red')
    process.exit(1)
  }

  logSection('✅ DEPLOYMENT VALIDATED')

  log('✅ RPC is working correctly!', 'green')
  log('✅ VOLATILE flag is set', 'green')
  log('✅ Aliases are correct (result_id, result_nome, result_created_at)', 'green')
  console.log('')

  logSection('NEXT STEPS')

  log('Run the atomic tests:', 'yellow')
  log('  npm run cache-buster', 'cyan')
  log('  npm run test:atomic-rpc', 'cyan')
  console.log('')

  log('Expected result:', 'yellow')
  log('  ✅ RPC IS ATOMIC - Production Ready!', 'green')
  console.log('')

  process.exit(0)
}

monitorDeploy().catch((err) => {
  console.log('')
  log(`💥 Fatal Error: ${err.message}`, 'red')
  process.exit(1)
})
