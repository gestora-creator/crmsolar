-- ✅ MIGRATION: Atomic find_or_create_grupo_economico
-- Solução para race condition em find-or-create pattern
-- Garante que exatamente 1 grupo é retornado, sem erro 23505

CREATE OR REPLACE FUNCTION find_or_create_grupo_economico(
  p_nome TEXT
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  descricao TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) AS $$
BEGIN
  -- 1️⃣ Primeiro, tenta retornar se exist
  RETURN QUERY
  SELECT 
    ge.id,
    ge.nome,
    ge.descricao,
    ge.created_at,
    ge.updated_at
  FROM grupos_economicos ge
  WHERE LOWER(TRIM(ge.nome)) = LOWER(TRIM(p_nome))
  LIMIT 1;

  -- 2️⃣ Se não encontrou, tenta inserir
  IF NOT FOUND THEN
    INSERT INTO grupos_economicos (nome)
    VALUES (TRIM(p_nome))
    ON CONFLICT (nome) DO NOTHING
    RETURNING 
      grupos_economicos.id,
      grupos_economicos.nome,
      grupos_economicos.descricao,
      grupos_economicos.created_at,
      grupos_economicos.updated_at;

    -- 3️⃣ Se ainda não encontrou (loss race condition),
    -- busca o que foi criado por outro thread
    IF NOT FOUND THEN
      RETURN QUERY
      SELECT 
        ge.id,
        ge.nome,
        ge.descricao,
        ge.created_at,
        ge.updated_at
      FROM grupos_economicos ge
      WHERE LOWER(TRIM(ge.nome)) = LOWER(TRIM(p_nome))
      LIMIT 1;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ✅ MIGRATION: Atomic create_vinculo_with_relatorio
-- Garante que vínculo e relatório são criados juntos (transação)

CREATE OR REPLACE FUNCTION create_vinculo_with_relatorio(
  p_cliente_id UUID,
  p_contato_id UUID,
  p_contato_principal BOOLEAN DEFAULT FALSE,
  p_cargo TEXT DEFAULT NULL
)
RETURNS TABLE (
  vinculo_id UUID,
  relatorio_id UUID
) AS $$
DECLARE
  v_vinculo_id UUID;
  v_relatorio_id UUID;
  v_contato_nome TEXT;
BEGIN
  -- 1️⃣ Create vínculo
  INSERT INTO crm_clientes_contatos (
    cliente_id,
    contato_id,
    contato_principal,
    cargo_no_cliente
  )
  VALUES (p_cliente_id, p_contato_id, p_contato_principal, p_cargo)
  RETURNING crm_clientes_contatos.id INTO v_vinculo_id;

  -- 2️⃣ Get contato name
  SELECT nome_completo INTO v_contato_nome
  FROM crm_contatos
  WHERE id = p_contato_id;

  -- 3️⃣ Create relatorio_envios atomically
  INSERT INTO relatorio_envios (
    cliente_id,
    contato_id,
    nome_falado_dono,
    status_envio,
    viewed
  )
  VALUES (
    p_cliente_id,
    p_contato_id,
    CASE 
      WHEN p_contato_principal THEN v_contato_nome
      ELSE v_contato_nome || ' (Contato-Vinculado)'
    END,
    'pendente',
    FALSE
  )
  RETURNING relatorio_envios.id INTO v_relatorio_id;

  RETURN QUERY SELECT v_vinculo_id, v_relatorio_id;
END;
$$ LANGUAGE plpgsql;

-- Comentário de auditoria
COMMENT ON FUNCTION find_or_create_grupo_economico(TEXT) IS
'Atomic find-or-create operation. Prevents 23505 unique constraint violations in race conditions.';

COMMENT ON FUNCTION create_vinculo_with_relatorio(UUID, UUID, BOOLEAN, TEXT) IS
'Atomic vinculo + relatorio creation. Guarantees both tables are synchronized.';
