---
name: crm-solar-conventions
description: Convenções de domínio e regras de negócio do CRM Solar Energy. Use quando criar/editar funcionalidades de clientes, contatos, grupos econômicos, tags, oportunidades, faturas, permissões ou qualquer lógica de negócio do CRM.
---

## Modelo de dados

### Base Mãe = crm_clientes
- PF e PJ com contrato real (NÃO são leads)
- Campo `razao_social` armazena "Razão Social" (PJ) e "Nome Completo" (PF)
- Campo `tipo_cliente`: 'PF' ou 'PJ'
- Campo `grupo_economico_id`: FK para grupos_economicos (opcional, PF e PJ)
- Ordenação padrão: `razao_social ASC` (alfabética)

### Relacionamentos = crm_contatos
- Pessoas vinculadas N:N via crm_clientes_contatos
- Campo `contato_principal` no vínculo
- Busca: nome_completo, celular, email, cargo, apelido

### Dados Técnicos = crm_clientes_tecnica
- 1:1 com cliente (dados da usina solar)
- Acesso: aba dentro do cadastro do cliente (não menu separado)

### Oportunidades = tabela base
- Lê coluna `dados_extraidos` (JSON: faturado, consumo, injetado)
- SEM filtro de valor na API (frontend filtra por faixa)
- Tipos: geradora, beneficiária

### Tags = crm_tags
- Tags são globais (compartilhadas entre todos os clientes)
- Campo `crm_clientes.tags` é array de strings
- CRUD de tags: página /tags + TagsSelector no formulário

## Sidebar (estrutura definitiva)
```
▾ Dashboards (Hub colapsável)
    Visão Geral        → /dashboard
    Faturas             → /faturas
    Interações          → /interacoes
    Oportunidades       → /oportunidades
    Monitor de Envios   → /tv (nova aba)
  Clientes              → /clientes
  Relacionamentos       → /contatos
  Tags                  → /tags
  Permissões            → /permicoes (admin only)
```

## Permissões
- 2 roles: 'admin' | 'limitada'
- Fallback: SEMPRE 'limitada' (princípio de menor privilégio)
- Tabela: user_roles (user_id, role, permissions JSONB)
- Admin: vê tudo, gerencia usuários
- Limitada: acesso conforme permissions JSON por módulo

## Princípios
- "Menos é mais" — simplicidade, agilidade
- Filtros server-side (nunca client-side para listas paginadas)
- React Query para TODO acesso a dados
- Confirmação explícita para ações destrutivas
- Sem auto-create silencioso (grupos, tags: sempre com confirmação)
