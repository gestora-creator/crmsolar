import { LeadsOportunidadesTable } from '@/components/leads/LeadsOportunidadesTable'

export default function OportunidadesPage() {
  return (
    <LeadsOportunidadesTable
      apiEndpoint="/api/oportunidades"
      dataKey="oportunidades"
      pageTitle="Oportunidades"
      pageSubtitle="Faturado acima de R$ 1.000"
    />
  )
}
