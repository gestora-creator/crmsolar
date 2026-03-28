# 🚀 Guia Prático: Executar Smoke Test RPC Antes do Deploy

**Data:** 28 de Março de 2026  
**Propósito:** Validar atomicidade do RPC antes de produção  
**Tempo Estimado:** 10 minutos

---

## 📋 Passo a Passo

### ✅ Passo 1: Verificar Pré-requisitos

```bash
# Verificar Node.js versão
node --version
# Esperado: v16+ (recomendado v18+)

# Verificar npm versão
npm --version
# Esperado: v8+
```

**Se não tiver Node.js:**
→ Instale em https://nodejs.org/

---

### ✅ Passo 2: Clonar/Abrir o Projeto

```bash
cd /root/Engenharia-IA/CRM\ SOLAR

# Verificar que os arquivos existem
ls -la scripts/test-atomic-rpc.ts
ls -la scripts/README_TEST_ATOMIC_RPC.md
```

---

### ✅ Passo 3: Instalar Dependências

```bash
# Instalar (inclui ts-node, dotenv, etc)
npm install

# Verificar se foram adicionadas
npm list ts-node dotenv
# Esperado: ambas aparecerem na lista
```

---

### ✅ Passo 4: Configurar Variáveis de Ambiente

**Opção A: Usar .env.local existente** (recomendado)
```bash
# Verificar se já existe
cat .env.local

# Se não tiver, criar:
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...yourkey...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...yourkey...
EOF
```

**Opção B: Usar valores do Supabase Dashboard**
1. Abrir https://app.supabase.com
2. Selecionar projeto
3. Settings → API
4. Copiar valores:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Anon Public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service Role → `SUPABASE_SERVICE_ROLE_KEY` (deixar em branco se não tiver)

---

### ✅ Passo 5: Verificar RPC na Supabase

**Importante:** O RPC deve estar deployed ANTES de rodar o teste.

```bash
# Abrir Supabase Dashboard
# URL: https://app.supabase.com → seu projeto

# 1. Ir em: SQL Editor → (lado esquerdo)
# 2. Clicar: "+ New Query"
# 3. Executar para verificar:

SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name ILIKE 'find_or_create%';

# Esperado: find_or_create_grupo_economico
```

**Se não aparecer:**
→ Executar a migração primeiro (veja próxima seção)

---

### ✅ Passo 6: Deploy RPC em Supabase (se necessário)

**Se o RPC ainda não está deployado:**

```bash
# 1. Copiar conteúdo da migração
cat supabase/migrations/20260328_atomic_find_or_create_grupo.sql

# 2. Supabase Dashboard → SQL Editor → New Query
# 3. Colar conteúdo completo
# 4. Clicar: Run
# 5. Verificar sucesso (sem erro)
```

**Resultado esperado:**
```
Query executed successfully
```

---

### ✅ Passo 7: Executar Teste (Finalmente! 🎯)

**Opção 1: Usar npm script** ⭐ (recomendado)
```bash
npm run test:atomic-rpc
```

**Opção 2: Direto com ts-node**
```bash
npx ts-node scripts/test-atomic-rpc.ts
```

**Opção 3: Com npx (automático)** 
```bash
# Se ts-node não instalado, npx instala automaticamente
npx ts-node scripts/test-atomic-rpc.ts --yes
```

---

## 📊 Interpretar Resultados

### ✅ SUCESSO - RPC é Atômico

```
✅ RPC É ATÔMICO - Pronto para Produção!

Conclusões:
  ✅ 0% erro 23505 (race condition eliminada)
  ✅ 100% requisições bem-sucedidas
  ✅ 1 ID único (apenas 1 registro criado)
  ✅ RPC funciona corretamente sob concorrência
```

**Ações:**
- ✅ Pode fazer deploy em staging
- ✅ Pode fazer deploy em produção
- Monitor erro 23505 por 1 semana

---

### ❌ FALHA 1 - Erro 23505

```
❌ Erro 23505 (unique constraint) detectado ✗
  → Error: duplicate key value violates unique constraint "crm_grupos_economicos_nome_key"
```

**Quer dizer:**
- Race condition NÃO foi eliminada
- Múltiplas requisições conseguiram inserir ao mesmo tempo

**Ações:**
- ❌ NÃO fazer deploy
- Revisar migração SQL
- Verificar ON CONFLICT DO NOTHING
- Testar localmente com PostgreSQL

---

### ❌ FALHA 2 - IDs Diferentes

```
❌ IDs não batem! 10 IDs diferentes encontrados:
  → 550e8400-e29b-41d4-a716-446655440001
  → 550e8400-e29b-41d4-a716-446655440002
```

**Quer dizer:**
- Cada requisição criou um novo registro
- RPC não está retornando o mesmo ID

**Ações:**
- ❌ NÃO fazer deploy
- Revisar lógica: SELECT * FROM ... UNION ALL SELECT * FROM ...
- Verificar se RETURNING está funcionando

---

### ⚠️ FALHA 3 - Timeout

```
Error: RPC request timeout after 30000ms
```

**Quer dizer:**
- RPC demorou muito (possível lock)
- Banco dados lento

**Ações:**
- Aumentar timeout no script:
  ```typescript
  const TIMEOUT = 60000; // 60 segundos
  ```
- Revisar índices no banco (executar EXPLAIN ANALYZE)
- Testar com número menor de requisições (5 em vez de 10)

---

## 🔧 Troubleshooting Rápido

| Erro | Solução |
|------|---------|
| `Cannot find module 'ts-node'` | `npm install -D ts-node` |
| `NEXT_PUBLIC_SUPABASE_URL não definido` | Criar/preencher `.env.local` |
| `RPC não existe` | Deploy migração em Supabase |
| `Permission denied` | Verificar chave ANON_KEY |
| `Connection refused` | Verificar URL Supabase |
| `Timeout` | Aumentar timeout no script |

---

## 📝 Saída Completa com Comandos

```bash
# Full workflow
cd /root/Engenharia-IA/CRM\ SOLAR
npm install
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
EOF
npm run test:atomic-rpc

# Esperado: ✅ RPC É ATÔMICO - Pronto para Produção!
```

---

## 🚀 Próximos Passos Após Sucesso

1. ✅ Smoke Test passou
2. → Deploy em **staging**
   ```bash
   git commit -m "test: add atomic rpc smoke test"
   git push origin staging
   ```

3. → Validar em staging por 24h
   - Monitorar erro 23505
   - Testar CRUD de clientes
   - Testar vincular contatos

4. → Deploy em **produção**
   ```bash
   git push origin main
   ```

5. → Monitorar por 1 semana
   - Error rate dashboard
   - Erro 23505 deve estar em 0

---

## 🎓 Para Entender o Teste

**O que o teste faz:**

```
1. Cria nome único: "Test-Group-1711612345-abc123"
2. Dispara 10 requisições simultâneas (Promise.all)
3. Cada uma chama: find_or_create_grupo_economico("Test-Group-...")
4. Coleta resultados
5. Valida:
   - Todas retornaram sucesso? ✅
   - Nenhum erro 23505? ✅
   - Todos com ID igual? ✅ (apenas 1 created)
6. Conclude: RPC é atômico ✅
```

**Por que 10 requisições?**
- Pequeno o bastante para rodar rápido (< 500ms)
- Grande o bastante para demonstrar concorrência (P(falha) < 0.1%)
- Padronizado em testes de race condition

**Por que Promise.all?**
- Paralelo = concorrente
- Simula N usuários criando ao mesmo tempo
- Melhor detecção de race conditions

---

## ✅ Checklist Final

- [ ] Node.js v16+ instalado
- [ ] npm install executado
- [ ] .env.local configurado
- [ ] RPC deployed em Supabase
- [ ] npm run test:atomic-rpc executado
- [ ] Teste passou com ✅ verde
- [ ] Sem erro 23505
- [ ] 1 ID único
- [ ] Pronto para staging

---

## 📞 Precisa de Ajuda?

**Documentação:**
- [scripts/README_TEST_ATOMIC_RPC.md](./README_TEST_ATOMIC_RPC.md) - Detalhes do teste
- [docs/internal/FASE_3_VALIDATION_CHECKLIST.md](../docs/internal/FASE_3_VALIDATION_CHECKLIST.md) - Validação geral
- [docs/internal/CACHE_IMPLEMENTATION_PLAN.md](../docs/internal/CACHE_IMPLEMENTATION_PLAN.md) - Arquitetura

**Arquivo do teste:**
- [scripts/test-atomic-rpc.ts](./test-atomic-rpc.ts) - Código-fonte

---

**Pronto para começar?**

```bash
npm run test:atomic-rpc
```

💪 Boa sorte! 🎯
