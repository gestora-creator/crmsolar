# API Timeline — Integração n8n + Agentes IA

## Endpoint

```
POST /api/timeline
GET  /api/timeline?cliente_id={uuid}&limit=50
```

## Autenticação

Todas as chamadas usam `SUPABASE_SERVICE_ROLE_KEY` como Bearer token:

```
Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
Content-Type: application/json
```

## POST — Registrar evento(s)

### Evento único

```json
{
  "cliente_id": "uuid-do-cliente",
  "contato_id": "uuid-do-contato-opcional",
  "tipo_evento": "mensagem_whatsapp",
  "canal": "whatsapp",
  "direcao": "entrada",
  "resumo_chave": "Cliente perguntou sobre fatura de março",
  "tom_conversa": "neutro",
  "conteudo_longo": "Transcrição completa da conversa...",
  "metadata": { "numero_whatsapp": "5567999999999" },
  "origem": "n8n_webhook",
  "autor": "n8n-whatsapp-flow",
  "ocorrido_em": "2026-04-13T14:30:00Z"
}
```

### Batch (até 100 eventos)

```json
[
  { "cliente_id": "...", "tipo_evento": "mensagem_whatsapp", "resumo_chave": "..." },
  { "cliente_id": "...", "tipo_evento": "nota_interna", "resumo_chave": "..." }
]
```

### Resposta de sucesso

```json
{
  "success": true,
  "count": 1,
  "events": [
    {
      "id": "uuid-gerado",
      "cliente_id": "...",
      "tipo_evento": "mensagem_whatsapp",
      "resumo_chave": "...",
      "ocorrido_em": "2026-04-13T14:30:00Z"
    }
  ]
}
```

## Campos obrigatórios

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| cliente_id | UUID | Sim |
| tipo_evento | string | Sim |
| resumo_chave | string | Sim |

## Tipos de evento válidos

| tipo_evento | Uso |
|-------------|-----|
| mensagem_whatsapp | Mensagem via WhatsApp |
| mensagem_email | E-mail enviado/recebido |
| ligacao_telefone | Chamada telefônica |
| reuniao | Reunião agendada/realizada |
| visita_tecnica | Visita técnica na usina |
| chamado_aberto | Abertura de chamado |
| chamado_encerrado | Resolução de chamado |
| relatorio_enviado | Relatório enviado ao cliente |
| relatorio_visualizado | Cliente visualizou relatório |
| pesquisa_respondida | Cliente respondeu pesquisa |
| nota_interna | Anotação manual da equipe |
| agente_acao | Ação executada pelo agente IA |
| agente_resumo | Resumo gerado pelo agente IA |

## Canais válidos

whatsapp, email, telefone, presencial, sistema, agente_ia, portal_cliente

## Direções válidas

entrada (cliente → empresa), saida (empresa → cliente), interna (nota/sistema)

## Exemplo n8n — Workflow HTTP Request

```
Node: HTTP Request
Method: POST
URL: https://seu-crm.vercel.app/api/timeline
Headers:
  Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}
  Content-Type: application/json
Body:
{
  "cliente_id": "{{$json.cliente_id}}",
  "tipo_evento": "mensagem_whatsapp",
  "canal": "whatsapp",
  "direcao": "entrada",
  "resumo_chave": "{{$json.message_summary}}",
  "metadata": { "from": "{{$json.from}}", "message_id": "{{$json.id}}" },
  "origem": "n8n_webhook",
  "autor": "n8n-whatsapp",
  "ocorrido_em": "{{$json.timestamp}}"
}
```
