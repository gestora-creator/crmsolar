-- Bucket whatsapp-media + policy de leitura pública.
-- Aplicado em produção em 2026-05-12 via Supabase MCP.
-- Versionado aqui para rastreabilidade.
--
-- Configuração final:
--   - public: true (URLs públicas, simplifica render no chat)
--   - file_size_limit: 100MB (audios longos, vídeos de até 16MB do WhatsApp,
--     PDFs com folga)
--   - allowed_mime_types: image/jpeg, image/png, image/gif, image/webp,
--     video/mp4, video/3gpp, video/quicktime, audio/ogg, audio/mpeg,
--     audio/wav, audio/mp4, application/pdf, application/msword, .docx,
--     application/vnd.ms-excel, .xlsx, text/plain, text/csv,
--     application/zip, application/x-zip-compressed, application/octet-stream

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  true,
  104857600,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/3gpp','video/quicktime',
    'audio/ogg','audio/mpeg','audio/wav','audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv',
    'application/zip','application/x-zip-compressed',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy: leitura pública (URLs publicUrl funcionam sem JWT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='whatsapp_media_public_read'
  ) THEN
    CREATE POLICY whatsapp_media_public_read ON storage.objects
      FOR SELECT
      USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;
