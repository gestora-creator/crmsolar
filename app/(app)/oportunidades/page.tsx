import { LeadsOportunidadesTable } from '@/components/leads/LeadsOportunidadesTable'

export default function OportunidadesPage() {
  return (
    <LeadsOportunidadesTable
      apiEndpoint="/api/oportunidades"
      dataKey="oportunidades"
      pageTitle="Oportunidades"
      pageSubtitle="Faturamento por unidade consumidora"
    />
  )
}
