import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'

type AppRole = 'admin' | 'limitada'

export interface OportunidadeUC {
  cliente: string
  cpfCnpj: string | null
  uc: string
  tipo: 'geradora' | 'beneficiaria'
  faturado: number
  mesReferente: string | null
  classificacao: string | null
  endereco: string | null
  injetado: number | null
  consumo: number | null
  saldoAcumulado: number | null
}

export interface OportunidadesResponse {
  oportunidades: OportunidadeUC[]
  total: number
  metricas: {
    totalOportunidades: number
    totalGeradoras: number
    totalBeneficiarias: number
    somaFaturado: number
    mediaFaturado: number
    maiorFaturado: number
  }
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value !== 'string') return 0
  const trimmed = value.trim()
  if (!trimmed) return 0
  const cleaned = trimmed.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0
  const hasComma = cleaned.includes(',')
  const hasDot = cleaned.includes('.')
  let normalized = cleaned
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.')
  } else if (hasDot) {
    const dotParts = cleaned.split('.')
    if (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 1) {
      normalized = cleaned.replace('.', '')
    } else if (dotParts.length > 2) {
      normalized = cleaned.replace(/\./g, '')
    }
  }
  const parsed = parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMaybeJson(text: unknown): Record<string, unknown> | null {
  if (!text) return null
  if (typeof text === 'object' && !Array.isArray(text)) return text as Record<string, unknown>
  if (typeof text !== 'string') return null
  const raw = text.trim()
  if (!raw) return null
  const withoutFence = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    const parsed = JSON.parse(withoutFence)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

function extrairDadosFatura(dadosExtraidos: unknown) {
  const json = parseMaybeJson(dadosExtraidos)
  if (!json) return null

  const faturadoRaw = json['faturado']
  const faturado = faturadoRaw !== null && faturadoRaw !== undefined ? parseNumber(faturadoRaw) : null
  const mesRef = json['mês'] ?? json['mes'] ?? json['mes_referente']
  const classificacao = json['classificacao']
  const endereco = json['endereço'] ?? json['endereco']
  const saldoAcumulado = json['saldo_acumulado_kwh']

  // Extrair injetado
  let injetado: number | null = null
  const leitura = json['leitura_medidor'] as Record<string, unknown> | null
  if (leitura && typeof leitura === 'object') {
    const ponta = leitura['injetado_ponta'] != null ? parseNumber(leitura['injetado_ponta']) : 0
    const fp = leitura['injetado_fora_ponta'] != null ? parseNumber(leitura['injetado_fora_ponta']) : 0
    const soma = ponta + fp
    if (soma > 0) injetado = soma
  }

  // Extrair consumo
  let consumo: number | null = null
  if (leitura && typeof leitura === 'object') {
    const cPonta = leitura['consumo_ponta'] != null ? parseNumber(leitura['consumo_ponta']) : 0
    const cFp = leitura['consumo_fora_ponta'] != null ? parseNumber(leitura['consumo_fora_ponta']) : 0
    const cSimples = leitura['consumo_total_simples'] != null ? parseNumber(leitura['consumo_total_simples']) : 0
    const soma = cPonta + cFp + cSimples
    if (soma > 0) consumo = soma
  }

  return {
    faturado,
    mesReferente: typeof mesRef === 'string' ? mesRef.trim() : null,
    classificacao: typeof classificacao === 'string' ? classificacao.trim() : null,
    endereco: typeof endereco === 'string' ? endereco.trim() : null,
    injetado,
    consumo,
    saldoAcumulado: saldoAcumulado != null ? parseNumber(saldoAcumulado) : null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Variáveis Supabase não configuradas')
    }

    // Autenticação
    const authorization = request.headers.get('authorization') || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const supabaseAuth = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
    }

    // Verificar role
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey!, {
      auth: { persistSession: false },
    })

    const { data: roleRow } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    const userRole = ((roleRow as { role?: AppRole } | null)?.role ?? 'admin') as AppRole
    if (userRole !== 'admin' && userRole !== 'limitada') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Buscar TODOS os registros da tabela base (geradoras + beneficiárias)
    const { data: baseRows, error: baseError } = await (supabase as any)
      .from('base')
      .select('*')

    if (baseError) throw new Error(`Erro ao buscar base: ${baseError.message}`)

    const oportunidades: OportunidadeUC[] = []

    ;(baseRows || []).forEach((row: any) => {
      const tipo = (row.Tipo || row.tipo || '').toString().toLowerCase().trim()
      if (tipo !== 'geradora' && tipo !== 'beneficiária' && tipo !== 'beneficiaria') return

      const clientName = (row.CLIENTE || '').trim()
      const uc = (row.Unidades || '').trim()
      if (!uc) return

      const dados = extrairDadosFatura(row.dados_extraidos)
      if (!dados || dados.faturado === null) return

      // Filtro: faturado > R$ 1.000
      if (dados.faturado <= 1000) return

      oportunidades.push({
        cliente: clientName || 'Cliente sem identificação',
        cpfCnpj: row['CPF/CNPJ'] || null,
        uc,
        tipo: tipo === 'geradora' ? 'geradora' : 'beneficiaria',
        faturado: dados.faturado,
        mesReferente: dados.mesReferente,
        classificacao: dados.classificacao,
        endereco: dados.endereco,
        injetado: dados.injetado,
        consumo: dados.consumo,
        saldoAcumulado: dados.saldoAcumulado,
      })
    })

    // Ordenar por valor faturado (maior primeiro)
    oportunidades.sort((a, b) => b.faturado - a.faturado)

    const totalGeradoras = oportunidades.filter(l => l.tipo === 'geradora').length
    const totalBeneficiarias = oportunidades.filter(l => l.tipo === 'beneficiaria').length
    const somaFaturado = oportunidades.reduce((s, l) => s + l.faturado, 0)

    const response: OportunidadesResponse = {
      oportunidades,
      total: oportunidades.length,
      metricas: {
        totalOportunidades: oportunidades.length,
        totalGeradoras,
        totalBeneficiarias,
        somaFaturado,
        mediaFaturado: oportunidades.length > 0 ? somaFaturado / oportunidades.length : 0,
        maiorFaturado: oportunidades.length > 0 ? oportunidades[0].faturado : 0,
      },
    }

    const res = NextResponse.json(response)
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (error) {
    console.error('❌ Erro na API de oportunidades:', error)
    const err = error as Error
    return NextResponse.json(
      { error: 'Erro ao buscar oportunidades: ' + err.message },
      { status: 500 }
    )
  }
}
