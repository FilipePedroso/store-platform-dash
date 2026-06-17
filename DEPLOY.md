# Deploy estático para GitHub Pages

Este projeto pode ser publicado como site estático no GitHub Pages. Os dados
do Excel ficam pré-processados em JSON dentro de `public/data/` e são
carregados pelo navegador junto com o site.

## Como atualizar os dados

1. Substitua o arquivo Excel de origem em `/mnt/user-uploads/Histórico-5.xlsx`
   ou aponte para outro caminho:
   ```bash
   bun run build:data /caminho/para/Histórico.xlsx
   ```
2. Commit & push das alterações em `public/data/`.

O script `scripts/build_data.mjs` lê as abas `Dados`, `dados ags`,
`dados_skus`, `estrutura`, `iniciativas` e `estrutura_grupos`, e gera os
JSONs (com `ags` e `skus` divididos em chunks de 20k linhas).

## Build local

```bash
bun run build:static
```

O resultado fica em `dist/` e pode ser servido por qualquer hosting estático.

## GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` faz tudo automaticamente em
cada push para `main`:

1. Instala dependências
2. Roda `bun run build:static` (regenera JSONs + compila o site)
3. Publica `dist/` no GitHub Pages

### Project Pages (`https://<user>.github.io/<repo>/`)

O workflow já configura `VITE_BASE_PATH=/<repo>/` automaticamente. Nada a
fazer — só ativar GitHub Pages em **Settings → Pages → Source: GitHub Actions**.

### User/Org Pages ou domínio customizado (raiz `/`)

Remova a linha `VITE_BASE_PATH` do workflow ou defina como `/`.
