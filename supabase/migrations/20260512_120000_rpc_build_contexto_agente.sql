-- =====================================================================
-- Migração: RPC build_contexto_agente — monta payload p/ agente n8n
-- Data: 2026-05-12
-- Onda: V3 - Fase 2
--
-- Chamada pela Edge Function whatsapp-webhook para construir o
-- ContextoAgente em UMA ÚNICA round-trip ao Postgres (em vez de 5 HTTP
-- separados como o n8n faz hoje).
--
-- Retorna jsonb com a forma:
-- {
--   "cliente": {...},
--   "sessao": {...},
--   "historico": [...],
--   "chamados_abertos": [...],
--   "modo": "normal" | "retomada_caso" | "cliente_novo" | "cliente_irritado"
-- }
--
-- A mensagem atual e o trace_id são adicionados pela Edge Function.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.build_contexto_agente(
  p_jid             text,
  p_message_id      text DEFAULT NULL,
  p_historico_limit int  DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session     public.whatsapp_sessions%ROWTYPE;
  v_cliente     jsonb := '{}'::jsonb;
  v_historico   jsonb := '[]'::jsonb;
  v_chamados    jsonb := '[]'::jsonb;
  v_modo        text  := 'normal';
  v_tem_urgente boolean := false;
BEGIN
  -- ===== Sessão =====
  SELECT * INTO v_session FROM public.whatsapp_sessions WHERE jid = p_jid;
  IF NOT FOUND THEN
    -- Sessão deveria existir (processar_mensagem_recebida criou). Mas
    -- se chamarem isolado, retorna placeholder.
    RETURN jsonb_build_object(
      'cliente', '{}'::jsonb,
      'sessao', jsonb_build_object('jid', p_jid, 'tipo_conversa', public.derivar_tipo_conversa(p_jid)),
      'historico', '[]'::jsonb,
      'chamados_abertos', '[]'::jsonb,
      'modo', 'cliente_novo'
    );
  END IF;

  -- ===== Cliente =====
  -- A RPC existente retorna jsonb com {cliente_id, contato_id, contato_nome, metodo_match, is_grupo}.
  -- Enriquecemos aqui com JOIN em crm_clientes/crm_contatos para o agente
  -- ter razão social, documento, apelido, status, tags, etc.
  DECLARE
    v_resolve  jsonb;
    v_cli_id   uuid;
    v_ct_id    uuid;
  BEGIN
    v_resolve := public.buscar_cliente_por_whatsapp_jid(p_jid);
    v_cli_id  := NULLIF(v_resolve ->> 'cliente_id', '')::uuid;
    v_ct_id   := NULLIF(v_resolve ->> 'contato_id', '')::uuid;

    IF v_cli_id IS NOT NULL THEN
      -- Enriquece com dados do cliente
      SELECT jsonb_build_object(
        'cliente_id',            c.id,
        'contato_id',            v_ct_id,
        'razao_social',          c.razao_social,
        'nome_fantasia',         c.nome_fantasia,
        'apelido_relacionamento', COALESCE(ct.apelido_relacionamento, c.apelido_relacionamento),
        'documento',             c.documento,
        'tipo_cliente',          c.tipo_cliente,
        'status',                c.status,
        'tags',                  COALESCE(c.tags, ARRAY[]::text[]),
        'tipo_relacionamento',   c.tipo_relacionamento,
        'tipos_relacionamento',  COALESCE(c.tipos_relacionamento, ARRAY[]::text[]),
        'grupo_economico_id',    c.grupo_economico_id,
        'whatsapp',              c.whatsapp,
        'telefone_principal',    c.telefone_principal,
        'email_principal',       c.email_principal,
        'municipio',             c.municipio,
        'uf',                    c.uf,
        'cliente_desde',         c.cliente_desde,
        'contato_nome',          COALESCE(ct.nome_completo, v_resolve ->> 'contato_nome'),
        'contato_cargo',         ct.cargo,
        'contato_email',         ct.email,
        'contato_celular',       ct.celular,
        'metodo_match',          v_resolve ->> 'metodo_match',
        'is_grupo',              (v_resolve ->> 'is_grupo')::boolean
      ) INTO v_cliente
      FROM public.crm_clientes c
      LEFT JOIN public.crm_contatos ct ON ct.id = v_ct_id
      WHERE c.id = v_cli_id;
    ELSE
      -- Cliente não identificado — devolve só o que a RPC achou
      v_cliente := v_resolve;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_cliente := jsonb_build_object(
      'cliente_id', v_session.cliente_id,
      'contato_id', v_session.contato_id,
      'metodo_match', 'erro_enriquecimento'
    );
  END;

  IF v_cliente IS NULL THEN
    v_cliente := jsonb_build_object(
      'cliente_id', v_session.cliente_id,
      'contato_id', v_session.contato_id
    );
  END IF;

  -- ===== Histórico =====
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY enviado_em_ord DESC), '[]'::jsonb)
    INTO v_historico
    FROM (
      SELECT
        id, direcao, tipo, conteudo, media_url, media_mimetype,
        transcricao, descricao_ia, intencao, remetente, remetente_nome,
        enviado_em, created_at,
        COALESCE(enviado_em, created_at) AS enviado_em_ord
        FROM public.whatsapp_messages
       WHERE jid = p_jid
         AND (p_message_id IS NULL OR message_id IS DISTINCT FROM p_message_id)
       ORDER BY COALESCE(enviado_em, created_at) DESC, id DESC
       LIMIT p_historico_limit
    ) t;

  -- ===== Chamados abertos =====
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb), bool_or(t.prioridade = 'urgente')
    INTO v_chamados, v_tem_urgente
    FROM (
      SELECT id, tipo, status, prioridade, descricao, created_at
        FROM public.chamados_atendimento
       WHERE jid = p_jid
         AND status IN ('aberto','em_andamento_agente','escalado_humano','agendado')
       ORDER BY created_at DESC
       LIMIT 10
    ) t;

  -- ===== Modo operacional =====
  IF v_session.cliente_id IS NULL THEN
    v_modo := 'cliente_novo';
  ELSIF v_session.caso_tipo IS NOT NULL AND COALESCE(v_session.etapa, 'saudacao') <> 'saudacao' THEN
    v_modo := 'retomada_caso';
  END IF;
  IF COALESCE(v_session.prioridade, 'normal') = 'urgente' OR v_tem_urgente THEN
    v_modo := 'cliente_irritado';
  END IF;

  -- ===== Monta resultado =====
  RETURN jsonb_build_object(
    'cliente', COALESCE(v_cliente, '{}'::jsonb),
    'sessao', jsonb_build_object(
      'jid',                  v_session.jid,
      'tipo_conversa',        v_session.tipo_conversa,
      'status',               v_session.status,
      'ia_pausada',           COALESCE(v_session.ia_pausada, false),
      'caso_tipo',            v_session.caso_tipo,
      'etapa',                v_session.etapa,
      'prioridade',           COALESCE(v_session.prioridade, 'normal'),
      'dados_caso',           COALESCE(v_session.dados_caso, '{}'::jsonb),
      'intencao',             v_session.intencao,
      'atendente_id',         v_session.atendente_id,
      'atendente_nome',       v_session.atendente_nome,
      'ultima_msg_em',        v_session.ultima_msg_em,
      'total_msgs_nao_lidas', COALESCE(v_session.total_msgs_nao_lidas, 0)
    ),
    'historico',        v_historico,
    'chamados_abertos', v_chamados,
    'modo',             v_modo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_contexto_agente(text, text, int)
  TO service_role, authenticated;

COMMENT ON FUNCTION public.build_contexto_agente IS
  'V3: monta payload completo p/ agente n8n em 1 round-trip. Chamada pela Edge Function whatsapp-webhook.';

COMMIT;

-- =====================================================================
-- Validação:
--   SELECT public.build_contexto_agente('5511999999999@s.whatsapp.net');
--   -- Inspecionar JSON retornado.
-- =====================================================================
