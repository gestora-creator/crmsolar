# Fix: Vinculação automática JID WhatsApp → Cliente CRM

**Data:** 08 de maio de 2026  
**Tipo:** Correção crítica de integração (backend / banco / n8n)  
**Impacto:** Sistema WhatsApp ↔ CRM agora vincula corretamente sessões e mensagens ao cliente.

---

## Problema observado

A tabela `whatsapp_sessions` estava sendo populada normalmente pelo SDR (workflow n8n
`FF18M7RdVMGXRJog`), mas em **100% das sessões em produção** a coluna `cliente_id`
ficava `NULL`. Como consequência:

1. A timeline na tela do cliente (`/clientes/[id]`) **não recebia** os eventos
   `mensagem_whatsapp` — a tabela `timeline_relacional` tinha 0 registros desse tipo.
2. O sub-workflow `CRM — Resumir e Registrar WhatsApp` (`FxL9V8k42s6Aeu3i`) caía
   sempre no ramo "Log Sem Contato" e nunca chegava a chamar o sub-workflow
   `CRM — Registrar Evento Timeline` (`Xry0dp83tcoN01SO`).
3. Mensagens em `whatsapp_messages` também ficavam sem `cliente_id`/`contato_id`,
   inutilizando a UI de atendimento (`/atendimento`) para histórico.

## Causa raiz

Dois lookups de telefone independentes, ambos com bug:

### Bug 1 — RPC `public.registrar_msg_whatsapp`

Extraía `RIGHT(REGEXP_REPLACE(p_jid, '[^0-9]', '', 'g'), 11)`. Para um JID
brasileiro padrão `5567999501458@s.whatsapp.net` (12 dígitos), isso retornava
`56799501458` — ou seja, **incluía o `5` do DDI** e cortava o último dígito do
celular cadastrado, fazendo o match bater fora. JIDs com 13 dígitos (DDD 11)
funcionavam por coincidência.

### Bug 2 — Code node "Buscar Contato no CRM" (sub-workflow `FxL9V8k42s6Aeu3i`)

Usava `jid.replace(/@.*/,'').replace(/^55/,'')` e fazia `ILIKE %fullnumber%`. O
problema é que o JID do WhatsApp brasileiro frequentemente vem **sem o nono dígito
adicional do celular**, enquanto o cadastro no CRM tem com o 9. Resultado: o
substring de 10 dígitos não casa com o celular de 11 dígitos cadastrado.

Exemplo real (da sessão "BGR"):
- JID: `556792779413@s.whatsapp.net` → numRaw = `6792779413` (10 dígitos)
- Banco: `cel = 67992779413` (11 dígitos com o nono dígito)
- `'67992779413' ILIKE '%6792779413%'` → **false** (não bate, faltou um `9`)

## Correção aplicada

### 1. Nova função SQL helper (DRY)

Migration: `buscar_cliente_por_whatsapp_jid`.

Recebe um JID e retorna `jsonb` com `cliente_id`, `contato_id`, `contato_nome`,
`metodo_match`, `is_grupo`. Faz cascata de quatro tentativas:

1. **Grupo (`@g.us`)**: lookup por `crm_clientes.us_grupo_whatsapp = jid`.
2. **Individual A**: `crm_contatos.celular` com últimos 11 dígitos exatos.
3. **Individual B**: `crm_contatos.celular` com sufixo de 8 dígitos (cobre
   diferença do nono dígito).
4. **Individual C**: `crm_clientes_contatos.telefone_contato` com sufixo 8.
5. **Individual D**: `crm_clientes.whatsapp` ou `telefone_principal` com sufixo 8
   (cliente direto, sem contato vinculado).

Antes do match, normaliza:
- Remove tudo após `@`
- Remove não-dígitos
- Remove prefixo `55` (DDI)
- Pega últimos 11 e últimos 8 separadamente

### 2. RPC `registrar_msg_whatsapp` refatorada

Agora delega o lookup à função helper, eliminando a lógica embutida com bug. A
RPC continua mantendo a sessão e a mensagem, mas o "como achar o cliente" virou
responsabilidade única da função helper — qualquer outro chamador (n8n, edge
functions, scripts ad-hoc) usa a mesma regra.

### 3. Backfill em produção

- **5 de 7 sessões individuais** sem `cliente_id` foram re-vinculadas
  automaticamente. As 2 restantes (Fernando Avelar `5544...`, Omar Ruiz
  `5567...`) simplesmente **não estão cadastradas** no CRM — comportamento
  correto.
- **3 grupos SOLZAP (`@g.us`)** continuam sem vínculo porque nenhum cliente tem
  esse JID em `us_grupo_whatsapp` — também dado faltando no cadastro, não bug.
- **26 mensagens** em `whatsapp_messages` foram retroativamente preenchidas com
  `cliente_id`/`contato_id` herdados da sessão.

### 4. n8n — sub-workflow `FxL9V8k42s6Aeu3i`

O Code node "Buscar Contato no CRM" foi reescrito para chamar a nova RPC via
HTTP. Resultado: a lógica de match deixa de viver duplicada em JS e passa a
viver só no banco. O sub-workflow agora também propaga `is_grupo` e
`metodo_match` para o downstream (útil para diagnóstico).

### 5. n8n — SDR principal `FF18M7RdVMGXRJog`

O Code node "Definir Atendente por Assunto" passou a preencher também o campo
`numAtendente` (antes só havia `nomeAtendente`), com os números reais de
Rebecca, Silvana, Marlos e Taís. Sem isso, o nó "Notificar Atendente - Novo
Caso" (atualmente desabilitado) quebraria assim que fosse ativado.

## Como verificar

```sql
-- Sessões com cliente vinculado
SELECT c.razao_social, ws.jid, ws.nome_contato, ws.status
FROM whatsapp_sessions ws
JOIN crm_clientes c ON c.id = ws.cliente_id
ORDER BY ws.ultima_msg_em DESC;

-- Test direto da função
SELECT buscar_cliente_por_whatsapp_jid('556796010103@s.whatsapp.net');
```

Em `/clientes/{id}` na UI, a aba "Linha do Tempo" deve passar a receber novos
eventos `mensagem_whatsapp` a cada conversa nova com clientes cadastrados.

## Pendências relacionadas (não cobertas neste fix)

- [ ] Cadastrar `us_grupo_whatsapp` para os grupos SOLZAP (3 JIDs em produção).
- [ ] Tratar `participant` em mensagens de grupo (quando alguém manda no grupo, o
      remetente real está em `data.key.participant`, não em `remoteJid`).
- [ ] Mover a `service_role_key` hardcoded em ~6 nós n8n para uma credencial
      compartilhada do tipo `httpHeaderAuth`.
- [ ] Reativar o nó "Notificar Atendente - Novo Caso" depois de validar com a
      equipe os números reais.
