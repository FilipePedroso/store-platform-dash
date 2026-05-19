## Objetivo

Substituir os dados mock do dashboard pelos dados reais da aba **Dados** do Excel, e permitir que o usuário **atualize a planilha a qualquer momento** sem precisar de novo prompt.

A planilha tem 813 linhas, 15 colunas (Rede, Distribuidor, Cluster, Cluster Mix, Canal, Canal Mix, Nº de CNPJ's, Target de Unidades por AG, Qtd. AG, Ag. Batidos, % Sortimento, Faturamento Mês Atual, Potencial de Investimento, Investimento Gerado, Mês).

## Abordagem

**Upload do .xlsx direto no navegador** (sem backend). Mais simples, sem custo, e o usuário pode reenviar a planilha sempre que precisar:

- Adicionar dependência **SheetJS** (`xlsx`) para ler arquivos Excel no client.
- Botão **"Atualizar dados"** no header do dashboard → abre seletor de arquivo (.xlsx).
- Ao escolher o arquivo, parse da aba `Dados`, validação básica das colunas, e armazenamento em **localStorage** (persiste entre reloads).
- Seed inicial: converto a planilha enviada agora em `src/data/historico-seed.json` para o dashboard já abrir com os dados reais; o upload sobrescreve esse seed.
- Indicador no header mostrando "Dados atualizados em DD/MM/AAAA" e quantas linhas estão carregadas.

## Cálculo dos indicadores (a partir das linhas)

Aplicados sobre os dados filtrados pelos chips (Cluster, Canal, Rede, Distribuidor, Mês). Por padrão, mostro o **mês mais recente** disponível na planilha.

KPIs:
- **Investimento Gerado**: soma de `Investimento Gerado` no mês atual.
- **Potencial**: soma de `Potencial de Investimento` no mês atual.
- **% Atingimento da verba**: Gerado / Potencial.
- **Redes ≥ 90% sortimento**: contagem distinta de `Rede` com `% Sortimento >= 0,9` / total de redes ativas.
- **Faturamento mês atual**: soma de `Faturamento Mês Atual`.
- **AGs batidos / Qtd. AG**: somas; **% AGs** = batidos/qtd.
- **CNPJs ativos**: soma de `Nº de CNPJ's`.
- **Comparações "vs mês anterior"**: comparam mês atual com o mês imediatamente anterior na planilha.

Gráficos:
- **Por Cluster**: agrupamento por `Cluster` somando Potencial e Gerado (substitui as barras hardcoded A–E).
- **Donut "Sortimento ≥ 90% por canal"**: distribuição por `Canal` das redes que atingiram ≥90%.
- **Evolução mensal**: soma de `Investimento Gerado` por `Mês` (todos os meses presentes).
- **Ranking de redes**: Top 5 por `Investimento Gerado` no mês atual, com `% Sortimento`.
- **AGs por canal mix**: agrupamento por `Canal Mix` (ou `Canal`) — % de `Ag. Batidos / Qtd. AG`.

## Filtros funcionais

Os 5 chips no topo viram dropdowns reais (Cluster, Canal, Rede, Distribuidor, Mês), populados a partir dos valores únicos da planilha. Mudar um filtro recalcula todos os indicadores e gráficos.

## Implementação

- `bun add xlsx`
- `src/lib/dashboard-data.ts` — tipos, parsing do arquivo (SheetJS), seed inicial, salvar/ler do localStorage.
- `src/lib/dashboard-metrics.ts` — funções puras que recebem linhas + filtros e devolvem KPIs/séries para cada gráfico.
- `src/components/dashboard/UploadButton.tsx` — botão "Atualizar dados" + input file oculto.
- `src/components/dashboard/FilterBar.tsx` — refatorado com Popover/Select shadcn para filtros reais.
- `src/routes/index.tsx` — usa `useState`/`useMemo` para reagir aos filtros e ao reupload.
- `src/data/historico-seed.json` — gerado a partir do .xlsx enviado (813 linhas) para boot inicial.

## Fora de escopo

- Salvar a planilha no servidor (Lovable Cloud) — pode ser feito depois se quiser compartilhar entre dispositivos/usuários.
- Edição inline dos dados pelo dashboard.
- Exportar para CSV/PDF.
