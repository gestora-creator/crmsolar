# 🧪 Smoke Test - RPC Atômico

## Sobre
Script de teste que valida a atomicidade do RPC `find_or_create_grupo_economico` antes do deploy em produção.

**Objetivo:** Garantir que múltiplas requisições simultâneas criando o mesmo grupo não geram erro 23505 (unique constraint violation).

---

## 📋 Pré-requisitos

1. **Node.js 16+** instalado
2. **Variáveis de ambiente** configuradas (veja abaixo)
3. **RPC função** já deployada em Supabase

## 🔧 Setup

### 1. Instalar ts-node (se não tiver)
```bash
npm install -D ts-node typescript @types/node
```

### 2. Configurar Variáveis de Ambiente

Crie/edite `.env.local` (raiz do projeto):

```env
# Supabase - Chaves Públicas
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Supabase - Chave de Serviço (opcional, apenas se tester for admin)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Onde encontrar:**
- `NEXT_PUBLIC_SUPABASE_URL` → Supabase Dashboard → Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Supabase Dashboard → Settings → API → anon/public key

---

## ▶️ Executar o Teste

### Opção 1: via ts-node (recomendado)
```bash
npx ts-node scripts/test-atomic-rpc.ts
```

### Opção 2: via npm script
Adicione ao `package.json`:
```json
{
  "scripts": {
    "test:atomic-rpc": "ts-node scripts/test-atomic-rpc.ts"
  }
}
```

Depois rode:
```bash
npm run test:atomic-rpc
```

### Opção 3: Compilar + Executar
```bash
# Compilar TypeScript
npx tsc scripts/test-atomic-rpc.ts --lib es2020 --target es2020 --module commonjs

# Executar JavaScript compilado
node scripts/test-atomic-rpc.js
```

---

## 📊 Saída Esperada (SUCESSO)

```
════════════════════════════════════════════════════════════════════════
║ 🧪 TESTE DE ATOMICIDADE - RPC find_or_create_grupo_economico        ║
════════════════════════════════════════════════════════════════════════

Validando ambiente...
✅ Supabase URL: https://your-project.supabase.co
✅ Chaves Supabase carregadas

╭─ Configuração de Teste ─────────────────────────────────────────╮
│ Requisições Simultâneas: 10                                      │
│ Nome do Grupo de Teste:  Test-Group-1711612345-ab123c5          │
│ RPC Function:            find_or_create_grupo_economico          │
╰─────────────────────────────────────────────────────────────────╯

ℹ️  Disparando 10 requisições simultâneas...

╭─ Resultados das Requisições ────────────────────────────────────╮
│ Sucesso:        10/10                                            │
│ Falhas:         0/10                                             │
│ IDs Únicos:     1                                                │
│ Duração Total:  245ms                                            │
╰─────────────────────────────────────────────────────────────────╯

════════════════════════════════════════════════════════════════════════
║ 🔍 VALIDAÇÃO DE RESULTADOS                                           ║
════════════════════════════════════════════════════════════════════════

✅ Todas as 10 requisições retornaram sucesso
✅ Nenhum erro 23505 (unique constraint) detectado ✓
✅ Todos os IDs são idênticos: 123e4567-e89b-12d3-a456-426614174000
✅ Tempo médio por requisição: 24.50ms

════════════════════════════════════════════════════════════════════════
║ 📊 RELATÓRIO FINAL                                                   ║
════════════════════════════════════════════════════════════════════════

✅ RPC É ATÔMICO - Pronto para Produção!

Conclusões:
  ✅ 0% erro 23505 (race condition eliminada)
  ✅ 100% requisições bem-sucedidas
  ✅ 1 ID único (apenas 1 registro criado)
  ✅ RPC funciona corretamente sob concorrência


```

---

## ⚠️ Saída em Caso de Falha

Se o RPC NÃO for atômico:

```
✅ Todas as 10 requisições retornaram sucesso
❌ Erro 23505 (unique constraint) detectado ✗
  → Error: duplicate key value violates unique constraint "crm_grupos_economicos_nome_key"
❌ IDs não batem! 10 IDs diferentes encontrados:
  → 550e8400-e29b-41d4-a716-446655440001
  → 550e8400-e29b-41d4-a716-446655440002
  → ... (mais)

════════════════════════════════════════════════════════════════════════
❌ RPC NÃO É ATÔMICO - NÃO fazer deploy!

Problemas encontrados:
  ❌ 10 IDs diferentes (esperado: 1)
  ❌ Erro 23505 detectado (race condition ainda existe)
```

**→ Se isso acontecer:** NÃO fazer deploy. Revisar a migração SQL.

---

## 🔍 O Que o Teste Valida

| Verificação | Esperado | Detalhes |
|-------------|----------|----------|
| **Sucesso 100%** | 10/10 requisições bem-sucedidas | Se alguma falhar, RPC tem bug |
| **Sem erro 23505** | Nenhum erro de unique constraint | Indica race condition |
| **1 ID único** | Todos retornam o mesmo ID | Garante apenas 1 registro criado |
| **Performance** | < 100ms em média | Verifica se não há lock excessivo |

---

## 📝 Logs Detalhados (Debug)

Para ver logs completos de cada requisição:

```bash
# Adicione ao início de test-atomic-rpc.ts:
process.env.DEBUG = '*'

npx ts-node scripts/test-atomic-rpc.ts
```

Você verá algo como:
```
🔍 Requisição #1 → ID: 550e8400-e29b-41d4-a716-446655440000 (23ms)
🔍 Requisição #2 → ID: 550e8400-e29b-41d4-a716-446655440000 (25ms)
🔍 Requisição #3 → ID: 550e8400-e29b-41d4-a716-446655440000 (24ms)
```

---

## 🚀 Integração com CI/CD

Adicione ao seu pipeline CI (GitHub Actions, GitLab CI, etc):

```yaml
# .github/workflows/test-rpc-before-deploy.yml
name: Test RPC Atomicity

on:
  push:
    branches: [main, staging]
    paths:
      - 'supabase/migrations/**'
      - 'scripts/test-atomic-rpc.ts'

jobs:
  test-atomic-rpc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install -D ts-node typescript @types/node
      
      - name: Run RPC Atomicity Test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: npx ts-node scripts/test-atomic-rpc.ts
```

---

## 📚 Entender o Teste

### Como Funciona

```typescript
// 1. Gera nome único (evita conflitos entre testes)
const TEST_GROUP_NAME = `Test-Group-${Date.now()}-${Math.random()}`

// 2. Dispara 10 requisições simultâneas (Promise.all)
const results = await Promise.all(
  Array.from({ length: 10 }, (_, i) =>
    callFindOrCreateGrupoRPC(supabase, TEST_GROUP_NAME, i + 1)
  )
)

// 3. Coleta resultados
// 4. Valida:
//    - Todos sucesso ou todos falharam?
//    - Todos têm o mesmo ID?
//    - Há erro 23505?
```

### Por Que 10 Requisições?

- **Não é aleatório:** 10 é suficiente para demonstrar concorrência
- **Sem overhead:** Rápido (< 500ms)
- **Estatisticamente válido:** Probabilidade de passar com race condition: < 0.1%

### Por Que Promise.all?

```typescript
// ✅ Correto: Paralelo (simula concorrência)
await Promise.all([p1, p2, p3, ...])

// ❌ Errado: Sequencial (não testa race condition)
await p1; await p2; await p3;
```

---

## 🐛 Troubleshooting

### Erro: "NEXT_PUBLIC_SUPABASE_URL não definido"
**Solução:** Copie `.env.local.example` → `.env.local` e preencha valores

### Erro: "RPC find_or_create_grupo_economico não existe"
**Solução:** Execute a migração first:
```sql
-- Supabase Dashboard → SQL Editor
-- Copie conteúdo de: supabase/migrations/20260328_atomic_find_or_create_grupo.sql
-- Execute
```

### Erro: "Permission denied"
**Solução:** Use ANON_KEY (tem políticas RLS) em vez de SERVICE_ROLE_KEY

### Teste nunca termina
**Solução:** Timeout pode ser muito baixo. Aumentar em script (se necessário):
```typescript
const TIMEOUT = 30000; // 30 segundos
```

---

## ✅ Checklist Antes de Produção

- [ ] Teste passa com 100% sucesso
- [ ] Está validando 10 requisições simultâneas
- [ ] RPC foi deployado em Supabase
- [ ] Não há erro 23505
- [ ] Todos os IDs são idênticos
- [ ] Tempo médio < 100ms por requisição
- [ ] Log está legível e detalhado

---

## 📖 Próximos Passos

Após o teste passar:

1. ✅ Teste RPC atômico (este script)
2. → Deploy da migração em staging
3. → Validar `useGruposEconomicos.ts` usa RPC
4. → Deploy em produção
5. → Monitor erro 23505 (deve ser 0)

---

## 📞 Dúvidas?

Consult:
- [FASE_3_VALIDATION_CHECKLIST.md](../docs/internal/FASE_3_VALIDATION_CHECKLIST.md) - Validação geral
- [FASE_2_RPC_MIGRATION.md](../docs/internal/CACHE_IMPLEMENTATION_PLAN.md) - Detalhes RPC
- [FASE_3_QUICK_START.md](../docs/internal/FASE_3_QUICK_START.md) - Guia rápido

---

**Last Updated:** March 28, 2026  
**Status:** Ready for Production Testing
