import { NextRequest, NextResponse } from 'next/server'

// Proxy para publica.cnpj.ws — evita CORS no client e centraliza rate limiting
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj: cnpjParam } = await params
  const cnpj = cnpjParam.replace(/\D/g, '')

  if (cnpj.length !== 14) {
    return NextResponse.json({ error: 'CNPJ inválido' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 }, // cache 24h — dados da Receita mudam pouco
    })

    if (res.status === 429) {
      return NextResponse.json({ error: 'Rate limit atingido. Tente em alguns segundos.' }, { status: 429 })
    }

    if (!res.ok) {
      return NextResponse.json({ error: 'CNPJ não encontrado' }, { status: 404 })
    }

    const d = await res.json()
    const est = d.estabelecimento || {}

    // Mapear para o formato do CRM
    const payload = {
      razao_social:        d.razao_social || null,
      nome_fantasia:       est.nome_fantasia || null,
      status:              est.situacao_cadastral === 'Ativa' ? 'ATIVO' : 'INATIVO',
      data_fundacao:       est.data_inicio_atividade || null,
      logradouro:          est.logradouro
                             ? `${est.tipo_logradouro || ''} ${est.logradouro}`.trim()
                             : null,
      numero:              est.numero || null,
      complemento:         est.complemento || null,
      bairro:              est.bairro || null,
      municipio:           est.cidade?.nome || null,
      uf:                  est.estado?.sigla || null,
      cep:                 est.cep?.replace(/\D/g, '') || null,
      ins_estadual:        est.inscricoes_estaduais?.[0]?.inscricao_estadual || null,
      tipo_estabelecimento: (() => {
        const num = cnpj.slice(8, 12)
        return num === '0001' ? 'matriz' : 'filial'
      })(),
      cnpj_base: cnpj.slice(0, 8),
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[receita/cnpj] Erro:', err)
    return NextResponse.json({ error: 'Erro ao consultar Receita Federal' }, { status: 500 })
  }
}
