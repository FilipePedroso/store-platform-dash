# Dashboard Histórico

Dashboard estático publicado via GitHub Pages. Os dados vêm de um Excel commitado no próprio repositório.

## 🚀 Atualizar os dados (fluxo simples)

1. Coloque o Excel mais recente em **`data-source/`** (ex.: `data-source/Historico.xlsx`).
   - Pode sobrescrever o anterior, ou colocar um novo `.xlsx` ao lado — o script usa o último em ordem alfabética.
   - O Excel precisa ter as abas: `Dados`, `Dados AGs`, `Estrutura`, `Iniciativas`, `Estrutura Grupos`, `Dados SKUs`.
2. Faça commit e push para `main`:
   ```bash
   git add data-source/
   git commit -m "chore(data): atualiza histórico"
   git push origin main
   ```
3. Pronto. O GitHub Actions detecta o `.xlsx`, regenera os JSONs em `public/data/` e publica no GitHub Pages automaticamente (≈ 2 min).

> Não é mais preciso rodar nada localmente. Só trocar o Excel, commitar e push.

## 🧪 Rodar / pré-visualizar localmente (opcional)

```bash
bun install
bun scripts/build_data.mjs        # regenera JSONs a partir de data-source/
bun run dev                       # modo desenvolvimento
# ou
bun run build:static && bun run preview
```

Para gerar a partir de um Excel em outro caminho:
```bash
bun scripts/build_data.mjs "caminho/do/arquivo.xlsx"
```

## 📦 Estrutura

- `data-source/` — Excel fonte (versionado no Git, é a fonte da verdade).
- `public/data/` — JSONs gerados a partir do Excel (também versionados; servem o app).
- `scripts/build_data.mjs` — conversor Excel → JSON.
- `.github/workflows/deploy-pages.yml` — pipeline de build + deploy.

## ⚙️ Pipeline de deploy

A cada push em `main`:
1. `bun install`
2. Se houver `.xlsx` em `data-source/`, roda `bun scripts/build_data.mjs` (regenera `public/data/`).
3. `bun run build:static` (Vite gera o site em `dist/`).
4. Publica em GitHub Pages.
