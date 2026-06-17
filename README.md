# Dashboard Histórico

Site estático publicado no GitHub Pages. Os dados ficam em `public/data/*.json`, gerados a partir de uma planilha Excel.

## Como atualizar os dados com um novo arquivo Excel

Siga este passo a passo sempre que receber uma nova versão da planilha (`Histórico-X.xlsx`).

### Pré-requisitos (apenas na primeira vez)
- [Node.js 20+](https://nodejs.org/) ou [Bun](https://bun.sh/) instalado
- [Git](https://git-scm.com/) instalado e o repositório clonado localmente
- Rodar `bun install` (ou `npm install`) na raiz do projeto

### Passo a passo

1. **Coloque o novo Excel** em uma pasta conhecida do seu computador, por exemplo `~/Downloads/Histórico-6.xlsx`.

2. **Gere os JSONs** a partir do Excel, passando o caminho do arquivo como argumento:
   ```bash
   bun scripts/build_data.mjs "/caminho/para/Histórico-6.xlsx"
   ```
   > Se usar npm: `node scripts/build_data.mjs "/caminho/para/Histórico-6.xlsx"`

   O script vai:
   - Ler as abas `Dados`, `Dados AGs`, `Estrutura`, `Iniciativas`, `Estrutura Grupos` e `Dados SKUs`
   - Limpar os arquivos antigos em `public/data/`
   - Regenerar `rows.json`, `ags.partX.json`, `skus.partX.json`, `estrutura.json`, `iniciativas.json`, `estrutura_grupos.json` e `meta.json`

3. **Confira localmente** se está tudo certo:
   ```bash
   bun run build:static
   bun run preview
   ```
   Abra a URL mostrada no terminal e valide os números no dashboard.

4. **Faça o commit e push** dos JSONs atualizados:
   ```bash
   git add public/data
   git commit -m "chore(data): atualiza histórico para versão X"
   git push origin main
   ```

5. **Aguarde o deploy automático.** O workflow `.github/workflows/deploy-pages.yml` é disparado no push para `main`, faz o build e publica no GitHub Pages.
   - Acompanhe em **Actions** no GitHub
   - Quando ficar ✅ verde, o site novo já está no ar em `https://<usuário>.github.io/<repositório>/`

### Atalho (gerar dados + build em um comando)
```bash
bun scripts/build_data.mjs "/caminho/para/Histórico-6.xlsx" && bun run build:static
```
Ou use o script combinado (usa o caminho padrão definido em `scripts/build_data.mjs`):
```bash
bun run build:static:data
```

### Dica
Você pode manter o Excel versionado dentro do repositório (ex.: `data-source/Historico.xlsx`) e sempre rodar:
```bash
bun scripts/build_data.mjs "data-source/Historico.xlsx"
```
Assim o histórico do arquivo fica salvo no Git junto com os JSONs gerados.

## Estrutura relevante
- `scripts/build_data.mjs` — converte Excel → JSON
- `public/data/` — JSONs servidos pelo site (não editar à mão)
- `.github/workflows/deploy-pages.yml` — pipeline de publicação
- `src/lib/dashboard-data.ts` — carregamento dos JSONs no front
