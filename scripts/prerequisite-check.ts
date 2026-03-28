#!/usr/bin/env node

/**
 * ✅ PRÉ-REQUISITO CHECKER: Valida RPC antes de rodar smoke test
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

async function checkPrerequisites() {
  console.log('\n' + '='.repeat(70))
  console.log('  ✅ PRÉ-REQUISITO CHECKER - RPC Atomicity Test')
  console.log('='.repeat(70) + '\n')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.log('❌ Variáveis de ambiente não configuradas')
    console.log('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌')
    console.log('   SUPABASE_SERVICE_ROLE_KEY:', SERVICE_ROLE ? '✅' : '❌')
    process.exit(1)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // Test RPC
  console.log('🧪 Testando RPC find_or_create_grupo_economico...\n')
  
  const testName = `CHECK-${Date.now()}`
  const { data, error } = await admin.rpc('find_or_create_grupo_economico', {
    p_nome: testName,
  } as any)

  if (error) {
    console.log('❌ ERRO NA RPC')
    console.log('━'.repeat(70))
    console.log('Mensagem:', error.message)
    console.log('Código:', error.code)
    console.log('Detalhes:', error.details)
    console.log('━'.repeat(70))

    if (error.message.includes('ambiguous')) {
      console.log('\n🚨 DIAGNÓSTICO: RPC COM VERSÃO ANTIGA\n')
      console.log('A RPC no Supabase está retornando colunas ambíguas.')
      console.log('Isso significa que a função SQL ainda é a versão antiga.\n')
      console.log('SOLUÇÃO IMEDIATA:\n')
      console.log('1. Abra: https://app.supabase.com → SQL Editor')
      console.log('2. New Query')
      console.log('3. Copie e execute:\n')
      console.log('   cat scripts/FINAL_RPC_FIX.sql\n')
      console.log('4. Espere 30 segundos')
      console.log('5. Rode novamente: npm run prerequisite-check')
      process.exit(1)
    }

    console.log('\n💡 Erro desconhecido. Verifique logs do Supabase.')
    process.exit(1)
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('❌ RPC retornou resposta vazia\n')
    process.exit(1)
  }

  const row = data[0] as any
  console.log('✅ RPC Respondeu com sucesso!\n')
  console.log('Colunas retornadas:')
  Object.entries(row).forEach(([key, val]) => {
    console.log(`   ${key}: ${val}`)
  })

  console.log('\n' + '='.repeat(70))
  console.log('  ✅ PRÉ-REQUISITOS OK - Pronto para executar testes')
  console.log('='.repeat(70))
  console.log('\nExecute: npm run test:atomic-rpc\n')
  process.exit(0)
}

checkPrerequisites().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
