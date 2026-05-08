# Feature: Envio e visualização de mídia no atendimento WhatsApp

**Data:** 08 de maio de 2026  
**Tipo:** Feature de produto (full-stack: frontend, backend, n8n, banco)  
**Impacto:** Atendentes agora enviam imagens, documentos, áudios e vídeos pelo CRM. Mídias recebidas dos clientes ficam armazenadas e visíveis na conversa.

---

## Comportamento esperado

### Atendente envia mídia ao cliente
1. No `/atendimento`, com uma conversa em modo `humano` selecionada, o botão de clipe (Paperclip) abre o seletor de arquivos.
2. Após selecionar, o arquivo é enviado para `POST /api/atendimento/upload`, que sobe ao bucket Supabase Storage `whatsapp-media` (pasta `outgoing/{jid}/...`) e devolve a URL pública.
3. Aparece um preview compacto acima do textarea: thumbnail (imagens) ou ícone (audio/video/doc), nome do arquivo, tamanho e botão de remover.
4. O atendente pode adicionar uma legenda no textarea e clicar Enviar.
5. O `POST /api/atendimento/mensagens/[jid]` chama a Evolution API `sendMedia` com o `media_url`, e grava a mensagem no banco com `tipo`, `media_url`, `media_mimetype`, `media_filename`.
6. A mensagem aparece no chat (a UI já renderiza inline) e é entregue no WhatsApp do cliente.

### Cliente envia mídia ao atendente (recebimento)
1. SDR (`FF18M7RdVMGXRJog`) recebe a mensagem do webhook Evolution.
2. `Salvar Msg Entrada` grava a mensagem em `whatsapp_messages` com `media_url = NULL` (fluxo principal não fica bloqueado pelo upload).
3. **Em paralelo**, conforme o tipo da mensagem, o ramo correspondente (`Obter Audio/Imagem/Doc Base64`) dispara um `executeWorkflow` assíncrono para `CRM — Upload Mídia WhatsApp` (`r1BtBcdGjja63jM4`) com `{jid, message_id, base64, mimetype, filename, tipo}`.
4. O sub-workflow:
   - Decodifica o base64 em Buffer
   - Sobe no bucket `whatsapp-media` (pasta `incoming/{jid}/...`) via Supabase Storage REST API com `Content-Type` correto
   - Chama a RPC `atualizar_media_msg_whatsapp(message_id, url, mimetype, filename, size)` para popular `whatsapp_messages` localizada por `message_id`
5. Como a inserção da mensagem (`Salvar Msg Entrada`) é mais rápida que o upload + RPC, na prática a `media_url` aparece poucos segundos depois da mensagem na UI. Realtime do Supabase já propaga.

---

## Componentes alterados

### Banco — `lodgnyduaezlcjxfcxrh`

- **Bucket Storage** `whatsapp-media` (público, limite 50MB) — já existia, RLS protegido por service_role.
- **Nova RPC** `public.atualizar_media_msg_whatsapp(p_message_id, p_media_url, p_media_mimetype, p_media_filename, p_media_size, p_transcricao, p_descricao_ia)` retorna `jsonb`. Faz `UPDATE` em `whatsapp_messages` localizado por `message_id`.

### CRM — Next.js 16 / React 19

- **Novo endpoint** `POST /api/atendimento/upload` recebe `FormData` com `file` e `jid`, faz upload via service_role, devolve `{ url, path, mimetype, filename, size, tipo }`. Limite 50MB. Sanitiza filename. Organiza por pasta `outgoing/{jid}/`.
- **`app/(app)/atendimento/page.tsx`** ganhou:
  - Estado `pendingMedia` com info do anexo já uploadado (incluindo `previewUrl` local para imagens).
  - Estados `uploadingMedia` e `uploadError`.
  - Handler `handleFileSelected` que sobe via `/api/atendimento/upload`.
  - Handler `clearPendingMedia` para descartar anexo antes de enviar.
  - `handleSend` reescrito para suportar texto, mídia, ou ambos (legenda).
  - Input file oculto com `accept` cobrindo image/audio/video + extensões comuns de docs.
  - Botão Paperclip funcional com loading state.
  - Preview compacto do anexo pendente acima do textarea.
  - Banner de erro de upload com botão fechar.

### n8n — workflows

- **Novo workflow** `CRM — Upload Mídia WhatsApp` (id `r1BtBcdGjja63jM4`, ativo): 4 nós — `executeWorkflowTrigger` → `Code (preparar)` → `HTTP Request (upload Storage, binaryData)` → `HTTP Request (RPC atualizar_media_msg_whatsapp)`.
- **Workflow SDR** (`FF18M7RdVMGXRJog`) ganhou 3 nós `executeWorkflow` (assíncronos com `waitForSubWorkflow: false`):
  - `Upload Áudio Storage` — após `Obter Audio Base64`
  - `Upload Imagem Storage` — após `Obter Imagem Base64`
  - `Upload Documento Storage` — após `Obter Doc Base64`
  
  Cada um passa `{jid, message_id, base64, mimetype, filename, tipo}` para o sub-workflow. Não bloqueiam o fluxo principal (transcrição/análise/extração continuam em paralelo).

---

## Limitações conhecidas

1. **Race condition mínima**: se o upload terminar antes do `Salvar Msg Entrada` inserir a linha (improvável: insert leva ~100-300ms vs upload ~1-2s), a RPC retorna `updated: 0`. Comportamento defensivo: a RPC retorna `success: false` mas não joga erro; o sub-workflow não bloqueia o SDR. Mitigação futura: adicionar retry com backoff curto na RPC.
2. **Sem retry no upload do CRM**: se a rede do atendente cair durante o `POST /api/atendimento/upload`, ele vê o erro e tem que tentar de novo. Sem upload chunked.
3. **Sem antivirus/scan de conteúdo** nos uploads. Limite de tamanho (50MB) é a única defesa básica.
4. **`previewUrl` local de imagens** usa `URL.createObjectURL` — revogado em `clearPendingMedia` e após envio para evitar leak.

## Como testar manualmente

### Recebimento (cliente → CRM)
1. Pedir para um cliente cadastrado mandar uma foto/áudio/PDF no WhatsApp.
2. Em ~3 segundos a mensagem aparece em `/atendimento` com a mídia renderizada inline.
3. Verificar em SQL: `SELECT jid, tipo, media_url, media_mimetype FROM whatsapp_messages WHERE direcao='in' AND media_url IS NOT NULL ORDER BY created_at DESC LIMIT 5;`

### Envio (CRM → cliente)
1. Em `/atendimento`, abrir uma conversa em status `humano` (ou clicar Assumir).
2. Clicar no clipe, escolher uma imagem/PDF, adicionar legenda opcional, enviar.
3. Cliente deve receber no WhatsApp em segundos.
4. Verificar em SQL: `SELECT jid, tipo, media_url, conteudo FROM whatsapp_messages WHERE direcao='out' AND remetente='atendente' ORDER BY created_at DESC LIMIT 5;`

## Referências

- Sub-workflow upload: https://n8n.damaral.ia.br/workflow/r1BtBcdGjja63jM4
- SDR principal: https://n8n.damaral.ia.br/workflow/FF18M7RdVMGXRJog
- Storage bucket: dashboard Supabase → Storage → `whatsapp-media`
