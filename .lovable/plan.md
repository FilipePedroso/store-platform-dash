## Mudança

Adicionar no card **"Investimento gerado"**, na extremidade direita, um bloco com o título "Faturamento" e o valor do faturamento do mês atual (`kpis.faturamento`), no mesmo estilo visual do valor principal e alinhado verticalmente com ele. A cor segue a paleta do card (verde — `valueColor` `#3DD9A4`).

## Alterações em `src/routes/index.tsx`

1. **Componente `KpiCard`** (linhas ~747-794): adicionar prop opcional `rightStat?: { label: string; value: React.ReactNode }`. Renderizar à direita do bloco principal (dentro do mesmo `flex items-start`), antes do `categoryBreakdown`, com:
   - Label `text-[11px] text-neutral-400`
   - Valor `text-[22px] font-medium leading-none` usando a mesma `valueColor` do card
   - Alinhamento vertical idêntico ao valor principal (sem ícone em cima, mas com a mesma altura de label).

2. **Card "Investimento gerado"** (linhas ~296-317): passar `rightStat={{ label: "Faturamento", value: fmtBRL(kpis.faturamento) }}`.

Nenhum outro card é afetado. Nenhuma lógica ou KPI é alterado.
