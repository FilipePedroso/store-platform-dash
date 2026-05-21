## Problema

No bloco "Indicadores principais" há 4 KpiCards lado a lado. O 2º card (Redes com sortimento ≥ 90%) tem a coluna "Por Cluster" no topo, deixando a barra de progresso mais baixa que a dos outros 3 cards.

## Solução

Em `src/routes/index.tsx`, ajustar o componente `KpiCard` (linhas 770–774) para:

1. Tornar o card um flex column de altura total: adicionar `h-full flex flex-col` no wrapper raiz.
2. Tornar a seção superior (linhas 775–823: bloco com valor + coluna de cluster) `flex-1`, para empurrar o rótulo de progresso e a barra para o fim do card.
3. Garantir que o grid em `lg:grid-cols-4` (linha 295) estique os filhos (já é o padrão `items-stretch`, basta confirmar).

Resultado: as barras de progresso dos 4 cards ficam alinhadas na mesma altura, independentemente do conteúdo acima. Nada além disso é alterado (cores, valores, lógica e a coluna "Por Cluster" permanecem iguais).
