/**
 * Layout do /atendimento — server component.
 *
 * Razao de existir: forcar a pagina a NAO ser prerenderizada no build
 * (Static), evitando que o Vercel Edge cacheie HTML antigo apontando
 * para chunks JS antigos. Sem isso, deploys novos demoram horas pra
 * propagar porque o HTML em cache mantem hash de chunks da build
 * anterior, e o browser nunca baixa o JS novo.
 *
 * Por que aqui em vez de no page.tsx: page.tsx tem 'use client', e o
 * Next.js IGNORA `export const dynamic` em client components. Layout
 * server component eh o lugar correto para essa diretiva.
 */
export const dynamic = 'force-dynamic'

export default function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
