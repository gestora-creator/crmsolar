-- =============================================
-- MIGRATION: Timeline Multi-Canal v2.0
-- CRM Solar Energy — Fase 0
-- Data: 2026-04-16
-- Autor: Solar Energy Dev
--
-- OBJETIVO: Evoluir timeline_relacional para suportar:
--   - Snapshots de agente (nome, avatar) para histórico imutável
--   - Snapshot do nome do relacionamento (contato) por evento
--   - agente_id como FK para rastreabilidade LGPD
--   - Novos tipos de evento: followup, pos_venda, evento_sistema
--   - Origem atualizada: adicionar 'automatico' e 'integracao'
--   - Índice parcial para nota_interna (sem contato_id)
--
-- REVERSÍVEL: Ver bloco DOWN ao final
-- =============================================

-- ─────────────────────────────────────────────
-- 1. ADICIONAR COLUNAS DE SNAPSHOT DO AGENTE
-- Necessário para: exibir quem registrou cada evento
-- sem depender do cadastro de usuário no futuro (LGPD art. 6º - finalidade)
-- ─────────────────────────────────────────────

ALTER TABLE public.timeline_relacional
  ADD COLUMN IF NOT EXISTS agente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agente_nome TEXT,
  ADD COLUMN IF NOT EXISTS agente_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS relacionamento_nome TEXT; -- snapshot do nome do contato no momento do registro

-- ─────────────────────────────────────────────
-- 2. AMPLIAR CONSTRAINT DE tipo_evento
-- Adicionar: followup, pos_venda, evento_sistema
-- ─────────────────────────────────────────────

ALTER TABLE public.timeline_relacional
  DROP CONSTRAINT IF EXISTS timeline_relacional_tipo_evento_check;

ALTER TABLE public.timeline_relacional
  ADD CONSTRAINT timeline_relacional_tipo_evento_check
  CHECK (tipo_evento IN (
    -- Tipos originais (mantidos)
    'mensagem_whatsapp',
    'mensagem_email',
    'ligacao_telefone',
    'reuniao',
    'visita_tecnica',
    'chamado_aberto',
    'chamado_encerrado',
    'relatorio_enviado',
    'relatorio_visualizado',
    'pesquisa_respondida',
    'nota_interna',
    'agente_acao',
    'agente_resumo',
    -- Novos tipos v2.0
    'followup',          -- Retorno/acompanhamento
    'pos_venda',         -- Suporte pós-venda / manutenção
    'evento_sistema'     -- Log automático do sistema (não editável)
  ));

-- ─────────────────────────────────────────────
-- 3. AMPLIAR CONSTRAINT DE origem
-- Adicionar: 'automatico', 'integracao' (alinhado com spec)
-- Mantém compatibilidade com valores existentes
-- ─────────────────────────────────────────────

ALTER TABLE public.timeline_relacional
  DROP CONSTRAINT IF EXISTS timeline_relacional_origem_check;

ALTER TABLE public.timeline_relacional
  ADD CONSTRAINT timeline_relacional_origem_check
  CHECK (origem IN (
    'manual',        -- Registro pelo agente humano
    'automatico',    -- Gerado automaticamente pelo sistema
    'integracao',    -- Via API/webhook de canal externo
    'n8n_webhook',   -- Mantido para compatibilidade
    'agente_ia',     -- Mantido para compatibilidade
    'sistema',       -- Mantido para compatibilidade
    'importacao'     -- Mantido para compatibilidade
  ));

-- ─────────────────────────────────────────────
-- 4. ÍNDICES DE PERFORMANCE
-- Índice parcial para nota_interna (contato_id NULL)
-- ─────────────────────────────────────────────

-- Índice para buscar notas internas sem relacionamento
CREATE INDEX IF NOT EXISTS idx_timeline_notas_internas
  ON public.timeline_relacional(cliente_id, ocorrido_em DESC)
  WHERE contato_id IS NULL AND tipo_evento = 'nota_interna';

-- Índice para agente_id (rastreabilidade / LGPD)
CREATE INDEX IF NOT EXISTS idx_timeline_agente
  ON public.timeline_relacional(agente_id)
  WHERE agente_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 5. ATUALIZAR RLS — LGPD compliance
-- Princípio: agente só pode editar/excluir o que registrou
-- Admin pode editar/excluir qualquer evento
-- evento_sistema nunca é editável por usuários
-- ─────────────────────────────────────────────

-- Remover políticas existentes
DROP POLICY IF EXISTS "auth_update_timeline" ON public.timeline_relacional;
DROP POLICY IF EXISTS "auth_delete_timeline" ON public.timeline_relacional;

-- UPDATE: agente_id = usuário atual OU role admin
--         eventos do sistema não podem ser editados
CREATE POLICY "auth_update_timeline"
  ON public.timeline_relacional
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND tipo_evento <> 'evento_sistema'
    AND (
      agente_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tipo_evento <> 'evento_sistema'
  );

-- DELETE: mesmo critério do UPDATE
CREATE POLICY "auth_delete_timeline"
  ON public.timeline_relacional
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND tipo_evento <> 'evento_sistema'
    AND (
      agente_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role = 'admin'
      )
    )
  );

-- ─────────────────────────────────────────────
-- 6. COMENTÁRIOS LGPD nas novas colunas
-- Art. 6º LGPD — finalidade e necessidade documentadas
-- ─────────────────────────────────────────────

COMMENT ON COLUMN public.timeline_relacional.agente_id
  IS 'LGPD: FK para auth.users. Permite rastrear quem registrou o evento. Base legal: Art. 7º, II (legítimo interesse — auditoria).';

COMMENT ON COLUMN public.timeline_relacional.agente_nome
  IS 'LGPD: Snapshot imutável do nome do agente no momento do registro. Garante histórico mesmo após desativação do usuário.';

COMMENT ON COLUMN public.timeline_relacional.agente_avatar_url
  IS 'LGPD: Snapshot da URL do avatar no momento do registro. Pode ficar inválida se o avatar for removido.';

COMMENT ON COLUMN public.timeline_relacional.relacionamento_nome
  IS 'LGPD: Snapshot imutável do nome do contato (Relacionamento) no momento do registro. Mínimo necessário (Art. 6º, III).';

COMMENT ON COLUMN public.timeline_relacional.ocorrido_em
  IS 'Data/hora da interação. Editável pelo agente ao registrar (permite retroagir). Não permite data futura (validado na aplicação).';

-- ─────────────────────────────────────────────
-- DOWN (reversão — executar manualmente se necessário)
-- ─────────────────────────────────────────────
/*
  -- Remover colunas adicionadas
  ALTER TABLE public.timeline_relacional
    DROP COLUMN IF EXISTS agente_id,
    DROP COLUMN IF EXISTS agente_nome,
    DROP COLUMN IF EXISTS agente_avatar_url,
    DROP COLUMN IF EXISTS relacionamento_nome;

  -- Restaurar constraint de tipo_evento sem os novos tipos
  ALTER TABLE public.timeline_relacional
    DROP CONSTRAINT IF EXISTS timeline_relacional_tipo_evento_check;
  ALTER TABLE public.timeline_relacional
    ADD CONSTRAINT timeline_relacional_tipo_evento_check
    CHECK (tipo_evento IN (
      'mensagem_whatsapp','mensagem_email','ligacao_telefone',
      'reuniao','visita_tecnica','chamado_aberto','chamado_encerrado',
      'relatorio_enviado','relatorio_visualizado','pesquisa_respondida',
      'nota_interna','agente_acao','agente_resumo'
    ));

  -- Restaurar constraint de origem
  ALTER TABLE public.timeline_relacional
    DROP CONSTRAINT IF EXISTS timeline_relacional_origem_check;
  ALTER TABLE public.timeline_relacional
    ADD CONSTRAINT timeline_relacional_origem_check
    CHECK (origem IN ('manual','n8n_webhook','agente_ia','sistema','importacao'));

  -- Remover índices adicionados
  DROP INDEX IF EXISTS idx_timeline_notas_internas;
  DROP INDEX IF EXISTS idx_timeline_agente;

  -- Restaurar políticas de DELETE/UPDATE originais
  DROP POLICY IF EXISTS "auth_update_timeline" ON timeline_relacional;
  DROP POLICY IF EXISTS "auth_delete_timeline" ON timeline_relacional;
  CREATE POLICY "auth_update_timeline" ON timeline_relacional
    FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  CREATE POLICY "auth_delete_timeline" ON timeline_relacional
    FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
*/
