# Fix: SDR não disparava upload de mídia em modo humano

**Data:** 08 de maio de 2026
**Tipo:** Fix de produção (workflow n8n — aplicado via MCP)
**Workflow afetado:** `FF18M7RdVMGXRJog` (SDR - Com Debounce WhatsApp)
**Snapshot pré-fix:** `n8n/workflows/SDR-FF18M7RdVMGXRJog.json` (versionado neste PR)

---

## Bug

Quando uma conversa estava em **modo humano** (atendente assumiu via "Assumir" no /atendimento), o SDR principal:

1. Recebia o webhook da Evolution
2. Salvava a mensagem em `whatsapp_messages` via `Salvar Msg Entrada`
3. Checava `Está em Modo Humano?` no Supabase
4. **Output 0 (humano = TRUE) estava vazio** → workflow encerrava
5. O sub-workflow `r1BtBcdGjja63jM4` (Upload Mídia) NUNCA era disparado

Resultado: mídia ficava com `media_url = NULL` permanente, sem nem chegar no Storage. Diferente do bug de race condition (resolvido em PR #20), aqui o upload nem rodava.

### Evidência

Execuções 21011 (msg 234) e 21022 (msg 242) duraram apenas ~530ms cada (vs ~3s para áudios em modo bot que passam por Obter Base64 → Upload + Transcrição). Topologia mostrava 6 nós executados parando em `Salvar Msg Entrada`, sem `Obter Audio Base64` nem `Upload Áudio Storage`.

---

## Fix aplicado

Adicionados 4 nós e 7 conexões. Apenas aditivo — nada removido ou modificado.

### Novos nós
1. **`Route Mídia (Humano)`** — Switch (typeVersion 3.2) com 3 rules: Audio / Image / Document. Texto não tem rule (cai fora — atendente humano lê texto direto, sem upload necessário).
2. **`Obter Audio Base64 (Humano)`** — Evolution API `get-media-base64`, mesma config do existente.
3. **`Obter Imagem Base64 (Humano)`** — idem, para imagens.
4. **`Obter Doc Base64 (Humano)`** — idem, para documentos.

### Novas conexões
| Origem | Saída | Destino |
|---|---|---|
| `Está em Modo Humano?` | 0 (humano = TRUE) | `Route Mídia (Humano)` |
| `Route Mídia (Humano)` | 0 (audio) | `Obter Audio Base64 (Humano)` |
| `Route Mídia (Humano)` | 1 (image) | `Obter Imagem Base64 (Humano)` |
| `Route Mídia (Humano)` | 2 (document) | `Obter Doc Base64 (Humano)` |
| `Obter Audio Base64 (Humano)` | 0 | `Upload Áudio Storage` (existente) |
| `Obter Imagem Base64 (Humano)` | 0 | `Upload Imagem Storage` (existente) |
| `Obter Doc Base64 (Humano)` | 0 | `Upload Documento Storage` (existente) |

### Topologia depois do fix

```
Filtrar Grupos
   ├─ Salvar Msg Entrada
   └─ Checar Sessão Supabase
        └─ Está em Modo Humano?
             ├─ output 0 (humano)  → Route Mídia (Humano) → Obter X (Humano) → Upload X Storage  ✅ (NOVO)
             └─ output 1 (bot)     → Route Types          → Obter X Base64   → Upload X Storage  (existente)
                                                                              + Converter/Transcrever/Agente
```

Em modo humano, **só o upload roda** — não passa pelo agente OpenAI, não transcreve, não responde no WhatsApp. Atendente humano cuida da resposta.

---

## Limitações conhecidas

1. **Sem transcrição automática em modo humano.** O atendente vê o player de áudio sem o "Ver transcrição". Se virar dor, basta adicionar `Converter Audio + Transcrever Audio` em paralelo no novo ramo (5 minutos). Hoje vale a economia de token OpenAI.
2. **Texto em modo humano continua não fazendo nada extra.** Já era o comportamento anterior. Mensagem só fica salva em `whatsapp_messages` e aparece no /atendimento via Realtime. Nada de upload (não tem mídia mesmo).

---

## Como testar

1. Abrir `/atendimento` em uma conversa, clicar em **Assumir** (vira modo humano).
2. Pedir cliente mandar áudio/imagem/PDF.
3. SQL para checar:
   ```sql
   SELECT id, message_id, tipo, media_url, created_at
   FROM whatsapp_messages
   WHERE jid = 'JID_TESTE@s.whatsapp.net'
   ORDER BY created_at DESC LIMIT 3;
   ```
4. `media_url` deve estar preenchido em ~1–3s. Combinado com a migration de race condition (PR #20), funciona em qualquer ordem.

---

## Como reverter

Se algo der errado (improvável — fix é aditivo), basta deletar os 4 nós novos via UI do n8n ou via MCP:

```
n8n_update_partial_workflow operations:
  removeNode "Route Mídia (Humano)"
  removeNode "Obter Audio Base64 (Humano)"
  removeNode "Obter Imagem Base64 (Humano)"
  removeNode "Obter Doc Base64 (Humano)"
```

As conexões são removidas em cascata. Nenhum nó existente foi modificado.

Snapshot original em `n8n/workflows/SDR-FF18M7RdVMGXRJog.json`.

---

## Combinação com outros PRs

| PR | O que resolve |
|---|---|
| **#20** (já mergeado em prod) | Race condition: mídia que chega antes da mensagem fica em holding |
| **#19** + **#18** | Atendente clica "Tentar recuperar" se mídia escapar mesmo assim |
| **Este fix** (aplicado direto via n8n MCP, este PR é só doc/snapshot) | Garante que upload roda mesmo em modo humano |

Os 3 juntos formam camadas de proteção: prevenção (este fix) → mitigação (#20) → recuperação manual (#18 + #19).
