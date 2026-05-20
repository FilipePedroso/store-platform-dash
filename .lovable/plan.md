## Objetivo

Adicionar, no card de KPI **"Redes com sortimento ≥ 90%"**, uma coluna no canto superior direito intitulada **POR CATEGORIA** com a contagem `redes OK / redes ativas` para os 3 clusters (Diamante, Ouro, Prata), conforme o print.

Nenhum outro card, KPI, filtro, gráfico ou estilo é alterado.

## Comportamento

- A coluna aparece **apenas** no card de "Redes com sortimento ≥ 90%". Os demais KPIs (Investimento, Atingimento, Faturamento) seguem idênticos.
- Para cada cluster (Diamante, Ouro, Prata):
  - **Numerador**: nº de redes únicas no mês filtrado com `sortimento >= 0.9`.
  - **Denominador**: nº de redes únicas no mês filtrado (independente do sortimento).
  - Bolinha colorida ao lado do nome: Diamante (roxo), Ouro (amarelo), Prata (cinza).
- A coluna fica posicionada no topo direito do card, **alinhada com o rótulo/valor principal**. A barra de progresso de "Taxa de conversão" continua ocupando **100% da largura** do card (mesma largura atual).
- Se um cluster não existir no recorte filtrado, mostra `0 / 0`.

## Implementação (técnico)

- `src/routes/index.tsx`:
  - Calcular `sortimentoByCluster` num `useMemo` (a partir de `monthData`), retornando `[{ cluster: "Diamante", ok, total }, ...]` na ordem Diamante → Ouro → Prata.
  - Estender o componente `KpiCard` com prop opcional `categoryBreakdown?: { label: string; ok: number; total: number; color: string }[]` e prop opcional `categoryTitle?: string`.
  - Quando `categoryBreakdown` está presente, transformar o topo do card num layout flex de duas colunas: à esquerda o bloco existente (label + valor + sub), à direita a coluna "POR CATEGORIA" com as 3 linhas. O bloco da barra de progresso (label, valor, barra, meta, badge) permanece **fora** dessa divisão, ocupando a largura total do card.
  - Passar `categoryBreakdown` somente no card de sortimento; cores: Diamante `PURPLE`, Ouro `ORANGE`/amarelo (`#F1C40F` se houver token existente, caso contrário usar `ORANGE`), Prata `#9CA3AF`.

## Fora de escopo

- Mudar lógica/threshold do "sortimento ≥ 90%".
- Alterar visual ou dados dos outros KPIs e cards.
- Filtros, KPIs e gráficos.
