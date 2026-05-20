## Objetivo

Tornar os filtros do dashboard **dependentes entre si**: as opções listadas em cada filtro passam a refletir apenas valores que existem nas linhas restantes após aplicar os outros filtros selecionados.

Exemplo: ao escolher o distribuidor **Oniz RS**, o filtro **Rede** mostra somente as redes atendidas por esse distribuidor. O mesmo vale para Cluster, Canal, Distribuidor e Mês.

## Comportamento

- Cada filtro calcula suas opções a partir das linhas filtradas por **todos os outros filtros** (exceto ele mesmo). Isso evita travar a própria seleção do usuário.
- Se uma opção já selecionada deixar de existir após aplicar outro filtro, ela continua visível e marcada (para o usuário poder removê-la), mas aparece como “sem dados” — sem quebrar o filtro.
- O filtro de **Mês** segue a mesma lógica (opções limitadas aos meses presentes nas linhas filtradas pelos demais).
- Nenhuma mudança nos KPIs, gráficos, tabelas ou estilos.

## Implementação (técnico)

- `src/lib/dashboard-metrics.ts`: adicionar helper `optionsFor(rows, filters, key)` que aplica todos os filtros **menos** `key` e devolve `uniqueSorted` da coluna correspondente. Para `mes`, usar `uniqueMonths`.
- `src/routes/index.tsx`:
  - Substituir os 4 `useMemo` atuais (`clusterOpts`, `canalOpts`, `redeOpts`, `distribOpts`) por chamadas a `optionsFor(rows, filters, …)`, agora dependentes também de `filters`.
  - Fazer o mesmo para as opções do filtro de Mês (hoje calculadas a partir de `rows`).
  - Garantir que valores já selecionados que sumirem das opções continuem renderizados no `FilterChip` (merge entre `selected` e `options`).

## Fora de escopo

- Mudar visual dos filtros, KPIs ou gráficos.
- Alterar a lógica de cálculo dos indicadores.