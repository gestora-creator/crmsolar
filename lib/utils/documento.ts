// ─── Validação matemática de CPF ─────────────────────────────────────────────
// Verifica os dígitos verificadores segundo o algoritmo oficial da Receita Federal
export function validateCPF(cpf: string): boolean {
  const n = cpf.replace(/\D/g, '')

  if (n.length !== 11) return false

  // Rejeitar sequências inválidas conhecidas (111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(n)) return false

  // Primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i)
  let d1 = 11 - (sum % 11)
  if (d1 >= 10) d1 = 0
  if (d1 !== parseInt(n[9])) return false

  // Segundo dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i)
  let d2 = 11 - (sum % 11)
  if (d2 >= 10) d2 = 0
  if (d2 !== parseInt(n[10])) return false

  return true
}

// ─── Validação matemática de CNPJ ────────────────────────────────────────────
export function validateCNPJ(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')

  if (n.length !== 14) return false
  if (/^(\d)\1{13}$/.test(n)) return false

  const calc = (nums: string, weights: number[]) => {
    const sum = nums.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }

  const d1 = calc(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== parseInt(n[12])) return false

  const d2 = calc(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d2 !== parseInt(n[13])) return false

  return true
}

// ─── Helper unificado ────────────────────────────────────────────────────────
export type DocumentoStatus = 'valido' | 'invalido' | 'incompleto' | 'vazio'

export function checkDocumento(value: string, tipo: 'PF' | 'PJ'): DocumentoStatus {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'vazio'

  const expectedLen = tipo === 'PF' ? 11 : 14
  if (digits.length < expectedLen) return 'incompleto'

  const valid = tipo === 'PF' ? validateCPF(digits) : validateCNPJ(digits)
  return valid ? 'valido' : 'invalido'
}
