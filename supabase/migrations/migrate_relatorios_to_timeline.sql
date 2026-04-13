-- MIGRATION DE DADOS: relatorio_envios → timeline_relacional
-- Colunas reais: id, created_at, cliente_id, contato_id, status_envio, viewed, tipo_relatorio, resultado_envio

INSERT INTO public.timeline_relacional (
  cliente_id, contato_id, tipo_evento, canal, direcao,
  resumo_chave, tom_conversa, metadata,
  origem, autor, ocorrido_em, created_at
)
SELECT 
  re.cliente_id,
  re.contato_id,
  CASE 
    WHEN re.viewed = true THEN 'relatorio_visualizado'
    ELSE 'relatorio_enviado'
  END,
  'sistema',
  'saida',
  CASE 
    WHEN re.viewed = true THEN 'Relatório ' || COALESCE(re.tipo_relatorio, '') || ' visualizado'
    ELSE 'Relatório ' || COALESCE(re.tipo_relatorio, '') || ' enviado'
  END,
  'neutro',
  jsonb_build_object(
    'relatorio_envio_id', re.id,
    'status_envio', re.status_envio,
    'tipo_relatorio', re.tipo_relatorio,
    'resultado_envio', re.resultado_envio
  ),
  'importacao',
  'sistema',
  re.created_at,
  re.created_at
FROM public.relatorio_envios re
WHERE re.cliente_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.timeline_relacional tl
    WHERE tl.metadata->>'relatorio_envio_id' = re.id::text
  );
