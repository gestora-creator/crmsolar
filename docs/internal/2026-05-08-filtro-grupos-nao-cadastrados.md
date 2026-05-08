# Fix: Bot deixa de responder em grupos não cadastrados

**Data:** 08 de maio de 2026  
**Tipo:** Correção de comportamento (filtragem de mensagens no SDR)  
**Impacto:** O agente WhatsApp para de responder em grupos `@g.us` que não têm registro em `crm_clientes.us_grupo_whatsapp`.

---

## Problema observado

A instância do WhatsApp do suporte está em vários grupos que não são clientes
da Solar Energy (ex: 6 grupos da "Carol da SOLZAP" e 1 da "Lucimara — Cerro
Verde Agro" detectados em produção). Como o `Filtro de Contato` original só
checava `event === 'messages.upsert'` e `fromMe === false`, qualquer mensagem
nesses grupos disparava o agente, que respondia para a sala inteira e poluia
a lista de atendimento com sessões órfãs (sem `cliente_id`).

## Comportamento corrigido

| Tipo de origem | Antes | Depois |
|---|---|---|
| **DM** (`@s.whatsapp.net`) | sempre passa | sempre passa |
| **Grupo cadastrado** (JID em `crm_clientes.us_grupo_whatsapp`) | sempre passa | sempre passa |
| **Grupo não cadastrado** | era respondido como qualquer mensagem | bloqueado silenciosamente — não grava `whatsapp_messages`, não cria `whatsapp_sessions`, não chama o agente |

## Implementação

Novo nó **`Filtrar Grupos`** (Code) inserido no SDR (`FF18M7RdVMGXRJog`) entre
`Filtro de Contato` e os ramos paralelos `Salvar Msg Entrada` + `Checar Sessão
Supabase`:

```
Webhook → Filtro de Contato → [NOVO] Filtrar Grupos → [Salvar Msg Entrada, Checar Sessão Supabase]
```

Lógica:

- Se o `remoteJid` **não termina** em `@g.us` (DM): retorna o item, segue normal.
- Se termina em `@g.us`: chama a RPC `buscar_cliente_por_whatsapp_jid` (já
  existente, criada no fix anterior). Se devolve `cliente_id`, segue. Se
  devolve `null`, retorna array vazio — o n8n encerra a execução
  silenciosamente sem propagar nada adiante.
- Em caso de erro de rede no lookup: **bloqueia o grupo** (fail-closed). DMs
  continuam passando porque nem chegam a fazer o lookup.

## Como cadastrar um novo grupo (UI/SQL)

Para um grupo passar a ser respondido, basta popular `crm_clientes.us_grupo_whatsapp`
com o JID exato do grupo. Pelo CRM, isso fica em campo da tela de cliente
("Grupo WhatsApp"). Por SQL:

```sql
UPDATE crm_clientes
SET us_grupo_whatsapp = '5511944797846-1605757392@g.us'
WHERE razao_social = 'NOME DO CLIENTE';
```

Depois disso, a próxima mensagem do grupo já é processada normalmente — sem
precisar mexer no n8n.

## Sessões órfãs em produção (informativo)

No momento do deploy havia 7 sessões em modo `bot` referentes a grupos não
cadastrados. Elas **continuam visíveis** na lista de atendimento (não foram
apagadas por precaução), mas não vão receber novas mensagens com este fix.

Se quiser limpar a lista e o histórico desses grupos, rode manualmente:

```sql
-- Remove mensagens de grupos sem cliente_id (cuidado: irreversível)
DELETE FROM whatsapp_messages
WHERE jid IN (
  SELECT jid FROM whatsapp_sessions
  WHERE jid LIKE '%@g.us' AND cliente_id IS NULL
);

-- Remove as sessões órfãs
DELETE FROM whatsapp_sessions
WHERE jid LIKE '%@g.us' AND cliente_id IS NULL;
```

Recomenda-se cadastrar os grupos legítimos primeiro (com `us_grupo_whatsapp`) e
só depois rodar o `DELETE` — assim eles não são apagados por engano.

## Como reverter

Caso seja preciso voltar atrás, basta desabilitar o nó "Filtrar Grupos" no
SDR. A topologia volta a se comportar como antes (todos os grupos passam),
porque a saída do nó desabilitado é simplesmente passada adiante pelo n8n.

## Referências

- SDR: https://n8n.damaral.ia.br/workflow/FF18M7RdVMGXRJog
- RPC reusada: `public.buscar_cliente_por_whatsapp_jid` (criada em
  `2026-05-08-fix-whatsapp-cliente-lookup.md`).
