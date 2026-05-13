-- RPC marcar_conversa_como_lida(p_jid)
-- Aplicada em produção em 2026-05-12 via Supabase MCP.
-- Versionada aqui para rastreabilidade.
--
-- Fix de ambiguous column reference: usa alias wm.<col> dentro do UPDATE
-- com RETURNING wm.message_id, evitando colisão com a coluna do CTE.
--
-- Retorna a lista de message_ids marcados como lidos -> consumida pela
-- API de mensagens para invocar Evolution chat/markMessageAsRead em
-- background e mostrar tick azul no celular do cliente.

CREATE OR REPLACE FUNCTION public.marcar_conversa_como_lida(p_jid text)
RETURNS TABLE(marked_message_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH marcadas AS (
    UPDATE public.whatsapp_messages AS wm
       SET lida = true,
           updated_at = now()
     WHERE wm.jid = p_jid
       AND wm.direcao = 'in'
       AND wm.lida = false
       AND wm.message_id IS NOT NULL
    RETURNING wm.message_id
  )
  SELECT m.message_id FROM marcadas m;

  UPDATE public.whatsapp_sessions
     SET total_msgs_nao_lidas = 0,
         updated_at = now()
   WHERE jid = p_jid
     AND total_msgs_nao_lidas > 0;
END;
$function$;
