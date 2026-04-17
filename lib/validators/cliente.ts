import { z } from 'zod'
import { validateCPF, validateCNPJ } from '@/lib/utils/documento'

export const clienteSchema = z.object({
  razao_social: z.string().min(1, 'Razão Social é obrigatório'),
  tipo_cliente: z.enum(['PF', 'PJ']).nullable().optional(),
  documento: z.string().nullable().optional(),
  nome_fantasia: z.string().nullable().optional(),
  apelido_relacionamento: z.string().nullable().optional(),
  telefone_principal: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  grupo_whatsapp: z.string().nullable().optional(),
  us_grupo_whatsapp: z.string().nullable().optional(),
  email_principal: z.string().email('E-mail inválido').nullable().optional().or(z.literal('')),
  logradouro: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  complemento: z.string().nullable().optional(),
  bairro: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  uf: z.string().max(2).nullable().optional(),
  cep: z.string().nullable().optional(),
  pais: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  observacoes_extras: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  favorito: z.boolean().nullable().optional(),
  // Novos campos
  status: z.enum(['ATIVO', 'INATIVO', 'PROSPECTO', 'SUSPENSO', 'BLOQUEADO']).nullable().optional(),
  tipos_relacionamento: z.array(z.string()).nullable().optional(),
  ins_estadual: z.string().nullable().optional(),
  emp_redes: z.string().nullable().optional(),
  data_fundacao: z.string().nullable().optional(), // String para compatibilidade com input date
  emp_site: z.string().url('URL inválida').nullable().optional().or(z.literal('')),
  ins_municipal: z.string().nullable().optional(),
  grupo_economico_id: z.string().uuid().nullable().optional(),
  origem: z.string().nullable().optional(),
  quem_e: z.string().nullable().optional(),
  cliente_desde: z.string().nullable().optional(), // String para compatibilidade com input date
}).refine((data) => {
  if (!data.documento || data.documento.trim() === '') return true
  const n = data.documento.replace(/\D/g, '')

  if (data.tipo_cliente === 'PF') {
    if (n.length !== 11) return false
    return validateCPF(n)
  }

  if (data.tipo_cliente === 'PJ') {
    if (n.length !== 14) return false
    return validateCNPJ(n)
  }

  return true
}, {
  message: 'Documento inválido — verifique os dígitos informados',
  path: ['documento'],
})

export type ClienteFormData = z.infer<typeof clienteSchema>
