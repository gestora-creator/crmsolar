-- =========================================================
-- Fix: race condition entre SDR (insert da mensagem) e
--      sub-workflow de upload (preenchimento da media_url)
--
-- Aplicado em prod: 2026-05-08 (gestora-creator/crmsolar)
-- Projeto Supabase: lodgnyduaezlcjxfcxrh
--
-- Problema observado: o sub-workflow r1BtBcdGjja63jM4
-- (Upload Mídia WhatsApp) termina o upload em ~600ms, enquanto
-- o SDR principal demora 2-8s para inserir a linha em
-- whatsapp_messages (faz lookup de cliente, transcrição etc.
-- antes do INSERT). Resultado: a RPC
-- atualizar_media_msg_whatsapp roda ANTES da linha existir e
-- retorna updated=0. Áudios e demais mídias ficam órfãos
-- (media_url permanece NULL).
--
-- A documentação original (docs/internal/2026-05-08-feature-
-- midia-atendimento.md) assumia que o INSERT era mais rápido
-- que o upload. Em prod é o oposto.
--
-- Solução: tabela auxiliar de "mídia pendente" + trigger
-- BEFORE INSERT que consome ela quando a linha principal é
-- inserida. Resolve a race em qualquer direção (sub-workflow
-- rápido ou lento, mensagem vindo antes ou depois).
-- =========================================================

-- 1. Tabela auxiliar (holding area)
CREATE TABLE IF NOT EXISTS public.whatsapp_media_pending (
  message_id     text PRIMARY KEY,
  media_url      text NOT NULL,
  media_mimetype text,
  media_filename text,
  media_size     integer,
  transcricao    text,
  descricao_ia   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_media_pending IS
  'Holding area para mídia que chegou pelo upload paralelo antes da linha principal em whatsapp_messages. Trigger aplica e remove.';

-- 2. RPC: tenta UPDATE; se 0 linhas afetadas, salva na pending
CREATE OR REPLACE FUNCTION public.atualizar_media_msg_whatsapp(
  p_message_id    text,
  p_media_url     text,
  p_media_mimetype text DEFAULT NULL,
  p_media_filename text DEFAULT NULL,
  p_media_size    integer DEFAULT NULL,
  p_transcricao   text DEFAULT NULL,
  p_descricao_ia  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_message_id IS NULL OR p_message_id = '' THEN
    RETURN jsonb_build_object('success', false, 'erro', 'message_id obrigatório');
  END IF;

  UPDATE whatsapp_messages SET
    media_url      = COALESCE(p_media_url,      media_url),
    media_mimetype = COALESCE(p_media_mimetype, media_mimetype),
    media_filename = COALESCE(p_media_filename, media_filename),
    media_size     = COALESCE(p_media_size,     media_size),
    transcricao    = COALESCE(p_transcricao,    transcricao),
    descricao_ia   = COALESCE(p_descricao_ia,   descricao_ia)
  WHERE message_id = p_message_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Linha principal ainda nao existe (race) — guarda na pending.
    -- Trigger AFTER INSERT em whatsapp_messages aplica quando chegar.
    INSERT INTO whatsapp_media_pending (
      message_id, media_url, media_mimetype, media_filename,
      media_size, transcricao, descricao_ia
    ) VALUES (
      p_message_id, p_media_url, p_media_mimetype, p_media_filename,
      p_media_size, p_transcricao, p_descricao_ia
    )
    ON CONFLICT (message_id) DO UPDATE SET
      media_url      = COALESCE(EXCLUDED.media_url,      whatsapp_media_pending.media_url),
      media_mimetype = COALESCE(EXCLUDED.media_mimetype, whatsapp_media_pending.media_mimetype),
      media_filename = COALESCE(EXCLUDED.media_filename, whatsapp_media_pending.media_filename),
      media_size     = COALESCE(EXCLUDED.media_size,     whatsapp_media_pending.media_size),
      transcricao    = COALESCE(EXCLUDED.transcricao,    whatsapp_media_pending.transcricao),
      descricao_ia   = COALESCE(EXCLUDED.descricao_ia,   whatsapp_media_pending.descricao_ia),
      created_at     = now();

    RETURN jsonb_build_object(
      'success', true,
      'pending', true,
      'updated', 0,
      'message_id', p_message_id,
      'note', 'salvo em whatsapp_media_pending — trigger aplicara quando a mensagem for inserida'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pending', false,
    'updated', v_updated,
    'message_id', p_message_id
  );
END;
$$;

-- 3. Trigger BEFORE INSERT: consome whatsapp_media_pending se houver
CREATE OR REPLACE FUNCTION public.aplicar_media_pending()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pending whatsapp_media_pending;
BEGIN
  IF NEW.message_id IS NULL OR NEW.message_id = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pending
  FROM whatsapp_media_pending
  WHERE message_id = NEW.message_id
  LIMIT 1;

  IF FOUND THEN
    NEW.media_url      := COALESCE(NEW.media_url,      v_pending.media_url);
    NEW.media_mimetype := COALESCE(NEW.media_mimetype, v_pending.media_mimetype);
    NEW.media_filename := COALESCE(NEW.media_filename, v_pending.media_filename);
    NEW.media_size     := COALESCE(NEW.media_size,     v_pending.media_size);
    NEW.transcricao    := COALESCE(NEW.transcricao,    v_pending.transcricao);
    NEW.descricao_ia   := COALESCE(NEW.descricao_ia,   v_pending.descricao_ia);

    DELETE FROM whatsapp_media_pending WHERE message_id = NEW.message_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicar_media_pending ON public.whatsapp_messages;
CREATE TRIGGER trg_aplicar_media_pending
  BEFORE INSERT ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.aplicar_media_pending();

COMMENT ON FUNCTION public.aplicar_media_pending() IS
  'Trigger BEFORE INSERT: se ja existe midia em whatsapp_media_pending para o message_id, copia para os campos da NEW row e limpa a pending.';
