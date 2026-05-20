/**
 * Vocabulário, labels e helpers visuais compartilhados pela tela de Chamados.
 * Espelha o CHECK de chamados_atendimento (tipo/status/prioridade).
 */

export interface ClienteRef {
  id: string
  razao_social: string | null
  nome_fantasia: string | null
  documento: string | null
}

export interface ChamadoListItem {
  id: string
  tipo: string
  status: string
  prioridade: string | null
  descricao: string
  resolucao: string | null
  atribuido_a: string | null
  atribuido_a_user_id: string | null
  cliente_id: string | null
  contato_id: string | null
  jid: string | null
  link_agendamento: string | null
  sla_proxima_acao_em: string | null
  created_at: string | null
  updated_at: string | null
  resolvido_em: string | null
  cliente: ClienteRef | null
}

export const STATUS_OPCOES = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'em_andamento_agente', label: 'Em andamento' },
  { value: 'escalado_humano', label: 'Escalado p/ humano' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'resolvido', label: 'Resolvido' },
  { value: 'cancelado', label: 'Cancelado' },
] as const

export const PRIORIDADE_OPCOES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
] as const

export const TIPO_OPCOES = [
  { value: 'fatura_alta', label: 'Fatura alta' },
  { value: 'sem_creditos', label: 'Sem créditos' },
  { value: 'vistoria_om', label: 'Vistoria O&M' },
  { value: 'problema_inversor', label: 'Problema inversor' },
  { value: 'sem_geracao', label: 'Sem geração' },
  { value: 'aluguel_uc', label: 'Aluguel de UC' },
  { value: 'saida_grupo', label: 'Saída do grupo' },
  { value: 'troca_titularidade', label: 'Troca de titularidade' },
  { value: 'segunda_via_boleto', label: '2ª via de boleto' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'problema_tecnico', label: 'Problema técnico' },
  { value: 'solicitacao_geral', label: 'Solicitação geral' },
  { value: 'duvida_simples', label: 'Dúvida simples' },
  { value: 'relatorio_geracao', label: 'Relatório de geração' },
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'pos_venda', label: 'Pós-venda' },
  { value: 'lead_nao_cadastrado', label: 'Lead não cadastrado' },
  { value: 'cliente_outro_numero', label: 'Cliente — outro número' },
] as const

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPCOES.map((o) => [o.value, o.label]),
)
const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  TIPO_OPCOES.map((o) => [o.value, o.label]),
)
const PRIORIDADE_LABEL: Record<string, string> = Object.fromEntries(
  PRIORIDADE_OPCOES.map((o) => [o.value, o.label]),
)

export function statusLabel(v: string | null): string {
  return (v && STATUS_LABEL[v]) || v || '—'
}
export function tipoLabel(v: string | null): string {
  return (v && TIPO_LABEL[v]) || v || '—'
}
export function prioridadeLabel(v: string | null): string {
  return (v && PRIORIDADE_LABEL[v]) || v || '—'
}

export function statusBadgeClass(v: string | null): string {
  switch (v) {
    case 'aberto':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    case 'em_andamento_agente':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'escalado_humano':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'agendado':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300'
    case 'resolvido':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    case 'cancelado':
      return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

export function prioridadeBadgeClass(v: string | null): string {
  switch (v) {
    case 'urgente':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    case 'alta':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
    case 'baixa':
      return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400'
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

export function nomeCliente(c: ClienteRef | null): string {
  if (!c) return 'Sem cliente vinculado'
  return c.razao_social || c.nome_fantasia || c.documento || 'Cliente sem nome'
}

export function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
