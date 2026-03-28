-- Drop completamente a função
DROP FUNCTION IF EXISTS public.find_or_create_grupo_economico(TEXT) CASCADE;

-- Recriar com nomes de saída diferentes (sem ambiguidade)
CREATE OR REPLACE FUNCTION public.find_or_create_grupo_economico(p_nome TEXT)
RETURNS TABLE (
  result_id UUID,
  result_nome TEXT,
  result_created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  -- Step 1: Try insert (ON CONFLICT silently ignores if exists)
  INSERT INTO public.grupos_economicos (nome)
  VALUES (TRIM(p_nome))
  ON CONFLICT (nome) DO NOTHING;
  
  -- Step 2: Always return the record (new or existing)
  RETURN QUERY
  SELECT 
    grupos_economicos.id AS result_id,
    grupos_economicos.nome AS result_nome,
    grupos_economicos.created_at AS result_created_at
  FROM public.grupos_economicos
  WHERE LOWER(TRIM(grupos_economicos.nome)) = LOWER(TRIM(p_nome))
  LIMIT 1;
END;
$$;

-- Test function created
SELECT COUNT(*) as functions_found
FROM pg_proc 
WHERE proname = 'find_or_create_grupo_economico';
-- Should return 1 ✅

-- Grant permission
GRANT EXECUTE ON FUNCTION public.find_or_create_grupo_economico(TEXT) TO anon, authenticated;
