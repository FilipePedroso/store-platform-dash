import type { ChaveRow, PgMaisRow, Row } from "./dashboard-data";

/**
 * Virada de contrato: a partir deste mês, "% Sortimento" deixa de ser um percentual
 * e passa a ser a Chave atingida (0/1/2), calculada com base em metas de AGs por
 * Cluster+Canal (aba "Chaves"). Meses anteriores continuam usando o % legado.
 */
export const CHAVE_CUTOVER = "2026-08-01";
export const isChaveRegime = (mes: string): boolean => mes >= CHAVE_CUTOVER;
/** Rede "OK" (bateu o mix mínimo) no regime vigente para o mês daquela linha. */
export const isSortOk = (r: Row): boolean =>
  isChaveRegime(r.mes) ? r.chave === 2 : r.sortimento >= 0.9;

export type Filters = {
  cluster: string[];
  canal: string[];
  rede: string[];
  distribuidor: string[];
  mes: string[]; // empty = latest month
  gv: string[];
  sv: string[];
  rv: string[];
};

export const EMPTY_FILTERS: Filters = {
  cluster: [],
  canal: [],
  rede: [],
  distribuidor: [],
  mes: [],
  gv: [],
  sv: [],
  rv: [],
};

export function hasAnyFilter(f: Filters): boolean {
  return (
    f.cluster.length > 0 ||
    f.canal.length > 0 ||
    f.rede.length > 0 ||
    f.distribuidor.length > 0 ||
    f.mes.length > 0 ||
    f.gv.length > 0 ||
    f.sv.length > 0 ||
    f.rv.length > 0
  );
}

export function uniqueSorted(rows: Row[], key: keyof Row): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v != null && v !== "") set.add(String(v));
  }
  return [...set].sort();
}

export function uniqueMonths(rows: Row[]): string[] {
  return uniqueSorted(rows, "mes");
}

export function latestMonth(rows: Row[]): string | null {
  const months = uniqueMonths(rows);
  return months.length ? months[months.length - 1] : null;
}

export function previousMonth(rows: Row[], current: string): string | null {
  const months = uniqueMonths(rows);
  const idx = months.indexOf(current);
  return idx > 0 ? months[idx - 1] : null;
}

const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);

/** Apply non-month filters. Month is applied separately for KPI MoM comparisons. */
export function applyBaseFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter(
    (r) =>
      inList(r.cluster, f.cluster) &&
      inList(r.canal, f.canal) &&
      inList(r.rede, f.rede) &&
      inList(r.distribuidor, f.distribuidor),
  );
}

/**
 * Compute options for a given filter key, applying all OTHER active filters.
 * Already-selected values are merged in so the user can always deselect them.
 */
export function optionsFor(
  rows: Row[],
  f: Filters,
  key: "cluster" | "canal" | "rede" | "distribuidor" | "mes",
): string[] {
  const filtered = rows.filter(
    (r) =>
      (key === "cluster" || inList(r.cluster, f.cluster)) &&
      (key === "canal" || inList(r.canal, f.canal)) &&
      (key === "rede" || inList(r.rede, f.rede)) &&
      (key === "distribuidor" || inList(r.distribuidor, f.distribuidor)) &&
      (key === "mes" || inList(r.mes, f.mes)),
  );
  const set = new Set<string>();
  for (const r of filtered) {
    const v = r[key];
    if (v != null && v !== "") set.add(String(v));
  }
  for (const v of f[key]) set.add(v);
  return [...set].sort();
}

export function applyAllFilters(rows: Row[], f: Filters): Row[] {
  return applyBaseFilters(rows, f).filter((r) => inList(r.mes, f.mes));
}

function sum(rows: Row[], key: keyof Row): number {
  let t = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number") t += v;
  }
  return t;
}

export type Kpis = {
  gerado: number;
  potencial: number;
  atingimentoVerba: number; // 0..1
  redesSortimentoOk: number;
  redesAtivas: number;
  taxaConversao: number; // 0..1
  faturamento: number;
  agBatidos: number;
  qtdAG: number;
  pctAGs: number; // 0..1
  cnpjsAtivos: number;
  // Comparisons vs previous month (delta absolute / pp)
  geradoDeltaPct: number | null; // % change
  redesOkDelta: number | null; // absolute delta
  atingimentoDeltaPP: number | null; // p.p.
  agsDeltaPP: number | null;
};

/** Soma potencial/gerado das linhas "P&G+ Volume" para as redes já presentes em `baseRows`
 * (ou seja, respeitando os filtros de cluster/canal/rede/distribuidor já aplicados) e no(s)
 * mês(es) informado(s). */
function sumPgVolumeInvest(
  pgMais: PgMaisRow[],
  baseRows: Row[],
  months: string[],
): { potencial: number; gerado: number } {
  const allowedRedes = new Set(baseRows.map((r) => r.rede));
  const monthSet = new Set(months);
  let potencial = 0;
  let gerado = 0;
  for (const r of pgMais) {
    if (!/p&g\+\s*volume/i.test(r.tipo)) continue;
    if (!monthSet.has(r.data)) continue;
    if (!allowedRedes.has(r.rede)) continue;
    potencial += r.potencial;
    gerado += r.gerado;
  }
  return { potencial, gerado };
}

export function computeKpis(
  allRows: Row[],
  baseRows: Row[],
  selectedMonths: string[],
  pgMais: PgMaisRow[] = [],
): Kpis {
  const monthSet = new Set(selectedMonths);
  const monthRows = baseRows.filter((r) => monthSet.has(r.mes));
  const pgVol = sumPgVolumeInvest(pgMais, baseRows, selectedMonths);
  const gerado = sum(monthRows, "gerado") + pgVol.gerado;
  const potencial = sum(monthRows, "potencial") + pgVol.potencial;
  const faturamento = sum(monthRows, "faturamento");
  const agBatidos = sum(monthRows, "agBatidos");
  const qtdAG = sum(monthRows, "qtdAG");
  const cnpjsAtivos = sum(monthRows, "cnpjs");

  const redesAtivas = new Set(monthRows.map((r) => r.rede)).size;
  const redesSortimentoOk = new Set(
    monthRows.filter(isSortOk).map((r) => r.rede),
  ).size;

  // Previous month comparison only when exactly one month is selected
  const singleMonth = selectedMonths.length === 1 ? selectedMonths[0] : null;
  const prevMonth = singleMonth ? previousMonth(allRows, singleMonth) : null;
  const prevRows = prevMonth ? baseRows.filter((r) => r.mes === prevMonth) : [];
  const prevPgVol = prevMonth ? sumPgVolumeInvest(pgMais, baseRows, [prevMonth]) : { potencial: 0, gerado: 0 };
  const prevGerado = sum(prevRows, "gerado") + prevPgVol.gerado;
  const prevPotencial = sum(prevRows, "potencial") + prevPgVol.potencial;
  const prevAg = sum(prevRows, "agBatidos");
  const prevQtd = sum(prevRows, "qtdAG");
  const prevRedesOk = new Set(prevRows.filter(isSortOk).map((r) => r.rede)).size;

  return {
    gerado,
    potencial,
    atingimentoVerba: potencial > 0 ? gerado / potencial : 0,
    redesSortimentoOk,
    redesAtivas,
    taxaConversao: redesAtivas > 0 ? redesSortimentoOk / redesAtivas : 0,
    faturamento,
    agBatidos,
    qtdAG,
    pctAGs: qtdAG > 0 ? agBatidos / qtdAG : 0,
    cnpjsAtivos,
    geradoDeltaPct: prevMonth && prevGerado > 0 ? (gerado - prevGerado) / prevGerado : null,
    redesOkDelta: prevMonth ? redesSortimentoOk - prevRedesOk : null,
    atingimentoDeltaPP:
      prevMonth && prevPotencial > 0
        ? (gerado / potencial - prevGerado / prevPotencial) * 100
        : null,
    agsDeltaPP:
      prevMonth && prevQtd > 0 ? (agBatidos / qtdAG - prevAg / prevQtd) * 100 : null,
  };
}

export type ChannelSlice = { canal: string; redes: number; pct: number };

export function computeDonutByCanal(monthRows: Row[]): {
  total: number;
  totalRedes: number;
  pctAtingiram: number;
  slices: ChannelSlice[];
} {
  const okByCanal = new Map<string, Set<string>>();
  const allRedes = new Set<string>();
  const okRedes = new Set<string>();
  for (const r of monthRows) {
    allRedes.add(r.rede);
    if (isSortOk(r)) {
      okRedes.add(r.rede);
      const k = r.canal || "—";
      if (!okByCanal.has(k)) okByCanal.set(k, new Set());
      okByCanal.get(k)!.add(r.rede);
    }
  }
  const total = okRedes.size;
  const slices: ChannelSlice[] = [...okByCanal.entries()]
    .map(([canal, set]) => ({
      canal,
      redes: set.size,
      pct: total > 0 ? set.size / total : 0,
    }))
    .sort((a, b) => b.redes - a.redes);
  return {
    total,
    totalRedes: allRedes.size,
    pctAtingiram: allRedes.size > 0 ? total / allRedes.size : 0,
    slices,
  };
}

export type MonthPoint = { mes: string; gerado: number };

export function computeEvolution(baseRows: Row[]): MonthPoint[] {
  const map = new Map<string, number>();
  for (const r of baseRows) {
    map.set(r.mes, (map.get(r.mes) ?? 0) + r.gerado);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, gerado]) => ({ mes, gerado }));
}

export type RankRow = {
  rede: string;
  cluster: string;
  canal: string;
  sortimento: number;
  gerado: number;
  potencial: number;
  qtdAG: number;
  agBatidos: number;
  gapAgs: number;
  gapAgs90: number;
  /** Regime vigente para o mês desta linha (true = Chave, false = % legado). */
  chaveRegime: boolean;
  /** Chave atingida (0/1/2), só preenchida quando chaveRegime é true. */
  chave: number | null;
  /** AGs faltantes para a próxima chave (0 se já está na Chave 2, ou sem regime de chave). */
  gapProximaChave: number;
  /** Nível da próxima chave (1 ou 2), null se já está na Chave 2 ou sem regime de chave. */
  proximaChaveNivel: number | null;
};

export function computeRanking(
  monthRows: Row[],
  chaves: ChaveRow[],
  topN = 5,
): RankRow[] {
  const chavesMap = new Map<string, ChaveRow>();
  for (const c of chaves) chavesMap.set(`${c.cluster}|${c.canal}`, c);

  const map = new Map<
    string,
    {
      rede: string;
      gerado: number;
      potencial: number;
      qtdAG: number;
      agBatidos: number;
      mes: string;
      cluster: string;
      canal: string;
      chave: number | null;
      sortimento: number;
    }
  >();
  for (const r of monthRows) {
    const cur = map.get(r.rede);
    if (cur) {
      cur.gerado += r.gerado;
      cur.potencial += r.potencial;
      cur.qtdAG += r.qtdAG;
      cur.agBatidos += r.agBatidos;
      // Última linha encontrada define cluster/canal/chave/sortimento/mês (redes têm 1 linha/mês na prática).
      cur.mes = r.mes;
      cur.cluster = r.cluster;
      cur.canal = r.canal;
      cur.chave = r.chave;
      cur.sortimento = r.sortimento;
    } else {
      map.set(r.rede, {
        rede: r.rede,
        gerado: r.gerado,
        potencial: r.potencial,
        qtdAG: r.qtdAG,
        agBatidos: r.agBatidos,
        mes: r.mes,
        cluster: r.cluster,
        canal: r.canal,
        chave: r.chave,
        sortimento: r.sortimento,
      });
    }
  }
  return [...map.values()]
    .map((v) => {
      // Usa o % Sortimento vindo direto da aba Dados (já arredondado para cima na origem),
      // em vez de recalcular agBatidos/qtdAG aqui — evita divergência como 89% vs 90%.
      const sortimento = v.sortimento;
      const gapAgs = Math.max(0, v.qtdAG - v.agBatidos);
      const gapAgs90 = sortimento >= 0.9 ? 0 : Math.max(0, Math.ceil(0.9 * v.qtdAG) - v.agBatidos);
      const chaveRegime = isChaveRegime(v.mes);
      let gapProximaChave = 0;
      let proximaChaveNivel: number | null = null;
      if (chaveRegime) {
        const meta = chavesMap.get(`${v.cluster}|${v.canal}`);
        if (meta && v.chave !== 2) {
          const usaChave2 = v.chave === 1 || meta.chave1 == null;
          const proximo = usaChave2 ? meta.chave2 : meta.chave1;
          if (proximo != null) {
            gapProximaChave = Math.max(0, proximo - v.agBatidos);
            proximaChaveNivel = usaChave2 ? 2 : 1;
          }
        }
      }
      return {
        rede: v.rede,
        cluster: v.cluster,
        canal: v.canal,
        sortimento,
        gerado: v.gerado,
        potencial: v.potencial,
        qtdAG: v.qtdAG,
        agBatidos: v.agBatidos,
        gapAgs,
        gapAgs90,
        chaveRegime,
        chave: chaveRegime ? v.chave : null,
        gapProximaChave,
        proximaChaveNivel,
      };
    })
    .sort((a, b) =>
      a.chaveRegime
        ? (b.chave ?? -1) - (a.chave ?? -1) || b.gerado - a.gerado
        : b.sortimento - a.sortimento || b.gerado - a.gerado,
    )
    .slice(0, topN);
}

export type TopMoverRow = {
  rede: string;
  cluster: string;
  atual: number;
  anterior: number;
  delta: number;
};

/**
 * Redes com maior alta/queda de investimento gerado no mês vigente vs. o mês anterior.
 * Assim como em `computeInvestmentConcentration`, soma o P&G+ Volume ao `gerado` legado
 * por rede — a partir da virada de contrato (ago/2026), o campo legado sozinho fica quase
 * todo zerado.
 */
export function computeTopMovers(
  baseRows: Row[],
  currentMonth: string | null,
  prevMonth: string | null,
  pgMais: PgMaisRow[] = [],
  topN = 5,
): { altas: TopMoverRow[]; quedas: TopMoverRow[] } {
  if (!currentMonth || !prevMonth) return { altas: [], quedas: [] };
  const allowedRedes = new Set(baseRows.map((r) => r.rede));
  const curMap = new Map<string, { gerado: number; cluster: string }>();
  for (const r of baseRows) {
    if (r.mes !== currentMonth) continue;
    const cur = curMap.get(r.rede);
    if (cur) cur.gerado += r.gerado;
    else curMap.set(r.rede, { gerado: r.gerado, cluster: r.cluster });
  }
  const prevMap = new Map<string, number>();
  for (const r of baseRows) {
    if (r.mes !== prevMonth) continue;
    prevMap.set(r.rede, (prevMap.get(r.rede) ?? 0) + r.gerado);
  }
  for (const r of pgMais) {
    if (!/p&g\+\s*volume/i.test(r.tipo)) continue;
    if (!allowedRedes.has(r.rede)) continue;
    if (r.data === currentMonth) {
      const cur = curMap.get(r.rede);
      if (cur) cur.gerado += r.gerado;
      else curMap.set(r.rede, { gerado: r.gerado, cluster: "" });
    } else if (r.data === prevMonth) {
      prevMap.set(r.rede, (prevMap.get(r.rede) ?? 0) + r.gerado);
    }
  }
  const deltas: TopMoverRow[] = [...curMap.entries()].map(([rede, v]) => {
    const anterior = prevMap.get(rede) ?? 0;
    return { rede, cluster: v.cluster, atual: v.gerado, anterior, delta: v.gerado - anterior };
  });
  const altas = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, topN);
  const quedas = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, topN);
  return { altas, quedas };
}

export type ConcentrationRede = { rede: string; gerado: number; pct: number };

export type ConcentrationStats = {
  totalRedes: number;
  totalGerado: number;
  top5Pct: number;
  next5Pct: number; // 6ª–10ª
  restPct: number;
  redesFor80Pct: number;
  /** Top 10 redes por investimento gerado (Top 5 + 6ª–10ª), maior primeiro. */
  topRedes: ConcentrationRede[];
};

/**
 * Quanto do investimento gerado total está concentrado nas maiores redes (curva de Pareto).
 * A partir da virada de contrato (ago/2026), o investimento por rede deixa de vir só das
 * linhas legadas (`gerado`) e passa a incluir também o P&G+ Volume — por isso soma as duas
 * fontes por rede, como o restante do dashboard já faz em `computeKpis`.
 */
export function computeInvestmentConcentration(
  monthRows: Row[],
  pgMais: PgMaisRow[] = [],
  months: string[] = [],
): ConcentrationStats {
  const map = new Map<string, number>();
  for (const r of monthRows) {
    map.set(r.rede, (map.get(r.rede) ?? 0) + r.gerado);
  }
  const allowedRedes = new Set(monthRows.map((r) => r.rede));
  const monthSet = new Set(months);
  for (const r of pgMais) {
    if (!/p&g\+\s*volume/i.test(r.tipo)) continue;
    if (!monthSet.has(r.data)) continue;
    if (!allowedRedes.has(r.rede)) continue;
    map.set(r.rede, (map.get(r.rede) ?? 0) + r.gerado);
  }
  const sorted = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalRedes = sorted.length;
  const totalGerado = sorted.reduce((a, [, v]) => a + v, 0);
  if (totalRedes === 0 || totalGerado <= 0) {
    return {
      totalRedes: 0,
      totalGerado: 0,
      top5Pct: 0,
      next5Pct: 0,
      restPct: 0,
      redesFor80Pct: 0,
      topRedes: [],
    };
  }
  const sum = (arr: [string, number][]) => arr.reduce((a, [, v]) => a + v, 0);
  const top5 = sum(sorted.slice(0, 5));
  const next5 = sum(sorted.slice(5, 10));
  const rest = totalGerado - top5 - next5;
  let cum = 0;
  let redesFor80Pct = 0;
  for (const [, v] of sorted) {
    cum += v;
    redesFor80Pct++;
    if (cum >= totalGerado * 0.8) break;
  }
  const topRedes: ConcentrationRede[] = sorted
    .slice(0, 10)
    .map(([rede, gerado]) => ({ rede, gerado, pct: gerado / totalGerado }));
  return {
    totalRedes,
    totalGerado,
    top5Pct: top5 / totalGerado,
    next5Pct: next5 / totalGerado,
    restPct: rest / totalGerado,
    redesFor80Pct,
    topRedes,
  };
}

export type CanalMixBar = { canal: string; pct: number };

export function computeAgsByCanalMix(monthRows: Row[]): CanalMixBar[] {
  const map = new Map<string, { batidos: number; total: number }>();
  for (const r of monthRows) {
    const k = r.canal || "—";
    const cur = map.get(k) ?? { batidos: 0, total: 0 };
    cur.batidos += r.agBatidos;
    cur.total += r.qtdAG;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([canal, v]) => ({ canal, pct: v.total > 0 ? v.batidos / v.total : 0 }))
    .sort((a, b) => b.pct - a.pct);
}

/** BR formatting helpers */
export function fmtBRL(n: number, compact = true): string {
  if (compact) {
    if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
    if (Math.abs(n) >= 1e3) return `R$ ${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
  }
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function fmtMonth(iso: string): string {
  const [y, m] = iso.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

/** Build monthly series, optionally broken by a group key (e.g. cluster). */
export function computeMonthlySeries(
  baseRows: Row[],
  reducer: (rows: Row[]) => number,
  groupKey?: keyof Row,
): {
  months: string[];
  total: number[];
  groups: { name: string; values: number[] }[];
} {
  const months = uniqueMonths(baseRows);
  const total = months.map((m) => reducer(baseRows.filter((r) => r.mes === m)));
  let groups: { name: string; values: number[] }[] = [];
  if (groupKey) {
    const names = uniqueSorted(baseRows, groupKey);
    groups = names.map((name) => ({
      name,
      values: months.map((m) =>
        reducer(baseRows.filter((r) => r.mes === m && String(r[groupKey]) === name)),
      ),
    }));
  }
  return { months, total, groups };
}

/** Reducers for the historical line cards. */
export const reduceSumGerado = (rows: Row[]) => rows.reduce((a, r) => a + r.gerado, 0);
export const reduceSumPotencial = (rows: Row[]) => rows.reduce((a, r) => a + r.potencial, 0);
export const reduceSumFaturamento = (rows: Row[]) => rows.reduce((a, r) => a + r.faturamento, 0);
export const reduceRedesOk = (rows: Row[]) =>
  new Set(rows.filter(isSortOk).map((r) => r.rede)).size;
export const reduceAtingimento = (rows: Row[]) => {
  const p = rows.reduce((a, r) => a + r.potencial, 0);
  const g = rows.reduce((a, r) => a + r.gerado, 0);
  return p > 0 ? g / p : 0;
};

export type PgVolumeBrand = { label: string; ok: number; total: number };
export type PgVolumeInvestBrand = { label: string; gerado: number; potencial: number };

/**
 * P&G+ Volume: as linhas do .xlsm só trazem Rede + Data (sem cluster/canal/distribuidor),
 * então cruzamos com o dataset principal (por rede, pegando a ocorrência mais recente) para
 * poder aplicar os mesmos filtros de cluster/canal/distribuidor do resto do painel.
 */
function filterPgVolumeRows(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgMaisRow[] {
  const info = new Map<string, { cluster: string; canal: string; distribuidor: string; mes: string }>();
  for (const r of rows) {
    const cur = info.get(r.rede);
    if (!cur || r.mes > cur.mes) {
      info.set(r.rede, { cluster: r.cluster, canal: r.canal, distribuidor: r.distribuidor, mes: r.mes });
    }
  }
  const monthSet = new Set(months);
  return pgMais.filter((r) => {
    if (!/p&g\+\s*volume/i.test(r.tipo)) return false;
    if (!monthSet.has(r.data)) return false;
    if (!inList(r.rede, f.rede)) return false;
    const inf = info.get(r.rede);
    // Rede fora do escopo atual de `rows` (ex.: excluída pelo filtro de equipe comercial
    // Gerente/Supervisor/Vendedor, que já veio aplicado em `rows`) — não deve contar aqui.
    if (!inf) return false;
    if (!inList(inf.cluster, f.cluster)) return false;
    if (!inList(inf.canal, f.canal)) return false;
    if (!inList(inf.distribuidor, f.distribuidor)) return false;
    return true;
  });
}

const pgBrandLabel = (tipo: string) => tipo.replace(/^p&g\+\s*volume\s*/i, "").trim();

/** "Atingiu" = realizado >= meta na linha (rede + tipo). A "marca" é o Tipo sem o prefixo "P&G+ Volume ". */
export function computePgVolumeBrands(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgVolumeBrand[] {
  const map = new Map<string, PgVolumeBrand>();
  for (const r of filterPgVolumeRows(pgMais, rows, f, months)) {
    const label = pgBrandLabel(r.tipo);
    const cur = map.get(label) ?? { label, ok: 0, total: 0 };
    cur.total += 1;
    if (r.realizado >= r.meta) cur.ok += 1;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.ok / Math.max(1, b.total) - a.ok / Math.max(1, a.total));
}

/** Investimento gerado vs potencial por marca (mesmo filtro/agrupamento de computePgVolumeBrands). */
export function computePgVolumeInvestByBrand(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgVolumeInvestBrand[] {
  const map = new Map<string, PgVolumeInvestBrand>();
  for (const r of filterPgVolumeRows(pgMais, rows, f, months)) {
    const label = pgBrandLabel(r.tipo);
    const cur = map.get(label) ?? { label, gerado: 0, potencial: 0 };
    cur.gerado += r.gerado;
    cur.potencial += r.potencial;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.gerado / Math.max(1, b.potencial) - a.gerado / Math.max(1, a.potencial));
}

export type PgVolumeCell = {
  meta: number;
  realizado: number;
  gap: number; // nunca negativo — 0 quando a meta já foi atingida/superada
  potencial: number;
  gerado: number;
};
export type PgVolumeTableRow = { rede: string; cells: Record<string, PgVolumeCell> };
export type PgVolumeTable = { brands: string[]; rows: PgVolumeTableRow[] };

/** Tabela "Resumo Redes": uma linha por rede, com Meta/Realizado/Gap/Potencial/Gerado por marca (mecânica). */
export function computePgVolumeTable(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgVolumeTable {
  const brandSet = new Set<string>();
  const byRede = new Map<string, Record<string, PgVolumeCell>>();
  for (const r of filterPgVolumeRows(pgMais, rows, f, months)) {
    const label = pgBrandLabel(r.tipo);
    brandSet.add(label);
    const cells = byRede.get(r.rede) ?? {};
    const cell = cells[label] ?? { meta: 0, realizado: 0, gap: 0, potencial: 0, gerado: 0 };
    cell.meta += r.meta;
    cell.realizado += r.realizado;
    cell.gap = Math.max(0, cell.meta - cell.realizado);
    cell.potencial += r.potencial;
    cell.gerado += r.gerado;
    cells[label] = cell;
    byRede.set(r.rede, cells);
  }
  const brands = [...brandSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tableRows = [...byRede.entries()]
    .map(([rede, cells]) => ({ rede, cells }))
    .sort((a, b) => a.rede.localeCompare(b.rede, "pt-BR"));
  return { brands, rows: tableRows };
}

/**
 * P&G+ Mix: mesma fonte/estrutura do P&G+ Volume (Rede + Data cruzados com o dataset
 * principal para os filtros de cluster/canal/distribuidor), mas com uma mecânica de
 * "atingiu" diferente — não é realizado >= meta, e sim a relação realizado/meta bater
 * um percentual mínimo que varia por marca/categoria (AGs): >= 75% para Pampers e
 * >= 85% para Gillette.
 */
function filterPgMixRows(pgMais: PgMaisRow[], rows: Row[], f: Filters, months: string[]): PgMaisRow[] {
  const info = new Map<string, { cluster: string; canal: string; distribuidor: string; mes: string }>();
  for (const r of rows) {
    const cur = info.get(r.rede);
    if (!cur || r.mes > cur.mes) {
      info.set(r.rede, { cluster: r.cluster, canal: r.canal, distribuidor: r.distribuidor, mes: r.mes });
    }
  }
  const monthSet = new Set(months);
  return pgMais.filter((r) => {
    if (!/p&g\+\s*mix/i.test(r.tipo)) return false;
    if (!monthSet.has(r.data)) return false;
    if (!inList(r.rede, f.rede)) return false;
    const inf = info.get(r.rede);
    if (!inf) return false;
    if (!inList(inf.cluster, f.cluster)) return false;
    if (!inList(inf.canal, f.canal)) return false;
    if (!inList(inf.distribuidor, f.distribuidor)) return false;
    return true;
  });
}

const pgMixBrandLabel = (tipo: string) => tipo.replace(/^p&g\+\s*mix\s*/i, "").trim();

/** Percentual mínimo de realizado/meta para a rede ser considerada "atingiu" no P&G+ Mix, por marca. */
export function pgMixThreshold(label: string): number {
  if (/pampers/i.test(label)) return 0.75;
  if (/gillette/i.test(label)) return 0.85;
  return 1;
}

/** "Atingiu" = realizado/meta >= threshold da marca (75% Pampers, 85% Gillette). */
export function computePgMixBrands(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgVolumeBrand[] {
  const map = new Map<string, PgVolumeBrand>();
  for (const r of filterPgMixRows(pgMais, rows, f, months)) {
    const label = pgMixBrandLabel(r.tipo);
    const cur = map.get(label) ?? { label, ok: 0, total: 0 };
    cur.total += 1;
    const ratio = r.meta > 0 ? r.realizado / r.meta : 1;
    if (ratio >= pgMixThreshold(label)) cur.ok += 1;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.ok / Math.max(1, b.total) - a.ok / Math.max(1, a.total));
}

/** Tabela "Resumo Redes" do P&G+ Mix — mesmo formato de computePgVolumeTable (potencial/gerado não se aplicam, ficam 0). */
export function computePgMixTable(
  pgMais: PgMaisRow[],
  rows: Row[],
  f: Filters,
  months: string[],
): PgVolumeTable {
  const brandSet = new Set<string>();
  const byRede = new Map<string, Record<string, PgVolumeCell>>();
  for (const r of filterPgMixRows(pgMais, rows, f, months)) {
    const label = pgMixBrandLabel(r.tipo);
    brandSet.add(label);
    const cells = byRede.get(r.rede) ?? {};
    const cell = cells[label] ?? { meta: 0, realizado: 0, gap: 0, potencial: 0, gerado: 0 };
    cell.meta += r.meta;
    cell.realizado += r.realizado;
    cell.gap = Math.max(0, cell.meta - cell.realizado);
    cell.potencial += r.potencial;
    cell.gerado += r.gerado;
    cells[label] = cell;
    byRede.set(r.rede, cells);
  }
  const brands = [...brandSet].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tableRows = [...byRede.entries()]
    .map(([rede, cells]) => ({ rede, cells }))
    .sort((a, b) => a.rede.localeCompare(b.rede, "pt-BR"));
  return { brands, rows: tableRows };
}

/** Se uma célula do P&G+ (Volume ou Mix) conta como "atingida" pela mecânica da rede. */
export function pgCellAtingiu(kind: "volume" | "mix", brand: string, cell: PgVolumeCell): boolean {
  if (cell.meta <= 0) return true;
  const threshold = kind === "mix" ? pgMixThreshold(brand) : 1;
  return cell.realizado / cell.meta >= threshold;
}
