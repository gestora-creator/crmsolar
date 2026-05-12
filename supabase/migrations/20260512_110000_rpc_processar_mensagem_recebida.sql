-- =====================================================================
-- Migração: RPC processar_mensagem_recebida (cérebro do webhook V3)
-- Data: 2026-05-12
-- Onda: V3 - Fase 2
--
-- Esta RPC é chamada pela Edge Function whatsapp-webhook a cada
-- MESSAGES_UPSERT. Faz tudo de uma vez:
--   1. Resolve cliente/contato a partir do jid (FK para crm_clientes/contatos)
--   2. Cria/atualiza whatsapp_sessions (upsert)
--   3. Insere whatsapp_messages com ON CONFLICT (message_id) DO UPDATE
--   4. Decide se deve chamar agente IA, baseado em:
--        - tipo_conversa = 'chat' (não grupo, não broadcast)
--        - direcao = 'in' (não respondemos a SEND_MESSAGE eco)
--        - ia_pausada = false
--        - status_sessao != 'humano'
--        - NÃO é mensagem antiga (timestamp > now - 5min)
--   5. Retorna { deve_chamar_agente, session_id, message_id_db, jid }
--
-- A Edge Function NÃO contém regras de negócio — só roteia.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tipo de retorno
-- ---------------------------------------------------------------------
DROP TYPE IF EXISTS public.processar_msg_result CASCADE;
CREATE TYPE public.processar_msg_result AS (
  deve_chamar_agente boolean,
  motivo_skip        text,
  session_jid        text,
  message_db_id      bigint,
  cliente_id         uuid,
  contato_id         uuid,
  tipo_conversa      text,
  ja_existia         boolean
);

-- ---------------------------------------------------------------------
-- Função principal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.processar_mensagem_recebida(
  p_event           text,           -- MESSAGES_UPSERT | SEND_MESSAGE | MESSAGES_UPDATE
  p_instance        text,
  p_jid             text,
  p_message_id      text,
  p_from_me         boolean,
  p_message_type    text,           -- text | image | audio | video | document | sticker | reaction | etc
  p_conteudo        text,
  p_media_url       text DEFAULT NULL,
  p_media_mimetype  text DEFAULT NULL,
  p_media_filename  text DEFAULT NULL,
  p_push_name       text DEFAULT NULL,
  p_message_ts      timestamptz DEFAULT now(),
  p_raw_payload     jsonb DEFAULT '{}'::jsonb
)
RETURNS public.processar_msg_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tipo_conversa text;
  v_direcao       text;
  v_session       public.whatsapp_sessions%ROWTYPE;
  v_msg_id        bigint;
  v_ja_existia    boolean := false;
  v_cliente_id    uuid;
  v_contato_id    uuid;
  v_cliente_resolve jsonb;
  v_idade_msg_min int;
  v_result        public.processar_msg_result;
BEGIN
  -- ===================================================================
  -- 1) Derivar metadados básicos
  -- ===================================================================
  v_tipo_conversa := public.derivar_tipo_conversa(p_jid);
  v_direcao := CASE WHEN p_from_me THEN 'out' ELSE 'in' END;

  -- ===================================================================
  -- 2) Resolver cliente/contato (best-effort, não falha se não achar)
  --    A RPC buscar_cliente_por_whatsapp_jid retorna jsonb.
  -- ===================================================================
  BEGIN
    v_cliente_resolve := public.buscar_cliente_por_whatsapp_jid(p_jid);
    v_cliente_id := NULLIF(v_cliente_resolve ->> 'cliente_id', '')::uuid;
    v_contato_id := NULLIF(v_cliente_resolve ->> 'contato_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_cliente_id := NULL;
    v_contato_id := NULL;
  END;

  -- ===================================================================
  -- 3) Upsert da sessão
  -- ===================================================================
  -- Grupo e broadcast: sessão entra como 'bot' (não 'aguardando')
  -- pra não disparar o trigger tg_auto_abrir_chamado.
  INSERT INTO public.whatsapp_sessions (
    jid, tipo_conversa, status, cliente_id, contato_id,
    nome_contato, ultima_msg_em, total_msgs_nao_lidas, created_at, updated_at
  )
  VALUES (
    p_jid, v_tipo_conversa,
    CASE
      WHEN v_tipo_conversa <> 'chat' THEN 'bot'
      WHEN v_direcao = 'in'          THEN 'aguardando'
      ELSE 'bot'
    END,
    v_cliente_id, v_contato_id,
    COALESCE(p_push_name, p_jid),
    p_message_ts,
    CASE WHEN v_direcao = 'in' AND v_tipo_conversa = 'chat' THEN 1 ELSE 0 END,
    now(), now()
  )
  ON CONFLICT (jid) DO UPDATE
    SET ultima_msg_em       = EXCLUDED.ultima_msg_em,
        nome_contato        = COALESCE(public.whatsapp_sessions.nome_contato, EXCLUDED.nome_contato),
        cliente_id          = COALESCE(public.whatsapp_sessions.cliente_id, EXCLUDED.cliente_id),
        contato_id          = COALESCE(public.whatsapp_sessions.contato_id, EXCLUDED.contato_id),
        tipo_conversa       = EXCLUDED.tipo_conversa,
        total_msgs_nao_lidas = CASE
          WHEN v_direcao = 'in' AND v_tipo_conversa = 'chat'
            THEN public.whatsapp_sessions.total_msgs_nao_lidas + 1
            ELSE public.whatsapp_sessions.total_msgs_nao_lidas
        END,
        updated_at = now()
  RETURNING * INTO v_session;

  -- ===================================================================
  -- 4) Upsert da mensagem (ON CONFLICT por message_id evita duplicação)
  -- ===================================================================
  IF p_message_id IS NOT NULL THEN
    -- ja_existia?
    SELECT EXISTS (
      SELECT 1 FROM public.whatsapp_messages WHERE message_id = p_message_id
    ) INTO v_ja_existia;
  END IF;

  INSERT INTO public.whatsapp_messages (
    jid, tipo_conversa, direcao, tipo, conteudo,
    media_url, media_mimetype, media_filename,
    remetente, remetente_nome,
    message_id, status, lida, enviado_em,
    created_at
  )
  VALUES (
    p_jid, v_tipo_conversa, v_direcao, p_message_type, p_conteudo,
    p_media_url, p_media_mimetype, p_media_filename,
    CASE
      WHEN v_direcao = 'in'  THEN 'cliente'
      WHEN p_from_me AND p_event = 'SEND_MESSAGE' THEN 'atendente'
      ELSE 'sistema'
    END,
    COALESCE(p_push_name, p_jid),
    p_message_id,
    CASE WHEN v_direcao = 'in' THEN 'delivered' ELSE 'sent' END,
    false,
    p_message_ts,
    now()
  )
  ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO UPDATE
    SET
      -- Mensagem já existe (foi inserida pelo POST do CRM antes do webhook chegar).
      -- Atualiza só o que faz sentido: media_url (se webhook trouxer), status.
      media_url   = COALESCE(public.whatsapp_messages.media_url, EXCLUDED.media_url),
      media_mimetype = COALESCE(public.whatsapp_messages.media_mimetype, EXCLUDED.media_mimetype),
      media_filename = COALESCE(public.whatsapp_messages.media_filename, EXCLUDED.media_filename),
      updated_at  = now()
  RETURNING id INTO v_msg_id;

  -- ===================================================================
  -- 5) Decidir se chama agente
  -- ===================================================================
  v_idade_msg_min := EXTRACT(EPOCH FROM (now() - p_message_ts)) / 60;

  -- Padrão: chama
  v_result.deve_chamar_agente := true;
  v_result.motivo_skip := NULL;

  -- Regras de NÃO chamar:
  IF v_direcao = 'out' THEN
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'mensagem_de_saida';
  ELSIF v_tipo_conversa <> 'chat' THEN
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'tipo_conversa_' || v_tipo_conversa;
  ELSIF v_ja_existia THEN
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'mensagem_duplicada';
  ELSIF v_session.ia_pausada = true THEN
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'ia_pausada';
  ELSIF v_session.status = 'humano' THEN
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'status_humano';
  ELSIF v_idade_msg_min > 5 THEN
    -- Backfill ou reentrega tardia — não responder mensagem antiga.
    v_result.deve_chamar_agente := false;
    v_result.motivo_skip := 'mensagem_antiga_' || v_idade_msg_min::text || '_min';
  END IF;

  v_result.session_jid    := p_jid;
  v_result.message_db_id  := v_msg_id;
  v_result.cliente_id     := v_cliente_id;
  v_result.contato_id     := v_contato_id;
  v_result.tipo_conversa  := v_tipo_conversa;
  v_result.ja_existia     := v_ja_existia;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.processar_mensagem_recebida(
  text, text, text, text, boolean, text, text, text, text, text, text, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.processar_mensagem_recebida IS
  'V3: cérebro do webhook. Upsert msg + sessão e decide se Edge Function deve chamar agente n8n.';

-- ---------------------------------------------------------------------
-- Função auxiliar: pausar/despausar IA por sessão (usada pela UI admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pausar_ia_sessao(
  p_jid     text,
  p_pausada boolean,
  p_motivo  text DEFAULT NULL
)
RETURNS public.whatsapp_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session public.whatsapp_sessions%ROWTYPE;
BEGIN
  UPDATE public.whatsapp_sessions
     SET ia_pausada = p_pausada,
         updated_at = now()
   WHERE jid = p_jid
   RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada para jid %', p_jid;
  END IF;

  -- Registra na timeline (best-effort)
  BEGIN
    INSERT INTO public.timeline_relacional (
      cliente_id, contato_id, tipo_evento, canal, direcao,
      resumo_chave, conteudo_longo, origem, autor, ocorrido_em
    ) VALUES (
      v_session.cliente_id, v_session.contato_id,
      CASE WHEN p_pausada THEN 'ia_pausada' ELSE 'ia_retomada' END,
      'whatsapp', 'interna',
      CASE WHEN p_pausada THEN 'IA pausada' ELSE 'IA retomada' END,
      p_motivo,
      'admin_ui',
      COALESCE(v_session.atendente_nome, 'sistema'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- timeline é log; falha não bloqueia
    NULL;
  END;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pausar_ia_sessao(text, boolean, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.pausar_ia_sessao IS
  'V3: liga/desliga IA por sessão. Usado pelo toggle no chat e por escalações manuais.';

-- ---------------------------------------------------------------------
-- Função auxiliar: atualizar status de mensagem (MESSAGES_UPDATE)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_status_mensagem(
  p_message_id text,
  p_status     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_messages
     SET status = p_status,
         lida   = (p_status = 'read'),
         updated_at = now()
   WHERE message_id = p_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_status_mensagem(text, text)
  TO service_role;

COMMENT ON FUNCTION public.atualizar_status_mensagem IS
  'V3: chamada por webhook MESSAGES_UPDATE. Atualiza ticks (sent/delivered/read).';

-- ---------------------------------------------------------------------
-- RPC: inserir_mensagem_saida_idempotente
-- Usada pelo route handler POST /api/atendimento/mensagens/[jid]
-- porque o supabase-js NÃO consegue gerar ON CONFLICT com WHERE clause
-- (necessário pra partial unique index).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_mensagem_saida_idempotente(
  p_jid             text,
  p_message_id      text,
  p_tipo            text,
  p_conteudo        text,
  p_media_url       text,
  p_media_mimetype  text,
  p_media_filename  text,
  p_remetente_nome  text,
  p_enviado_em      timestamptz DEFAULT now()
)
RETURNS public.whatsapp_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.whatsapp_messages%ROWTYPE;
BEGIN
  INSERT INTO public.whatsapp_messages (
    jid, tipo_conversa, direcao, tipo, conteudo,
    media_url, media_mimetype, media_filename,
    remetente, remetente_nome,
    message_id, status, lida, enviado_em,
    created_at, updated_at
  )
  VALUES (
    p_jid, public.derivar_tipo_conversa(p_jid), 'out', p_tipo, p_conteudo,
    p_media_url, p_media_mimetype, p_media_filename,
    'atendente', p_remetente_nome,
    p_message_id, 'sent', false, p_enviado_em,
    now(), now()
  )
  ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO UPDATE
    SET media_url      = COALESCE(public.whatsapp_messages.media_url, EXCLUDED.media_url),
        media_mimetype = COALESCE(public.whatsapp_messages.media_mimetype, EXCLUDED.media_mimetype),
        media_filename = COALESCE(public.whatsapp_messages.media_filename, EXCLUDED.media_filename),
        updated_at     = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inserir_mensagem_saida_idempotente(
  text, text, text, text, text, text, text, text, timestamptz
) TO authenticated, service_role;

COMMENT ON FUNCTION public.inserir_mensagem_saida_idempotente IS
  'V3: inserção idempotente usada pelo CRM. Resolve limitação do supabase-js com partial unique index.';

COMMIT;

-- =====================================================================
-- Validação:
--
--   -- Teste manual com mensagem fake:
--   SELECT * FROM public.processar_mensagem_recebida(
--     'MESSAGES_UPSERT',
--     'n8n-suporte',
--     '5511999999999@s.whatsapp.net',
--     'TEST_MSG_001',
--     false,
--     'text',
--     'Mensagem teste',
--     NULL, NULL, NULL,
--     'Cliente Teste',
--     now(),
--     '{}'::jsonb
--   );
--   -- Espera: deve_chamar_agente=true, motivo_skip=null
--
--   -- Teste com grupo:
--   SELECT * FROM public.processar_mensagem_recebida(
--     'MESSAGES_UPSERT', 'n8n-suporte',
--     '120363025@g.us', 'TEST_GRP_001', false, 'text', 'Oi grupo',
--     NULL, NULL, NULL, 'Fulano', now(), '{}'::jsonb
--   );
--   -- Espera: deve_chamar_agente=false, motivo_skip='tipo_conversa_grupo'
--
--   -- Teste com sessão pausada:
--   UPDATE whatsapp_sessions SET ia_pausada=true WHERE jid='5511999999999@s.whatsapp.net';
--   SELECT * FROM public.processar_mensagem_recebida(...);
--   -- Espera: motivo_skip='ia_pausada'
-- =====================================================================
