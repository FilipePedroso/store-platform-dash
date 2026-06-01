## Objetivo
Melhorar a legibilidade dos rótulos no modo "Por cluster" quando os valores das linhas ficam muito próximos.

## Abordagem

Aplicar somente no modo **Por cluster** (modo Total continua igual):

1. **Card mais alto no modo cluster** — aumentar a altura do SVG de 170px para ~260px (e o `viewBox` proporcionalmente), dando muito mais espaço vertical para rótulos respirarem. O card cresce junto.

2. **Eixo Y ajustado (zoom)** — em vez de partir de 0, o eixo Y passa a ir de `min * 0.9` até `max * 1.05` considerando apenas os valores dos clusters visíveis. Isso "estica" verticalmente as linhas e separa naturalmente clusters com valores próximos.
   - Rótulos do eixo Y recalculados (base, meio, topo) para refletir a nova escala.
   - Gradiente/área sombreada abaixo de cada linha é removida no modo cluster (não faz sentido com eixo que não parte do zero, e atrapalha leitura dos rótulos).

3. **Anti-colisão de rótulos por ponto** — para cada mês, ordenar os clusters por `y` e empilhar os rótulos com espaçamento mínimo (~11px). Assim:
   - Quando dois clusters têm valores próximos → rótulos saem empilhados sem sobrepor.
   - Quando estão distantes → cada rótulo fica colado ao seu próprio ponto.
   Substitui o offset fixo por índice de cluster que existe hoje.

## Arquivo
- `src/routes/index.tsx` — componente `LineHistoryCard` (cálculo de `yMax`/`yMin`/`yAt`, altura do SVG, render do eixo Y e dos rótulos dos pontos).