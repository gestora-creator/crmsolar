/**
 * Contrato do payload enviado ao n8n /agent-responder.
 *
 * O CRM monta este objeto e envia ao n8n. O n8n NÃO faz lookup —
 * tudo o que ele precisa pra rodar o LLM está aqui dentro.
 *
 * Por que isso?
 *   - Hoje o n8n tem ~12 nodes HTTP de pré-processamento. Inconsistente.
 *   - Com este contrato, o n8n vira 3 nodes: webhook in → agent LLM → respond.
 *   - O agente passa a ter contexto 100% das vezes (eliminando "agente sem contexto").
 *   - Testar o agente vira um curl.
 *
 * Versão: v1 (incrementar se mudar campos obrigatórios)
 */

import { createClient } from '@supabase/supabase-js'

// =====================================================================
// Tipos
// =====================================================================

export interface ContextoCliente {
  cliente_id: string | null
  contato_id: string | null
  razao_social: string | null
  apelido_relacionamento: string | null
  documento: string | null               // CPF/CNPJ
  status: string | null                  // ATIVO | PROSPECTO | SUSPENSO
  tags: string[]
  grupo_economico: string | null
  relacionamento: string | null          // cliente | prospecto | parceiro
  ucs: Array<{
    uc: string
    distribuidora: string | null
    apelido: string | null
    ativa: boolean
  }>
}

export interface ContextoSessao {
  jid: string
  tipo_conversa: 'chat' | 'grupo' | 'broadcast'
  status: string                         // bot | aguardando | humano
  ia_pausada: boolean
  caso_tipo: string | null
  etapa: string | null
  prioridade: string
  dados_caso: Record<string, unknown>
  intencao: string | null
  atendente_id: string | null
  atendente_nome: string | null
  ultima_msg_em: string | null
  total_msgs_nao_lidas: number
}

export interface MensagemHistorico {
  id: number
  direcao: 'in' | 'out'
  tipo: string
  conteudo: string | null
  media_url: string | null
  media_mimetype: string | null
  transcricao: string | null
  descricao_ia: string | null
  intencao: string | null
  remetente: string
  remetente_nome: string | null
  enviado_em: string | null
  created_at: string
}

export interface MensagemAtual {
  message_id: string
  tipo: string
  conteudo: string | null
  media_url: string | null
  media_mimetype: string | null
  enviado_em: string
}

export interface ChamadoAberto {
  id: string
  tipo: string
  status: string
  prioridade: string
  descricao: string | null
  created_at: string
}

export interface ContextoAgente {
  /** Versão do schema. Cliente n8n valida que sabe processar. */
  schema_version: 'v1'
  /** Pra correlação de logs CRM↔n8n */
  trace_id: string
  /** Quando o CRM enviou */
  sent_at: string
  /** Instância da Evolution que recebeu */
  instance: string

  cliente: ContextoCliente
  sessao: ContextoSessao
  mensagem_atual: MensagemAtual
  /** Últimas N mensagens da conversa (mais recente primeiro). */
  historico: MensagemHistorico[]
  /** Chamados em aberto desta sessão. */
  chamados_abertos: ChamadoAberto[]

  /** Hint operacional pro agente: 'normal', 'pos_escalacao', 'cliente_irritado'... */
  modo: 'normal' | 'retomada_caso' | 'cliente_novo' | 'cliente_irritado'
}

// =====================================================================
// Builder
// =====================================================================

interface BuildOpts {
  jid: string
  message_id: string
  conteudo: string | null
  tipo: string
  media_url?: string | null
  media_mimetype?: string | null
  enviado_em: string
  instance: string
  trace_id: string
  /** Quantas mensagens anteriores buscar (default 20) */
  historico_limit?: number
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Wrapper sobre a RPC SQL build_contexto_agente (1 round-trip ao Postgres).
 * Use este builder em route handlers do CRM quando precisar do contexto.
 *
 * A Edge Function chama a mesma RPC diretamente — esta função é só açúcar
 * pra código TypeScript.
 */
export async function buildContextoAgente(opts: BuildOpts): Promise<ContextoAgente> {
  const { data: ctx, error } = await supabase.rpc('build_contexto_agente', {
    p_jid: opts.jid,
    p_message_id: opts.message_id,
    p_historico_limit: opts.historico_limit ?? 20,
  })

  if (error) throw new Error(`build_contexto_agente RPC falhou: ${error.message}`)
  if (!ctx) throw new Error(`Contexto vazio para jid=${opts.jid}`)

  const c = ctx as Record<string, unknown>

  return {
    schema_version: 'v1',
    trace_id: opts.trace_id,
    sent_at: new Date().toISOString(),
    instance: opts.instance,
    cliente: (c.cliente ?? {}) as ContextoCliente,
    sessao: (c.sessao ?? {}) as ContextoSessao,
    mensagem_atual: {
      message_id: opts.message_id,
      tipo: opts.tipo,
      conteudo: opts.conteudo,
      media_url: opts.media_url ?? null,
      media_mimetype: opts.media_mimetype ?? null,
      enviado_em: opts.enviado_em,
    },
    historico: (c.historico ?? []) as MensagemHistorico[],
    chamados_abertos: (c.chamados_abertos ?? []) as ChamadoAberto[],
    modo: (c.modo ?? 'normal') as ContextoAgente['modo'],
  }
}

// =====================================================================
// Resposta esperada do n8n
// =====================================================================

export interface RespostaAgente {
  /** Texto a enviar. Se null/vazio, agente decidiu não responder. */
  resposta: string | null
  /** Tipo de envio. Default text. */
  tipo?: 'text' | 'audio' | 'image'
  media_url?: string | null
  /** Intenção classificada — escreve em whatsapp_messages.intencao */
  intencao?: string | null
  /** Tags semânticas */
  tags?: string[]
  /** 0..1 — confiança da classificação */
  confianca?: number
  /** Se true, força status=humano e abre chamado */
  requer_humano?: boolean
  motivo_escalacao?: string | null
  /** Atualizações sugeridas em dados_caso (merge no jsonb) */
  dados_caso_patch?: Record<string, unknown>
  /** Mudança de caso_tipo / etapa */
  caso_tipo?: string | null
  etapa?: string | null
  /** Telemetria */
  llm_model?: string
  tokens_in?: number
  tokens_out?: number
  latency_ms?: number
}
