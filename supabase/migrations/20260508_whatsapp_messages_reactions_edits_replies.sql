-- Fase 1 da integracao direta com Evolution API.
-- Adiciona suporte a reacoes, edicao, exclusao e threaded reply
-- em whatsapp_messages.
--
-- Aplicado em prod: 2026-05-08 (lodgnyduaezlcjxfcxrh)

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS editado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_reply_to
  ON public.whatsapp_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.reactions IS
  'Array JSONB de reacoes: [{emoji, by:"cliente"|"atendente", name?, ts}]';
COMMENT ON COLUMN public.whatsapp_messages.editado_em IS
  'Timestamp da ultima edicao (sendUpdate via Evolution). NULL = nunca editada.';
COMMENT ON COLUMN public.whatsapp_messages.excluido_em IS
  'Timestamp da exclusao (sendMessageDelete via Evolution). Soft-delete: linha permanece, conteudo apagado pela UI.';
COMMENT ON COLUMN public.whatsapp_messages.reply_to_message_id IS
  'message_id da mensagem citada (threaded reply). UI faz lookup para renderizar a citacao.';
