-- =============================================
-- MIGRATION: Limpeza Grupos Econômicos
-- 1. Remove coluna nome_grupo (redundante com grupo_economico_id)
-- 2. Revoga acesso anon à RPC find_or_create_grupo_economico
-- 3. Revoga acesso anon às policies de grupos_economicos
-- =============================================

-- PASSO 1: Migrar dados de nome_grupo para grupos_economicos (se existirem)
-- Criar grupos para clientes que tinham nome_grupo mas não tinham grupo_economico_id
INSERT INTO grupos_economicos (nome)
SELECT DISTINCT TRIM(nome_grupo)
FROM crm_clientes
WHERE nome_grupo IS NOT NULL 
  AND TRIM(nome_grupo) != ''
  AND grupo_economico_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM grupos_economicos 
    WHERE LOWER(TRIM(grupos_economicos.nome)) = LOWER(TRIM(crm_clientes.nome_grupo))
  )
ON CONFLICT (nome) DO NOTHING;

-- Vincular clientes que tinham nome_grupo mas sem grupo_economico_id
UPDATE crm_clientes c
SET grupo_economico_id = g.id
FROM grupos_economicos g
WHERE c.nome_grupo IS NOT NULL
  AND TRIM(c.nome_grupo) != ''
  AND c.grupo_economico_id IS NULL
  AND LOWER(TRIM(g.nome)) = LOWER(TRIM(c.nome_grupo));

-- PASSO 2: Remover coluna nome_grupo
ALTER TABLE crm_clientes DROP COLUMN IF EXISTS nome_grupo;

-- PASSO 3: Segurança — Revogar acesso anon à RPC
REVOKE EXECUTE ON FUNCTION public.find_or_create_grupo_economico(TEXT) FROM anon;

-- PASSO 4: Segurança — Remover policy anon em relatorio_envios
DROP POLICY IF EXISTS "Acesso público para visualizar relatórios" ON public.relatorio_envios;
CREATE POLICY "Somente autenticados visualizam relatórios"
ON public.relatorio_envios
FOR SELECT
TO authenticated
USING (true);

-- PASSO 5: Criar índice para ordenação alfabética de clientes (performance)
CREATE INDEX IF NOT EXISTS idx_clientes_razao_social_asc 
ON public.crm_clientes(razao_social ASC);

-- PASSO 6: Criar índice para filtro por grupo econômico (performance server-side)
CREATE INDEX IF NOT EXISTS idx_clientes_grupo_economico_id 
ON public.crm_clientes(grupo_economico_id) 
WHERE grupo_economico_id IS NOT NULL;

-- PASSO 7: Corrigir fallback de segurança no useAuth
-- (Nota: isto é feito no código TypeScript, documentado aqui para rastreabilidade)
-- useAuth.ts linha ~82: trocar ?? 'admin' por ?? 'limitada'

COMMENT ON COLUMN crm_clientes.grupo_economico_id IS 'FK para grupo econômico. Vínculo manual de governança — agrupa clientes PF e PJ sob um nome referencial de controlador.';
