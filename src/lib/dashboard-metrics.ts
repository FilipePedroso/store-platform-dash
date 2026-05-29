import type { Row } from "./dashboard-data";

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

export function computeKpis(
  allRows: Row[],
  baseRows: Row[],
  selectedMonths: string[],
): Kpis {
  const monthSet = new Set(selectedMonths);
  const monthRows = baseRows.filter((r) => monthSet.has(r.mes));
  const gerado = sum(monthRows, "gerado");
  const potencial = sum(monthRows, "potencial");
  const faturamento = sum(monthRows, "faturamento");
  const agBatidos = sum(monthRows, "agBatidos");
  const qtdAG = sum(monthRows, "qtdAG");
  const cnpjsAtivos = sum(monthRows, "cnpjs");

  const redesAtivas = new Set(monthRows.map((r) => r.rede)).size;
  const redesSortimentoOk = new Set(
    monthRows.filter((r) => r.sortimento >= 0.9).map((r) => r.rede),
  ).size;

  // Previous month comparison only when exactly one month is selected
  const singleMonth = selectedMonths.length === 1 ? selectedMonths[0] : null;
  const prevMonth = singleMonth ? previousMonth(allRows, singleMonth) : null;
  const prevRows = prevMonth ? baseRows.filter((r) => r.mes === prevMonth) : [];
  const prevGerado = sum(prevRows, "gerado");
  const prevPotencial = sum(prevRows, "potencial");
  const prevAg = sum(prevRows, "agBatidos");
  const prevQtd = sum(prevRows, "qtdAG");
  const prevRedesOk = new Set(prevRows.filter((r) => r.sortimento >= 0.9).map((r) => r.rede)).size;

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

export type ClusterBar = { cluster: string; potencial: number; gerado: number };

export function computeByCluster(monthRows: Row[]): ClusterBar[] {
  const map = new Map<string, ClusterBar>();
  for (const r of monthRows) {
    const k = r.cluster || "—";
    const cur = map.get(k) ?? { cluster: k, potencial: 0, gerado: 0 };
    cur.potencial += r.potencial;
    cur.gerado += r.gerado;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.potencial - a.potencial);
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
    if (r.sortimento >= 0.9) {
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
  sortimento: number;
  gerado: number;
  potencial: number;
  qtdAG: number;
  agBatidos: number;
  gapAgs: number;
  gapAgs90: number;
};

export function computeRanking(monthRows: Row[], topN = 5): RankRow[] {
  const map = new Map<
    string,
    { rede: string; gerado: number; potencial: number; qtdAG: number; agBatidos: number }
  >();
  for (const r of monthRows) {
    const cur = map.get(r.rede);
    if (cur) {
      cur.gerado += r.gerado;
      cur.potencial += r.potencial;
      cur.qtdAG += r.qtdAG;
      cur.agBatidos += r.agBatidos;
    } else {
      map.set(r.rede, {
        rede: r.rede,
        gerado: r.gerado,
        potencial: r.potencial,
        qtdAG: r.qtdAG,
        agBatidos: r.agBatidos,
      });
    }
  }
  return [...map.values()]
    .map((v) => {
      const sortimento = v.qtdAG > 0 ? v.agBatidos / v.qtdAG : 0;
      const gapAgs = Math.max(0, v.qtdAG - v.agBatidos);
      const gapAgs90 = Math.max(0, Math.ceil(0.9 * v.qtdAG) - v.agBatidos);
      return { ...v, sortimento, gapAgs, gapAgs90 };
    })
    .sort((a, b) => b.sortimento - a.sortimento || b.gerado - a.gerado)
    .slice(0, topN);
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
  new Set(rows.filter((r) => r.sortimento >= 0.9).map((r) => r.rede)).size;
export const reduceAtingimento = (rows: Row[]) => {
  const p = rows.reduce((a, r) => a + r.potencial, 0);
  const g = rows.reduce((a, r) => a + r.gerado, 0);
  return p > 0 ? g / p : 0;
};
