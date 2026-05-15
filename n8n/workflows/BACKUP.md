# Backup e Restauracao de Workflows n8n

## Por que nao tem os JSON automatizados aqui?

Tentamos via MCP n8n (`n8n_get_workflow` mode=full) mas o "Generator Relatorio" e workflows com pinData grandes geram output >1MB que excede limites de parsing seguros. Em vez de salvar dump parcial/corrompido, mantemos este BACKUP.md + MANIFEST.md como fonte de verdade do mapa.

## Como fazer backup manual

### Opcao 1 — UI do n8n (1 workflow por vez)

1. Abrir https://n8n.damaral.ia.br/workflow/<id>
2. Menu (...) -> Download
3. Salvar JSON em `n8n/workflows/<id>__<slug>.json`
4. `git add` + commit

### Opcao 2 — n8n CLI (todos de uma vez, requer SSH ao container)

```bash
# Dentro do container n8n
n8n export:workflow --all --output=/tmp/n8n-workflows.json

# Copiar pro host
docker cp n8n-container:/tmp/n8n-workflows.json ./n8n/workflows/all.json
```

### Opcao 3 — Dump do PostgreSQL do n8n (mais completo)

```bash
# No host do n8n
pg_dump -U n8n -d n8n --table=workflow_entity --data-only > n8n/backup/workflow_entity_$(date +%Y%m%d).sql
```

Recupera: workflows + versoes + execucoes (se quiser).

## Como restaurar

### De um JSON unico:
1. UI n8n -> Workflows -> Import from File
2. Reconfigurar credenciais (IDs nao sao portaveis entre instancias)

### De um dump SQL:
1. Stop n8n
2. `psql -U n8n -d n8n < workflow_entity_YYYYMMDD.sql`
3. Restart n8n

## Politica recomendada

- **Mensal:** dump SQL completo do banco do n8n, salvar fora do servidor.
- **A cada alteracao significativa:** export do workflow alterado via UI + commit aqui.
- **Quem altera, commita:** se voce mexeu num workflow, exporte e commite. Sem isso este manifesto fica desatualizado.

## TODO

- Automatizar export via tarefa agendada (cron no container n8n + git push). Quando o n8n for atualizado para v2.20.7 (task #16), reavaliar se o MCP consegue exportar workflows grandes de forma confiavel — se sim, dropar essa abordagem manual.
