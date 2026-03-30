import { LeadsOportunidadesTable } from '@/components/leads/LeadsOportunidadesTable'

export default function LeadsPage() {
  return (
    <LeadsOportunidadesTable
      apiEndpoint="/api/leads"
      dataKey="leads"
      pageTitle="Leads"
      pageSubtitle="Faturado abaixo de R$ 1.000"
    />
  )
}
