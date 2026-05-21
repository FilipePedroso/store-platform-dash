## Mudança

Mover o badge "CNPJs ativos" do card **"Faturamento mês atual"** para o canto inferior direito do card **"Redes com sortimento ≥ 90%"**.

## Alterações em `src/routes/index.tsx`

1. **Card "Faturamento mês atual"** (linhas ~378-382): remover a prop `badge` que renderiza `"{cnpjsAtivos} CNPJs ativos"`.

2. **Card "Redes com sortimento ≥ 90%"** (linhas ~318-347): adicionar o texto `"{cnpjsAtivos} CNPJs ativos"` posicionado na extremidade inferior direita do card, alinhado com o badge "−81 redes vs mês ant." (lado esquerdo do rodapé), mantendo a cor roxa atual (`#A39DE5` sobre `#241F4D`).

3. **Componente `KpiCard`**: adicionar uma nova prop opcional `footerRight?: ReactNode` renderizada no rodapé do card à direita (mesma linha do `badge`). Aplicar somente no card de sortimento.

Nada mais é alterado (KPIs, lógica, demais cards e barra de progresso permanecem iguais).
