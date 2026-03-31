# 🔒 Guia de Segurança - Configuração de Ambiente

## Configuração Inicial

1. **Copie o arquivo de exemplo:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Preencha suas credenciais no `.env.local`:**
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase (nuvem ou `http://127.0.0.1:54321` se usar stack local)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` **ou** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`: chave pública do cliente

## ⚠️ IMPORTANTE: Arquivos que NUNCA devem ser commitados

Os seguintes arquivos contêm informações sensíveis e já estão protegidos pelo `.gitignore`:

- `.env` (todas variações: .env.local, .env.production, etc.)
- Qualquer arquivo com chaves/segredos hardcoded (ex.: `SUPABASE_SERVICE_ROLE_KEY`, JWTs começando com `eyJ...`)

Os scripts de teste foram movidos para `scripts/` e **não** devem conter credenciais hardcoded.

## 🛡️ Verificação Antes do Commit

Execute o script de verificação antes de fazer commit:

```powershell
.\safe-commit.ps1
```

Este script verificará se você está acidentalmente commitando arquivos sensíveis.

## 📝 Workflow Seguro de Commit

```bash
# 1. Adicione os arquivos
git add .

# 2. Verifique arquivos sensíveis (PowerShell)
.\safe-commit.ps1

# 3. Faça o commit
git commit -m "Descrição das mudanças"

# 4. Faça o push
git push origin main
```

## 🔄 Se Acidentalmente Commitou Credenciais

Se você commitou credenciais por engano:

1. **Remova do histórico (recomendado: git-filter-repo):**
   ```bash
   git filter-repo --path test-db.js --invert-paths
   ```

   Alternativa (legado): `git filter-branch`:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch test-db.js" \
     --prune-empty --tag-name-filter cat -- --all
   ```

2. **Revogue as credenciais antigas:**
   - Gere novas chaves no Supabase
   - Atualize seu `.env.local`

3. **Force push (⚠️ use com cuidado):**
   ```bash
   git push origin --force --all
   ```

## 📋 Checklist de Segurança

- [ ] `.env.local` criado com credenciais reais
- [ ] `.env.local.example` commitado (SEM credenciais reais)
- [ ] `.gitignore` configurado corretamente
- [ ] Arquivos de teste não estão no staging
- [ ] Script `safe-commit.ps1` executado antes do push

## 🚀 Deploy

Para ambientes de produção (Netlify/Vercel):

1. Configure as variáveis de ambiente no painel do serviço
2. Nunca commite arquivos `.env.production`
3. Use secrets do GitHub Actions se usar CI/CD

---

**Lembre-se:** Segurança é fundamental! Sempre verifique antes de fazer push.
