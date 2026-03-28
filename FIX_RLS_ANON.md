# 🔒 FIX RLS - Resolver Erro de Permissão

## ⚠️ Problema Encontrado

```
❌ new row violates row-level security policy for table "grupos_economicos"
```

**Causa**: Políticas RLS só permitem `authenticated`, mas RPC é chamada com `anon` key.

---

## 🔧 Solução (2 passos)

### ✅ Já feito:
```sql
DROP FUNCTION IF EXISTS public.find_or_create_grupo_economico(TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.find_or_create_grupo_economico(p_nome TEXT)
...
```

### 🔴 Falta fazer:
Executar este SQL em Supabase SQL Editor:

```sql
DROP POLICY IF EXISTS "Permitir criação anon grupos econômicos" ON public.grupos_economicos;

CREATE POLICY "Permitir criação anon grupos econômicos" ON public.grupos_economicos
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir leitura anon grupos econômicos" ON public.grupos_economicos;

CREATE POLICY "Permitir leitura anon grupos econômicos" ON public.grupos_economicos
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "Permitir atualização anon grupos econômicos" ON public.grupos_economicos;

CREATE POLICY "Permitir atualização anon grupos econômicos" ON public.grupos_economicos
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
```

---

## 📋 Passo a Passo

1. Abrir: https://lodgnyduaezlcjxfcxrh.supabase.co/project/_/sql
2. **+ New Query**
3. Copiar SQL acima
4. Colar no editor
5. **Run**
6. ⏳ Aguardar 30 segundos
7. Volte e execute: `npm run test:atomic-rpc`

---

## ✨ Resultado Esperado

```
✅ RPC IS ATOMIC - Production Ready!
```

---

**Ou veja o arquivo completo:**
```bash
cat scripts/FIX_RLS_ANON.sql
```
