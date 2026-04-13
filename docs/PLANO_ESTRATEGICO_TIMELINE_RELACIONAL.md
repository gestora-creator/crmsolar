# Plano Estratégico — Solar Energy CRM v2.0
## Timeline Relacional + Agente Inteligente + Reestruturação de Menu

**Data:** 10 de abril de 2026  
**Escopo:** 8 frentes de mudança identificadas pelo cliente  
**Princípio-guia:** "Menos é mais" — simplicidade, agilidade na identificação de informações, memórias contextuais inseridas por agentes.

---

## 1. Diagnóstico do Estado Atual

### 1.1 Tabelas existentes no Supabase

| Tabela | Papel atual |
|---|---|
| `crm_clientes` | Base Mãe (PF/PJ com contrato) — 40+ campos |
| `crm_contatos` | Pessoas físicas vinculadas |
| `crm_clientes_contatos` | Vínculo N:N (com `contato_principal`) |
| `relatorio_envios` | Histórico de relatórios enviados + respostas de pesquisa |
| `crm_clientes_tecnica` | Dados técnicos das usinas |
| `growatt` | Dados de geração do monitoramento |
| `fila_extracao` | Fila de processamento de faturas |
| `crm_ucs_validacao` | Validação de UCs |
| `grupos_economicos` | Agrupamento de clientes |

### 1.2 Rotas de UI existentes

```
/dashboard          → Dashboard geral
/clientes           → Lista de clientes (Base Mãe)
/clientes/[id]      → Detalhe: formulário + painel de relacionamentos
/contatos           → Lista de contatos (Pessoas)
/contatos/[id]      → Detalhe: formulário + clientes vinculados
/tecnica            → Dados técnicos
/interacoes         → Lê de relatorio_envios (SERÁ REMOVIDO)
/tags               → Gestão de tags
/faturas            → Faturas/extração
/oportunidades      → Leads com faturamento > R$1.000
/relatorios         → Relatórios enviados
/permicoes          → RBAC de usuários
/grupos-economicos  → Agrupamento
```

### 1.3 Problemas identificados

1. **Sem Timeline:** A página de detalhe do cliente (`/clientes/[id]`) mostra apenas formulário + painel de contatos. Não existe timeline de interações.
2. **Menu "Interações" desacoplado:** Mostra dados de `relatorio_envios` como página separada, sem contexto relacional.
3. **Sem suporte a multi-canal:** Não há registro de interações WhatsApp, email, telefone, apenas respostas a pesquisas de relatório.
4. **Sem agente inteligente:** Nenhuma infraestrutura para atendimento automatizado com triagem humana.
5. **Contato sem timeline própria:** A página `/contatos/[id]` só mostra formulário.

---

## 2. Arquitetura Proposta

### 2.1 Nova tabela central: `timeline_relacional`

Esta tabela substitui o conceito da página "Interações" e se torna o coração do histórico de relacionamento. Cada registro é um **evento** na timeline.

```sql
CREATE TABLE public.timeline_relacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vínculos obrigatórios
  cliente_id uuid NOT NULL REFERENCES crm_clientes(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES crm_contatos(id) ON DELETE SET NULL,
  
  -- Classificação do evento
  tipo_evento text NOT NULL CHECK (tipo_evento IN (
    'mensagem_whatsapp',
    'mensagem_email', 
    'ligacao_telefone',
    'reuniao',
    'visita_tecnica',
    'chamado_aberto',
    'chamado_encerrado',
    'relatorio_enviado',
    'relatorio_visualizado',
    'pesquisa_respondida',
    'nota_interna',
    'agente_acao',
    'agente_resumo'
  )),
  
  -- Canal de origem
  canal text CHECK (canal IN (
    'whatsapp', 'email', 'telefone', 'presencial', 
    'sistema', 'agente_ia', 'portal_cliente'
  )),
  
  -- Direção da interação
  direcao text CHECK (direcao IN ('entrada', 'saida', 'interna')),
  
  -- Conteúdo (formatos curto e longo)
  resumo_chave text NOT NULL,          -- Abertura: resumo humanizado (máx ~280 chars)
  tom_conversa text,                    -- Ex: "positivo", "preocupado", "neutro", "urgente"
  conteudo_longo text,                  -- Transcrição resumida com pontos-chave
  
  -- Metadados do evento
  metadata jsonb DEFAULT '{}',          -- Dados flexíveis (id_chamado, url_relatorio, etc.)
  
  -- Origem da gravação
  origem text DEFAULT 'manual' CHECK (origem IN (
    'manual', 'n8n_webhook', 'agente_ia', 'sistema', 'importacao'
  )),
  autor text,                           -- Quem registrou (user_id, nome agente, "sistema")
  
  -- Controle temporal
  ocorrido_em timestamptz NOT NULL DEFAULT now(),  -- Quando aconteceu de fato
  created_at timestamptz DEFAULT now(),             -- Quando foi gravado
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance da timeline
CREATE INDEX idx_timeline_cliente ON timeline_relacional(cliente_id, ocorrido_em DESC);
CREATE INDEX idx_timeline_contato ON timeline_relacional(contato_id, ocorrido_em DESC);
CREATE INDEX idx_timeline_tipo ON timeline_relacional(tipo_evento);
CREATE INDEX idx_timeline_canal ON timeline_relacional(canal);
CREATE INDEX idx_timeline_ocorrido ON timeline_relacional(ocorrido_em DESC);
CREATE INDEX idx_timeline_metadata ON timeline_relacional USING gin(metadata);

-- RLS
ALTER TABLE timeline_relacional ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_timeline" ON timeline_relacional FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_timeline" ON timeline_relacional FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_timeline" ON timeline_relacional FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Permitir inserts do n8n via service_role (sem RLS)
-- O n8n usará a service_role key para gravar direto
```

### 2.2 Nova tabela: `chamados_atendimento`

Para o agente inteligente triar e escalar para humanos.

```sql
CREATE TABLE public.chamados_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  cliente_id uuid NOT NULL REFERENCES crm_clientes(id),
  contato_id uuid REFERENCES crm_contatos(id),
  timeline_evento_id uuid REFERENCES timeline_relacional(id),
  
  -- Classificação
  tipo text NOT NULL CHECK (tipo IN (
    'duvida_simples',       -- Agente resolve sozinho
    'relatorio_geração',    -- Agente busca no storage
    'problema_tecnico',     -- Escala para humano
    'financeiro',           -- Escala para humano
    'reclamacao',           -- Escala para humano  
    'solicitacao_geral'     -- Agente tenta, escala se não conseguir
  )),
  
  -- Status do fluxo
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN (
    'aberto', 'em_andamento_agente', 'escalado_humano', 
    'agendado', 'resolvido', 'cancelado'
  )),
  
  -- Conteúdo
  descricao text NOT NULL,
  resolucao text,
  
  -- Atribuição
  atribuido_a text,              -- user_id ou 'agente_ia'
  link_agendamento text,         -- URL Google Calendar (futuro)
  
  -- Controle
  prioridade text DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolvido_em timestamptz
);

CREATE INDEX idx_chamados_cliente ON chamados_atendimento(cliente_id);
CREATE INDEX idx_chamados_status ON chamados_atendimento(status);
CREATE INDEX idx_chamados_tipo ON chamados_atendimento(tipo);

ALTER TABLE chamados_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_chamados" ON chamados_atendimento FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 2.3 Migração de dados: `relatorio_envios` → `timeline_relacional`

Os registros existentes de `relatorio_envios` que têm interação (respostas, visualização) serão migrados para a timeline como eventos históricos. A tabela `relatorio_envios` permanece para o fluxo de envio, mas o **registro relacional** passa a viver na timeline.

```sql
-- Migration script (executar uma vez)
INSERT INTO timeline_relacional (
  cliente_id, contato_id, tipo_evento, canal, direcao,
  resumo_chave, tom_conversa, conteudo_longo, metadata, 
  origem, ocorrido_em, created_at
)
SELECT 
  re.cliente_id,
  re.contato_id,
  CASE 
    WHEN re.viewed THEN 'relatorio_visualizado'
    ELSE 'relatorio_enviado'
  END,
  'sistema',
  'saida',
  COALESCE(
    'Relatório enviado para ' || re.nome_falado_dono,
    'Relatório enviado'
  ),
  CASE WHEN re.resposta1 IS NOT NULL THEN 'positivo' ELSE 'neutro' END,
  CONCAT_WS(E'\n',
    CASE WHEN re.resposta1 IS NOT NULL 
      THEN 'Resposta 1: ' || re.resposta1 ELSE NULL END,
    CASE WHEN re.resposta2 IS NOT NULL 
      THEN 'Resposta 2: ' || re.resposta2 ELSE NULL END,
    CASE WHEN re."sugestão_cliente" IS NOT NULL 
      THEN 'Sugestão: ' || re."sugestão_cliente" ELSE NULL END
  ),
  jsonb_build_object(
    'relatorio_envio_id', re.id,
    'url', re.url,
    'url_pdf', re.url_pdf,
    'plant_id', re.plant_id
  ),
  'importacao',
  COALESCE(re.enviado_em, re.created_at),
  re.created_at
FROM relatorio_envios re
WHERE re.cliente_id IS NOT NULL;
```

---

## 3. Plano de Execução em 6 Etapas

### ETAPA 1 — Banco de dados e tipos (sem tocar na UI)
**Esforço:** 1-2 dias | **Risco:** Baixo

**Ações:**
1. Criar migration `create_timeline_relacional.sql`
2. Criar migration `create_chamados_atendimento.sql`  
3. Executar migration de dados de `relatorio_envios`
4. Atualizar `database.types.ts` com as novas tabelas
5. Criar hook `useTimeline.ts`:
   - `useTimelineByCliente(clienteId)` — todos os eventos do cliente, ordenados por `ocorrido_em DESC`
   - `useTimelineByContato(contatoId)` — filtrado apenas pelo contato
   - `useCreateTimelineEvent()` — mutation para novo evento manual
6. Criar hook `useChamados.ts`:
   - `useChamadosByCliente(clienteId)`
   - `useCreateChamado()`
   - `useUpdateChamado()`

**Arquivos novos:**
```
supabase/migrations/create_timeline_relacional.sql
supabase/migrations/create_chamados_atendimento.sql
supabase/migrations/migrate_relatorios_to_timeline.sql
lib/hooks/useTimeline.ts
lib/hooks/useChamados.ts
lib/supabase/database.types.ts  (atualizar)
```

---

### ETAPA 2 — Componente Timeline (reutilizável)
**Esforço:** 2-3 dias | **Risco:** Médio

**Conceito de design:**

A timeline segue o padrão de timeline vertical inspirado no Moskit/HubSpot, mas com foco em **simplicidade e escaneabilidade**:

```
┌─────────────────────────────────────────────┐
│ 📅 Hoje                                     │
│                                             │
│  ● 14:32  📱 WhatsApp · João Silva          │
│    "Cliente satisfeito com o relatório      │
│     de março. Pediu orçamento de ampliação" │
│    Tom: positivo                            │
│    ▸ Ver transcrição completa               │
│                                             │
│  ● 09:15  🤖 Agente IA · Sistema           │
│    "Enviou relatório de geração mensal      │
│     automaticamente via WhatsApp"           │
│    Tom: neutro                              │
│                                             │
│ 📅 08/04/2026                               │
│                                             │
│  ● 16:45  📧 Email · Maria Oliveira         │
│    "Dúvida sobre créditos de energia.       │
│     Respondido com explicação detalhada"    │
│    Tom: neutro                              │
│                                             │
│  ● 10:00  🔧 Chamado #142 · Aberto          │
│    "Inversor apresentando erro. Escalado    │
│     para atendimento técnico presencial"    │
│    Tom: urgente                             │
└─────────────────────────────────────────────┘
```

**Princípios da timeline:**
- **Resumo-chave primeiro:** Máximo ~280 caracteres, humanizado, nunca robotizado
- **Tom visível:** Badge colorido (🟢 positivo, 🟡 neutro, 🟠 preocupado, 🔴 urgente)
- **Canal com ícone:** WhatsApp, Email, Telefone, Sistema, Agente IA
- **Contato identificado:** Nome da pessoa que interagiu
- **Data/hora sempre visível:** Agrupado por dia
- **Expandível:** Clicar revela `conteudo_longo` (transcrição resumida com pontos-chave)

**Componentes a criar:**

```
components/timeline/
  TimelineContainer.tsx       — Container com scroll, filtros por canal/tipo
  TimelineEventCard.tsx       — Card individual do evento
  TimelineFilters.tsx         — Filtros: canal, tipo_evento, período
  TimelineAddEvent.tsx        — Modal para adicionar nota manual
  TimelineDayGroup.tsx        — Agrupador por dia
```

**Regra crucial — Diferença entre timeline do Cliente vs timeline do Contato:**

| Na página do **Cliente** | Na página do **Contato** |
|---|---|
| Mostra TODOS os eventos de TODOS os contatos vinculados | Mostra APENAS eventos da pessoa específica |
| `WHERE cliente_id = :id ORDER BY ocorrido_em DESC` | `WHERE contato_id = :id ORDER BY ocorrido_em DESC` |
| Exibe o nome do contato em cada evento | Exibe o nome do cliente em cada evento |

---

### ETAPA 3 — Integrar Timeline nas páginas existentes
**Esforço:** 2 dias | **Risco:** Médio

**3a. Página `/clientes/[id]` — Reestruturar layout**

O layout atual é `2/3 formulário + 1/3 painel contatos`. A proposta é usar **tabs**:

```
┌──────────────────────────────────────────┐
│ [Breadcrumb] Clientes > Empresa XYZ      │
│ ★ Empresa XYZ Solar Ltda     [Excluir]  │
│                                          │
│ ┌─────┬──────────┬────────┬───────────┐  │
│ │Dados│Relacion. │Timeline│ Chamados  │  │
│ └─────┴──────────┴────────┴───────────┘  │
│                                          │
│ [Conteúdo da aba ativa]                  │
└──────────────────────────────────────────┘
```

- **Aba "Dados":** Formulário atual (`ClienteForm`)
- **Aba "Relacionamentos":** Painel de contatos atual (`ClienteContactsPanel`) + link para Dados Técnicos
- **Aba "Timeline":** Componente `TimelineContainer` filtrado por `cliente_id`
- **Aba "Chamados":** Lista de chamados do cliente + botão "Novo chamado"

**Alteração no arquivo:** `app/(app)/clientes/[id]/page.tsx`

**3b. Página `/contatos/[id]` — Adicionar timeline**

Mesmo padrão de tabs:

- **Aba "Dados":** Formulário atual (`ContatoForm`)
- **Aba "Vínculos":** Clientes vinculados atual (`ClientesVinculadosSection`)
- **Aba "Timeline":** `TimelineContainer` filtrado por `contato_id`

**Alteração no arquivo:** `app/(app)/contatos/[id]/page.tsx`

---

### ETAPA 4 — Remover menu "Interações" e ajustar sidebar
**Esforço:** 0.5 dia | **Risco:** Baixo

**Ações:**
1. No `Sidebar.tsx`, remover o item:
   ```typescript
   // REMOVER:
   { title: 'Interações', href: '/interacoes', icon: MessageSquare, ... }
   ```

2. Manter a rota `/interacoes/page.tsx` temporariamente com redirect:
   ```typescript
   // app/(app)/interacoes/page.tsx
   import { redirect } from 'next/navigation'
   export default function InteracoesPage() {
     redirect('/clientes')
   }
   ```

3. No futuro (fora deste escopo), a página será reaproveitada como **Dashboard de Monitoramento** das ferramentas de comunicação.

---

### ETAPA 5 — Integração n8n → Supabase (gravação direta)
**Esforço:** 1-2 dias | **Risco:** Médio

O n8n grava direto na `timeline_relacional` usando o **node Supabase** com a `service_role_key` (bypass RLS).

**Fluxo n8n para WhatsApp (exemplo):**

```
[Webhook WhatsApp] 
  → [Parse mensagem]
  → [Identificar cliente_id + contato_id por telefone]
  → [Claude: gerar resumo_chave + tom_conversa + conteudo_longo]
  → [Supabase Insert: timeline_relacional]
```

**Campos que o n8n preenche:**

```json
{
  "cliente_id": "uuid-do-cliente",
  "contato_id": "uuid-do-contato",
  "tipo_evento": "mensagem_whatsapp",
  "canal": "whatsapp",
  "direcao": "entrada",
  "resumo_chave": "Cliente perguntou sobre o relatório de março e elogiou o atendimento",
  "tom_conversa": "positivo",
  "conteudo_longo": "João: Bom dia, recebi o relatório...\nAgente: Fico feliz que...",
  "metadata": { "message_id": "wamid_xxx", "phone": "+5566999..." },
  "origem": "n8n_webhook",
  "autor": "agente_whatsapp",
  "ocorrido_em": "2026-04-10T14:32:00Z"
}
```

**Mesma lógica para email e telefone** — cada canal tem seu webhook no n8n, todos convergem para o mesmo INSERT na `timeline_relacional`.

---

### ETAPA 6 — Agente Inteligente (triagem e auto-atendimento)
**Esforço:** 3-5 dias | **Risco:** Alto

**Conceito central:**

O agente recebe a mensagem do cliente e decide:

```
┌──────────────────────┐
│  Mensagem do Cliente │
└──────────┬───────────┘
           │
    ┌──────▼──────┐
    │ Classificar │
    │  intenção   │
    └──────┬──────┘
           │
     ┌─────┼─────────────┐
     │     │             │
  ┌──▼──┐ ┌▼────────┐ ┌─▼──────────┐
  │Self │ │Buscar   │ │Escalar     │
  │Serve│ │Storage  │ │para Humano │
  └──┬──┘ └──┬──────┘ └──┬─────────┘
     │       │           │
     │       │     ┌─────▼─────────┐
     │       │     │Criar Chamado  │
     │       │     │+ Notificar    │
     │       │     │(futuro: link  │
     │       │     │ Google Cal)   │
     │       │     └───────────────┘
     │       │
  ┌──▼───────▼──┐
  │  Responder  │
  │  ao cliente │
  └─────────────┘
```

**Regras de triagem do agente:**

| Intenção detectada | Ação do agente | Escalação? |
|---|---|---|
| "Quero meu relatório de geração" | Busca no storage do Supabase, envia o PDF | Não |
| "Quanto gerou minha usina?" | Consulta tabela `growatt`, responde | Não |
| "Qual meu saldo de créditos?" | Consulta `growatt.saldo_credito`, responde | Não |
| "Meu inversor está com erro" | Abre chamado tipo `problema_tecnico` | Sim → humano |
| "Preciso de visita técnica" | Abre chamado tipo `problema_tecnico` | Sim → humano |
| "Problema na minha conta/fatura" | Abre chamado tipo `financeiro` | Sim → humano |
| "Reclamação sobre..." | Abre chamado tipo `reclamacao` | Sim → humano |
| Pergunta genérica | Tenta responder, escala se não souber | Condicional |

**Toda ação do agente gera um evento na `timeline_relacional`** com `origem = 'agente_ia'` e `tipo_evento = 'agente_acao'` ou `'agente_resumo'`.

**Implementação no n8n:**

```
[Webhook WhatsApp]
  → [Identificar cliente/contato]
  → [Carregar contexto: últimos 10 eventos da timeline]
  → [Claude API: classificar intenção + gerar resposta]
  → [Switch: tipo de intenção]
      ├─ self_serve → [Responder + Insert timeline]
      ├─ buscar_arquivo → [Supabase Storage: buscar PDF] → [Enviar + Insert timeline]  
      └─ escalar → [Insert chamados_atendimento] → [Insert timeline] → [Notificar humano]
```

---

## 4. Resumo dos Arquivos Alterados/Criados

### Arquivos NOVOS

```
supabase/migrations/
  create_timeline_relacional.sql
  create_chamados_atendimento.sql
  migrate_relatorios_to_timeline.sql

lib/hooks/
  useTimeline.ts
  useChamados.ts

components/timeline/
  TimelineContainer.tsx
  TimelineEventCard.tsx  
  TimelineFilters.tsx
  TimelineAddEvent.tsx
  TimelineDayGroup.tsx

components/chamados/
  ChamadosList.tsx
  ChamadoCard.tsx
  ChamadoForm.tsx
```

### Arquivos ALTERADOS

```
lib/supabase/database.types.ts          → Adicionar tipos timeline + chamados
components/layout/Sidebar.tsx            → Remover item "Interações"
app/(app)/clientes/[id]/page.tsx         → Reestruturar com Tabs (Dados, Relacion., Timeline, Chamados)
app/(app)/contatos/[id]/page.tsx         → Reestruturar com Tabs (Dados, Vínculos, Timeline)
app/(app)/interacoes/page.tsx            → Substituir por redirect
```

### Arquivos NÃO TOCADOS (preservados)

```
components/clientes/ClienteForm.tsx          → Reutilizado na aba "Dados"
components/clientes/ClienteContactsPanel.tsx → Reutilizado na aba "Relacionamentos"
components/contatos/ContatoForm.tsx           → Reutilizado na aba "Dados"
components/contatos/ClientesVinculadosSection.tsx → Reutilizado na aba "Vínculos"
Todas as outras rotas e componentes          → Intactos
```

---

## 5. Ordem de implementação recomendada

```
SEMANA 1
  ├─ Etapa 1: Banco de dados + tipos + hooks        (dia 1-2)
  └─ Etapa 4: Remover menu Interações               (dia 2)

SEMANA 2  
  ├─ Etapa 2: Componente Timeline reutilizável       (dia 3-5)
  └─ Etapa 3: Integrar Timeline nas páginas          (dia 5-6)

SEMANA 3
  ├─ Etapa 5: Integração n8n → Supabase             (dia 7-8)
  └─ Etapa 6: Agente inteligente (MVP)              (dia 8-12)
```

---

## 6. Boas práticas aplicadas

**De CRM:**
- Timeline unificada como "single source of truth" do relacionamento
- Conceito de "Cliente = Base Mãe" preservado (PJ/PF com contrato, não leads)
- Contatos como pessoas vinculadas, com visão própria de timeline filtrada
- Eventos tipados permitem dashboards futuros sem mudança de schema

**De Help Desk agêntico:**
- Triagem automatizada antes de escalar
- Toda ação do agente é auditável na timeline
- Chamados com ciclo de vida claro (aberto → em andamento → resolvido)
- Memória contextual: agente carrega últimos N eventos antes de responder
- Resumo humanizado nunca robotizado — o tom da conversa é registrado

**De simplicidade (menos é mais):**
- Um único lugar para ver todo o histórico: a aba Timeline dentro do cliente
- Sem página separada de "Interações" — o contexto vive onde o cliente vive
- Filtros simples: canal + tipo + período
- Resumo-chave de ~280 chars como "preview" — expandir para ver detalhes
- Agrupamento por dia com data/hora sempre visíveis

---

## 7. Decisões de design que merecem validação

| # | Decisão | Alternativa | Recomendação |
|---|---|---|---|
| 1 | Tabs na página do cliente (Dados, Relacion., Timeline, Chamados) | Manter layout 2/3 + sidebar com timeline embaixo | **Tabs** — melhor escalabilidade para abas futuras |
| 2 | `timeline_relacional` como tabela única para todos os canais | Uma tabela por canal (whatsapp_msgs, emails, etc.) | **Tabela única** — simplicidade, query unificada |
| 3 | n8n grava direto via service_role | API route intermediária no Next.js | **Direto** — menos latência, menos complexidade |
| 4 | `relatorio_envios` mantida + migração para timeline | Eliminar `relatorio_envios` | **Manter** — o fluxo de envio continua usando essa tabela |
| 5 | Chamados como tabela separada | Chamados como tipo_evento na timeline | **Separada** — chamados têm ciclo de vida próprio (status, atribuição) |

---

*Documento gerado como base para implementação iterativa. Cada etapa pode ser executada e validada independentemente.*
