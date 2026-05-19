## Objetivo

Construir uma página de dashboard "Store Platform — Painel de Resultados" replicando fielmente o layout do HTML/imagem enviados, em tema escuro, com dados mock para demonstração. Sem os botões "Período" e "Exportar" no canto superior direito.

## Estrutura da página (`/`)

Substituir o placeholder de `src/routes/index.tsx` por um dashboard composto por:

1. **Header**
   - Título: "Store Platform — Painel de Resultados" com ícone
   - Subtítulo: "Histórico de performance das redes participantes"
   - (sem chips "Jan–Mai 2025" e "Exportar" à direita, conforme pedido)

2. **Barra de filtros** (chips clicáveis, visuais apenas):
   - Todos os clusters, Canal, Rede, Distribuidor, Mês

3. **Indicadores principais (4 KPI cards)**
   - Investimento Gerado — R$ 4,2M / Potencial R$ 5,8M (verde)
   - Redes com sortimento ≥ 90% — 38/54 (azul)
   - % Atingimento da verba — 72,4% (laranja, abaixo da meta 85%)
   - Faturamento mês atual — R$ 12,7M, AGs 312/420 (roxo)
   - Cada card com borda superior colorida, barra de progresso e badge

4. **Linha intermediária (2 cards lado a lado, 2fr / 1fr)**
   - **Investimento gerado vs Potencial por Cluster** — barras agrupadas (Potencial x Gerado) para Clusters A–E
   - **Sortimento ≥ 90% por Canal** — donut chart com legenda (Autosserviço, Atacado, Food Service, Outros)

5. **Linha inferior (3 cards)**
   - **Evolução mensal** — barras Jan→Mai do investimento gerado, com nota de crescimento +75%
   - **Ranking de redes** — tabela Top 5 (Rede, % Sort., Invest.) com legenda de faixas
   - **AGs batidos por canal mix** — barras horizontais por canal (Autosserviço, Atacado, Food Service, etc.)

## Implementação técnica

- **Stack:** TanStack Start + React + Tailwind v4. Página única em `src/routes/index.tsx`; componentes auxiliares em `src/components/dashboard/` (`KpiCard`, `ClusterBars`, `ChannelDonut`, `MonthlyEvolution`, `RankingTable`, `ChannelMixBars`, `FilterBar`).
- **Tema escuro:** ativar classe `dark` no `<html>` em `__root.tsx` (o template já define variáveis `.dark` em `styles.css`). Adicionar tokens semânticos extras em `src/styles.css` para as cores de destaque do dashboard:
  - `--chart-green` (#1D9E75), `--chart-blue` (#378ADD), `--chart-orange` (#EF9F27), `--chart-purple` (#7F77DD), variantes claras para fundos de badges e barras "potencial".
- **Gráficos:** SVG inline (donut e barras) — sem dependências adicionais, replicando o HTML enviado.
- **Dados:** objeto mock em `src/lib/dashboard-data.ts` espelhando os valores do HTML, pronto para ser trocado por dados reais depois.
- **Sem backend** nesta etapa — apenas a UI estática com dados mock. A "quebra por Cluster/Canal" é representada pelos filtros visuais + gráfico por cluster e donut por canal já presentes.
- **SEO:** `head()` da rota `/` com título e descrição do painel.

## Fora de escopo (pode ser feito depois)

- Tornar os filtros funcionais (filtragem real dos dados)
- Conectar a uma base real (Lovable Cloud)
- Exportar para CSV/PDF
- Detalhes por rede individual (drill-down)
