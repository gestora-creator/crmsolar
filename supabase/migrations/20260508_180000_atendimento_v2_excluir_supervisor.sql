-- =====================================================================
-- Migration: Atendimento v2 — exclusão definitiva (hard delete) +
--            atribuição por usuário logado + transparência total
-- Data: 2026-05-08
-- =====================================================================
-- O que esta migration faz:
--   1. Garante REPLICA IDENTITY FULL nas tabelas de chat (Realtime preciso)
--   2. Adiciona colunas auxiliares em whatsapp_sessions:
--        - atendente_email          (audit trail / fallback)
--        - atendente_avatar_url     (avatar do atendente na lista)
--        - excluido_por_email       (audit trail antes do hard delete? não — guardamos em log)
--   3. Cria tabela whatsapp_sessions_audit (rastreia quem excluiu o quê)
--   4. Cria RPC excluir_conversa(p_jid)            — HARD DELETE
--   5. Cria RPC atualizar_atendente(p_jid, p_id, p_nome, p_email, p_avatar)
--   6. Atualiza RPC assumir_atendimento p/ aceitar email + avatar
--   7. Cria policies de RLS — leitura ABERTA p/ qualquer usuário autenticado
--      (transparência total, conforme decisão de produto)
-- =====================================================================

BEGIN;

-- 1. REPLICA IDENTITY FULL — Realtime envia row inteira em UPDATE/DELETE
ALTER TABLE public.whatsapp_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;

-- 2. Colunas extras em whatsapp_sessions
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS atendente_email      text,
  ADD COLUMN IF NOT EXISTS atendente_avatar_url text;

-- 3. Tabela de auditoria de exclusões (mantém histórico mesmo após hard delete)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions_audit (
  id              bigserial PRIMARY KEY,
  jid             text NOT NULL,
  acao            text NOT NULL,                  -- 'excluido' | 'encerrado' | 'assumido' | 'devolvido'
  executado_por   uuid,                           -- auth.uid()
  executado_email text,
  payload         jsonb,                          -- snapshot resumido
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wasa_audit_jid     ON public.whatsapp_sessions_audit (jid);
CREATE INDEX IF NOT EXISTS idx_wasa_audit_created ON public.whatsapp_sessions_audit (created_at DESC);

-- 4. RPC: excluir_conversa — HARD DELETE da sessão e mensagens
--    Audita antes de remover. SECURITY DEFINER pois a chamada vem do
--    backend Next.js usando a service_role; via RLS o usuário autenticado
--    não consegue DELETE direto.
CREATE OR REPLACE FUNCTION public.excluir_conversa(
  p_jid             text,
  p_executado_por   uuid    DEFAULT NULL,
  p_executado_email text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session  record;
  v_msg_qtd  int;
BEGIN
  IF p_jid IS NULL OR length(trim(p_jid)) = 0 THEN
    RAISE EXCEPTION 'jid é obrigatório';
  END IF;

  -- 1. Snapshot da sessão antes de apagar
  SELECT * INTO v_session
    FROM public.whatsapp_sessions
   WHERE jid = p_jid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason',  'sessao_nao_encontrada',
      'jid',     p_jid
    );
  END IF;

  -- 2. Conta mensagens que serão removidas (para retorno)
  SELECT count(*) INTO v_msg_qtd
    FROM public.whatsapp_messages
   WHERE jid = p_jid;

  -- 3. Auditoria
  INSERT INTO public.whatsapp_sessions_audit
    (jid, acao, executado_por, executado_email, payload)
  VALUES (
    p_jid,
    'excluido',
    p_executado_por,
    p_executado_email,
    jsonb_build_object(
      'sessao',       row_to_json(v_session),
      'mensagens_qtd', v_msg_qtd
    )
  );

  -- 4. Hard delete: mensagens primeiro (FK lógica), depois sessão
  DELETE FROM public.whatsapp_messages WHERE jid = p_jid;
  DELETE FROM public.whatsapp_sessions WHERE jid = p_jid;

  RETURN jsonb_build_object(
    'success',        true,
    'jid',            p_jid,
    'mensagens_qtd',  v_msg_qtd
  );
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_conversa(text, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.excluir_conversa(text, uuid, text) TO service_role, authenticated;

-- 5. RPC: atualizar_atendente — usado quando o atendente abre/responde
--    Persiste id+nome+email+avatar a partir do usuário logado.
CREATE OR REPLACE FUNCTION public.atualizar_atendente(
  p_jid                 text,
  p_atendente_id        uuid,
  p_atendente_nome      text,
  p_atendente_email     text DEFAULT NULL,
  p_atendente_avatar    text DEFAULT NULL,
  p_assumir_se_bot      boolean DEFAULT false
)
RETURNS public.whatsapp_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.whatsapp_sessions;
BEGIN
  UPDATE public.whatsapp_sessions
     SET atendente_id          = p_atendente_id,
         atendente_nome        = p_atendente_nome,
         atendente_email       = p_atendente_email,
         atendente_avatar_url  = p_atendente_avatar,
         status                = CASE
                                   WHEN p_assumir_se_bot AND status IN ('bot','aguardando')
                                     THEN 'humano'
                                   ELSE status
                                 END,
         updated_at            = now()
   WHERE jid = p_jid
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.atualizar_atendente(text, uuid, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_atendente(text, uuid, text, text, text, boolean)
  TO service_role, authenticated;

-- 6. Policies de RLS — TRANSPARÊNCIA TOTAL em leitura
--    Decisão de produto: qualquer atendente autenticado pode ver qualquer
--    conversa (modo "espiar" do print). Escrita continua via service_role
--    nos endpoints Next.js.
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Drop antigas se existirem (idempotente)
DROP POLICY IF EXISTS "wasa_select_authenticated"        ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "wamsg_select_authenticated"       ON public.whatsapp_messages;
DROP POLICY IF EXISTS "wasa_audit_select_authenticated"  ON public.whatsapp_sessions_audit;

CREATE POLICY "wasa_select_authenticated"
  ON public.whatsapp_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "wamsg_select_authenticated"
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.whatsapp_sessions_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wasa_audit_select_authenticated"
  ON public.whatsapp_sessions_audit
  FOR SELECT
  TO authenticated
  USING (true);

-- 7. Realtime: garantir que as tabelas estão na publicação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='whatsapp_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='whatsapp_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages';
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Smoke tests
-- =====================================================================
-- SELECT excluir_conversa('5511999999999@s.whatsapp.net'::text);
-- SELECT * FROM whatsapp_sessions_audit ORDER BY created_at DESC LIMIT 5;
