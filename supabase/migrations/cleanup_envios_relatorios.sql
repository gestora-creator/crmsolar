-- =============================================
-- LIMPEZA: Remover tabela antiga envios_relatorios
-- Data: 07/05/2026
-- Motivo: Consolidação em relatorio_envios como tabela única
-- =============================================

-- PASSO 1: Dropar view que usa tabela antiga
DROP VIEW IF EXISTS vw_resumo_envios CASCADE;

-- PASSO 2: Recriar view usando relatorio_envios
CREATE OR REPLACE VIEW vw_resumo_envios AS
SELECT 
  COALESCE(c.documento, 'SEM_DOC') as documento,
  COALESCE(re.nome_cliente, c.razao_social, 'SEM_NOME') as nome_cliente,
  re.mes_referencia as mes_ref,
  COUNT(*) as total_envios,
  COUNT(*) FILTER (WHERE re.canal = 'email') as envios_email,
  COUNT(*) FILTER (WHERE re.canal = 'whatsapp_grupo') as envios_whatsapp_grupo,
  COUNT(*) FILTER (WHERE re.canal = 'whatsapp_privado') as envios_whatsapp_privado,
  COUNT(*) FILTER (WHERE re.status_envio LIKE '%Enviado%') as envios_sucesso,
  COUNT(*) FILTER (WHERE re.erro IS NOT NULL) as envios_erro,
  MAX(re.created_at) as ultimo_envio
FROM relatorio_envios re
LEFT JOIN crm_clientes c ON re.cliente_id = c.id
GROUP BY c.documento, re.nome_cliente, c.razao_social, re.mes_referencia
ORDER BY mes_ref DESC, nome_cliente;

-- PASSO 3: Remover tabela antiga (estava vazia)
DROP TABLE IF EXISTS envios_relatorios CASCADE;

-- =============================================
-- RESULTADO:
-- - envios_relatorios (tabela antiga) REMOVIDA
-- - vw_resumo_envios ATUALIZADA para usar relatorio_envios
-- - Apenas relatorio_envios como fonte de verdade
-- =============================================
-- Migration executada em 07/05/2026 14:12 BRT
