# n8n Workflows — Manifest (Disaster Recovery)

Última atualização: 2026-05-15

Os workflows reais (n8n self-hosted em https://n8n.damaral.ia.br) sao a fonte autoritativa. Este manifesto serve como mapa de dependencias e indice de IDs para situacoes de disaster recovery — se o n8n cair, este arquivo diz o que precisa ser recriado.

**Backup completo:** seguir instrucoes em `BACKUP.md` (export via n8n UI ou dump do banco PostgreSQL do container n8n). MCP do n8n nao consegue exportar workflows muito grandes (>1MB) de forma confiavel — manifesto + backups manuais e o caminho recomendado.

## Workflows ativos (10)

| ID | Nome | Trigger | Funcao | Downstream |
|---|---|---|---|---|
| `9m0vyokKaTCpzdzJ` | Generator Relatorio | executeWorkflowTrigger + manual | OCR + agregacao + envio multi-canal de relatorio mensal por cliente | Supabase `base`, Gmail, Evolution API |
| `FxL9V8k42s6Aeu3i` | CRM — Resumir e Registrar WhatsApp | executeWorkflowTrigger | Resumo IA da msg WhatsApp + busca contato + registrar timeline | RPC `buscar_cliente_por_whatsapp_jid`, workflow `Xry0dp83tcoN01SO` |
| `Q0KjP0VJ30yFHyqf` | CRM — Timeline E-mail (Gmail) | gmailTrigger (cada minuto) | Filtra emails relevantes, busca contato, registra timeline | Workflow `Xry0dp83tcoN01SO` |
| `WdiIdEojHtfNNVus` | Pipeline Midia WhatsApp | webhook `/pipeline-midia-whatsapp` | Recebe acionamento da Edge Function whatsapp-webhook, chama Evolution getBase64, sobe pra Storage | Evolution API, workflow `r1BtBcdGjja63jM4`. Auth: Bearer `$MIDIA_PIPELINE_SECRET` |
| `Xry0dp83tcoN01SO` | CRM — Registrar Evento Timeline | executeWorkflowTrigger | Sub-workflow: insere registro em `timeline_relacional` via REST + Custom Auth | Tabela `timeline_relacional` |
| `Yb7UgonyNzlYMwHh` | Upload Faturas Historicas — OCR | webhook `/upload-fatura-historica` | Recebe PDF, OCR Gemini, lookup UC, upload Storage, registra historico_documentos + timeline | Tabela `base`, bucket `faturas`, `historico_documentos`, workflow `Xry0dp83tcoN01SO` |
| `_zaVcEukFU4VoBOf4pbA8` | chatbot gonova | webhook `/c449b664-...` | Chatbot com Gemini 2.5 Pro, AI Agent + memoria + tools data tables | DataTables `gonova`, `gonovafaturas` |
| `gc8DI1pBKIlqF6nG` | Upload Demonstrativo Geracao — OCR | webhook `/upload-demonstrativo-geracao` | Recebe PDF, OCR Gemini, RPC `atualizar_geradora_via_demonstrativo`, organiza Storage | RPC `atualizar_geradora_via_demonstrativo`, bucket `demonstrativos`, workflow `Xry0dp83tcoN01SO` |
| `r1BtBcdGjja63jM4` | CRM — Upload Midia WhatsApp | executeWorkflowTrigger | Sub-workflow: recebe base64, sobe pro bucket `whatsapp-media`, chama RPC `atualizar_media_msg_whatsapp` | Bucket `whatsapp-media`, RPC `atualizar_media_msg_whatsapp` |
| `ytXuGxaPFoL53nEK` | Energisa — Faturas GMAIL -> Supabase Storage | gmailTrigger (cada minuto, label especifica) | Recebe email da Energisa, extrai PDF, OCR via filtro de remetente, upload bucket `faturas`, registra timeline | Tabela `base`, bucket `faturas`, workflows `Xry0dp83tcoN01SO` e `9m0vyokKaTCpzdzJ` |

## Diagrama de dependencias

```
Gmail Energisa ──> ytXuGxaPFoL53nEK ──> 9m0vyokKaTCpzdzJ (Generator Relatorio)
                                    └─> Xry0dp83tcoN01SO (Timeline)

Gmail geral    ──> Q0KjP0VJ30yFHyqf ──> Xry0dp83tcoN01SO

Evolution webhook (CRM) ──> Edge Function whatsapp-webhook ──> WdiIdEojHtfNNVus ──> r1BtBcdGjja63jM4
                                                          └─> agente (chatbot gonova ou outro)
                                                          └─> FxL9V8k42s6Aeu3i ──> Xry0dp83tcoN01SO

Upload manual fatura     ──> Yb7UgonyNzlYMwHh ──> Xry0dp83tcoN01SO
Upload demonstrativo     ──> gc8DI1pBKIlqF6nG ──> Xry0dp83tcoN01SO
Chatbot externo (lead)   ──> _zaVcEukFU4VoBOf4pbA8
```

## Sub-workflow critico

`Xry0dp83tcoN01SO` (Registrar Evento Timeline) e chamado por 5 outros. Se ele quebrar, toda a timeline para de receber eventos. Tem fallback manual? Nao. Monitorar com alerta.

## Variaveis de ambiente esperadas no n8n

| Var | Usada em | Funcao |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | quase todos | Bearer para REST API do Supabase |
| `MIDIA_PIPELINE_SECRET` | WdiIdEojHtfNNVus | Auth do webhook (validado na entrada) |
| `EVOLUTION_API_KEY` | WdiIdEojHtfNNVus | apikey para Evolution `chat/getBase64FromMediaMessage` |

## Credenciais n8n (referencia)

| ID | Tipo | Usada por |
|---|---|---|
| `lAWlxakNwSpn2QkQ` | supabaseApi (Supabase — GoNova) | Generator Relatorio, Energisa Gmail |
| `baEGSDhEDdbzBMhC` | httpCustomAuth (Service Role — Custom Auth) | Timeline, Upload Faturas, Upload Demonstrativo, Upload Midia |
| `HMagBiRoxEvNaNzR` | gmailOAuth2 (atendimento) | Timeline E-mail, Energisa Gmail |
| `KcEJu3iFM5zbhEn3` | googlePalmApi | Upload Faturas, Upload Demonstrativo, chatbot gonova |
| `1dpyhpcqGP7I5CsR` | openAiApi | CRM Resumir WhatsApp |

## Tags

- `omar`, `solarenergy` — usados no Generator Relatorio
