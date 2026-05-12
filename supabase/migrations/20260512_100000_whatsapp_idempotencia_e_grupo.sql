-- =====================================================================
-- Migração: WhatsApp Idempotência + tipo_conversa (grupo vs chat)
-- Data: 2026-05-12
-- Onda: V3 - Fase 1
--
-- Objetivos:
--   1. UNIQUE em whatsapp_messages(message_id) — fecha race condition
--      entre POST do CRM e webhook SEND_MESSAGE da Evolution.
--   2. Coluna tipo_conversa em whatsapp_sessions e whatsapp_messages
--      (chat | grupo | broadcast) com backfill automático.
--   3. Índices para filtros frequentes (lista por tipo, busca por jid).
--
-- Esta migração é IDEMPOTENTE (usa IF NOT EXISTS / DROP IF EXISTS).
-- Pode ser reaplicada sem efeito.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Higienizar duplicatas existentes ANTES de criar UNIQUE
--    (mantém só a linha mais recente por message_id)
-- ---------------------------------------------------------------------
WITH duplicadas AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY message_id
           ORDER BY COALESCE(enviado_em, created_at) DESC, id DESC
         ) AS rn
    FROM public.whatsapp_messages
   WHERE message_id IS NOT NULL
)
DELETE FROM public.whatsapp_messages w
 USING duplicadas d
 WHERE w.id = d.id AND d.rn > 1;

-- ---------------------------------------------------------------------
-- 2) UNIQUE em whatsapp_messages(message_id)
--    Nullável: mensagens muito antigas podem não ter message_id.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'idx_whatsapp_messages_message_id_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_whatsapp_messages_message_id_unique
      ON public.whatsapp_messages(message_id)
      WHERE message_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON INDEX public.idx_whatsapp_messages_message_id_unique IS
  'V3: idempotência. Webhook receiver faz ON CONFLICT (message_id) DO UPDATE.';

-- ---------------------------------------------------------------------
-- 3) Coluna tipo_conversa em whatsapp_sessions
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS tipo_conversa text NOT NULL DEFAULT 'chat';

ALTER TABLE public.whatsapp_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_sessions_tipo_conversa_check;
ALTER TABLE public.whatsapp_sessions
  ADD CONSTRAINT whatsapp_sessions_tipo_conversa_check CHECK (
    tipo_conversa = ANY (ARRAY['chat','grupo','broadcast'])
  );

-- Backfill: deriva do sufixo do jid
UPDATE public.whatsapp_sessions
   SET tipo_conversa = CASE
         WHEN jid LIKE '%@g.us'          THEN 'grupo'
         WHEN jid LIKE '%@broadcast'     THEN 'broadcast'
         WHEN jid LIKE '%@s.whatsapp.net' THEN 'chat'
         ELSE tipo_conversa
       END
 WHERE tipo_conversa = 'chat';  -- só atualiza onde está no default

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_tipo_conversa
  ON public.whatsapp_sessions(tipo_conversa);

COMMENT ON COLUMN public.whatsapp_sessions.tipo_conversa IS
  'V3: discrimina 1:1 (chat), grupo (@g.us) e listas de transmissão (@broadcast). UI filtra por aqui; agente IA NÃO responde grupo nem broadcast.';

-- ---------------------------------------------------------------------
-- 4) Garantir updated_at em whatsapp_messages (usado pelas RPCs V3)
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- 5) Coluna tipo_conversa em whatsapp_messages (espelha sessão)
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS tipo_conversa text NOT NULL DEFAULT 'chat';

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_tipo_conversa_check;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_tipo_conversa_check CHECK (
    tipo_conversa = ANY (ARRAY['chat','grupo','broadcast'])
  );

UPDATE public.whatsapp_messages
   SET tipo_conversa = CASE
         WHEN jid LIKE '%@g.us'          THEN 'grupo'
         WHEN jid LIKE '%@broadcast'     THEN 'broadcast'
         WHEN jid LIKE '%@s.whatsapp.net' THEN 'chat'
         ELSE tipo_conversa
       END
 WHERE tipo_conversa = 'chat';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tipo_conversa
  ON public.whatsapp_messages(tipo_conversa);

-- ---------------------------------------------------------------------
-- 5) Helper: deriva tipo_conversa a partir de um jid
--    Usada por triggers e pela RPC processar_mensagem_recebida.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derivar_tipo_conversa(p_jid text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_jid LIKE '%@g.us'          THEN 'grupo'
    WHEN p_jid LIKE '%@broadcast'     THEN 'broadcast'
    WHEN p_jid LIKE '%@s.whatsapp.net' THEN 'chat'
    ELSE 'chat'
  END;
$$;

-- ---------------------------------------------------------------------
-- 6) Trigger: ao inserir mensagem, garante consistência tipo_conversa
--    entre mensagem e sessão.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_tipo_conversa_msg()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo_conversa IS NULL OR NEW.tipo_conversa = '' OR NEW.tipo_conversa = 'chat' THEN
    NEW.tipo_conversa := public.derivar_tipo_conversa(NEW.jid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_tipo_conversa_msg ON public.whatsapp_messages;
CREATE TRIGGER tg_sync_tipo_conversa_msg
BEFORE INSERT ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_tipo_conversa_msg();

-- Mesma coisa para sessões (quando criada via insert direto, sem RPC)
CREATE OR REPLACE FUNCTION public.fn_sync_tipo_conversa_sessao()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo_conversa IS NULL OR NEW.tipo_conversa = '' OR NEW.tipo_conversa = 'chat' THEN
    NEW.tipo_conversa := public.derivar_tipo_conversa(NEW.jid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_tipo_conversa_sessao ON public.whatsapp_sessions;
CREATE TRIGGER tg_sync_tipo_conversa_sessao
BEFORE INSERT ON public.whatsapp_sessions
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_tipo_conversa_sessao();

-- ---------------------------------------------------------------------
-- 7) Status de mensagem: aceitar 'delivered' e 'read' (se ainda não aceita)
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;
ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check CHECK (
    status = ANY (ARRAY['queued','sent','delivered','read','failed'])
  );

COMMENT ON COLUMN public.whatsapp_messages.status IS
  'Status de entrega da mensagem. queued (criada localmente) → sent (Evolution aceitou) → delivered (entregue ao device) → read (lida). failed = falha de envio.';

-- ---------------------------------------------------------------------
-- 8) Tabela de estado da instância (telemetria de conexão)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_instances_state (
  instance_name text PRIMARY KEY,
  state         text NOT NULL,
  qr_base64     text,
  last_qr_at    timestamptz,
  last_connect_at timestamptz,
  last_disconnect_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_instances_state ENABLE ROW LEVEL SECURITY;

-- Política: qualquer usuário autenticado pode LER (precisa pra tela admin)
DROP POLICY IF EXISTS "instances_state_read" ON public.whatsapp_instances_state;
CREATE POLICY "instances_state_read"
  ON public.whatsapp_instances_state
  FOR SELECT
  TO authenticated
  USING (true);

-- Só service_role escreve (a Edge Function usa service_role)
-- (não precisa policy de INSERT/UPDATE pra service_role — ele bypassa RLS)

COMMENT ON TABLE public.whatsapp_instances_state IS
  'V3: estado das instâncias Evolution. Alimentado por CONNECTION_UPDATE e QRCODE_UPDATED.';

-- ---------------------------------------------------------------------
-- 9) Tabela de eventos brutos (auditoria/troubleshooting)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_events_raw (
  id          bigserial PRIMARY KEY,
  event       text NOT NULL,
  instance    text NOT NULL,
  message_id  text,
  jid         text,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed   boolean NOT NULL DEFAULT false,
  process_error text
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_raw_received_at
  ON public.whatsapp_events_raw(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_raw_message_id
  ON public.whatsapp_events_raw(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_raw_event
  ON public.whatsapp_events_raw(event, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_raw_unprocessed
  ON public.whatsapp_events_raw(received_at) WHERE processed = false;

ALTER TABLE public.whatsapp_events_raw ENABLE ROW LEVEL SECURITY;
-- Sem policy de SELECT — só service_role acessa.

COMMENT ON TABLE public.whatsapp_events_raw IS
  'V3: log auditável de todo evento recebido da Evolution. Retenção 30 dias (pg_cron sugerido).';

-- ---------------------------------------------------------------------
-- 10) Tabela de alertas para o admin (consumida pela UI/email)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id          bigserial PRIMARY KEY,
  tipo        text NOT NULL,
  titulo      text NOT NULL,
  descricao   text,
  severidade  text NOT NULL DEFAULT 'media',
  metadata    jsonb,
  lido        boolean NOT NULL DEFAULT false,
  lido_em     timestamptz,
  lido_por    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_alerts
  DROP CONSTRAINT IF EXISTS admin_alerts_severidade_check;
ALTER TABLE public.admin_alerts
  ADD CONSTRAINT admin_alerts_severidade_check CHECK (
    severidade = ANY (ARRAY['baixa','media','alta','critica'])
  );

CREATE INDEX IF NOT EXISTS idx_admin_alerts_nao_lidos
  ON public.admin_alerts(created_at DESC) WHERE lido = false;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_alerts_read" ON public.admin_alerts;
CREATE POLICY "admin_alerts_read"
  ON public.admin_alerts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_alerts_update_own" ON public.admin_alerts;
CREATE POLICY "admin_alerts_update_own"
  ON public.admin_alerts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.admin_alerts IS
  'V3: alertas operacionais (instância caiu, erro de envio em lote, taxa de falha alta).';

COMMIT;

-- =====================================================================
-- Validação pós-aplicação:
--
--   SELECT tipo_conversa, COUNT(*) FROM public.whatsapp_messages GROUP BY 1;
--   SELECT tipo_conversa, COUNT(*) FROM public.whatsapp_sessions GROUP BY 1;
--
--   -- Conferir UNIQUE:
--   SELECT message_id, COUNT(*) FROM public.whatsapp_messages
--    WHERE message_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
--   -- Deve retornar 0 linhas.
--
--   -- Conferir derivar_tipo_conversa:
--   SELECT public.derivar_tipo_conversa('5511999999999@s.whatsapp.net'); -- chat
--   SELECT public.derivar_tipo_conversa('120363025@g.us');                -- grupo
-- =====================================================================

-- =====================================================================
-- Rollback (referência, NÃO executar em prod):
--   BEGIN;
--   DROP TRIGGER IF EXISTS tg_sync_tipo_conversa_msg ON public.whatsapp_messages;
--   DROP TRIGGER IF EXISTS tg_sync_tipo_conversa_sessao ON public.whatsapp_sessions;
--   DROP FUNCTION IF EXISTS public.fn_sync_tipo_conversa_msg();
--   DROP FUNCTION IF EXISTS public.fn_sync_tipo_conversa_sessao();
--   DROP FUNCTION IF EXISTS public.derivar_tipo_conversa(text);
--   DROP TABLE IF EXISTS public.whatsapp_events_raw;
--   DROP TABLE IF EXISTS public.whatsapp_instances_state;
--   DROP TABLE IF EXISTS public.admin_alerts;
--   ALTER TABLE public.whatsapp_messages
--     DROP CONSTRAINT IF EXISTS whatsapp_messages_tipo_conversa_check,
--     DROP COLUMN  IF EXISTS tipo_conversa;
--   ALTER TABLE public.whatsapp_sessions
--     DROP CONSTRAINT IF EXISTS whatsapp_sessions_tipo_conversa_check,
--     DROP COLUMN  IF EXISTS tipo_conversa;
--   DROP INDEX IF EXISTS public.idx_whatsapp_messages_message_id_unique;
--   -- atenção: UNIQUE removido permite duplicatas — só se está rollbackando tudo.
--   COMMIT;
-- =====================================================================
