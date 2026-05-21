## Correção

A coluna foi adicionada por engano no card **"Investimento gerado"** (1º KpiCard). Mover para o card **"Redes com sortimento ≥ 90%"** (2º KpiCard) e trocar o título de **"POR CATEGORIA"** para **"Por Cluster"**.

## Mudanças

- `src/routes/index.tsx`:
  - Remover `categoryTitle` e `categoryBreakdown` do 1º KpiCard (linhas ~297-298).
  - Adicionar `categoryTitle="Por Cluster"` e `categoryBreakdown={sortimentoByCluster}` no KpiCard cujo `label="Redes com sortimento ≥ 90%"` (linha ~323).

Nada mais é alterado.
