# Patch n8n — Agente como Serviço HTTP (V3)

**Workflow novo:** `agent-responder` (criar do zero)
**Substitui:** o ramo conversacional do workflow `SDR - Com Debounce WhatsApp` (`FF18M7RdVMGXRJog`)
**Status:** preparado, aguardando criação

## Por quê

Hoje o n8n é dono do webhook da Evolution e faz **todo o pipeline cognitivo**: debounce, classificação de intenção, lookup de cliente, lookup de sessão, lookup de chamados, montagem de prompt, vector search, LLM, decisão de resposta, envio via Evolution, gravação no Supabase.

Isso quebra com qualquer falha em qualquer dos 12+ nodes intermediários. Os sintomas observados pelo usuário (agente sem contexto, agente não para de responder, agente respondendo grupo) decorrem dessa complexidade.

**A V3 inverte a responsabilidade:** o CRM (Edge Function `whatsapp-webhook`) recebe o webhook, persiste, decide se deve chamar o agente, monta o `ContextoAgente` completo e POSTa ao n8n. O n8n vira um **serviço de IA**: recebe contexto pronto, roda o LLM com RAG, devolve a resposta. 3 nodes.

## Workflow novo: `agent-responder`

### Topologia

```
[Webhook In] → [Validate Auth] → [Build Prompt from Context] → [Vector Search KB] → [LLM Agent] → [Send via Evolution] → [Persist in Supabase] → [Respond OK]
```

### Detalhe dos nodes

#### 1. Webhook In (`POST /webhook/agent-responder`)
- HTTP Method: POST
- Path: `agent-responder`
- Response: `Last Node` (síncrono) ou `Immediately` (assíncrono — preferido)
- Authentication: Header Auth: `Authorization: Bearer {{ $env.N8N_AGENT_SECRET }}`

Payload recebido (ver `lib/whatsapp/contexto-agente.ts` no CRM):

```json
{
  "schema_version": "v1",
  "trace_id": "uuid",
  "sent_at": "2026-05-12T20:00:00Z",
  "instance": "n8n-suporte",
  "cliente": { "cliente_id": "...", "razao_social": "...", "documento": "...", "ucs": [...] },
  "sessao": { "jid": "...", "tipo_conversa": "chat", "status": "aguardando", "ia_pausada": false, "caso_tipo": null, "etapa": null, "dados_caso": {} },
  "mensagem_atual": { "message_id": "...", "tipo": "text", "conteudo": "minha conta veio alta", "enviado_em": "..." },
  "historico": [ { "direcao": "in", "conteudo": "oi", "enviado_em": "..." }, ... ],
  "chamados_abertos": [],
  "modo": "normal"
}
```

#### 2. Validate Schema (Function/Code node)
Bloqueia processamento se `schema_version !== 'v1'` ou `sessao.tipo_conversa !== 'chat'`.

```javascript
const body = $input.first().json.body || $input.first().json;
if (body.schema_version !== 'v1') {
  throw new Error('Schema version não suportada: ' + body.schema_version);
}
if (body.sessao?.tipo_conversa !== 'chat') {
  // Defesa em profundidade — CRM já filtra, mas garantimos aqui também.
  return [{ json: { skip: true, reason: 'tipo_conversa_' + body.sessao?.tipo_conversa } }];
}
return [{ json: body }];
```

#### 3. Build Prompt (Code node)
Monta o `systemMessage` e `userMessage` a partir do contexto recebido. **SEM HTTP** — só processa o que veio.

```javascript
const ctx = $input.first().json;

const cliente = ctx.cliente || {};
const sessao  = ctx.sessao || {};
const hist    = ctx.historico || [];
const chamados = ctx.chamados_abertos || [];

const apelido = cliente.apelido_relacionamento || cliente.razao_social || 'cliente';

const systemMessage = `
Você é o assistente virtual da GoNova/Solar Energy/HT Engenharia.
Tom: cordial, humano, profissional. PT-BR, sem regionalismos.
Responda em 2-5 linhas. Use negrito apenas em termos-chave (UC, kWh, R$, datas).

# CONTEXTO DO CLIENTE
${JSON.stringify(cliente, null, 2)}

# CONTEXTO DA SESSÃO
- jid: ${sessao.jid}
- status: ${sessao.status}
- caso_em_aberto: ${sessao.caso_tipo || 'nenhum'}
- etapa: ${sessao.etapa || 'inicial'}
- prioridade: ${sessao.prioridade}
- dados_caso: ${JSON.stringify(sessao.dados_caso || {})}

# CHAMADOS EM ABERTO
${chamados.length === 0 ? 'Nenhum.' : JSON.stringify(chamados, null, 2)}

# HISTÓRICO RECENTE
${hist.slice(0, 10).map(m => `[${m.direcao}] ${m.remetente_nome || ''}: ${m.conteudo || '(mídia)'}`).join('\n')}

REGRAS:
1. SE conhecer o cliente, NUNCA peça nome/CNPJ/UC novamente.
2. SE caso_em_aberto != null, retome a etapa em curso.
3. SE dados_caso.uc estiver setado, é a UC ativa.
4. NUNCA invente número de protocolo.
5. SE precisar abrir chamado, use a tool 'abrir_chamado'.
`.trim();

return [{
  json: {
    systemMessage,
    userMessage: ctx.mensagem_atual.conteudo,
    jid: sessao.jid,
    cliente_id: cliente.cliente_id,
    contato_id: cliente.contato_id,
    message_id: ctx.mensagem_atual.message_id,
    trace_id: ctx.trace_id,
    instance: ctx.instance
  }
}];
```

#### 4. Vector Search KB (MongoDB Atlas Vector Store)
Mesma configuração do workflow atual. Query: `{{ $json.userMessage }}`. Namespace: `kb-v2`. TopK: 4.

#### 5. LLM Agent (n8n LangChain Agent)
- Model: OpenAI GPT-4 ou Claude Sonnet
- System message: `{{ $('Build Prompt').item.json.systemMessage }}`
- User message: `{{ $('Build Prompt').item.json.userMessage }}`
- Tools (manter as que já funcionam):
  - `abrir_chamado` (HTTP → Supabase RPC `abrir_chamado`)
  - `consultar_ultima_fatura`
  - `consultar_saldo_creditos`
  - `consultar_chamados_abertos`
  - `consultar_relatorios`
  - `salvar_dado_caso`

#### 6. Send via Evolution (HTTP Request)
- URL: `{{ $env.EVOLUTION_API_URL }}/message/sendText/{{ $('Build Prompt').item.json.instance }}`
- Method: POST
- Headers: `apikey: {{ $env.EVOLUTION_API_KEY }}`
- Body:
```json
{
  "number": "{{ $('Build Prompt').item.json.jid.replace('@s.whatsapp.net','') }}",
  "text": "{{ $('LLM Agent').item.json.output }}",
  "delay": 800
}
```

#### 7. Persist in Supabase (HTTP Request → PostgREST)
Grava a resposta como `direcao=out, remetente=bot` em `whatsapp_messages` usando `ON CONFLICT`. Usar a mesma RPC `processar_mensagem_recebida` com `p_from_me=true` e `p_event='SEND_MESSAGE'` para padronizar.

**ATENÇÃO:** quando o webhook `SEND_MESSAGE` da Evolution chegar à Edge Function do CRM, ela vai também tentar persistir esta mesma mensagem. Como temos UNIQUE em `message_id`, o segundo `INSERT` vira `ON CONFLICT DO UPDATE` — sem duplicar.

#### 8. Respond OK (Respond to Webhook)
```json
{ "status": "ok", "trace_id": "{{ $('Webhook In').item.json.body.trace_id }}" }
```

## Variáveis de ambiente n8n

```
N8N_AGENT_SECRET=<gerar hex 32>
EVOLUTION_API_URL=https://evo.damaral.ia.br
EVOLUTION_API_KEY=<chave existente>
SUPABASE_URL=https://lodgnyduaezlcjxfcxrh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<chave service_role>
```

## Plano de migração — sem downtime

### Etapa 1 — Criar `agent-responder` em paralelo (sem ativar webhook da Evolution)
- Suba o workflow novo.
- Teste com curl mandando um ContextoAgente fake:
```bash
curl -X POST "https://<n8n>/webhook/agent-responder" \
  -H "Authorization: Bearer $N8N_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d @teste_contexto_agente.json
```
- Valide: chega resposta no WhatsApp do número de teste.

### Etapa 2 — Apontar webhook Evolution para o CRM (Edge Function)
- Edge Function `whatsapp-webhook` chama o `agent-responder` no n8n.
- Workflow antigo (`SDR - Com Debounce WhatsApp`) **continua ATIVO** alguns dias como segurança.
- Como a Evolution só envia webhook a UMA URL, há um pulo aqui: ou (a) configura webhook **só do CRM** e desliga o do n8n, ou (b) usa `WEBHOOK_GLOBAL_URL` no `.env` da Evolution apontando para o CRM, e mantém o webhook por-instância no n8n.

**Opção recomendada (a)**: corte definitivo. Antes, valide com DRY_RUN=true na Edge Function por 24h pra ter certeza que captura tudo.

### Etapa 3 — Desativar workflow conversacional antigo
Após 48h estável, no n8n:
- Desativar o trigger Webhook do `SDR - Com Debounce WhatsApp` (não deletar — só `inactive`).
- KB Ingest e outros workflows batch ficam como estão.

### Etapa 4 — Limpeza
Após 2 semanas estável, remover do workflow antigo:
- Nodes de pré-processamento (Checar Sessão, Buscar Contexto Cliente, etc.) — já não rodam.
- Manter o esqueleto como template/referência.

## Operações via MCP n8n

Para criar via API (se preferir):

```bash
# 1. Listar workflows existentes
curl https://<n8n>/api/v1/workflows -H "X-N8N-API-KEY: $N8N_API_KEY"

# 2. Criar o novo workflow (POST /workflows)
# Usar o template em agent_responder_v3.template.json (a criar)
```

## Validação pós-migração

1. Mensagem de cliente conhecido → resposta com nome correto, sem pedir UC novamente.
2. Mensagem de grupo → não responde (filtrada na Edge Function).
3. `UPDATE whatsapp_sessions SET ia_pausada=true WHERE jid=...` → próxima mensagem não responde.
4. `UPDATE whatsapp_sessions SET status='humano'` → próxima mensagem não responde.
5. Conferir trace_id correlacionando Edge Function logs + n8n execution.
6. Confirmar zero duplicatas em `whatsapp_messages` (UNIQUE em message_id).

## Rollback

Se algo der errado:
1. Reapontar webhook da Evolution para o n8n antigo:
```bash
curl -X POST "$EVOLUTION_API_URL/webhook/set/$EVOLUTION_INSTANCE" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{ "url": "https://<n8n>/webhook/whatsapp-sdr", "events": [...] }'
```
2. Reativar workflow antigo.
3. Edge Function pode continuar rodando — não interfere.
