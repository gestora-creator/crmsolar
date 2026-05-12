-- Migration: corrigir FKs que bloqueavam DELETE em crm_clientes (erro 23503/409)
-- Aplicada em produção em 2026-05-12 via Supabase Studio MCP.
-- Padronizamos com o resto do schema: SET NULL preserva histórico
-- (mensagens de WhatsApp e chamados) apenas desassociando o cliente excluído.

ALTER TABLE public.whatsapp_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_cliente_id_fkey,
  ADD  CONSTRAINT whatsapp_sessions_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.crm_clientes(id)
    ON DELETE SET NULL;

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_cliente_id_fkey,
  ADD  CONSTRAINT whatsapp_messages_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.crm_clientes(id)
    ON DELETE SET NULL;

ALTER TABLE public.chamados_atendimento
  DROP CONSTRAINT IF EXISTS chamados_atendimento_cliente_id_fkey,
  ADD  CONSTRAINT chamados_atendimento_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES public.crm_clientes(id)
    ON DELETE SET NULL;
