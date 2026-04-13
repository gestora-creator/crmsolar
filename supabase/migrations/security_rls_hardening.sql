-- =============================================
-- MIGRATION: Hardening de Segurança RLS
-- Corrige TODAS as policies para TO authenticated + auth.uid() IS NOT NULL
-- =============================================

-- ============================================
-- ITEM 3: CRIAR TABELA 'base' SE NÃO EXISTIR
-- ============================================
CREATE TABLE IF NOT EXISTS public.base (
  id BIGSERIAL PRIMARY KEY,
  "CLIENTE" TEXT,
  "CPF/CNPJ" TEXT,
  "Unidades" TEXT,
  "Tipo" TEXT,
  dados_extraidos JSONB,
  projetada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.base IS 'Dados de faturamento de UCs importados externamente.';

-- ============================================
-- ITEM 2: RLS NA TABELA 'base'
-- ============================================
ALTER TABLE public.base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_base" ON public.base;
DROP POLICY IF EXISTS "auth_insert_base" ON public.base;
DROP POLICY IF EXISTS "auth_update_base" ON public.base;
DROP POLICY IF EXISTS "auth_delete_base" ON public.base;

CREATE POLICY "auth_select_base" ON public.base FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_base" ON public.base FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_base" ON public.base FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_base" ON public.base FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- ITEM 1: crm_clientes — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "auth_insert_clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "auth_update_clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "auth_delete_clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Usuários autenticados podem criar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Ver clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Criar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Atualizar clientes" ON public.crm_clientes;
DROP POLICY IF EXISTS "Deletar clientes" ON public.crm_clientes;

CREATE POLICY "auth_select_clientes" ON public.crm_clientes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_clientes" ON public.crm_clientes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_clientes" ON public.crm_clientes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_clientes" ON public.crm_clientes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- crm_contatos — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "auth_insert_contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "auth_update_contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "auth_delete_contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem criar contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar contatos" ON public.crm_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar contatos" ON public.crm_contatos;

CREATE POLICY "auth_select_contatos" ON public.crm_contatos FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_contatos" ON public.crm_contatos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_contatos" ON public.crm_contatos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_contatos" ON public.crm_contatos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- crm_clientes_contatos — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_vinculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "auth_insert_vinculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "auth_update_vinculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "auth_delete_vinculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar vínculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem criar vínculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar vínculos" ON public.crm_clientes_contatos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar vínculos" ON public.crm_clientes_contatos;

CREATE POLICY "auth_select_vinculos" ON public.crm_clientes_contatos FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_vinculos" ON public.crm_clientes_contatos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_vinculos" ON public.crm_clientes_contatos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_vinculos" ON public.crm_clientes_contatos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- relatorio_envios — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_relatorios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "auth_insert_relatorios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "auth_update_relatorios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "auth_delete_relatorios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "Acesso público para visualizar relatórios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "Somente autenticados visualizam relatórios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "Usuários autenticados podem criar relatórios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar relatórios" ON public.relatorio_envios;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar relatórios" ON public.relatorio_envios;

CREATE POLICY "auth_select_relatorios" ON public.relatorio_envios FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_relatorios" ON public.relatorio_envios FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_relatorios" ON public.relatorio_envios FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_relatorios" ON public.relatorio_envios FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- crm_clientes_tecnica — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_tecnica" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "auth_insert_tecnica" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "auth_update_tecnica" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "auth_delete_tecnica" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir leitura de dados técnicos" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir inserção de dados técnicos" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir atualização de dados técnicos" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir exclusão de dados técnicos" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir leitura de dados técnicos para autenticados" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir inserção de dados técnicos para autenticados" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir atualização de dados técnicos para autenticados" ON public.crm_clientes_tecnica;
DROP POLICY IF EXISTS "Permitir exclusão de dados técnicos para autenticados" ON public.crm_clientes_tecnica;

CREATE POLICY "auth_select_tecnica" ON public.crm_clientes_tecnica FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_tecnica" ON public.crm_clientes_tecnica FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_tecnica" ON public.crm_clientes_tecnica FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_tecnica" ON public.crm_clientes_tecnica FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- grupos_economicos — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_grupos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "auth_insert_grupos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "auth_update_grupos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "auth_delete_grupos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir leitura de grupos econômicos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir inserção de grupos econômicos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir atualização de grupos econômicos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir exclusão de grupos econômicos" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir leitura de grupos econômicos para autenticados" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir inserção de grupos econômicos para autenticados" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir atualização de grupos econômicos para autenticados" ON public.grupos_economicos;
DROP POLICY IF EXISTS "Permitir exclusão de grupos econômicos para autenticados" ON public.grupos_economicos;

CREATE POLICY "auth_select_grupos" ON public.grupos_economicos FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_grupos" ON public.grupos_economicos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_grupos" ON public.grupos_economicos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_grupos" ON public.grupos_economicos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- crm_ucs_validacao — DROP ALL + RECREATE
-- ============================================
DROP POLICY IF EXISTS "auth_select_ucs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "auth_insert_ucs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "auth_update_ucs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "auth_delete_ucs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir leitura de validação de UCs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir inserção de validação de UCs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir atualização de validação de UCs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir exclusão de validação de UCs" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir leitura de validação para autenticados" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir inserção de validação para autenticados" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir atualização de validação para autenticados" ON public.crm_ucs_validacao;
DROP POLICY IF EXISTS "Permitir exclusão de validação para autenticados" ON public.crm_ucs_validacao;

CREATE POLICY "auth_select_ucs" ON public.crm_ucs_validacao FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth_insert_ucs" ON public.crm_ucs_validacao FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_update_ucs" ON public.crm_ucs_validacao FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth_delete_ucs" ON public.crm_ucs_validacao FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============================================
-- ITEM 4: RPC get_tag_counts
-- ============================================
CREATE OR REPLACE FUNCTION public.get_tag_counts()
RETURNS TABLE(nome TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT t.nome, COUNT(c.id)
  FROM crm_tags t
  LEFT JOIN crm_clientes c ON c.tags @> ARRAY[t.nome]
  GROUP BY t.nome
  ORDER BY COUNT(c.id) DESC, t.nome ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_tag_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tag_counts() TO authenticated;

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_base_tipo ON public.base("Tipo");
CREATE INDEX IF NOT EXISTS idx_base_cliente ON public.base("CLIENTE");
CREATE INDEX IF NOT EXISTS idx_clientes_tags ON public.crm_clientes USING GIN (tags);
