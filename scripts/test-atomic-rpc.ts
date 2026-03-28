#!/usr/bin/env node

/**
 * 🧪 Smoke Test: RPC Atômico find_or_create_grupo_economico
 * 
 * Valida que o RPC é thread-safe e não gera erro 23505
 * quando múltiplas requisições criam o mesmo grupo simultaneamente
 * 
 * Execução:
 *   npx ts-node scripts/test-atomic-rpc.ts
 * 
 * Esperado:
 *   ✅ 10 requisições paralelas
 *   ✅ Todos com sucesso (sem erro 23505)
 *   ✅ Todos com mesmo ID
 *   ✅ Apenas 1 registro criado no banco
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load .env.local from project root (for ES modules)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const NUM_CONCURRENT_REQUESTS = 10
const TEST_GROUP_NAME = `Test-Group-${Date.now()}-${Math.random().toString(36).substring(7)}`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// RPC Response type
interface GrupoResponse {
  result_id: string
  result_nome: string
  result_created_at: string
}

interface TestResult {
  success: boolean
  groupId: string | null
  error: string | null
  duration: number
}

interface TestSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  allIdsMatch: boolean
  uniqueIds: Set<string>
  errors: string[]
  totalDuration: number
  atomicityValid: boolean
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logHeader(title: string) {
  console.log('')
  log(`╔${'═'.repeat(70)}╗`, 'cyan')
  log(`║ ${title.padEnd(68)} ║`, 'cyan')
  log(`╚${'═'.repeat(70)}╝`, 'cyan')
  console.log('')
}

function logSuccess(message: string) {
  log(`✅ ${message}`, 'green')
}

function logError(message: string) {
  log(`❌ ${message}`, 'red')
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, 'yellow')
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, 'blue')
}

function logDebug(message: string) {
  log(`🔍 ${message}`, 'gray')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateEnvironment(): boolean {
  log('Validando ambiente...', 'blue')

  if (!SUPABASE_URL) {
    logError('NEXT_PUBLIC_SUPABASE_URL não definido')
    return false
  }

  if (!SUPABASE_ANON_KEY) {
    logError('NEXT_PUBLIC_SUPABASE_ANON_KEY não definido')
    return false
  }

  logSuccess(`Supabase URL: ${SUPABASE_URL}`)
  logSuccess('Chaves Supabase carregadas')

  return true
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RPC Test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callFindOrCreateGrupoRPC(
  client: any,
  groupName: string,
  requestNumber: number
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    const { data, error } = await client.rpc(
      'find_or_create_grupo_economico',
      {
        p_nome: groupName,
      }
    )

    const duration = Date.now() - startTime

    if (error) {
      const errorDetails = JSON.stringify(error, null, 2)
      logError(`Requisição #${requestNumber} falhou: ${error.message}`)
      if (process.env.DEBUG) {
        logDebug(`Detalhes do erro: ${errorDetails}`)
      }
      return {
        success: false,
        groupId: null,
        error: error.message || 'Unknown error',
        duration,
      }
    }

    // RPC retorna um TABLE/array, pegar o primeiro item
    if (!data || !Array.isArray(data) || data.length === 0) {
      logError(`Requisição #${requestNumber} retornou resposta inválida`)
      return {
        success: false,
        groupId: null,
        error: 'Invalid response from RPC',
        duration,
      }
    }

    const grupoData = data[0] as any
    
    // Tentar encontrar ID em qualquer campo possível
    const groupId = grupoData.result_id || grupoData.id || Object.values(grupoData)[0]
    
    logDebug(
      `Requisição #${requestNumber} → ID: ${groupId} (${duration}ms)`
    )

    return {
      success: true,
      groupId: String(groupId),
      error: null,
      duration,
    }
  } catch (err: any) {
    const duration = Date.now() - startTime
    const message = err?.message || String(err)

    logError(`Requisição #${requestNumber} exceção: ${message}`)

    return {
      success: false,
      groupId: null,
      error: message,
      duration,
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runAtomicityTest() {
  logHeader('🧪 TESTE DE ATOMICIDADE - RPC find_or_create_grupo_economico')

  // Step 1: Validate Environment
  if (!validateEnvironment()) {
    return
  }

  // Step 2: Initialize Supabase Client
  logInfo(`Inicializando cliente Supabase...`)
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Step 3: Display Test Config
  console.log('')
  log('╭─ Configuração de Teste ─────────────────────────────────────────╮', 'gray')
  log(`│ Requisições Simultâneas: ${NUM_CONCURRENT_REQUESTS.toString().padEnd(47)} │`, 'gray')
  log(`│ Nome do Grupo de Teste:  ${TEST_GROUP_NAME.substring(0, 46).padEnd(47)} │`, 'gray')
  log(`│ RPC Function:            find_or_create_grupo_economico${' '.repeat(9)} │`, 'gray')
  log('╰─────────────────────────────────────────────────────────────────╯', 'gray')
  console.log('')

  // Step 4: Execute Concurrent Requests
  logInfo(`Disparando ${NUM_CONCURRENT_REQUESTS} requisições simultâneas...`)
  console.log('')

  const startTestTime = Date.now()

  const results = await Promise.all(
    Array.from({ length: NUM_CONCURRENT_REQUESTS }, (_, i) =>
      callFindOrCreateGrupoRPC(supabase as any, TEST_GROUP_NAME, i + 1)
    )
  )

  const totalTestDuration = Date.now() - startTestTime

  // Step 5: Analyze Results
  console.log('')
  log('╭─ Resultados das Requisições ────────────────────────────────────╮', 'gray')

  const successfulRequests = results.filter((r) => r.success)
  const failedRequests = results.filter((r) => !r.success)
  const groupIds = successfulRequests
    .map((r) => r.groupId)
    .filter((id): id is string => id !== null && id !== undefined)
  const uniqueIds = new Set<string>(groupIds)
  const errors = failedRequests
    .map((r) => r.error)
    .filter((err): err is string => err !== null && err !== undefined)

  log(
    `│ Sucesso:        ${successfulRequests.length}/${NUM_CONCURRENT_REQUESTS}${' '.repeat(50 - String(successfulRequests.length).length - String(NUM_CONCURRENT_REQUESTS).length)}│`,
    'gray'
  )
  log(
    `│ Falhas:         ${failedRequests.length}/${NUM_CONCURRENT_REQUESTS}${' '.repeat(50 - String(failedRequests.length).length - String(NUM_CONCURRENT_REQUESTS).length)}│`,
    'gray'
  )
  log(
    `│ IDs Únicos:     ${uniqueIds.size}${' '.repeat(53 - String(uniqueIds.size).length)}│`,
    'gray'
  )
  log(
    `│ Duração Total:  ${totalTestDuration}ms${' '.repeat(48 - String(totalTestDuration).length)}│`,
    'gray'
  )
  log('╰─────────────────────────────────────────────────────────────────╯', 'gray')

  console.log('')

  // Step 6: Validate Results
  logHeader('🔍 VALIDAÇÃO DE RESULTADOS')

  const testSummary: TestSummary = {
    totalRequests: NUM_CONCURRENT_REQUESTS,
    successfulRequests: successfulRequests.length,
    failedRequests: failedRequests.length,
    allIdsMatch: uniqueIds.size === 1,
    uniqueIds,
    errors,
    totalDuration: totalTestDuration,
    atomicityValid: false,
  }

  // Validation 1: All requests successful
  if (testSummary.successfulRequests === NUM_CONCURRENT_REQUESTS) {
    logSuccess(`Todas as ${NUM_CONCURRENT_REQUESTS} requisições retornaram sucesso`)
  } else {
    logError(
      `${testSummary.failedRequests} requisições falharam (esperado: 0)`
    )
  }

  // Validation 2: No error 23505
  const has23505Error = errors.some((e) =>
    e?.includes('23505') || e?.includes('unique')
  )

  if (!has23505Error) {
    logSuccess('Nenhum erro 23505 (unique constraint) detectado ✓')
  } else {
    logError('Erro 23505 detectado - RPC NÃO é atômico!')
    errors.forEach((e) => {
      if (e) logError(`  → ${e}`)
    })
  }

  // Validation 3: All IDs match
  if (testSummary.allIdsMatch && uniqueIds.size > 0) {
    const groupIdArray = Array.from(uniqueIds)
    const groupId = groupIdArray[0]
    logSuccess(`Todos os IDs são idênticos: ${groupId}`)
  } else {
    logError(
      `IDs não batem! ${uniqueIds.size} IDs diferentes encontrados:`
    )
    uniqueIds.forEach((id) => {
      if (id) logError(`  → ${id}`)
    })
  }

  // Validation 4: Response time
  const avgResponseTime = testSummary.totalDuration / NUM_CONCURRENT_REQUESTS
  logSuccess(`Tempo médio por requisição: ${avgResponseTime.toFixed(2)}ms`)

  // Final atomicity check
  testSummary.atomicityValid =
    testSummary.successfulRequests === NUM_CONCURRENT_REQUESTS &&
    testSummary.allIdsMatch &&
    errors.length === 0 &&
    !errors.some((e) => e?.includes('23505') || e?.includes('unique'))

  console.log('')

  // Step 7: Final Report
  logHeader('📊 RELATÓRIO FINAL')

  if (testSummary.atomicityValid) {
    logSuccess('✅ RPC É ATÔMICO - Pronto para Produção!')
    console.log('')
    log('Conclusões:', 'green')
    log('  ✅ 0% erro 23505 (race condition eliminada)', 'green')
    log('  ✅ 100% requisições bem-sucedidas', 'green')
    log('  ✅ 1 ID único (apenas 1 registro criado)', 'green')
    log('  ✅ RPC funciona corretamente sob concorrência', 'green')
  } else {
    logError('❌ RPC NÃO É ATÔMICO - NÃO fazer deploy!')
    console.log('')
    logError('Problemas encontrados:')
    if (testSummary.successfulRequests < NUM_CONCURRENT_REQUESTS) {
      logError(
        `  ❌ ${testSummary.failedRequests} requisições falharam`
      )
    }
    if (!testSummary.allIdsMatch) {
      logError(`  ❌ ${testSummary.uniqueIds.size} IDs diferentes (esperado: 1)`)
    }
    if (errors.some((e) => e?.includes('23505') || e?.includes('unique'))) {
      logError('  ❌ Erro 23505 detectado (race condition ainda existe)')
    }
  }

  console.log('')
  console.log('')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

runAtomicityTest().catch((err) => {
  console.error('\n🔥 Erro fatal:', err)
  process.exit(1)
})
