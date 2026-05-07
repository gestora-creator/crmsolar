-- =============================================
-- REMOVER COLUNA canal_relatorio DA TABELA crm_contatos
-- Data: 07/05/2026
-- Motivo: Funcionalidade de preferências de comunicação foi removida
--         As preferências agora são gerenciadas por cliente vinculado
--         via campos pref_email, pref_whatsapp, pref_grupo_whatsapp
--         na tabela crm_clientes_contatos
-- =============================================

-- PASSO 1: Remover view que depende da coluna
DROP VIEW IF EXISTS vw_destinatarios_relatorio CASCADE;

-- PASSO 2: Remover índice GIN associado
DROP INDEX IF EXISTS idx_crm_contatos_canal_relatorio;

-- PASSO 3: Remover constraint de validação
ALTER TABLE crm_contatos 
DROP CONSTRAINT IF EXISTS crm_contatos_canal_relatorio_check;

-- PASSO 4: Remover a coluna
ALTER TABLE crm_contatos 
DROP COLUMN IF EXISTS canal_relatorio;

-- Verificação: confirmar que a coluna foi removida
-- Executar esta query para verificar:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'crm_contatos' 
-- ORDER BY ordinal_position;

-- =============================================
-- NOTA IMPORTANTE:
-- Esta operação é IRREVERSÍVEL. Certifique-se de que:
-- 1. Não há mais código usando canal_relatorio
-- 2. Backup foi feito antes de executar
-- 3. Todas as funcionalidades de preferências foram migradas
--    para a tabela crm_clientes_contatos
-- 4. A view vw_destinatarios_relatorio não é mais necessária
-- =============================================
-- Migration executada em 07/05/2026 14:08 BRT
