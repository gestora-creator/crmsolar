-- =============================================
-- MIGRATION: Timeline Relacional + Chamados
-- Coração do histórico de relacionamento do CRM
-- =============================================

-- TABELA: timeline_relacional
CREATE TABLE IF NOT EXISTS public.timeline_relacional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES crm_clientes(id) ON DELETE CASCADE,
  contato_id UUID REFERENCES crm_contatos(id) ON DELETE SET NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'mensagem_whatsapp', 'mensagem_email', 'ligacao_telefone',
    'reuniao', 'visita_tecnica', 'chamado_aberto', 'chamado_encerrado',
    'relatorio_enviado', 'relatorio_visualizado', 'pesquisa_respondida',
    'nota_interna', 'agente_acao', 'agente_resumo'
  )),
  canal TEXT CHECK (canal IN (
    'whatsapp', 'email', 'telefone', 'presencial',
    'sistema', 'agente_ia', 'portal_cliente'
  )),
  direcao TEXT CHECK (direcao IN ('entrada', 'saida', 'interna')),
  resumo_chave TEXT NOT NULL,
  tom_conversa TEXT,
  conteudo_longo TEXT,
  metadata JSONB DEFAULT '{}',
  origem TEXT DEFAULT 'manual' CHECK (origem IN (
    'manual', 'n8n_webhook', 'agente_ia', 'sistema', 'importacao'
  )),
  autor TEXT,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_cliente ON timeline_relacional(cliente_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_contato ON timeline_relacional(contato_id, ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_tipo ON timeline_relacional(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_timeline_canal ON timeline_relacional(canal);
CREATE INDEX IF NOT EXISTS idx_timeline_ocorrido ON timeline_relacional(ocorrido_em DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_metadata ON timeline_relacional USING gin(metadata);

ALTER TABLE timeline_relacional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_timeline" ON timeline_relacional;
DROP POLICY IF EXISTS "auth_insert_timeline" ON timeline_relacional;
DROP POLICY IF EXISTS "auth_update_timeline" ON timeline_relacional;
DROP POLICY IF EXISTS "auth_delete_timeline" ON timeline_relacional;

CREATE POLICY "auth_select_timeline" ON timeline_relacional FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_timeline" ON timeline_relacional FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_timeline" ON timeline_relacional FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_timeline" ON timeline_relacional FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- TABELA: chamados_atendimento
CREATE TABLE IF NOT EXISTS public.chamados_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES crm_clientes(id),
  contato_id UUID REFERENCES crm_contatos(id),
  timeline_evento_id UUID REFERENCES timeline_relacional(id),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'duvida_simples', 'relatorio_geracao', 'problema_tecnico',
    'financeiro', 'reclamacao', 'solicitacao_geral'
  )),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN (
    'aberto', 'em_andamento_agente', 'escalado_humano',
    'agendado', 'resolvido', 'cancelado'
  )),
  descricao TEXT NOT NULL,
  resolucao TEXT,
  atribuido_a TEXT,
  link_agendamento TEXT,
  prioridade TEXT DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolvido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chamados_cliente ON chamados_atendimento(cliente_id);
CREATE INDEX IF NOT EXISTS idx_chamados_status ON chamados_atendimento(status);
CREATE INDEX IF NOT EXISTS idx_chamados_tipo ON chamados_atendimento(tipo);

ALTER TABLE chamados_atendimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_chamados" ON chamados_atendimento;
DROP POLICY IF EXISTS "auth_insert_chamados" ON chamados_atendimento;
DROP POLICY IF EXISTS "auth_update_chamados" ON chamados_atendimento;
DROP POLICY IF EXISTS "auth_delete_chamados" ON chamados_atendimento;

CREATE POLICY "auth_select_chamados" ON chamados_atendimento FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_chamados" ON chamados_atendimento FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_chamados" ON chamados_atendimento FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_chamados" ON chamados_atendimento FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE timeline_relacional IS 'Eventos de relacionamento com clientes. Alimentado por n8n via service_role, agente IA, e registros manuais.';
COMMENT ON TABLE chamados_atendimento IS 'Chamados para triagem humana/IA. Vinculado a timeline_relacional.';
