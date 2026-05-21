## Mudança

Na tabela do card **"Grupos não batidos"**, encolher apenas o conteúdo (cabeçalho + linhas) em telas de celular para que todas as colunas caibam sem corte. Título do card, subtítulo de "grupos faltantes" e botão "Baixar CSV" permanecem com o mesmo tamanho atual.

## Alterações em `src/routes/index.tsx` (componente `GruposNaoBatidosCard`, linhas ~1372-1431)

1. **Fonte da tabela menor no mobile** (linha 1379): trocar
   `className="w-full text-[11px] table-fixed"` por
   `className="w-full text-[9px] sm:text-[11px] table-fixed"`.

2. **Padding vertical das células mais compacto no mobile**: nas `<td>` (linhas 1400, 1406, 1412, 1418, 1421, 1424) e nas `<th>` (linhas 1382-1387) trocar `py-1` / `pb-1.5` por `py-0.5 sm:py-1` e `pb-1 sm:pb-1.5` respectivamente.

3. **Larguras das colunas reduzidas no mobile** via classes responsivas:
   - Rede: `w-[26%]` → `w-[28%] sm:w-[26%]`
   - `%`: `w-12` → `w-9 sm:w-12`
   - Target: `w-16` → `w-12 sm:w-16`
   - Vendido(Un): `w-20` → `w-14 sm:w-20`
   - Faltante: `w-16` → `w-12 sm:w-16`
   - Aplicar as mesmas larguras nas `<td>` correspondentes (via classes; td herda do colgroup do `table-fixed` pelo th, então só ajustar nos `th` basta).

4. **Padding lateral entre colunas reduzido no mobile**: nas células com `pr-2`/`pl-2` trocar por `pr-1 sm:pr-2` / `pl-1 sm:pl-2`.

Nada mais é alterado — cabeçalho do card (título + contagem + botão CSV) e a lógica de filtros/ordenação ficam inalterados.
