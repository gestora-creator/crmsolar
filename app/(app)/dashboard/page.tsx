'use client'

export const dynamic = 'force-dynamic'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { 
  Users, UserCircle, Building2, User, TrendingUp, ArrowRight,
  BarChart3, Mail, Phone, Activity, Star, Tag, MessageSquare,
  CheckCircle2, Clock, AlertCircle, Zap, Crown, MonitorPlay,
  ExternalLink
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DashboardData {
  totalClientes: number
  clientesPF: number
  clientesPJ: number
  clientesFavoritos: number
  totalContatos: number
  contatosComEmail: number
  contatosComTelefone: number
  totalVinculos: number
  totalTags: number
  totalInteracoes: number
  interacoesRespondidas: number
  interacoesPendentes: number
  ultimosClientes: any[]
  ultimosContatos: any[]
  crescimentoSemanal: {
    clientes: number
    contatos: number
  }
}

function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard-data'],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const agora = new Date()
      const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [
        clientesResult,
        clientesPFResult,
        clientesPJResult,
        clientesFavoritosResult,
      ] = await Promise.all([
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }),
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }).eq('tipo_cliente', 'PF'),
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }).eq('tipo_cliente', 'PJ'),
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }).eq('favorito', true),
      ])

      const [
        contatosResult,
        contatosEmailResult,
        contatosTelResult,
        vinculosResult,
        tagsResult,
      ] = await Promise.all([
        supabase.from('crm_contatos').select('id', { count: 'exact', head: true }),
        supabase.from('crm_contatos').select('id', { count: 'exact', head: true }).not('email', 'is', null).neq('email', ''),
        supabase.from('crm_contatos').select('id', { count: 'exact', head: true }).not('celular', 'is', null).neq('celular', ''),
        supabase.from('crm_clientes_contatos').select('id', { count: 'exact', head: true }),
        supabase.from('crm_tags').select('id', { count: 'exact', head: true }),
      ])

      const [
        interacoesResult,
        interacoesRespondidasResult,
        interacoesPendentesResult,
      ] = await Promise.all([
        supabase.from('relatorio_envios').select('id', { count: 'exact', head: true }),
        supabase.from('relatorio_envios').select('id', { count: 'exact', head: true }).not('viewed', 'is', null),
        supabase.from('relatorio_envios').select('id', { count: 'exact', head: true }).is('viewed', null),
      ])

      const [ultimosClientesResult, ultimosContatosResult] = await Promise.all([
        supabase.from('crm_clientes').select('id, razao_social, tipo_cliente, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('crm_contatos').select('id, nome_completo, celular, created_at').order('created_at', { ascending: false }).limit(5),
      ])

      const [clientesNovosResult, contatosNovosResult] = await Promise.all([
        supabase.from('crm_clientes').select('id', { count: 'exact', head: true }).gte('created_at', seteDiasAtras.toISOString()),
        supabase.from('crm_contatos').select('id', { count: 'exact', head: true }).gte('created_at', seteDiasAtras.toISOString()),
      ])

      return {
        totalClientes: clientesResult.count || 0,
        clientesPF: clientesPFResult.count || 0,
        clientesPJ: clientesPJResult.count || 0,
        clientesFavoritos: clientesFavoritosResult.count || 0,
        totalContatos: contatosResult.count || 0,
        contatosComEmail: contatosEmailResult.count || 0,
        contatosComTelefone: contatosTelResult.count || 0,
        totalVinculos: vinculosResult.count || 0,
        totalTags: tagsResult.count || 0,
        totalInteracoes: interacoesResult.count || 0,
        interacoesRespondidas: interacoesRespondidasResult.count || 0,
        interacoesPendentes: interacoesPendentesResult.count || 0,
        ultimosClientes: ultimosClientesResult.data || [],
        ultimosContatos: ultimosContatosResult.data || [],
        crescimentoSemanal: {
          clientes: clientesNovosResult.count || 0,
          contatos: contatosNovosResult.count || 0,
        },
      } as DashboardData
    },
  })
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboardData()

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Carregando dashboards...</p>
        </div>
      </div>
    )
  }

  const percentPF = data?.totalClientes ? Math.round((data.clientesPF / data.totalClientes) * 100) : 0
  const percentPJ = data?.totalClientes ? Math.round((data.clientesPJ / data.totalClientes) * 100) : 0
  const percentEmail = data?.totalContatos ? Math.round((data.contatosComEmail / data.totalContatos) * 100) : 0
  const percentTel = data?.totalContatos ? Math.round((data.contatosComTelefone / data.totalContatos) * 100) : 0
  const taxaResposta = data?.totalInteracoes ? Math.round((data.interacoesRespondidas / data.totalInteracoes) * 100) : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboards</h1>
        <p className="text-muted-foreground mt-1">Visão geral e métricas do seu CRM</p>
      </div>

      {/* Hub Cards — Acesso rápido aos sub-dashboards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Link href="/faturas" className="group">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-amber-400/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="font-semibold text-foreground">Faturas</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acompanhamento de faturamento por UC</p>
          </div>
        </Link>

        <Link href="/interacoes" className="group">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-violet-400/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <MessageSquare className="h-5 w-5 text-violet-500" />
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {(data?.interacoesPendentes || 0) > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200">
                    {data?.interacoesPendentes} pendentes
                  </Badge>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <p className="font-semibold text-foreground">Interações</p>
            <p className="text-xs text-muted-foreground mt-0.5">Relatórios enviados e visualizações</p>
          </div>
        </Link>

        <Link href="/oportunidades" className="group">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-emerald-400/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Crown className="h-5 w-5 text-emerald-500" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="font-semibold text-foreground">Oportunidades</p>
            <p className="text-xs text-muted-foreground mt-0.5">Faturamento por unidade consumidora</p>
          </div>
        </Link>

        <a href="/tv" target="_blank" rel="noopener noreferrer" className="group">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-cyan-400/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10">
                <MonitorPlay className="h-5 w-5 text-cyan-500" />
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-50" />
            </div>
            <p className="font-semibold text-foreground">Monitor de Envios</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acompanhamento em tempo real</p>
          </div>
        </a>
      </div>

      {/* KPIs Principais */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Link href="/clientes" className="block">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{data?.totalClientes || 0}</p>
                <p className="text-xs text-muted-foreground">Total de Clientes</p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/contatos" className="block">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-5 transition-all hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
                <UserCircle className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{data?.totalContatos || 0}</p>
                <p className="text-xs text-muted-foreground">Total de Contatos</p>
              </div>
            </div>
          </div>
        </Link>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{data?.interacoesRespondidas || 0}</p>
              <p className="text-xs text-muted-foreground">Interações Respondidas</p>
            </div>
          </div>
          {(data?.totalInteracoes || 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-2">{taxaResposta}% taxa de resposta</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
              <Clock className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{data?.interacoesPendentes || 0}</p>
              <p className="text-xs text-muted-foreground">Interações Pendentes</p>
            </div>
          </div>
          {(data?.totalInteracoes || 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-2">{100 - taxaResposta}% aguardando</p>
          )}
        </div>
      </div>

      {/* Indicadores secundários */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Link href="/clientes?favorito=true" className="block">
          <div className="rounded-lg border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <Star className="h-4 w-4 text-yellow-500" />
              <div>
                <p className="text-lg font-bold">{data?.clientesFavoritos || 0}</p>
                <p className="text-xs text-muted-foreground">Favoritos</p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/tags" className="block">
          <div className="rounded-lg border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <Tag className="h-4 w-4 text-pink-500" />
              <div>
                <p className="text-lg font-bold">{data?.totalTags || 0}</p>
                <p className="text-xs text-muted-foreground">Tags Criadas</p>
              </div>
            </div>
          </div>
        </Link>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-cyan-500" />
            <div>
              <p className="text-lg font-bold">{data?.totalVinculos || 0}</p>
              <p className="text-xs text-muted-foreground">Vínculos Ativos</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-lg font-bold">+{data?.crescimentoSemanal?.clientes || 0}</p>
              <p className="text-xs text-muted-foreground">Novos esta semana</p>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown + Listas recentes */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card Clientes */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Total de Clientes</p>
              <p className="text-3xl font-bold">{data?.totalClientes || 0}</p>
            </div>
            <Users className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-foreground" />
                <span className="text-xs text-muted-foreground">Pessoa Física</span>
              </div>
              <p className="text-xl font-bold">{data?.clientesPF || 0}</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${percentPF}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{percentPF}% do total</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">Pessoa Jurídica</span>
              </div>
              <p className="text-xl font-bold">{data?.clientesPJ || 0}</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${percentPJ}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{percentPJ}% do total</p>
            </div>
          </div>
        </div>

        {/* Card Contatos */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Total de Contatos</p>
              <p className="text-3xl font-bold">{data?.totalContatos || 0}</p>
            </div>
            <UserCircle className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Com E-mail</span>
              </div>
              <p className="text-xl font-bold">{data?.contatosComEmail || 0}</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/70" style={{ width: `${percentEmail}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{percentEmail}% do total</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Com Telefone</span>
              </div>
              <p className="text-xl font-bold">{data?.contatosComTelefone || 0}</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${percentTel}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{percentTel}% do total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Listas recentes */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Últimos Clientes */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Últimos Clientes</span>
            </div>
            <Link href="/clientes" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {data?.ultimosClientes?.map((cliente) => (
              <Link
                key={cliente.id}
                href={`/clientes/${cliente.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {cliente.tipo_cliente === 'PJ' ? <Building2 className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cliente.razao_social}</p>
                  <p className="text-xs text-muted-foreground">{cliente.tipo_cliente === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Últimos Contatos */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Últimos Contatos</span>
            </div>
            <Link href="/contatos" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y">
            {data?.ultimosContatos?.map((contato) => (
              <Link
                key={contato.id}
                href={`/contatos/${contato.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 text-xs font-medium">
                  {contato.nome_completo?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contato.nome_completo}</p>
                  <p className="text-xs text-muted-foreground">{contato.celular || 'Sem telefone'}</p>
                </div>
                {contato.celular && (
                  <Phone className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
