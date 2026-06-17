# Dashboard Histórico

Dashboard estático publicado via GitHub Pages. Os dados vêm de um Excel commitado no próprio repositório.

## 🚀 Atualizar os dados (pelo navegador, sem instalar nada)

1. Abra o repositório no GitHub e entre na pasta **`data-source/`**.
2. Clique em **"Add file" → "Upload files"** e arraste o `.xlsx` novo.
   - Pode usar o mesmo nome do anterior (sobrescreve) ou um nome novo — o sistema usa o último em ordem alfabética.
   - O Excel precisa ter as abas: `Dados`, `Dados AGs`, `Estrutura`, `Iniciativas`, `Estrutura Grupos`, `Dados SKUs`.
3. Embaixo da página, escreva uma mensagem (ex.: "atualiza histórico") e clique em **"Commit changes"**.
4. Aguarde ~2 minutos. O GitHub Actions regenera os JSONs e publica no GitHub Pages automaticamente.
   - Acompanhe o progresso na aba **"Actions"** no topo do repositório (✅ verde = publicado).

Pronto. Não precisa rodar nada no computador.

---

## 🧪 (Opcional) Rodar localmente, no seu computador

Só faça isso se quiser pré-visualizar antes de publicar. Requer ter o [Bun](https://bun.sh) instalado. Abra o terminal **dentro da pasta do projeto** e rode:

```bash
bun install
bun scripts/build_data.mjs        # regenera JSONs a partir de data-source/
bun run dev                       # abre em http://localhost:5173
```

Para usar um Excel em outro caminho:
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
