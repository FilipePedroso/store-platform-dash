import { createFileRoute } from "@tanstack/react-router";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  Layers,
  MapPin,
  Network,
  Building2,
  CalendarRange,
  Banknote,
  Check,
  Target,
  Receipt,
  BarChart3,
  TrendingUp,
  TrendingDown,
  KeyRound,
  PieChart,
  Star,
  ChevronDown,
  ChevronRight,
  X,
  Download,
  Rocket,
  Users,
  Maximize2,
  ListFilter,
  AlertTriangle,
  LayoutGrid,
  Table2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCountUp, AnimatedNumber } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";
import {
  loadRowsFromCloud,
  formatUpdatedAt,
  type Row,
  type AgRow,
  type DataMeta,
  type EstruturaRow,
  type IniciativaRow,
  type EstruturaGrupoRow,
  type SkuRow,
  type ChaveRow,
  type PgMaisRow,
} from "@/lib/dashboard-data";



import {
  EMPTY_FILTERS,
  applyAllFilters,
  applyBaseFilters,
  computeAgsByCanalMix,
  computeEvolution,
  computeKpis,
  computeMonthlySeries,
  computePgVolumeBrands,
  computePgVolumeInvestByBrand,
  computePgVolumeTable,
  computeRanking,
  computeTopMovers,
  computeInvestmentConcentration,
  fmtBRL,
  fmtMonth,
  fmtPct,
  latestMonth,
  previousMonth,
  reduceAtingimento,
  reduceRedesOk,
  reduceSumFaturamento,
  reduceSumGerado,
  reduceSumPotencial,
  optionsFor,
  uniqueMonths,
  isSortOk,
  isChaveRegime,
  type Filters,
  type RankRow,
  type TopMoverRow,
  type ConcentrationStats,
  type PgVolumeBrand,
  type PgVolumeInvestBrand,
  type PgVolumeTable,
  type PgVolumeCell,
} from "@/lib/dashboard-metrics";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Store Platform — Painel de Resultados" },
      {
        name: "description",
        content:
          "Painel de performance das redes participantes da Store Platform: investimento gerado, sortimento, atingimento de verba e faturamento.",
      },
    ],
  }),
  component: Dashboard,
});

const GREEN = "#1D9E75";
const BLUE = "#378ADD";
const ORANGE = "#EF9F27";
const PURPLE = "#7F77DD";
const RED = "#E24B4A";
const LIGHT_BLUE = "#B5D4F4";
const PINK = "#D5548A";
const PALETTE = [GREEN, PURPLE, ORANGE, BLUE, RED, LIGHT_BLUE, "#5DCAA5", "#F1B257"];
/** Alcance máximo de AGs faltantes para uma rede entrar no card "Quick wins". */
const QUICK_WIN_MAX_GAP = 10;

/** Remove o mês mais recente de uma série mensal (usado pelo toggle "Mostrar mês recente"). */
function trimLatestMonth<
  T extends { months: string[]; total: number[]; groups: { name: string; values: number[] }[] },
>(series: T, show: boolean): T {
  if (show || series.months.length === 0) return series;
  return {
    ...series,
    months: series.months.slice(0, -1),
    total: series.total.slice(0, -1),
    groups: series.groups.map((g) => ({ ...g, values: g.values.slice(0, -1) })),
  };
}

/** Mostra "Chave N" (regime novo) ou o % de sortimento legado, conforme o dado disponível. */
function fmtChaveOrPct(chave: number | null, sortimento: number): string {
  return chave != null ? `Chave ${chave}` : fmtPct(sortimento, 0);
}
/** Cor por chave (2=verde/1=laranja/0=vermelho), mantendo a mesma paleta do threshold de %. */
function colorForChave(chave: number): string {
  return chave >= 2 ? GREEN : chave >= 1 ? ORANGE : RED;
}

/**
 * Mede a altura renderizada de um elemento via ResizeObserver — usado para fazer um card
 * (ex.: Quick wins) acompanhar a altura de um irmão cujo conteúdo é imprevisível, algo que
 * o CSS Grid sozinho não resolve quando esse irmão tem uma área com scroll (overflow:auto
 * não limita o tamanho intrínseco usado no cálculo da linha do grid).
 */
function useMeasuredHeight<T extends HTMLElement>(): [(node: T | null) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // Callback ref: o React garante chamá-lo de forma síncrona com o nó real do DOM
  // assim que ele monta/desmonta — evita a corrida de timing de ler `ref.current`
  // separadamente num useEffect/useLayoutEffect.
  const setRef = useCallback((node: T | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!node) return;
    setHeight(node.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h != null) setHeight(h);
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  return [setRef, height];
}

/** true a partir do breakpoint `lg` do Tailwind (1024px), onde os cards ficam lado a lado. */
function useIsLgUp(): boolean {
  const [isLgUp, setIsLgUp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsLgUp(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsLgUp(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isLgUp;
}

export function Dashboard() {
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [allAgRows, setAllAgRows] = useState<AgRow[]>([]);
  const [estrutura, setEstrutura] = useState<EstruturaRow[]>([]);
  const [allIniciativas, setAllIniciativas] = useState<IniciativaRow[]>([]);
  const [estruturaGrupos, setEstruturaGrupos] = useState<EstruturaGrupoRow[]>([]);
  const [allSkuRows, setAllSkuRows] = useState<SkuRow[]>([]);
  const [chaves, setChaves] = useState<ChaveRow[]>([]);
  const [pgMais, setPgMais] = useState<PgMaisRow[]>([]);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showLatestMonth, setShowLatestMonth] = useState(true);
  const [pgPlusEnabled, setPgPlusEnabled] = useState(true);
  // Toggles independentes do "P&G+" dos Indicadores principais — cada card decide por si só
  // se soma o P&G+ Volume ao investimento legado.
  const [concentrationPgEnabled, setConcentrationPgEnabled] = useState(false);
  const [topMoversPgEnabled, setTopMoversPgEnabled] = useState(false);

  const refresh = async () => {
    const { rows, agRows, estrutura, iniciativas, estruturaGrupos, skuRows, chaves, pgMais, meta } =
      await loadRowsFromCloud();
    setAllRows(rows);
    setAllAgRows(agRows);
    setEstrutura(estrutura);
    setAllIniciativas(iniciativas);
    setEstruturaGrupos(estruturaGrupos);
    setAllSkuRows(skuRows);
    setChaves(chaves);
    setPgMais(pgMais);
    setMeta(meta);
  };

  useEffect(() => {
    refresh();
  }, []);

  // Defer heavy recomputations so the filter UI (checkboxes) reflete
  // instantaneamente o clique, e o resto da página recalcula em segundo plano
  // sem travar a interação.
  const dFilters = useDeferredValue(filters);

  // Conjunto de pares rede+distribuidor permitidos pelos filtros de código (Gv/Sv/Rv).
  // Isso mantém o card principal e a tabela de equipe na mesma granularidade.
  const allowedEstruturaKeys = useMemo<Set<string> | null>(() => {
    if (dFilters.gv.length === 0 && dFilters.sv.length === 0 && dFilters.rv.length === 0) return null;
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const compose = (code: string, name: string) => (code ? (name ? `${code} - ${name}` : code) : "");
    const set = new Set<string>();
    for (const e of estrutura) {
      if (
        inList(compose(e.gv, e.gvNome), dFilters.gv) &&
        inList(compose(e.sv, e.svNome), dFilters.sv) &&
        inList(compose(e.rv, e.rvNome), dFilters.rv)
      ) {
        set.add(`${e.rede}||${e.distribuidor}`);
      }
    }
    return set;
  }, [estrutura, dFilters.gv, dFilters.sv, dFilters.rv]);

  const rows = useMemo(
    () => (allowedEstruturaKeys ? allRows.filter((r) => allowedEstruturaKeys.has(`${r.rede}||${r.distribuidor}`)) : allRows),
    [allRows, allowedEstruturaKeys],
  );
  const agRows = useMemo(
    () => (allowedEstruturaKeys ? allAgRows.filter((r) => allowedEstruturaKeys.has(`${r.rede}||${r.distribuidor}`)) : allAgRows),
    [allAgRows, allowedEstruturaKeys],
  );
  const skuRows = useMemo(
    () => (allowedEstruturaKeys ? allSkuRows.filter((r) => allowedEstruturaKeys.has(`${r.rede}||${r.distribuidor}`)) : allSkuRows),
    [allSkuRows, allowedEstruturaKeys],
  );


  const months = useMemo(() => uniqueMonths(rows), [rows]);
  const selectedMonths = useMemo(() => {
    if (dFilters.mes.length > 0) return dFilters.mes;
    const latest = latestMonth(rows);
    return latest ? [latest] : [];
  }, [dFilters.mes, rows]);
  const isAccumulated = dFilters.mes.length > 1 || dFilters.mes.length === months.length;
  const latestMonthOverall = useMemo(() => latestMonth(rows), [rows]);

  const baseRows = useMemo(() => applyBaseFilters(rows, dFilters), [rows, dFilters]);
  const monthRows = useMemo(() => {
    const set = new Set(selectedMonths);
    return baseRows.filter((r) => set.has(r.mes));
  }, [baseRows, selectedMonths]);
  // Alguns cards (ver MixedPeriodBadge) não fazem sentido somados entre vários meses —
  // quando o filtro de mês é múltiplo/vazio, eles travam no mês mais recente do dataset.
  const lockedMonthRows = useMemo(
    () => (latestMonthOverall ? baseRows.filter((r) => r.mes === latestMonthOverall) : []),
    [baseRows, latestMonthOverall],
  );
  const effectiveMonthRows = isAccumulated ? lockedMonthRows : monthRows;
  // Mês que efetivamente rege a fórmula exibida (o travado, ou o único selecionado).
  const effectiveMonth = isAccumulated ? latestMonthOverall : (selectedMonths[0] ?? null);
  const chaveMode = effectiveMonth ? isChaveRegime(effectiveMonth) : false;
  const kpis = useMemo(
    () => computeKpis(rows, baseRows, selectedMonths, pgPlusEnabled ? pgMais : []),
    [rows, baseRows, selectedMonths, pgMais, pgPlusEnabled],
  );
  const lockedKpis = useMemo(
    () => computeKpis(rows, baseRows, latestMonthOverall ? [latestMonthOverall] : [], pgPlusEnabled ? pgMais : []),
    [rows, baseRows, latestMonthOverall, pgMais, pgPlusEnabled],
  );
  const sortimentoByCluster = useMemo(() => {
    const order = ["Diamante", "Ouro", "Prata"] as const;
    const colors: Record<string, string> = {
      Diamante: PURPLE,
      Ouro: "#F1C40F",
      Prata: "#9CA3AF",
    };
    const map = new Map<string, { ok: Set<string>; all: Set<string> }>();
    for (const r of effectiveMonthRows) {
      const k = r.cluster || "—";
      const cur = map.get(k) ?? { ok: new Set<string>(), all: new Set<string>() };
      cur.all.add(r.rede);
      if (isSortOk(r)) cur.ok.add(r.rede);
      map.set(k, cur);
    }
    return order.map((name) => {
      const v = map.get(name);
      return {
        label: name,
        ok: v ? v.ok.size : 0,
        total: v ? v.all.size : 0,
        color: colors[name],
      };
    });
  }, [effectiveMonthRows]);
  const evolution = useMemo(() => computeEvolution(baseRows), [baseRows]);
  const ranking = useMemo(
    () => computeRanking(effectiveMonthRows, chaves, 9999),
    [effectiveMonthRows, chaves],
  );
  const prevEffectiveMonth = useMemo(
    () => (effectiveMonth ? previousMonth(rows, effectiveMonth) : null),
    [rows, effectiveMonth],
  );
  const topMovers = useMemo(
    () =>
      computeTopMovers(
        baseRows,
        effectiveMonth,
        prevEffectiveMonth,
        topMoversPgEnabled ? pgMais : [],
        5,
      ),
    [baseRows, effectiveMonth, prevEffectiveMonth, pgMais, topMoversPgEnabled],
  );
  const quickWins = useMemo(
    () =>
      ranking
        .map((r) => ({ r, gap: r.chaveRegime ? r.gapProximaChave : r.gapAgs90 }))
        .filter(({ gap }) => gap >= 1 && gap <= QUICK_WIN_MAX_GAP)
        .sort((a, b) => a.gap - b.gap || b.r.gerado - a.r.gerado)
        .map(({ r }) => r),
    [ranking],
  );
  const concentration = useMemo(
    () =>
      computeInvestmentConcentration(
        effectiveMonthRows,
        concentrationPgEnabled ? pgMais : [],
        effectiveMonth ? [effectiveMonth] : [],
      ),
    [effectiveMonthRows, pgMais, concentrationPgEnabled, effectiveMonth],
  );
  // Faz o card "Quick wins" acompanhar a altura de Concentração + Top Crescimentos empilhados
  // (só faz sentido quando os dois ficam lado a lado, a partir do breakpoint lg).
  const [concentrationColRef, concentrationColHeight] = useMeasuredHeight<HTMLDivElement>();
  const isLgUp = useIsLgUp();
  const canalMix = useMemo(() => computeAgsByCanalMix(monthRows), [monthRows]);
  const pgVolumeBrands = useMemo(
    () => computePgVolumeBrands(pgMais, rows, dFilters, selectedMonths),
    [pgMais, rows, dFilters, selectedMonths],
  );
  const pgVolumeInvest = useMemo(
    () => computePgVolumeInvestByBrand(pgMais, rows, dFilters, selectedMonths),
    [pgMais, rows, dFilters, selectedMonths],
  );
  const pgVolumeTable = useMemo(
    () => computePgVolumeTable(pgMais, rows, dFilters, selectedMonths),
    [pgMais, rows, dFilters, selectedMonths],
  );
  // Com uma única rede filtrada, o card "Atingimento por marca" troca o % de redes
  // (binário: bateu ou não) pela relação real Meta x Realizado dessa rede.
  const pgSingleRedeCells = useMemo(
    () => (dFilters.rede.length === 1 ? (pgVolumeTable.rows[0]?.cells ?? null) : null),
    [dFilters.rede, pgVolumeTable],
  );

  // Filtra a aba "iniciativas" pelos mesmos filtros (sem mês — não há campo mês)
  const filteredIniciativas = useMemo(() => {
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const estruturaOk = allowedEstruturaKeys;
    return allIniciativas.filter(
      (r) =>
        inList(r.cluster, dFilters.cluster) &&
        inList(r.canal, dFilters.canal) &&
        inList(r.rede, dFilters.rede) &&
        inList(r.distribuidor, dFilters.distribuidor) &&
        (estruturaOk == null || estruturaOk.has(`${r.rede}||${r.distribuidor}`)),
    );
  }, [allIniciativas, dFilters, allowedEstruturaKeys]);

  // Métricas por iniciativa: total batido/total + breakdown por cluster
  const iniciativasStats = useMemo(() => {
    if (filteredIniciativas.length === 0) return [] as {
      name: string;
      ok: number;
      total: number;
      byCluster: { label: string; ok: number; total: number; color: string }[];
    }[];
    const clusterOrder = ["Diamante", "Ouro", "Prata"] as const;
    const clusterColors: Record<string, string> = {
      Diamante: PURPLE,
      Ouro: "#F1C40F",
      Prata: "#9CA3AF",
    };
    // Descobre nomes preservando a ordem da primeira linha
    const names: string[] = [];
    const seen = new Set<string>();
    for (const r of filteredIniciativas) {
      for (const n of Object.keys(r.iniciativas)) {
        if (n.trim().toLowerCase() === "pantene pocahontas") continue;
        if (!seen.has(n)) {
          seen.add(n);
          names.push(n);
        }
      }
    }
    return names.map((name) => {
      let ok = 0;
      const total = filteredIniciativas.length;
      const byCluster = clusterOrder.map((label) => ({
        label,
        ok: 0,
        total: 0,
        color: clusterColors[label],
      }));
      for (const r of filteredIniciativas) {
        const val = Number(r.iniciativas[name] ?? 0) > 0 ? 1 : 0;
        if (val) ok++;
        const c = byCluster.find((b) => b.label === r.cluster);
        if (c) {
          c.total++;
          if (val) c.ok++;
        }
      }
      return { name, ok, total, byCluster };
    });
  }, [filteredIniciativas]);

  // Aplica os mesmos filtros (base + mês) ao dataset "dados ags"
  const agMonthRows = useMemo(() => {
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const monthSet = new Set(selectedMonths);
    return agRows.filter(
      (r) =>
        inList(r.cluster, dFilters.cluster) &&
        inList(r.canal, dFilters.canal) &&
        inList(r.rede, dFilters.rede) &&
        inList(r.distribuidor, dFilters.distribuidor) &&
        monthSet.has(r.mes),
    );
  }, [agRows, dFilters, selectedMonths]);


  // Filtros aplicados ao dataset de SKUs (com mês — usado na tabela de Grupos não batidos)
  const skuMonthRows = useMemo(() => {
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const monthSet = new Set(selectedMonths);
    return skuRows.filter(
      (r) =>
        inList(r.cluster, dFilters.cluster) &&
        inList(r.canal, dFilters.canal) &&
        inList(r.rede, dFilters.rede) &&
        inList(r.distribuidor, dFilters.distribuidor) &&
        monthSet.has(r.mes),
    );
  }, [skuRows, dFilters, selectedMonths]);


  // Mapa: activationGroup -> lista de SKUs (ean + descricao)
  const skusByGroup = useMemo(() => {
    const map = new Map<string, { ean: string; descricao: string }[]>();
    const seen = new Map<string, Set<string>>();
    for (const e of estruturaGrupos) {
      if (!e.activationGroup || !e.ean) continue;
      let arr = map.get(e.activationGroup);
      let dedup = seen.get(e.activationGroup);
      if (!arr) {
        arr = [];
        map.set(e.activationGroup, arr);
        dedup = new Set();
        seen.set(e.activationGroup, dedup);
      }
      if (!dedup!.has(e.ean)) {
        dedup!.add(e.ean);
        arr.push({ ean: e.ean, descricao: e.descricao });
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.ean.localeCompare(b.ean));
    }
    return map;
  }, [estruturaGrupos]);

  // Mapa: `${rede}|${activationGroup}|${ean}` -> volume somado (mês corrente)
  const skuVolumeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of skuMonthRows) {
      const k = `${r.rede}|${r.activationGroup}|${r.dsEan}`;
      map.set(k, (map.get(k) ?? 0) + (Number(r.volume) || 0));
    }
    return map;
  }, [skuMonthRows]);

  // Sortimento/Chave por rede no mês efetivo (travado em período misto — ver effectiveMonthRows)
  const sortimentoMap = useMemo(() => {
    const map = new Map<string, { sortimento: number; chave: number | null }>();
    for (const r of effectiveMonthRows) map.set(r.rede, { sortimento: r.sortimento, chave: r.chave });
    return map;
  }, [effectiveMonthRows]);

  // Tabela "Grupos não batidos": positivação == 0
  const gruposNaoBatidos = useMemo(() => {
    return agMonthRows
      .filter((r) => Number(r.positivacao) === 0)
      .map((r) => ({
        rede: r.rede,
        sortimento: sortimentoMap.get(r.rede)?.sortimento ?? 0,
        chave: sortimentoMap.get(r.rede)?.chave ?? null,
        target: r.targetUnidades,
        atributo: r.atributo,
        valor: r.valor,
      }))
      .sort((a, b) => a.rede.localeCompare(b.rede) || a.atributo.localeCompare(b.atributo));
  }, [agMonthRows, sortimentoMap]);

  // Tabela "Sortimento de Mix": todos os grupos (batidos ou não)
  const sortimentoMix = useMemo(() => {
    return agMonthRows
      .map((r) => ({
        rede: r.rede,
        sortimento: sortimentoMap.get(r.rede)?.sortimento ?? 0,
        chave: sortimentoMap.get(r.rede)?.chave ?? null,
        target: r.targetUnidades,
        atributo: r.atributo,
        valor: r.valor,
      }))
      .sort((a, b) => a.rede.localeCompare(b.rede) || a.atributo.localeCompare(b.atributo));
  }, [agMonthRows, sortimentoMap]);


  // Históricos mês a mês (gráficos de linha) — usam baseRows (sem filtro de mês)
  const histGerado = useMemo(
    () => computeMonthlySeries(baseRows, reduceSumGerado, "cluster"),
    [baseRows],
  );
  const histPotencial = useMemo(
    () => computeMonthlySeries(baseRows, reduceSumPotencial),
    [baseRows],
  );
  const histRedesOk = useMemo(
    () => computeMonthlySeries(baseRows, reduceRedesOk, "cluster"),
    [baseRows],
  );
  const histConversao = useMemo(() => {
    return histRedesOk.months.map((m) => {
      const monthData = baseRows.filter((r) => r.mes === m);
      const ativas = new Set(monthData.map((r) => r.rede)).size;
      const ok = new Set(monthData.filter(isSortOk).map((r) => r.rede)).size;
      return ativas > 0 ? ok / ativas : 0;
    });
  }, [baseRows, histRedesOk.months]);
  const histAtingimento = useMemo(
    () => computeMonthlySeries(baseRows, reduceAtingimento, "cluster"),
    [baseRows],
  );
  const histFaturamento = useMemo(
    () => computeMonthlySeries(baseRows, reduceSumFaturamento, "cluster"),
    [baseRows],
  );

  // Versões exibidas nos gráficos, respeitando o toggle "Mostrar mês recente"
  const histGeradoView = useMemo(
    () => trimLatestMonth(histGerado, showLatestMonth),
    [histGerado, showLatestMonth],
  );
  const histPotencialView = useMemo(
    () => trimLatestMonth(histPotencial, showLatestMonth),
    [histPotencial, showLatestMonth],
  );
  const histRedesOkView = useMemo(
    () => trimLatestMonth(histRedesOk, showLatestMonth),
    [histRedesOk, showLatestMonth],
  );
  const histConversaoView = useMemo(
    () => (showLatestMonth ? histConversao : histConversao.slice(0, -1)),
    [histConversao, showLatestMonth],
  );
  const histAtingimentoView = useMemo(
    () => trimLatestMonth(histAtingimento, showLatestMonth),
    [histAtingimento, showLatestMonth],
  );
  const histFaturamentoView = useMemo(
    () => trimLatestMonth(histFaturamento, showLatestMonth),
    [histFaturamento, showLatestMonth],
  );


  // Filter options — each filter adapts to the other selected filters
  const clusterOpts = useMemo(() => optionsFor(rows, dFilters, "cluster"), [rows, dFilters]);
  const canalOpts = useMemo(() => optionsFor(rows, dFilters, "canal"), [rows, dFilters]);
  const redeOpts = useMemo(() => optionsFor(rows, dFilters, "rede"), [rows, dFilters]);
  const distribOpts = useMemo(() => optionsFor(rows, dFilters, "distribuidor"), [rows, dFilters]);
  const monthOpts = useMemo(() => optionsFor(rows, dFilters, "mes"), [rows, dFilters]);

  // Opções para os filtros de código (Gv/Sv/Rv), cada um adaptado aos outros dois
  // e ao filtro de rede atualmente selecionado.
  const codeOpts = useMemo(() => {
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const compose = (code: string, name: string) => (code ? (name ? `${code} - ${name}` : code) : "");
    const redeSel = dFilters.rede;
    const distSel = dFilters.distribuidor;
    const pick = (key: "gv" | "sv" | "rv") => {
      const nameKey = (key + "Nome") as "gvNome" | "svNome" | "rvNome";
      const set = new Set<string>();
      for (const e of estrutura) {
        if (!inList(e.rede, redeSel)) continue;
        if (!inList(e.distribuidor, distSel)) continue;
        if (key !== "gv" && !inList(compose(e.gv, e.gvNome), dFilters.gv)) continue;
        if (key !== "sv" && !inList(compose(e.sv, e.svNome), dFilters.sv)) continue;
        if (key !== "rv" && !inList(compose(e.rv, e.rvNome), dFilters.rv)) continue;
        const label = compose(e[key], e[nameKey]);
        if (label) set.add(label);
      }
      for (const v of dFilters[key]) set.add(v);
      return [...set].sort();
    };
    return { gv: pick("gv"), sv: pick("sv"), rv: pick("rv") };
  }, [estrutura, dFilters.rede, dFilters.distribuidor, dFilters.gv, dFilters.sv, dFilters.rv]);




  if (!meta) {
    return <div className="min-h-screen bg-[#0f0f10]" />;
  }

  return (
    <div className="min-h-screen bg-[#0f0f10] text-neutral-200 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="text-[15px] font-medium text-neutral-100 flex items-center gap-2">
            <LayoutDashboard size={16} style={{ color: BLUE }} />
            Store Platform — Painel de Resultados
          </h1>
          <p className="text-[11px] text-neutral-400 mt-1">
            Histórico de performance das redes participantes · atualizado em{" "}
            {formatUpdatedAt(meta)}
          </p>
        </div>
      </div>




      {/* Filtros */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        clusterOpts={clusterOpts}
        canalOpts={canalOpts}
        redeOpts={redeOpts}
        distribOpts={distribOpts}
        monthOpts={monthOpts}
        gvOpts={codeOpts.gv}
        svOpts={codeOpts.sv}
        rvOpts={codeOpts.rv}
      />

      {/* Indicadores */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="text-[11px] font-medium text-neutral-400 tracking-wider uppercase">
          Indicadores principais
          {isAccumulated
            ? ` · Acumulado (${selectedMonths.length} meses)`
            : selectedMonths.length === 1
              ? ` · ${fmtMonth(selectedMonths[0])}`
              : ""}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer select-none shrink-0">
          P&amp;G+
          <Switch
            checked={pgPlusEnabled}
            onCheckedChange={setPgPlusEnabled}
            className="shadow-none focus-visible:ring-offset-0 focus-visible:ring-[#378ADD] data-[state=checked]:bg-[#0E2E4D] data-[state=checked]:border-[#378ADD] data-[state=unchecked]:bg-neutral-800 data-[state=unchecked]:border-neutral-700"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
        <KpiCard
          color={GREEN}
          icon={<Banknote size={13} style={{ color: GREEN }} />}
          label="Investimento gerado"
          value={<AnimatedNumber value={kpis.gerado} format={(n) => fmtBRL(n)} />}
          valueColor="#3DD9A4"
          sub={`Potencial: ${fmtBRL(kpis.potencial)}`}
          progressLabel="Atingimento"
          progressValue={fmtPct(kpis.atingimentoVerba)}
          progressPct={Math.min(100, kpis.atingimentoVerba * 100)}
          animateDelay={0}
          rightStat={{
            label: "Faturamento",
            value: <AnimatedNumber value={kpis.faturamento} format={(n) => fmtBRL(n)} />,
          }}
          badge={
            kpis.geradoDeltaPct == null
              ? { text: "sem mês anterior", bg: "#1a1a1c", fg: "#888" }
              : {
                  text: `${kpis.geradoDeltaPct >= 0 ? "▲" : "▼"} ${(
                    kpis.geradoDeltaPct * 100
                  ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs mês ant.`,
                  bg: kpis.geradoDeltaPct >= 0 ? "#11402F" : "#3D1A1A",
                  fg: kpis.geradoDeltaPct >= 0 ? "#7DE5BD" : "#F08A8A",
                }
          }
        />

        <KpiCard
          color={ORANGE}
          icon={<Target size={13} style={{ color: ORANGE }} />}
          label="% Atingimento da verba"
          value={<AnimatedNumber value={kpis.atingimentoVerba} format={(n) => fmtPct(n)} delay={120} />}
          valueColor="#F1B257"
          sub="Invest. Gerado / Potencial"
          progressLabel="Meta: 85%"
          progressValue={
            kpis.atingimentoDeltaPP == null
              ? "—"
              : `${kpis.atingimentoDeltaPP >= 0 ? "+" : ""}${kpis.atingimentoDeltaPP.toFixed(1)} p.p.`
          }
          progressPct={Math.min(100, kpis.atingimentoVerba * 100)}
          animateDelay={120}
          badge={
            kpis.atingimentoVerba >= 0.85
              ? { text: "▲ Meta atingida", bg: "#11402F", fg: "#7DE5BD" }
              : { text: "▼ Abaixo da meta", bg: "#3D2A10", fg: "#F1B257" }
          }
        />
        <div className="relative min-h-0">
        {isAccumulated && <MixedPeriodBadge />}
        <KpiCard
          categoryTitle="Por Cluster"
          categoryBreakdown={sortimentoByCluster}
          color={BLUE}
          icon={<Check size={13} style={{ color: BLUE }} />}
          label={chaveMode ? "Redes com Chave 2" : "Redes com sortimento ≥ 90%"}
          value={
            <>
              <AnimatedNumber
                value={(isAccumulated ? lockedKpis : kpis).redesSortimentoOk}
                format={(n) => Math.round(n).toString()}
                delay={240}
              />{" "}
              <span className="text-[14px] text-neutral-400 font-normal">
                / {(isAccumulated ? lockedKpis : kpis).redesAtivas}
              </span>
            </>
          }
          valueColor="#5FA8E8"
          sub="Redes ativas no período"
          progressLabel="Taxa de conversão"
          progressValue={fmtPct((isAccumulated ? lockedKpis : kpis).taxaConversao)}
          progressPct={(isAccumulated ? lockedKpis : kpis).taxaConversao * 100}
          progressTarget={60}
          animateDelay={240}
          badge={
            (isAccumulated ? lockedKpis : kpis).redesOkDelta == null
              ? { text: "sem mês anterior", bg: "#1a1a1c", fg: "#888" }
              : {
                  text: `${(isAccumulated ? lockedKpis : kpis).redesOkDelta! >= 0 ? "+" : ""}${(isAccumulated ? lockedKpis : kpis).redesOkDelta} redes vs mês ant.`,
                  bg: "#0E2E4D",
                  fg: "#8BBEEC",
                }
          }
          footerRight={
            <span
              className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#241F4D", color: "#A39DE5" }}
            >
              {(isAccumulated ? lockedKpis : kpis).cnpjsAtivos.toLocaleString("pt-BR")} CNPJs ativos
            </span>
          }

        />
        </div>

        <div className="relative min-h-0">
          <div className="sm:absolute sm:inset-0">
            <IniciativasCard data={iniciativasStats} />
          </div>
        </div>

      </div>

      {/* P&G+ Volume */}
      <SectionLabel>
        P&G+ Volume
        {isAccumulated
          ? ` · Acumulado (${selectedMonths.length} meses)`
          : selectedMonths.length === 1
            ? ` · ${fmtMonth(selectedMonths[0])}`
            : ""}
      </SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-3">
        <PgVolumeInvestCard brands={pgVolumeInvest} distribuidores={dFilters.distribuidor} />
        <PgVolumeRingCard
          brands={pgVolumeBrands}
          singleRedeCells={pgSingleRedeCells}
          singleRede={dFilters.rede.length === 1 ? dFilters.rede[0] : null}
          distribuidores={dFilters.distribuidor}
        />
      </div>

      {/* Histórico mês a mês */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="text-[11px] font-medium text-neutral-400 tracking-wider uppercase">
          Histórico mês a mês
          {histGeradoView.months.length > 0
            ? ` · ${fmtMonth(histGeradoView.months[0])} → ${fmtMonth(histGeradoView.months[histGeradoView.months.length - 1])}`
            : ""}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer select-none shrink-0">
          Mostrar mês recente
          <Switch
            checked={showLatestMonth}
            onCheckedChange={setShowLatestMonth}
            className="shadow-none focus-visible:ring-offset-0 focus-visible:ring-[#378ADD] data-[state=checked]:bg-[#0E2E4D] data-[state=checked]:border-[#378ADD] data-[state=unchecked]:bg-neutral-800 data-[state=unchecked]:border-neutral-700"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-3">
        <LineHistoryCard
          icon={<Banknote size={13} style={{ color: GREEN }} />}
          title="Investimento gerado vs potencial"
          sub="Valores acumulados mensais (R$)"
          color={GREEN}
          months={histGeradoView.months}
          total={histGeradoView.total}
          groups={histGeradoView.groups}
          extra={{ name: "Potencial", values: histPotencialView.total, color: LIGHT_BLUE, dashed: true }}
          yFormat={(n) => fmtBRL(n)}
          pointFormat={(n) => fmtBRL(n)}
          badgeBg="#11402F"
          badgeFg="#7DE5BD"
          distribuidores={dFilters.distribuidor}
        />
        {(() => {
          const singleRede = dFilters.rede.length === 1 ? dFilters.rede[0] : null;
          if (singleRede) {
            // Antes da virada: % de sortimento (0..1). A partir da virada: chave atingida
            // (0/1/2), normalizada pra 0..1 (÷2) só pra caber no mesmo eixo do gráfico —
            // o rótulo do ponto mostra "Chave N", não %.
            const sortPorMes = histRedesOkView.months.map((m) => {
              const r = baseRows.find((rr) => rr.mes === m && rr.rede === singleRede);
              if (!r) return 0;
              return isChaveRegime(m) ? (r.chave ?? 0) / 2 : r.sortimento;
            });
            return (
              <LineHistoryCard
                icon={<Check size={13} style={{ color: BLUE }} />}
                title="Histórico de Atingimento de Redes"
                sub="Sortimento"
                color={BLUE}
                months={histRedesOkView.months}
                total={sortPorMes}
                groups={[]}
                yFormat={(n) => fmtPct(n, 0)}
                pointFormat={(n, i) =>
                  isChaveRegime(histRedesOkView.months[i]) ? `Chave ${Math.round(n * 2)}` : fmtPct(n, 1)
                }
                forceMax={1}
                badgeBg="#0E2E4D"
                badgeFg="#8BBEEC"
                distribuidores={dFilters.distribuidor}
              />
            );
          }
          return (
            <LineHistoryCard
              icon={<Check size={13} style={{ color: BLUE }} />}
              title="Histórico de Atingimento de Redes"
              sub="Qtd. de redes atingindo o mix mínimo"
              color={BLUE}
              months={histRedesOkView.months}
              total={histRedesOkView.total}
              groups={histRedesOkView.groups}
              yFormat={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              pointFormat={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              pointSubLabel={{
                values: histConversaoView,
                format: (n) => fmtPct(n, 0),
                threshold: 0.6,
                activeColor: "#22ff88",
              }}
              badgeBg="#0E2E4D"
              badgeFg="#8BBEEC"
              distribuidores={dFilters.distribuidor}
            />
          );
        })()}

        <LineHistoryCard
          icon={<Target size={13} style={{ color: ORANGE }} />}
          title="% Atingimento da verba"
          sub="Investimento gerado / Potencial (%)"
          color={ORANGE}
          months={histAtingimentoView.months}
          total={histAtingimentoView.total}
          groups={histAtingimentoView.groups}
          yFormat={(n) => fmtPct(n, 0)}
          pointFormat={(n) => fmtPct(n, 1)}
          reference={{ value: 0.85, label: "Meta 85%" }}
          forceMax={1}
          deltaMode="pp"
          badgeBg="#3D2A10"
          badgeFg="#F1B257"
          distribuidores={dFilters.distribuidor}
        />
        <LineHistoryCard
          icon={<Receipt size={13} style={{ color: PURPLE }} />}
          title="Faturamento mensal"
          sub="Valores acumulados mensais (R$)"
          color={PURPLE}
          months={histFaturamentoView.months}
          total={histFaturamentoView.total}
          groups={histFaturamentoView.groups}
          yFormat={(n) => fmtBRL(n)}
          pointFormat={(n) => fmtBRL(n)}
          badgeBg="#241F4D"
          badgeFg="#A39DE5"
          distribuidores={dFilters.distribuidor}
        />
      </div>


      {/* Linha inferior */}
      <SectionLabel>
        Performance
        {effectiveMonth ? ` · ${fmtMonth(effectiveMonth)}` : ""}
      </SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2.5 mb-3">
        <RankingCard rows={ranking} chaveMode={chaveMode} locked={isAccumulated} />
        <TeamPerformanceCard
          monthRows={effectiveMonthRows}
          estrutura={estrutura}
          filters={dFilters}
          chaveMode={chaveMode}
          locked={isAccumulated}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-3">
        <div ref={concentrationColRef} className="flex flex-col gap-2.5 self-start">
          <ConcentrationCard
            stats={concentration}
            pgEnabled={concentrationPgEnabled}
            onPgEnabledChange={setConcentrationPgEnabled}
          />
          <TopMoversCard
            altas={topMovers.altas}
            quedas={topMovers.quedas}
            currentMonth={effectiveMonth}
            prevMonth={prevEffectiveMonth}
            pgEnabled={topMoversPgEnabled}
            onPgEnabledChange={setTopMoversPgEnabled}
          />
        </div>
        <QuickWinsCard
          rows={quickWins}
          chaveMode={chaveMode}
          targetMonth={effectiveMonth}
          heightPx={isLgUp ? concentrationColHeight : null}
        />
      </div>


      {/* Grupos não batidos (dataset 'dados ags') */}
      <div className="grid grid-cols-1 gap-2.5 mb-3">
        <GruposNaoBatidosCard
          rows={gruposNaoBatidos}
          skusByGroup={skusByGroup}
          skuVolumeMap={skuVolumeMap}
          chaveMode={chaveMode}
          locked={isAccumulated}
        />

      </div>

      {/* Sortimento de Mix — todos os grupos */}
      <div className="grid grid-cols-1 gap-2.5 mb-3">
        <GruposNaoBatidosCard
          rows={sortimentoMix}
          skusByGroup={skusByGroup}
          skuVolumeMap={skuVolumeMap}
          title="Sortimento de Mix"
          subtitleMode="count"
          showCadastroL3M
          chaveMode={chaveMode}
          locked={isAccumulated}
        />

      </div>

      <PgVolumeSummaryCard table={pgVolumeTable} />

    </div>
  );
}

/* ---------------- Filter Bar with real dropdowns ---------------- */

type FilterBarProps = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  clusterOpts: string[];
  canalOpts: string[];
  redeOpts: string[];
  distribOpts: string[];
  monthOpts: string[];
  gvOpts: string[];
  svOpts: string[];
  rvOpts: string[];
};

function FilterBar(p: FilterBarProps) {
  const hasAny =
    p.filters.cluster.length ||
    p.filters.canal.length ||
    p.filters.rede.length ||
    p.filters.distribuidor.length ||
    p.filters.mes.length ||
    p.filters.gv.length ||
    p.filters.sv.length ||
    p.filters.rv.length;
  // Sentinela 1px acima da barra: quando ela sai da viewport (rolagem ultrapassa o topo),
  // a barra "grudou" — usado só pra decidir quando mostrar a sombra/borda de "descolada".
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      threshold: 0,
      rootMargin: "-1px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="h-px" aria-hidden />
      <div
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-1.5 mb-3 bg-[#0f0f10] py-2 -mx-4 px-4 transition-shadow duration-200",
          isStuck && "shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)] border-b border-neutral-800/80",
        )}
      >
      <span className="text-[11px] font-medium text-neutral-400 mr-1">Filtros:</span>
      <FilterChip
        icon={<Layers size={12} />}
        label="Cluster"
        values={p.filters.cluster}
        options={p.clusterOpts}
        onChange={(v) => p.setFilters({ ...p.filters, cluster: v })}
        allLabel="Todos os clusters"
      />
      <FilterChip
        icon={<MapPin size={12} />}
        label="Canal"
        values={p.filters.canal}
        options={p.canalOpts}
        onChange={(v) => p.setFilters({ ...p.filters, canal: v })}
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Rede"
        values={p.filters.rede}
        options={p.redeOpts}
        onChange={(v) => p.setFilters({ ...p.filters, rede: v })}
        searchable
      />
      <FilterChip
        icon={<Building2 size={12} />}
        label="Distribuidor"
        values={p.filters.distribuidor}
        options={p.distribOpts}
        onChange={(v) => p.setFilters({ ...p.filters, distribuidor: v })}
        searchable
      />
      <FilterChip
        icon={<CalendarRange size={12} />}
        label="Mês"
        values={p.filters.mes}
        formatValue={(v) => fmtMonth(v)}
        options={p.monthOpts}
        onChange={(v) => p.setFilters({ ...p.filters, mes: v })}
        allLabel="Mês mais recente"
        accumulatedLabel="Acumulado (todos os meses)"
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Gerente"
        values={p.filters.gv}
        options={p.gvOpts}
        onChange={(v) => p.setFilters({ ...p.filters, gv: v })}
        searchable
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Supervisor"
        values={p.filters.sv}
        options={p.svOpts}
        onChange={(v) => p.setFilters({ ...p.filters, sv: v })}
        searchable
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Vendedor"
        values={p.filters.rv}
        options={p.rvOpts}
        onChange={(v) => p.setFilters({ ...p.filters, rv: v })}
        searchable
      />
      {hasAny ? (
        <button
          onClick={() => p.setFilters(EMPTY_FILTERS)}
          className="text-[11px] text-neutral-400 hover:text-neutral-200 flex items-center gap-1 ml-1"
        >
          <X size={12} /> limpar
        </button>
      ) : null}
      </div>
    </>
  );
}

function FilterChip({
  icon,
  label,
  values,
  options,
  onChange,
  allLabel,
  accumulatedLabel,
  formatValue,
  searchable,
}: {
  icon: React.ReactNode;
  label: string;
  values: string[];
  options: string[];
  onChange: (v: string[]) => void;
  allLabel?: string;
  accumulatedLabel?: string;
  formatValue?: (v: string) => string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollAnimRef = useRef<{ raf: number | null; target: number }>({ raf: null, target: 0 });
  const active = values.length > 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && ref.current.contains(t)) return;
      if (menuRef.current && menuRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open) return;
    // Fecha o menu = cancela qualquer animação de scroll pendente.
    if (scrollAnimRef.current.raf !== null) {
      cancelAnimationFrame(scrollAnimRef.current.raf);
      scrollAnimRef.current.raf = null;
    }
  }, [open]);

  const menuWheelCleanupRef = useRef<(() => void) | null>(null);
  // Este menu é portalado direto no <body>, fora do Dialog do Radix — o scroll-lock dele
  // bloqueia/compete com o wheel nativo aqui. O onWheel do React é passivo por padrão
  // (preventDefault não funciona nele), então anexamos um listener nativo com
  // { passive: false } assim que o menu monta, garantindo que só a nossa animação
  // suavizada controle o scrollTop — sem isso, em rolagens rápidas o scroll nativo e o
  // nosso ficavam disputando o mesmo elemento, causando o "bounce".
  const attachMenuRef = useCallback((node: HTMLDivElement | null) => {
    menuWheelCleanupRef.current?.();
    menuWheelCleanupRef.current = null;
    menuRef.current = node;
    if (!node) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const max = node.scrollHeight - node.clientHeight;
      const state = scrollAnimRef.current;
      const current = state.raf !== null ? state.target : node.scrollTop;
      state.target = Math.min(max, Math.max(0, current + e.deltaY));
      if (state.raf === null) {
        const step = () => {
          const diff = state.target - node.scrollTop;
          if (Math.abs(diff) < 0.5) {
            node.scrollTop = state.target;
            state.raf = null;
            return;
          }
          node.scrollTop += diff * 0.28;
          state.raf = requestAnimationFrame(step);
        };
        state.raf = requestAnimationFrame(step);
      }
    };
    node.addEventListener("wheel", onNativeWheel, { passive: false });
    menuWheelCleanupRef.current = () => node.removeEventListener("wheel", onNativeWheel);
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const compute = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const boundary = ref.current?.closest('[role="dialog"]')?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      const boundaryLeft = boundary ? boundary.left + margin : margin;
      const boundaryRight = boundary ? boundary.right - margin : vw - margin;
      const boundaryTop = boundary ? boundary.top + margin : margin;
      const boundaryBottom = boundary ? boundary.bottom - margin : vh - margin;
      const maxWidth = Math.max(140, boundaryRight - boundaryLeft);
      const width = Math.max(180, Math.min(260, maxWidth));
      // Alinha pelo lado direito do botão (o chip está à direita no header)
      let left = rect.right - width;
      if (left + width > boundaryRight) left = boundaryRight - width;
      if (left < boundaryLeft) left = boundaryLeft;
      const spaceBelow = boundaryBottom - rect.bottom - 4;
      const spaceAbove = rect.top - boundaryTop - 4;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(140, Math.min(320, openUp ? spaceAbove : spaceBelow));
      const top = openUp ? Math.max(boundaryTop, rect.top - maxHeight - 4) : rect.bottom + 4;
      setPos({ top, left, width, maxHeight });
    };
    // Escuta scroll em modo captura para reposicionar o menu se a página/algum ancestral rolar —
    // mas precisa ignorar o scroll do próprio menu (ele é filho do <body> via portal e cai aqui
    // também), senão cada frame da animação de scroll dispara um recompute/re-render e "briga"
    // com a própria animação, dando a sensação de travamento/bounce.
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      compute();
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, values.length]);


  const filtered = searchable
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const fmt = (v: string) => (formatValue ? formatValue(v) : v);
  const display = !active
    ? label
    : values.length === 1
      ? fmt(values[0])
      : `${label}: ${values.length}`;

  const toggle = (opt: string, e?: React.MouseEvent) => {
    const multi = !!(e && (e.ctrlKey || e.metaKey));
    if (multi) {
      if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
      else onChange([...values, opt]);
    } else {
      if (values.length === 1 && values[0] === opt) onChange([]);
      else onChange([opt]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full px-3 py-1 text-[11px] flex items-center gap-1.5 border transition-colors ${
          active
            ? "bg-[#0E2E4D] border-[#378ADD] text-[#8BBEEC] font-medium"
            : "bg-[#1a1a1c] border-neutral-800 text-neutral-400 hover:border-neutral-700"
        }`}
      >
        {icon}
        {display}
        <ChevronDown size={12} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={attachMenuRef}
          className="fixed z-[9999] overflow-auto bg-[#1a1a1c] border border-neutral-800 rounded-md shadow-lg py-1 text-[11px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, scrollbarWidth: "thin", scrollbarColor: "#404040 transparent", pointerEvents: "auto" }}
          onMouseDown={(e) => e.stopPropagation()}
        >

          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-2 py-1 mb-1 bg-[#0f0f10] border-b border-neutral-800 text-neutral-200 outline-none"
            />
          )}
          <button
            onClick={() => {
              onChange([]);
              setQuery("");
            }}
            className={`block w-full text-left px-3 py-1 hover:bg-neutral-800 ${
              !active ? "text-[#8BBEEC]" : "text-neutral-400"
            }`}
          >
            {allLabel ?? `Todos`}
          </button>
          {accumulatedLabel && options.length > 0 && (
            <button
              onClick={() => onChange([...options])}
              className={`block w-full text-left px-3 py-1 hover:bg-neutral-800 ${
                values.length === options.length ? "text-[#8BBEEC] font-medium" : "text-neutral-300"
              }`}
            >
              {accumulatedLabel}
            </button>
          )}
          <div className="h-px bg-neutral-800 my-1" />
          {filtered.map((opt) => {
            const checked = values.includes(opt);
            return (
              <button
                key={opt}
                onClick={(e) => toggle(opt, e)}
                title={fmt(opt)}
                className={`flex items-center gap-2 w-full text-left px-3 py-1 hover:bg-neutral-800 ${
                  checked ? "text-[#8BBEEC] font-medium" : "text-neutral-200"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border shrink-0 ${
                    checked ? "bg-[#378ADD] border-[#378ADD]" : "border-neutral-600"
                  }`}
                >
                  {checked && <Check size={9} className="text-white" />}
                </span>
                <span className="truncate min-w-0 flex-1">{fmt(opt)}</span>
              </button>

            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-neutral-500">Nenhum resultado</div>
          )}
        </div>,
        document.body

      )}
    </div>
  );
}

/* ---------------- Reusable UI ---------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium text-neutral-400 mb-2 tracking-wider uppercase">
      {children}
    </div>
  );
}

function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function CardTitle({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] font-medium text-neutral-100 mb-0.5 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className="text-[11px] text-neutral-400 mb-3">{sub}</div>
    </div>
  );
}

function KpiCard({
  color,
  icon,
  label,
  value,
  valueColor,
  sub,
  progressLabel,
  progressValue,
  progressPct,
  progressTarget,
  badge,
  footerRight,
  rightStat,
  categoryTitle,
  categoryBreakdown,
  animateDelay = 0,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueColor: string;
  sub: string;
  progressLabel: string;
  progressValue: string;
  progressPct: number;
  progressTarget?: number;
  badge?: { text: string; bg: string; fg: string };
  footerRight?: React.ReactNode;
  rightStat?: { label: string; value: React.ReactNode };
  categoryTitle?: string;
  categoryBreakdown?: { label: string; ok: number; total: number; color: string }[];
  animateDelay?: number;
}) {
  const animatedPct = useCountUp(progressPct, 1100, animateDelay);

  return (
    <div
      className="bg-[#1a1a1c] rounded-b-xl border border-neutral-800/80 p-3.5"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1.5">
            {icon}
            {label}
          </div>
          <div className="text-[22px] font-medium leading-none" style={{ color: valueColor }}>
            {value}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1.5">{sub}</div>
        </div>
        {rightStat && (
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-neutral-400 mb-1.5">{rightStat.label}</div>
            <div
              className="text-[22px] font-medium leading-none"
              style={{ color: valueColor }}
            >
              {rightStat.value}
            </div>
          </div>
        )}

        {categoryBreakdown && categoryBreakdown.length > 0 && (
          <div className="shrink-0 border-l border-neutral-800 pl-3 -my-0.5">
            {categoryTitle && (
              <div className="text-[10px] text-neutral-400 mb-1 tracking-wide">
                {categoryTitle}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {categoryBreakdown.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: c.color }}
                  />
                  <span className="text-neutral-200 font-medium">{c.label}</span>
                  <span className="ml-auto tabular-nums text-neutral-300 flex items-center gap-1.5">
                    <span>
                      <span className="font-semibold" style={{ color: c.color }}>
                        {c.ok}
                      </span>
                      <span className="text-neutral-500"> / {c.total}</span>
                    </span>
                    {(() => {
                      const pct = c.total > 0 ? c.ok / c.total : 0;
                      const pctColor = pct >= 0.6 ? "#22c55e" : c.color;
                      return (
                        <span className="font-semibold tabular-nums" style={{ color: pctColor }}>
                          {Math.round(pct * 100)}%
                        </span>
                      );
                    })()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-400 mt-2">
        <span>{progressLabel}</span>
        <span className="font-medium" style={{ color: valueColor }}>
          {progressValue}
        </span>
      </div>
      <div className="h-[5px] bg-neutral-800 rounded mt-1.5 overflow-hidden relative">
        <div
          className="h-full rounded"
          style={{ width: `${Math.max(0, Math.min(100, animatedPct))}%`, background: color, transition: "background 0.2s" }}
        />
        {progressTarget != null && (
          <>
            <div
              className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-white/90 rounded-sm"
              style={{ left: `calc(${Math.max(0, Math.min(100, progressTarget))}% - 1px)` }}
              title={`Meta ${progressTarget}%`}
            />
          </>
        )}
      </div>
      {progressTarget != null && (
        <div className="text-[9px] text-neutral-400 mt-0.5 relative h-[10px]">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${Math.max(0, Math.min(100, progressTarget))}%` }}
          >
            Meta {progressTarget}%
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        {badge ? (
          <span
            className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: badge.bg, color: badge.fg }}
          >
            {badge.text}
          </span>
        ) : <span />}
        {footerRight && <div className="text-[10px] text-neutral-400">{footerRight}</div>}
      </div>


    </div>
  );
}

function pgColorFor(pct: number): string {
  return pct >= 0.6 ? GREEN : pct >= 0.4 ? ORANGE : RED;
}

function PgVolumeInvestCard({
  brands,
  distribuidores,
}: {
  brands: PgVolumeInvestBrand[];
  distribuidores?: string[];
}) {
  const totalGerado = brands.reduce((a, b) => a + b.gerado, 0);
  const totalPotencial = brands.reduce((a, b) => a + b.potencial, 0);

  return (
    <div
      className="bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5"
      style={{ borderTop: `3px solid ${PINK}` }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[12px] font-medium text-neutral-100 flex items-center gap-1.5 flex-wrap">
          <LayoutGrid size={13} style={{ color: PINK }} />
          P&amp;G+ Volume · Investimento por marca
          {distribuidores && distribuidores.length > 0 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: "#3D1A2D", color: "#F2A8C9" }}
              title={distribuidores.join(", ")}
            >
              {distribuidores.length === 1 ? distribuidores[0] : `${distribuidores.length} distribuidores`}
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500 shrink-0 tabular-nums">
          {fmtBRL(totalGerado)} / {fmtBRL(totalPotencial)} no total
        </span>
      </div>
      {brands.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {brands.map((b, idx) => (
            <PgInvestTile key={b.label} brand={b} delay={idx * 80} />
          ))}
        </div>
      )}
    </div>
  );
}

function PgInvestTile({ brand, delay }: { brand: PgVolumeInvestBrand; delay: number }) {
  const pct = brand.potencial > 0 ? brand.gerado / brand.potencial : 0;
  const c = pgColorFor(pct);
  const animatedPct = useCountUp(pct * 100, 1100, delay);
  return (
    <div className="bg-[#141417] border border-neutral-800/70 rounded-lg pt-0 overflow-hidden basis-[calc(50%-6px)] sm:basis-[calc(33.333%-8px)] grow-0 shrink-0">
      <div className="h-[3px]" style={{ background: c }} />
      <div className="p-3 min-h-[153px] flex flex-col justify-between">
        <div>
          <div className="text-[12px] text-neutral-400 truncate" title={brand.label}>
            {brand.label}
          </div>
          <div className="text-[22px] font-semibold text-neutral-100 leading-tight mt-1">
            <AnimatedNumber value={brand.gerado} format={(n) => fmtBRL(n)} delay={delay} />
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Potencial {fmtBRL(brand.potencial)}</div>
        </div>
        <div>
          <div className="h-[5px] bg-neutral-800 rounded mt-2 overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${Math.max(2, Math.min(100, animatedPct))}%`,
                background: c,
                transition: "background 0.2s",
              }}
            />
          </div>
          <div className="text-[12px] font-medium mt-1.5" style={{ color: c }}>
            {Math.round(pct * 100)}% atingido
          </div>
        </div>
      </div>
    </div>
  );
}

function PgVolumeRingCard({
  brands,
  singleRedeCells,
  singleRede,
  distribuidores,
}: {
  brands: PgVolumeBrand[];
  singleRedeCells?: Record<string, PgVolumeCell> | null;
  singleRede?: string | null;
  distribuidores?: string[];
}) {
  const R = 32;
  const C = 2 * Math.PI * R;
  const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");

  return (
    <div
      className="bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5"
      style={{ borderTop: `3px solid ${PINK}` }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Target size={13} style={{ color: PINK }} />
          <div className="text-[12px] font-medium text-neutral-100">
            P&amp;G+ Volume · Atingimento por marca
          </div>
          {distribuidores && distribuidores.length > 0 && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ background: "#3D1A2D", color: "#F2A8C9" }}
              title={distribuidores.join(", ")}
            >
              {distribuidores.length === 1 ? distribuidores[0] : `${distribuidores.length} distribuidores`}
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500 shrink-0 text-right truncate max-w-[55%]" title={singleRede ?? undefined}>
          {singleRede ?? "Filtre sua rede para visualizar as unidades"}
        </span>
      </div>
      {brands.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {brands.map((b) => {
            const cell = singleRedeCells?.[b.label];
            const pct = cell ? (cell.meta > 0 ? cell.realizado / cell.meta : 0) : b.total > 0 ? b.ok / b.total : 0;
            const pctInt = Math.round(pct * 100);
            const offset = C - (Math.min(100, pctInt) / 100) * C;
            const c = pgColorFor(Math.min(1, pct));
            return (
              <div
                key={b.label}
                className="bg-[#141417] border border-neutral-800/70 rounded-lg p-3 min-h-[153px] flex flex-col items-center justify-between gap-1.5 basis-[calc(50%-6px)] sm:basis-[calc(33.333%-8px)] grow-0 shrink-0"
              >
                <div className="relative w-[76px] h-[76px] shrink-0">
                  <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
                    <circle cx="38" cy="38" r={R} fill="none" stroke="#262626" strokeWidth="7" />
                    <circle
                      cx="38"
                      cy="38"
                      r={R}
                      fill="none"
                      stroke={c}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={offset}
                      style={{ transition: "stroke-dashoffset 0.6s ease" }}
                    />
                  </svg>
                  <div
                    className="absolute inset-0 flex items-center justify-center text-[17px] font-semibold"
                    style={{ color: c }}
                  >
                    {pctInt}%
                  </div>
                </div>
                <div className="text-[13px] font-medium text-neutral-100 text-center truncate max-w-full" title={b.label}>
                  {b.label}
                </div>
                {cell ? (
                  <div className="text-[11px] text-neutral-500 tabular-nums text-center leading-tight">
                    <div>
                      Meta {fmtInt(cell.meta)} · Real. {fmtInt(cell.realizado)}
                    </div>
                    <div>Gap {fmtInt(cell.gap)}</div>
                  </div>
                ) : (
                  <div className="text-[11px] text-neutral-500 tabular-nums">
                    {b.ok}/{b.total} redes
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PgVolumeSummaryCard({ table }: { table: PgVolumeTable }) {
  const [mode, setMode] = useState<"unidades" | "investimento">("unidades");
  const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
  const fmtBRNum = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const subCols = mode === "unidades" ? ["Meta", "Realizado", "Gap"] : ["Potencial", "Gerado"];

  const cellValues = (cell: PgVolumeCell | undefined, forCsv: boolean): (string | number)[] => {
    if (!cell) return subCols.map(() => (forCsv ? "" : "—"));
    if (mode === "unidades") {
      return forCsv
        ? [cell.meta, cell.realizado, cell.gap]
        : [fmtInt(cell.meta), fmtInt(cell.realizado), fmtInt(cell.gap)];
    }
    return forCsv
      ? [fmtBRNum(cell.potencial), fmtBRNum(cell.gerado)]
      : [fmtBRL(cell.potencial), fmtBRL(cell.gerado)];
  };

  const handleDownloadCsv = () => {
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Rede", ...table.brands.flatMap((b) => subCols.map((s) => `${b} - ${s}`))];
    const lines = [headers.join(";")];
    table.rows.forEach((r) => {
      const vals = table.brands.flatMap((b) => cellValues(r.cells[b], true));
      lines.push([r.rede, ...vals].map(escape).join(";"));
    });
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo-redes-pg-mais-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Resumo Redes — P&G+ Volume", 40, 40);
    const head = [
      [
        { content: "Rede", rowSpan: 2 },
        ...table.brands.map((b) => ({ content: b, colSpan: subCols.length })),
      ],
      table.brands.flatMap(() => subCols),
    ];
    const body = table.rows.map((r) => [
      r.rede,
      ...table.brands.flatMap((b) => cellValues(r.cells[b], false)),
    ]);
    autoTable(doc, {
      startY: 60,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`resumo-redes-pg-mais-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Card className="mb-3">
      <div className="flex items-start justify-between gap-2">
        <CardTitle
          icon={<Table2 size={13} className="text-neutral-400" />}
          title="Resumo Redes"
          sub={
            mode === "unidades"
              ? "Meta, realizado e gap por mecânica (P&G+ Volume)"
              : "Potencial de investimento e investimento gerado por mecânica (P&G+ Volume)"
          }
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-full border border-neutral-800 overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setMode("unidades")}
              className={`px-3 py-1 transition-colors ${
                mode === "unidades"
                  ? "bg-[#0E2E4D] text-[#8BBEEC] font-medium"
                  : "bg-[#1a1a1c] text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Unidades
            </button>
            <button
              type="button"
              onClick={() => setMode("investimento")}
              className={`px-3 py-1 border-l border-neutral-800 transition-colors ${
                mode === "investimento"
                  ? "bg-[#0E2E4D] text-[#8BBEEC] font-medium"
                  : "bg-[#1a1a1c] text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Investimento
            </button>
          </div>
          <ExtractDropdown onCsv={handleDownloadCsv} onPdf={handleDownloadPdf} disabled={table.rows.length === 0} />
        </div>
      </div>
      <PgVolumeSummaryTable table={table} mode={mode} />
    </Card>
  );
}

function PgVolumeSummaryTable({
  table,
  mode,
}: {
  table: PgVolumeTable;
  mode: "unidades" | "investimento";
}) {
  const fmtInt = (n: number) => Math.round(n).toLocaleString("pt-BR");
  const colsPerBrand = mode === "unidades" ? 3 : 2;
  const colCount = 1 + table.brands.length * colsPerBrand;
  const emptyCells = mode === "unidades" ? 3 : 2;
  return (
    <div
      className="max-h-[420px] overflow-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
    >
      <table className="text-[11px] border-collapse min-w-full">
        <thead className="sticky top-0 bg-[#141416] z-10">
          <tr className="text-neutral-400 font-medium border-b border-neutral-800">
            <th
              rowSpan={2}
              className="text-left pb-1 pr-3 sticky left-0 bg-[#141416] z-20 align-bottom whitespace-nowrap"
            >
              Rede
            </th>
            {table.brands.map((b) => (
              <th
                key={b}
                colSpan={colsPerBrand}
                className="text-center pb-1 px-2 border-l border-neutral-800/70 font-medium whitespace-nowrap"
              >
                {b}
              </th>
            ))}
          </tr>
          <tr className="text-neutral-500 font-medium border-b border-neutral-800">
            {table.brands.map((b) =>
              mode === "unidades" ? (
                <React.Fragment key={b}>
                  <th className="text-center pb-1 px-2 border-l border-neutral-800/70 font-normal whitespace-nowrap">
                    Meta
                  </th>
                  <th className="text-center pb-1 px-2 font-normal whitespace-nowrap">Realizado</th>
                  <th className="text-center pb-1 px-2 font-normal whitespace-nowrap">Gap</th>
                </React.Fragment>
              ) : (
                <React.Fragment key={b}>
                  <th className="text-center pb-1 px-2 border-l border-neutral-800/70 font-normal whitespace-nowrap">
                    Potencial
                  </th>
                  <th className="text-center pb-1 px-2 font-normal whitespace-nowrap">Gerado</th>
                </React.Fragment>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {table.rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-4">
                <Empty />
              </td>
            </tr>
          ) : (
            table.rows.map((r) => (
              <tr key={r.rede} className="border-b border-neutral-800 last:border-0">
                <td
                  className="py-1 pr-3 text-neutral-200 truncate sticky left-0 bg-[#1a1a1c] whitespace-nowrap"
                  title={r.rede}
                >
                  {r.rede}
                </td>
                {table.brands.map((b) => {
                  const cell = r.cells[b];
                  if (!cell) {
                    return (
                      <React.Fragment key={b}>
                        {Array.from({ length: emptyCells }, (_, i) => (
                          <td
                            key={i}
                            className={`py-1 text-center text-neutral-600 ${i === 0 ? "border-l border-neutral-800/70" : ""}`}
                          >
                            —
                          </td>
                        ))}
                      </React.Fragment>
                    );
                  }
                  if (mode === "unidades") {
                    const gapColor = cell.gap <= 0 ? GREEN : RED;
                    return (
                      <React.Fragment key={b}>
                        <td className="py-1 text-center border-l border-neutral-800/70 text-neutral-300 tabular-nums">
                          {fmtInt(cell.meta)}
                        </td>
                        <td className="py-1 text-center text-neutral-200 tabular-nums">
                          {fmtInt(cell.realizado)}
                        </td>
                        <td className="py-1 text-center font-medium tabular-nums" style={{ color: gapColor }}>
                          {fmtInt(cell.gap)}
                        </td>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={b}>
                      <td className="py-1 text-center border-l border-neutral-800/70 text-neutral-300 tabular-nums">
                        {fmtBRL(cell.potencial)}
                      </td>
                      <td className="py-1 text-center font-medium text-neutral-200 tabular-nums">
                        {fmtBRL(cell.gerado)}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Cards ---------------- */

type IniciativaStat = {
  name: string;
  ok: number;
  total: number;
  byCluster: { label: string; ok: number; total: number; color: string }[];
};

function IniciativasList({
  data,
  className,
}: {
  data: IniciativaStat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 overflow-y-auto pr-1 -mr-1 space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600",
        className
      )}
      style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
    >
      {data.length === 0 ? (
        <div className="text-[11px] text-neutral-500">Sem dados para os filtros atuais.</div>
      ) : (
        data.map((it, idx) => {
          const pct = it.total > 0 ? it.ok / it.total : 0;
          return (
            <IniciativaRow key={it.name} it={it} pct={pct} isFirst={idx === 0} delay={idx * 60} />
          );
        })
      )}
    </div>
  );
}

function IniciativasCard({ data }: { data: IniciativaStat[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const allNames = useMemo(() => data.map((d) => d.name), [data]);
  // Descarta seleções que não existem mais nos dados atuais
  const effectiveSelected = useMemo(
    () => selected.filter((s) => allNames.includes(s)),
    [selected, allNames]
  );
  const modalData = useMemo(
    () =>
      effectiveSelected.length === 0
        ? data
        : data.filter((d) => effectiveSelected.includes(d.name)),
    [data, effectiveSelected]
  );

  return (
    <>
      <div
        className="bg-[#1a1a1c] rounded-b-xl border border-neutral-800/80 p-3.5 flex flex-col h-[480px] md:h-full min-h-0"
        style={{ borderTop: `3px solid ${PURPLE}` }}
      >
        <div className="text-[11px] text-neutral-400 mb-2 flex items-center justify-between gap-1.5 tracking-wide uppercase">
          <div className="flex items-center gap-1.5">
            <Rocket size={13} style={{ color: PURPLE }} />
            Iniciativas
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/70 transition-colors"
            aria-label="Expandir iniciativas"
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <IniciativasList data={data} className="flex-1" />
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)] h-[600px] bg-[#1a1a1c] border-neutral-800/80 p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-neutral-800/70 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-[13px] font-medium text-neutral-100 flex items-center gap-2 normal-case tracking-normal">
                <Rocket size={15} style={{ color: PURPLE }} />
                Iniciativas
              </DialogTitle>
              <div className="pr-6">
                <FilterChip
                  icon={<ListFilter size={12} />}
                  label="Filtrar"
                  values={effectiveSelected}
                  options={allNames}
                  onChange={setSelected}
                  searchable
                />
              </div>
            </div>
          </DialogHeader>
          <IniciativasList data={modalData} className="flex-1 p-5" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function IniciativaRow({
  it,
  pct,
  isFirst,
  delay,
}: {
  it: IniciativaStat;
  pct: number;
  isFirst: boolean;
  delay: number;
}) {
  const animatedPct = useCountUp(pct * 100, 1000, delay);
  const animatedOk = useCountUp(it.ok, 1000, delay);
  return (
    <div className={!isFirst ? "pt-2.5 border-t border-neutral-800/70" : ""}>
      <div className="text-[12px] font-medium text-neutral-100 mb-1 truncate" title={it.name}>
        {it.name}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-neutral-300 mb-1.5">
        <span className="tabular-nums">
          <span className="font-semibold text-neutral-100">{Math.round(animatedOk)}</span>
          <span className="text-neutral-500"> / {it.total}</span>
        </span>
        {it.byCluster.map((c) => (
          <span key={c.label} className="flex items-center gap-1 tabular-nums">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: c.color }}
            />
            <span className="text-neutral-300">{c.label}</span>
            <span className="text-neutral-400">
              {c.ok}/{c.total}
            </span>
          </span>
        ))}
      </div>
      <div className="flex justify-end text-[10px] mb-1">
        <span className="font-semibold tabular-nums" style={{ color: "#A39DE5" }}>
          {animatedPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <div className="h-[5px] bg-neutral-800 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${Math.max(0, Math.min(100, animatedPct))}%`,
            background: PURPLE,
          }}
        />
      </div>
    </div>
  );
}


function MonthlyEvolutionCard({ data }: { data: { mes: string; gerado: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.gerado));
  const first = data[0]?.gerado ?? 0;
  const last = data[data.length - 1]?.gerado ?? 0;
  const growth = first > 0 ? (last - first) / first : null;
  return (
    <Card>
      <CardTitle
        icon={<TrendingUp size={13} className="text-neutral-400" />}
        title="Evolução mensal"
        sub="Investimento gerado por mês"
      />
      {data.length === 0 && <Empty />}
      <div className="flex flex-col gap-2">
        {data.map((m, i) => {
          const pct = (m.gerado / max) * 100;
          const color = i === data.length - 1 ? "#0F6E56" : i >= data.length - 2 ? GREEN : "#5DCAA5";
          return (
            <div key={m.mes} className="flex items-center gap-2 text-[11px]">
              <span className="w-[34px] text-neutral-400">{fmtMonth(m.mes)}</span>
              <div className="flex-1 h-3.5 bg-neutral-800 rounded overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="w-[52px] text-right font-medium text-neutral-200">
                {fmtBRL(m.gerado)}
              </span>
            </div>
          );
        })}
      </div>
      {growth != null && data.length > 1 && (
        <>
          <div className="h-px bg-neutral-800 my-2" />
          <span className="text-[10px] text-neutral-400">
            <span
              className="font-medium"
              style={{ color: growth >= 0 ? "#3DD9A4" : "#F08A8A" }}
            >
              {growth >= 0 ? "+" : ""}
              {(growth * 100).toFixed(0)}%
            </span>{" "}
            {fmtMonth(data[0].mes)} → {fmtMonth(data[data.length - 1].mes)}
          </span>
        </>
      )}
    </Card>
  );
}

function RankingTable({
  rows,
  chaveMode = false,
  expanded = false,
}: {
  rows: RankRow[];
  chaveMode?: boolean;
  expanded?: boolean;
}) {
  const fmtInt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return (
    <div
      className={`${expanded ? "h-[calc(92vh-104px)] max-h-[calc(92vh-104px)] overflow-y-scroll" : "max-h-[200px] overflow-y-auto"} pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600`}
      style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
    >
      <table className={`w-full ${expanded ? "text-[10px] sm:text-[11px] lg:text-[12px]" : "text-[9px] sm:text-[11px]"}`} style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-[#141416] z-10">
          <tr className="text-neutral-400 font-medium border-b border-neutral-800">
            <th className={`text-left pb-1 ${expanded ? "w-5 sm:w-8" : "w-4 sm:w-5"} font-medium`}>#</th>
            <th className="text-left pb-1 font-medium truncate">Rede</th>
            <th className={`text-center pb-1 ${expanded ? "w-8 sm:w-14" : "w-9 sm:w-12"} font-medium`}>{chaveMode ? "Chave" : "Sort."}</th>
            <th className={`text-center pb-1 ${expanded ? "w-12 sm:w-20" : "w-12 sm:w-16"} font-medium leading-tight`}>
              <div>Ags</div><div>atingidos</div>
            </th>
            <th className={`text-center pb-1 ${expanded ? "w-12 sm:w-24" : "w-14 sm:w-20"} font-medium leading-tight`}>
              {chaveMode ? (<><div>Gap Ags</div><div>.p próx. Chave</div></>) : (<><div>Gap Ags</div><div>.p ≥ 90%</div></>)}
            </th>
            <th className={`text-center pb-1 ${expanded ? "w-14 sm:w-20" : "w-12 sm:w-16"} font-medium`}>Potencial</th>
            <th className={`text-center pb-1 ${expanded ? "w-14 sm:w-20" : "w-12 sm:w-16"} font-medium`}>Invest.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const color = r.chaveRegime
              ? colorForChave(r.chave ?? 0)
              : r.sortimento >= 0.9
                ? "#22C55E"
                : r.sortimento >= 0.85
                  ? ORANGE
                  : RED;
            const gap = r.chaveRegime ? r.gapProximaChave : r.gapAgs90;
            return (
              <tr key={r.rede} className="border-b border-neutral-800 last:border-0">
                <td className="py-1 text-neutral-400 font-medium">{i + 1}</td>
                <td className="py-1 text-neutral-200 truncate" title={r.rede}>
                  {r.rede}
                </td>
                <td className="py-1 text-center font-medium" style={{ color }}>
                  {fmtChaveOrPct(r.chave, r.sortimento)}
                </td>
                <td className="py-1 text-center font-medium">
                  <span style={{ color }}>{r.agBatidos}</span>
                  <span className="text-neutral-200"> / {r.qtdAG}</span>
                </td>
                <td className="py-1 text-center text-neutral-200">
                  {gap.toLocaleString("pt-BR")}
                </td>
                <td className="py-1 text-center text-neutral-200">
                  {fmtBRL(r.potencial)}
                </td>
                <td className="py-1 text-center font-medium text-neutral-200">
                  {fmtBRL(r.gerado)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MoverBarRow({ item, maxAbs, color }: { item: TopMoverRow; maxAbs: number; color: string }) {
  const pct = maxAbs > 0 ? Math.max(4, Math.min(100, (Math.abs(item.delta) / maxAbs) * 100)) : 4;
  return (
    <div className="flex items-center gap-2">
      <div className="w-[128px] shrink-0 min-w-0">
        <div className="text-[11px] text-neutral-200 truncate" title={item.rede}>
          {item.rede}
        </div>
        <div className="text-[9.5px] text-neutral-500 truncate">{item.cluster || "—"}</div>
      </div>
      <div className="flex-1 h-[10px] bg-neutral-800 rounded overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div
        className="w-[76px] shrink-0 text-right text-[11px] font-semibold tabular-nums"
        style={{ color }}
      >
        {item.delta >= 0 ? "+" : "−"}
        {fmtBRL(Math.abs(item.delta))}
      </div>
    </div>
  );
}

function PgToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer select-none shrink-0">
      P&amp;G+
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="shadow-none focus-visible:ring-offset-0 focus-visible:ring-[#378ADD] data-[state=checked]:bg-[#0E2E4D] data-[state=checked]:border-[#378ADD] data-[state=unchecked]:bg-neutral-800 data-[state=unchecked]:border-neutral-700"
      />
    </label>
  );
}

function TopMoversCard({
  altas,
  quedas,
  currentMonth,
  prevMonth,
  pgEnabled,
  onPgEnabledChange,
}: {
  altas: TopMoverRow[];
  quedas: TopMoverRow[];
  currentMonth: string | null;
  prevMonth: string | null;
  pgEnabled: boolean;
  onPgEnabledChange: (v: boolean) => void;
}) {
  const maxAlta = altas.length > 0 ? altas[0].delta : 0;
  const maxQueda = quedas.length > 0 ? Math.abs(quedas[0].delta) : 0;
  const hasData = altas.length > 0 || quedas.length > 0;
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <CardTitle
          icon={<TrendingUp size={13} className="text-neutral-400" />}
          title="Top Crescimentos"
          sub={
            currentMonth && prevMonth
              ? `Investimento gerado · ${fmtMonth(prevMonth)} → ${fmtMonth(currentMonth)}`
              : "Investimento gerado vs. mês anterior"
          }
        />
        <PgToggle checked={pgEnabled} onCheckedChange={onPgEnabledChange} />
      </div>
      {!hasData ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <div
              className="text-[10px] font-semibold tracking-wide uppercase mb-2 flex items-center gap-1"
              style={{ color: GREEN }}
            >
              <TrendingUp size={11} /> Maiores altas
            </div>
            {altas.length === 0 ? (
              <div className="text-[10.5px] text-neutral-500">Sem altas no período</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {altas.map((item) => (
                  <MoverBarRow key={item.rede} item={item} maxAbs={maxAlta} color={GREEN} />
                ))}
              </div>
            )}
          </div>
          <div>
            <div
              className="text-[10px] font-semibold tracking-wide uppercase mb-2 flex items-center gap-1"
              style={{ color: RED }}
            >
              <TrendingDown size={11} /> Maiores quedas
            </div>
            {quedas.length === 0 ? (
              <div className="text-[10.5px] text-neutral-500">Sem quedas no período</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {quedas.map((item) => (
                  <MoverBarRow key={item.rede} item={item} maxAbs={maxQueda} color={RED} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function QuickWinRow({ r }: { r: RankRow }) {
  const gap = gapOf(r);
  return (
    <div className="flex items-center justify-between gap-2 bg-[#141417] border border-neutral-800/70 rounded-md px-2.5 py-1.5">
      <div className="min-w-0">
        <div className="text-[11px] text-neutral-200 truncate" title={r.rede}>
          {r.rede}
        </div>
        <div className="text-[9.5px] text-neutral-500 truncate">
          {r.cluster || "—"} · {r.canal || "—"}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: "#262629", color: "#c9c9cf" }}
        >
          {gap} {gap === 1 ? "AG" : "AGs"}
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: "#3D2A10", color: ORANGE }}
        >
          {r.chaveRegime
            ? `Chave ${r.chave ?? 0} → ${r.proximaChaveNivel}`
            : `${Math.round(r.sortimento * 100)}% → 90%`}
        </span>
      </div>
    </div>
  );
}

function gapOf(r: RankRow): number {
  return r.chaveRegime ? r.gapProximaChave : r.gapAgs90;
}

function QuickWinsCard({
  rows,
  chaveMode,
  targetMonth,
  heightPx,
}: {
  rows: RankRow[];
  chaveMode: boolean;
  targetMonth: string | null;
  /** Altura (px) medida no card vizinho (Concentração + Top Crescimentos), para acompanhá-la. */
  heightPx: number | null;
}) {
  const [maxGap, setMaxGap] = useState(5);
  const metaLabel = chaveMode ? "da próxima chave" : "dos 90% de sortimento";
  const visibleRows = useMemo(() => rows.filter((r) => gapOf(r) <= maxGap), [rows, maxGap]);

  const metaFor = (r: RankRow) =>
    r.chaveRegime
      ? `Chave ${r.chave ?? 0} -> ${r.proximaChaveNivel}`
      : `${Math.round(r.sortimento * 100)}% -> 90%`;

  const handleDownloadCsv = () => {
    const headers = ["Rede", "Cluster", "Canal", "AGs faltantes", chaveMode ? "Chave" : "% Sortimento"];
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    visibleRows.forEach((r) => {
      lines.push([r.rede, r.cluster, r.canal, gapOf(r), metaFor(r)].map(escape).join(";"));
    });
    const csv = "﻿" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quick-wins-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Quick wins", 40, 40);
    const body = visibleRows.map((r) => [r.rede, r.cluster, r.canal, gapOf(r), metaFor(r)]);
    autoTable(doc, {
      startY: 60,
      head: [["Rede", "Cluster", "Canal", "AGs faltantes", chaveMode ? "Chave" : "Sortimento"]],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`quick-wins-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Card
      className={cn("flex flex-col", heightPx == null && "max-h-[420px]")}
      style={heightPx != null ? { height: heightPx } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <CardTitle
          icon={<KeyRound size={13} className="text-neutral-400" />}
          title="Quick wins"
          sub={
            targetMonth
              ? `Redes a até ${maxGap} AGs ${metaLabel} · ${fmtMonth(targetMonth)}`
              : `Redes a até ${maxGap} AGs ${metaLabel}`
          }
        />
        <ExtractDropdown onCsv={handleDownloadCsv} onPdf={handleDownloadPdf} disabled={visibleRows.length === 0} />
      </div>
      <div className="mb-3 w-1/2 min-w-[140px]" style={{ "--primary": GREEN } as React.CSSProperties}>
        <Slider
          min={1}
          max={QUICK_WIN_MAX_GAP}
          step={1}
          value={[maxGap]}
          onValueChange={(v) => setMaxGap(v[0])}
        />
        <div className="flex items-center justify-between text-[10px] text-neutral-500 mt-1.5">
          <span>1 AG</span>
          <span>{QUICK_WIN_MAX_GAP} AGs</span>
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Empty />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
        >
          {visibleRows.map((r) => (
            <QuickWinRow key={r.rede} r={r} />
          ))}
        </div>
      )}
      <div className="text-[10.5px] text-neutral-500 text-right mt-2 pt-2 border-t border-neutral-800/70 shrink-0">
        {visibleRows.length} {visibleRows.length === 1 ? "rede" : "redes"}
      </div>
    </Card>
  );
}

function ConcentrationCard({
  stats,
  pgEnabled,
  onPgEnabledChange,
}: {
  stats: ConcentrationStats;
  pgEnabled: boolean;
  onPgEnabledChange: (v: boolean) => void;
}) {
  const hasData = stats.totalRedes > 0;
  const NEXT5_BLUE = "#6fb1e8";
  const REST_GRAY = "#3a3a3f";
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <CardTitle
          icon={<PieChart size={13} className="text-neutral-400" />}
          title="Concentração de investimento"
          sub="Quanto do resultado depende de poucas redes grandes"
        />
        <PgToggle checked={pgEnabled} onCheckedChange={onPgEnabledChange} />
      </div>
      {!hasData ? (
        <Empty />
      ) : (
        <>
          <div className="flex h-[22px] rounded-md overflow-hidden bg-neutral-800">
            <div style={{ width: `${stats.top5Pct * 100}%`, background: BLUE }} />
            <div style={{ width: `${stats.next5Pct * 100}%`, background: NEXT5_BLUE }} />
            <div style={{ width: `${stats.restPct * 100}%`, background: REST_GRAY }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
            <LegendDot color={BLUE} label={`Top 5 redes — ${fmtPct(stats.top5Pct, 1)}`} />
            <LegendDot color={NEXT5_BLUE} label={`6ª–10ª — ${fmtPct(stats.next5Pct, 1)}`} />
            <LegendDot
              color={REST_GRAY}
              label={`Demais ${Math.max(0, stats.totalRedes - 10)} redes — ${fmtPct(stats.restPct, 1)}`}
            />
          </div>
          <div className="mt-3 bg-[#141417] border border-neutral-800/70 rounded-md px-3 py-2 text-[11.5px] text-neutral-300">
            <span className="font-semibold text-neutral-100">
              {stats.redesFor80Pct} de {stats.totalRedes} redes
            </span>{" "}
            ({fmtPct(stats.redesFor80Pct / stats.totalRedes, 0)}) concentram 80% de todo o investimento
            gerado no período.
          </div>
        </>
      )}
    </Card>
  );
}

function RankingCard({
  rows,
  chaveMode = false,
  locked = false,
}: {
  rows: RankRow[];
  chaveMode?: boolean;
  locked?: boolean;
}) {
  const fmtInt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const fmtBRNum = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [expanded, setExpanded] = useState(false);
  const gapHeader = chaveMode ? "Gap Ags p/próx. Chave" : "Gap Ags p>=90%";
  const handleDownloadCsv = () => {
    const headers = ["#", "Rede", chaveMode ? "Chave" : "Sortimento", "Ags batidos", "Qtd AG", gapHeader, "Potencial", "Investimento"];
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    rows.forEach((r, i) => {
      const gap = r.chaveRegime ? r.gapProximaChave : r.gapAgs90;
      lines.push([i + 1, r.rede, fmtChaveOrPct(r.chave, r.sortimento), r.agBatidos, r.qtdAG, gap, fmtBRNum(r.potencial), fmtBRNum(r.gerado)].map(escape).join(";"));
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking-redes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("Ranking de redes", 40, 40);
    const body = rows.map((r, i) => [
      i + 1, r.rede, fmtChaveOrPct(r.chave, r.sortimento),
      `${r.agBatidos} / ${r.qtdAG}`, fmtInt(r.chaveRegime ? r.gapProximaChave : r.gapAgs90), fmtBRL(r.potencial), fmtBRL(r.gerado),
    ]);
    autoTable(doc, {
      startY: 60,
      head: [["#", "Rede", chaveMode ? "Chave" : "Sortimento", "Ags atingidos", gapHeader, "Potencial", "Investimento"]],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`ranking-redes-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  return (
    <>
      <Card className="relative">
        {locked && <MixedPeriodBadge />}
        <div className="flex items-start justify-between gap-2 mb-2">
          <CardTitle
            icon={<Star size={13} className="text-neutral-400" />}
            title="Ranking de redes"
            sub="Top redes por sortimento"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => setExpanded(true)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Expandir"
            >
              <Maximize2 size={14} />
            </button>
            <ExtractDropdown onCsv={handleDownloadCsv} onPdf={handleDownloadPdf} disabled={rows.length === 0} />
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <RankingTable rows={rows} chaveMode={chaveMode} />
        )}
        <div className="h-px bg-neutral-800 my-2" />
        <div className="flex gap-2.5">
          {chaveMode ? (
            <>
              <LegendDot color={GREEN} label="Chave 2" />
              <LegendDot color={ORANGE} label="Chave 1" />
              <LegendDot color={RED} label="Chave 0" />
            </>
          ) : (
            <>
              <LegendDot color={GREEN} label="≥90%" />
              <LegendDot color={ORANGE} label="85–89%" />
              <LegendDot color={RED} label="<85%" />
            </>
          )}
        </div>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent showCloseButton={false} className="w-[min(920px,100vw)] h-[100vh] sm:w-[min(920px,94vw)] sm:h-[92vh] max-w-none sm:max-w-[min(920px,94vw)] p-0 border-neutral-800 bg-[#1a1a1c] overflow-hidden flex flex-col rounded-none sm:rounded-lg">
          <DialogHeader className="px-3 sm:px-4 py-2 sm:py-3 border-b border-neutral-800 shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xs sm:text-sm font-medium text-neutral-100 flex items-center gap-1.5">
                <Star size={14} className="text-neutral-400" />
                Ranking de redes
              </DialogTitle>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <ExtractDropdown onCsv={handleDownloadCsv} onPdf={handleDownloadPdf} disabled={rows.length === 0} />
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors"
                  title="Fechar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </DialogHeader>
          {rows.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <Empty />
            </div>
          ) : (
            <div className="flex-1 min-h-0 p-2 sm:p-4 overflow-hidden">
              <RankingTable rows={rows} chaveMode={chaveMode} expanded />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


function ExtractDropdown({
  onCsv,
  onPdf,
  disabled = false,
}: {
  onCsv: () => void;
  onPdf: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-[11px] text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Extrair"
        >
          <Download size={12} />
          Extrair
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-700 text-neutral-200 min-w-[140px]">
        <DropdownMenuItem onClick={onCsv} className="text-[12px] focus:bg-neutral-800 focus:text-white cursor-pointer">
          <Download size={12} className="mr-2" />
          Extrair em CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPdf} className="text-[12px] focus:bg-neutral-800 focus:text-white cursor-pointer">
          <Download size={12} className="mr-2" />
          Extrair em PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type TeamMode = "gv" | "sv" | "rv";
const TEAM_LABELS: Record<TeamMode, string> = {
  gv: "Cód. Gv/Cv",
  sv: "Cód. Sv",
  rv: "Cód. Rv",
};

function TeamPerformanceCard({
  monthRows,
  estrutura,
  filters,
  chaveMode = false,
  locked = false,
}: {
  monthRows: Row[];
  estrutura: EstruturaRow[];
  filters: Filters;
  chaveMode?: boolean;
  locked?: boolean;
}) {
  const [mode, setMode] = useState<TeamMode>("gv");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const CLUSTER_COLORS: Record<string, string> = {
    Diamante: PURPLE,
    Ouro: "#F1C40F",
    Prata: "#9CA3AF",
  };
  const CLUSTER_ORDER = ["Diamante", "Ouro", "Prata"] as const;

  const teamRows = useMemo(() => {
    const compose = (code: string, name: string) =>
      code ? (name ? `${code} - ${name}` : code) : "";
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const hasCodeFilter = filters.gv.length > 0 || filters.sv.length > 0 || filters.rv.length > 0;
    const matchesCodeFilters = (e: EstruturaRow) =>
      inList(compose(e.gv, e.gvNome), filters.gv) &&
      inList(compose(e.sv, e.svNome), filters.sv) &&
      inList(compose(e.rv, e.rvNome), filters.rv);
    const nameKey = (mode + "Nome") as "gvNome" | "svNome" | "rvNome";
    const teamMap = new Map<string, Set<string>>();
    for (const e of estrutura) {
      if (hasCodeFilter && !matchesCodeFilters(e)) continue;
      const label = compose(e[mode], e[nameKey]);
      if (!label) continue;
      const key = `${e.rede}||${e.distribuidor}`;
      const labels = teamMap.get(key) ?? new Set<string>();
      labels.add(label);
      teamMap.set(key, labels);
    }

    type Agg = {
      label: string;
      allTotal: Set<string>;
      okTotal: Set<string>;
      byCluster: Record<string, { all: Set<string>; ok: Set<string> }>;
    };
    const map = new Map<string, Agg>();
    for (const r of monthRows) {
      const teamLabels = teamMap.get(`${r.rede}||${r.distribuidor}`);
      if (!teamLabels) continue;
      const isOk = isSortOk(r);
      for (const teamLabel of teamLabels) {
        let agg = map.get(teamLabel);
        if (!agg) {
          agg = {
            label: teamLabel,
            allTotal: new Set(),
            okTotal: new Set(),
            byCluster: {
              Diamante: { all: new Set(), ok: new Set() },
              Ouro: { all: new Set(), ok: new Set() },
              Prata: { all: new Set(), ok: new Set() },
            },
          };
          map.set(teamLabel, agg);
        }
        agg.allTotal.add(r.rede);
        if (isOk) agg.okTotal.add(r.rede);
        const cl = agg.byCluster[r.cluster];
        if (cl) {
          cl.all.add(r.rede);
          if (isOk) cl.ok.add(r.rede);
        }
      }
    }
    return [...map.values()]
      .map((a) => ({
        label: a.label,
        total: { ok: a.okTotal.size, all: a.allTotal.size },
        byCluster: CLUSTER_ORDER.map((c) => ({
          label: c,
          ok: a.byCluster[c].ok.size,
          all: a.byCluster[c].all.size,
          color: CLUSTER_COLORS[c],
        })),
      }))
      .sort((a, b) => {
        const pctA = a.total.all > 0 ? a.total.ok / a.total.all : 0;
        const pctB = b.total.all > 0 ? b.total.ok / b.total.all : 0;
        if (pctB !== pctA) return pctB - pctA;
        const numA = parseInt(a.label, 10);
        const numB = parseInt(b.label, 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return a.label.localeCompare(b.label);
      });
  }, [monthRows, estrutura, mode, filters]);

  const renderClusterCell = (ok: number, all: number, color: string) => {
    if (all === 0) {
      return <span className="text-neutral-500 tabular-nums">0 / 0</span>;
    }
    const pct = ok / all;
    const pctColor = color;
    return (
      <span className="tabular-nums whitespace-nowrap">
        <span className="font-semibold" style={{ color }}>
          {ok}
        </span>
        <span className="text-neutral-500"> / {all}</span>{" "}
        <span className="font-semibold" style={{ color: pctColor }}>
          {Math.round(pct * 100)}%
        </span>
      </span>
    );
  };

  const fmtIntPt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const buildExtract = () => {
    const headers = ["Equipe", "Total OK", "Total Redes", "Total %", ...CLUSTER_ORDER.flatMap((c) => [`${c} OK`, `${c} Redes`, `${c} %`])];
    const rows2 = teamRows.map((r) => {
      const totalPct = r.total.all > 0 ? Math.round((r.total.ok / r.total.all) * 100) : 0;
      const clusterCells = r.byCluster.flatMap((c) => {
        const pct = c.all > 0 ? Math.round((c.ok / c.all) * 100) : 0;
        return [c.ok, c.all, c.all > 0 ? `${pct}%` : "—"];
      });
      return [r.label, r.total.ok, r.total.all, r.total.all > 0 ? `${totalPct}%` : "—", ...clusterCells];
    });
    return { headers, rows: rows2 };
  };
  const fileSlug = `performance-equipe-${mode}`;
  const handleDownloadCsv = () => {
    const { headers, rows: rs } = buildExtract();
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";"), ...rs.map((r) => r.map(escape).join(";"))];
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const handleDownloadPdf = () => {
    const { headers, rows: rs } = buildExtract();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`Performance por Equipe — ${TEAM_LABELS[mode]}`, 40, 40);
    autoTable(doc, {
      startY: 60,
      head: [headers],
      body: rs.map((r) => r.map((v) => (typeof v === "number" ? fmtIntPt(v) : String(v)))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`${fileSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <Card className="relative">
      {locked && <MixedPeriodBadge />}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[12px] font-medium text-neutral-100 mb-0.5 flex items-center gap-1.5">
            <Users size={13} className="text-neutral-400" />
            Performance por Equipe
          </div>
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <Check size={11} style={{ color: BLUE }} />
            {chaveMode ? "Redes com Chave 2" : "Redes com sortimento ≥ 90%"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ExtractDropdown onCsv={handleDownloadCsv} onPdf={handleDownloadPdf} disabled={teamRows.length === 0} />
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-full px-3 py-1 text-[11px] flex items-center gap-1.5 border transition-colors bg-[#0E2E4D] border-[#378ADD] text-[#8BBEEC] font-medium"
            >
              <Layers size={12} />
              {TEAM_LABELS[mode]}
              <ChevronDown size={12} />
            </button>
            {open && (
              <div className="absolute right-0 z-20 mt-1 min-w-[140px] bg-[#1a1a1c] border border-neutral-800 rounded-md shadow-lg py-1 text-[11px]">
                {(Object.keys(TEAM_LABELS) as TeamMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-1 hover:bg-neutral-800 ${
                      mode === m ? "text-[#8BBEEC] font-medium" : "text-neutral-200"
                    }`}
                  >
                    {TEAM_LABELS[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {teamRows.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="max-h-[260px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
        >
          <table className="w-full text-[10px] sm:text-[11px]">
            <thead className="sticky top-0 bg-[#1a1a1c] z-10">
              <tr className="text-neutral-400 font-medium border-b border-neutral-800">
                <th className="text-left pb-1.5 font-medium">Equipe</th>
                <th className="text-center pb-1.5 font-medium">Total</th>
                {CLUSTER_ORDER.map((c) => (
                  <th key={c} className="text-center pb-1.5 font-medium">
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: CLUSTER_COLORS[c] }}
                    >
                      <span
                        className="inline-block rounded-full"
                        style={{ width: 6, height: 6, backgroundColor: CLUSTER_COLORS[c] }}
                      />
                      {c}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamRows.map((r) => {
                const totalPct = r.total.all > 0 ? r.total.ok / r.total.all : 0;
                const totalPctColor = "#5FA8E8";
                return (
                  <tr key={r.label} className="border-b border-neutral-800 last:border-0">
                    <td
                      className="py-1 text-neutral-200 truncate pr-2 max-w-[140px]"
                      title={r.label}
                    >
                      {r.label}
                    </td>
                    <td className="py-1 text-center tabular-nums whitespace-nowrap">
                      <span className="font-semibold" style={{ color: "#5FA8E8" }}>
                        {r.total.ok}
                      </span>
                      <span className="text-neutral-500"> / {r.total.all}</span>
                      {r.total.all > 0 && (
                        <>
                          {" "}
                          <span className="font-semibold" style={{ color: totalPctColor }}>
                            {Math.round(totalPct * 100)}%
                          </span>
                        </>
                      )}
                    </td>
                    {r.byCluster.map((c) => (
                      <td key={c.label} className="py-1 text-center">
                        {renderClusterCell(c.ok, c.all, c.color)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}


function GruposNaoBatidosCard({
  rows,
  skusByGroup,
  skuVolumeMap,
  title = "Grupos não batidos",
  subtitleMode = "default",
  showCadastroL3M = false,
  chaveMode = false,
  locked = false,
}: {
  rows: { rede: string; sortimento: number; chave: number | null; target: number; atributo: string; valor: number }[];
  skusByGroup: Map<string, { ean: string; descricao: string }[]>;
  skuVolumeMap: Map<string, number>;
  title?: string;
  subtitleMode?: "default" | "count";
  showCadastroL3M?: boolean;
  chaveMode?: boolean;
  locked?: boolean;
}) {
  const fileSlug = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const fmtInt = (n: number) =>
    n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const visibleRows = rows;

  const handleDownloadCsv = () => {
    const sortLabel = chaveMode ? "Chave" : showCadastroL3M ? "Sort." : "Sortimento";
    const headers = showCadastroL3M
      ? ["Rede", sortLabel, "Grupo", "EAN", "Descrição SKU", "Vendido(Un)", "Cadastro", "Qtd. Cadastro"]
      : ["Rede", sortLabel, "Grupo", "EAN", "Descrição SKU", "Target", "Vendido(Un)", "Faltante"];
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    for (const r of visibleRows) {
      const faltante = Math.max(0, r.target - r.valor);
      const skus = skusByGroup.get(r.atributo) ?? [];
      let cadastrados = 0;
      for (const sku of skus) {
        const v = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        if (v > 0) cadastrados += 1;
      }
      const qtdLabel =
        skus.length === 0
          ? "—"
          : cadastrados >= skus.length
            ? "Todos Itens do AG cadastrados"
            : `${cadastrados} Itens cadastrados dentro do AG`;
      if (!showCadastroL3M) {
        lines.push(
          [r.rede, fmtChaveOrPct(r.chave, r.sortimento), r.atributo, "Total", "Total", r.target, r.valor, faltante]
            .map(escape)
            .join(";"),
        );
      }
      for (const sku of skus) {
        const vol = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        const cadastroLabel = vol > 0 ? "Item Cadastrado" : "Item não Cadastrado";
        if (showCadastroL3M) {
          lines.push(
            [r.rede, fmtChaveOrPct(r.chave, r.sortimento), r.atributo, sku.ean, sku.descricao ?? "", vol, cadastroLabel, qtdLabel]
              .map(escape)
              .join(";"),
          );
        } else {
          lines.push(
            [r.rede, fmtChaveOrPct(r.chave, r.sortimento), r.atributo, sku.ean, sku.descricao ?? "", "", vol, ""]
              .map(escape)
              .join(";"),
          );
        }
      }
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(title, 40, 40);
    const body: (string | number)[][] = [];
    visibleRows.forEach((r) => {
      const faltante = Math.max(0, r.target - r.valor);
      const skus = skusByGroup.get(r.atributo) ?? [];
      let cadastrados = 0;
      for (const sku of skus) {
        const v = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        if (v > 0) cadastrados += 1;
      }
      const qtdLabel =
        skus.length === 0
          ? "—"
          : cadastrados >= skus.length
            ? "Todos Itens do AG cadastrados"
            : `${cadastrados} Itens cadastrados dentro do AG`;
      if (!showCadastroL3M) {
        body.push([
          r.rede,
          fmtChaveOrPct(r.chave, r.sortimento),
          r.atributo,
          "Total",
          "Total",
          fmtInt(r.target),
          fmtInt(r.valor),
          fmtInt(faltante),
        ]);
      }
      for (const sku of skus) {
        const vol = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        const cadastroLabel = vol > 0 ? "Item Cadastrado" : "Item não Cadastrado";
        if (showCadastroL3M) {
          body.push([
            r.rede,
            fmtChaveOrPct(r.chave, r.sortimento),
            r.atributo,
            sku.ean,
            sku.descricao ?? "",
            fmtInt(vol),
            cadastroLabel,
            qtdLabel,
          ]);
        } else {
          body.push([
            r.rede,
            fmtChaveOrPct(r.chave, r.sortimento),
            r.atributo,
            sku.ean,
            sku.descricao ?? "",
            "",
            fmtInt(vol),
            "",
          ]);
        }
      }
    });
    autoTable(doc, {
      startY: 60,
      head: [
        showCadastroL3M
          ? ["Rede", chaveMode ? "Chave" : "Sort.", "Grupo", "EAN", "Descrição SKU", "Vendido(Un)", "Cadastro", "Qtd. Cadastro"]
          : ["Rede", chaveMode ? "Chave" : "Sortimento", "Grupo", "EAN", "Descrição SKU", "Target", "Vendido(Un)", "Faltante"],
      ],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`${fileSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };


  return (
    <div className="relative bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5">
      {locked && <MixedPeriodBadge />}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[12px] font-medium text-neutral-100 mb-0.5 flex items-center gap-1.5">
            <Star size={13} className="text-neutral-400" />
            {title}
          </div>
          <div className="text-[11px] text-neutral-400">
            {subtitleMode === "count"
              ? `${visibleRows.length.toLocaleString("pt-BR")} grupos`
              : `${visibleRows.length.toLocaleString("pt-BR")} grupos faltantes`}

          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={visibleRows.length === 0}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-[11px] text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Extrair"
            >
              <Download size={12} />
              Extrair
              <ChevronDown size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-neutral-900 border-neutral-700 text-neutral-200 min-w-[140px]"
          >
            <DropdownMenuItem
              onClick={handleDownloadCsv}
              className="text-[12px] focus:bg-neutral-800 focus:text-white cursor-pointer"
            >
              <Download size={12} className="mr-2" />
              Extrair em CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDownloadPdf}
              className="text-[12px] focus:bg-neutral-800 focus:text-white cursor-pointer"
            >
              <Download size={12} className="mr-2" />
              Extrair em PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>

      {visibleRows.length === 0 ? (
        <Empty />
      ) : (
        <VirtualizedGruposList
          rows={visibleRows}
          skusByGroup={skusByGroup}
          skuVolumeMap={skuVolumeMap}
          expanded={expanded}
          toggleExpand={toggleExpand}
          fmtInt={fmtInt}
          showCadastroL3M={showCadastroL3M}
          chaveMode={chaveMode}
        />
      )}
    </div>
  );
}

const GRUPOS_GRID_COLS =
  "grid-cols-[28%_1fr_36px_48px_56px_48px] sm:grid-cols-[26%_1fr_48px_64px_80px_64px]";
const GRUPOS_GRID_COLS_EXT =
  "grid-cols-[180px_minmax(220px,1fr)_48px_80px_140px_200px] sm:grid-cols-[220px_minmax(260px,1fr)_56px_88px_160px_240px]";


type GruposRow = { rede: string; sortimento: number; chave: number | null; target: number; atributo: string; valor: number };
type FlatItem =
  | { kind: "group"; row: GruposRow; rowKey: string; skuCount: number; cadastrados: number; index: number; qtdLabel: string; qtdColor: string }
  | { kind: "sku"; ean: string; descricao: string; vol: number; parentKey: string; parentQtdLabel?: string; parentQtdColor?: string };

function VirtualizedGruposList({
  rows,
  skusByGroup,
  skuVolumeMap,
  expanded,
  toggleExpand,
  fmtInt,
  showCadastroL3M = false,
  chaveMode = false,
}: {
  rows: GruposRow[];
  skusByGroup: Map<string, { ean: string; descricao: string }[]>;
  skuVolumeMap: Map<string, number>;
  expanded: Set<string>;
  toggleExpand: (key: string) => void;
  fmtInt: (n: number) => string;
  showCadastroL3M?: boolean;
  chaveMode?: boolean;
}) {
  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    rows.forEach((r, i) => {
      const rowKey = `${r.rede}-${r.atributo}-${i}`;
      const skus = skusByGroup.get(r.atributo) ?? [];
      let cadastrados = 0;
      for (const sku of skus) {
        const v = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        if (v > 0) cadastrados += 1;
      }
      const qtdLabel =
        skus.length === 0
          ? "—"
          : cadastrados >= skus.length
            ? "Todos Itens do AG cadastrados"
            : `${cadastrados} Itens cadastrados dentro do AG`;
      const qtdColor =
        skus.length === 0
          ? "#F87171"
          : cadastrados >= skus.length
            ? "#22C55E"
            : cadastrados === 0
              ? "#F87171"
              : "#FBBF24";
      out.push({ kind: "group", row: r, rowKey, skuCount: skus.length, cadastrados, index: i, qtdLabel, qtdColor });
      if (expanded.has(rowKey)) {
        for (const sku of skus) {
          const vol = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
          out.push({
            kind: "sku",
            ean: sku.ean,
            descricao: sku.descricao,
            vol,
            parentKey: rowKey,
            parentQtdLabel: qtdLabel,
            parentQtdColor: qtdColor,
          });
        }
      }
    });
    return out;
  }, [rows, skusByGroup, skuVolumeMap, expanded]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  });

  const gridCols = showCadastroL3M ? GRUPOS_GRID_COLS_EXT : GRUPOS_GRID_COLS;

  return (
    <div
      ref={parentRef}
      className="max-h-[calc(100vh-180px)] overflow-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full text-[9px] sm:text-[11px]"
      style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
    >
      <div
        className={`grid ${gridCols} sticky top-0 bg-[#141416] z-10 text-neutral-400 font-medium border-b border-neutral-800`}
      >
        <div className="text-left pb-1 sm:pb-1.5 pr-1 sm:pr-2">Rede</div>
        <div className="text-left pb-1 sm:pb-1.5 pl-1 sm:pl-2">Grupo</div>
        <div className="text-center pb-1 sm:pb-1.5">{chaveMode ? "Chave" : showCadastroL3M ? "Sort." : "%"}</div>
        {!showCadastroL3M && <div className="text-right pb-1 sm:pb-1.5">Target</div>}
        <div className="text-right pb-1 sm:pb-1.5">Vendido(Un)</div>
        {!showCadastroL3M && <div className="text-right pb-1 sm:pb-1.5">Faltante</div>}
        {showCadastroL3M && (
          <>
            <div className="text-center pb-1 sm:pb-1.5 pl-2">Cadastro</div>
            <div className="text-left pb-1 sm:pb-1.5 pl-2">Qtd. Cadastro</div>
          </>
        )}
      </div>

      <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
        {virtualizer.getVirtualItems().map((v) => {
          const it = items[v.index];
          const common: React.CSSProperties = {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${v.start}px)`,
          };
          if (it.kind === "group") {
            const r = it.row;
            const faltante = Math.max(0, r.target - r.valor);
            const sortColor =
              r.chave != null
                ? colorForChave(r.chave)
                : r.sortimento >= 0.9
                  ? "#22C55E"
                  : r.sortimento >= 0.85
                    ? ORANGE
                    : RED;
            const isExpanded = expanded.has(it.rowKey);
            return (
              <div
                key={it.rowKey}
                ref={virtualizer.measureElement}
                data-index={v.index}
                style={common}
                className={`grid ${gridCols} border-b border-neutral-800 hover:bg-neutral-800/40 transition-colors`}
              >
                <div
                  className="py-0.5 sm:py-1 truncate pr-1 sm:pr-2 text-neutral-200"
                  title={r.rede}
                >
                  {r.rede}
                </div>
                <div
                  className="py-0.5 sm:py-1 pr-1 sm:pr-2 pl-1 sm:pl-2 text-neutral-200 min-w-0"
                  title={r.atributo}
                >
                  <span className="inline-flex items-center gap-1 max-w-full">
                    {it.skuCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(it.rowKey)}
                        className="text-neutral-400 hover:text-neutral-100 -ml-1 shrink-0"
                        aria-label="Expandir SKUs"
                      >
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                    ) : (
                      <span className="w-[11px] inline-block shrink-0" />
                    )}
                    <span className="truncate">{r.atributo}</span>
                  </span>
                </div>
                <div
                  className="py-0.5 sm:py-1 text-center tabular-nums font-medium"
                  style={{ color: sortColor }}
                >
                  {fmtChaveOrPct(r.chave, r.sortimento)}
                </div>
                {!showCadastroL3M && (
                  <div className="py-0.5 sm:py-1 text-right tabular-nums text-neutral-300">
                    {fmtInt(r.target)}
                  </div>
                )}
                <div className="py-0.5 sm:py-1 text-right tabular-nums font-medium text-neutral-200">
                  {fmtInt(r.valor)}
                </div>
                {!showCadastroL3M && (
                  <div className="py-0.5 sm:py-1 text-right tabular-nums font-medium text-[#F87171]">
                    {fmtInt(faltante)}
                  </div>
                )}

                {showCadastroL3M && (
                  <>
                    <div className="py-0.5 sm:py-1 text-center truncate text-neutral-400" title={it.qtdLabel}>
                      —
                    </div>
                    <div
                      className="py-0.5 sm:py-1 pl-2 truncate font-medium"
                      style={{ color: it.qtdColor }}
                      title={it.qtdLabel}
                    >
                      {it.qtdLabel}
                    </div>
                  </>
                )}
              </div>
            );
          }
          const cadastroLabel = it.vol > 0 ? "Item Cadastrado" : "Item não Cadastrado";
          const cadastroColor = it.vol > 0 ? "#22C55E" : "#F87171";
          return (
            <div
              key={`${it.parentKey}-${it.ean}`}
              ref={virtualizer.measureElement}
              data-index={v.index}
              style={common}
              className={`grid ${gridCols} border-b border-neutral-800/60 hover:bg-neutral-800/30 transition-colors`}
            >
              <div className="py-0.5 sm:py-1" />
              <div
                className="py-0.5 sm:py-1 truncate pr-1 sm:pr-2 pl-5 sm:pl-7 text-[10px] text-neutral-400"
                title={`${it.ean} - ${it.descricao}`}
              >
                {it.ean}
                {it.descricao ? ` - ${it.descricao}` : ""}
              </div>
              <div />
              {!showCadastroL3M && <div />}
              <div className="py-0.5 sm:py-1 text-right tabular-nums text-[10px] text-neutral-300">
                {fmtInt(it.vol)}
              </div>
              {!showCadastroL3M && <div />}

              {showCadastroL3M && (
                <>
                  <div
                    className="py-0.5 sm:py-1 text-center truncate text-[10px] font-medium"
                    style={{ color: cadastroColor }}
                    title={cadastroLabel}
                  >
                    {cadastroLabel}
                  </div>
                  <div
                    className="py-0.5 sm:py-1 pl-2 truncate text-[10px] font-medium"
                    style={{ color: it.parentQtdColor || "#9CA3AF" }}
                    title={it.parentQtdLabel || ""}
                  >
                    {it.parentQtdLabel || ""}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}




/** Etiqueta discreta que "espia" atrás do card, avisando que ele trava em período misto. */
function MixedPeriodBadge() {
  return (
    <div
      className="absolute -top-2 -right-2 z-0 flex items-center justify-center w-5 h-5 rounded-full bg-[#3D2A10] border border-[#7A5215] text-[#F1B257] shadow-md"
      title="Este card não se altera com períodos múltiplos selecionados."
    >
      <AlertTriangle size={11} />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="text-[10px] flex items-center gap-1 text-neutral-400">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Empty() {
  return (
    <div className="text-[11px] text-neutral-500 text-center py-6">
      Sem dados para os filtros selecionados.
    </div>
  );
}


/* ---------------- Line History Card ---------------- */

type LineHistoryProps = {
  icon: React.ReactNode;
  title: string;
  sub: string;
  color: string;
  months: string[];
  total: number[];
  groups: { name: string; values: number[] }[];
  extra?: { name: string; values: number[]; color: string; dashed?: boolean };
  yFormat: (n: number) => string;
  pointFormat: (n: number, i: number) => string;
  reference?: { value: number; label: string };
  forceMax?: number;
  deltaMode?: "pct" | "pp";
  badgeBg: string;
  badgeFg: string;
  distribuidores?: string[];
  pointSubLabel?: {
    values: number[];
    format: (n: number) => string;
    threshold: number;
    activeColor: string;
  };
};

function ModeToggle({
  mode,
  setMode,
  hasGroups,
}: {
  mode: "total" | "cluster";
  setMode: (m: "total" | "cluster") => void;
  hasGroups: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full px-3 py-1 text-[11px] flex items-center gap-1.5 border transition-colors ${
          mode === "cluster"
            ? "bg-[#0E2E4D] border-[#378ADD] text-[#8BBEEC] font-medium"
            : "bg-[#1a1a1c] border-neutral-800 text-neutral-400 hover:border-neutral-700"
        }`}
      >
        <Layers size={12} />
        {mode === "total" ? "Total" : "Por cluster"}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[140px] bg-[#1a1a1c] border border-neutral-800 rounded-md shadow-lg py-1 text-[11px]">
          {(["total", "cluster"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-1 hover:bg-neutral-800 ${
                mode === m ? "text-[#8BBEEC] font-medium" : "text-neutral-200"
              }`}
              disabled={m === "cluster" && !hasGroups}
            >
              {m === "total" ? "Total" : "Por cluster"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LineHistoryCard(p: LineHistoryProps) {
  const [mode, setMode] = useState<"total" | "cluster">("total");
  const [expanded, setExpanded] = useState(false);

  const showCluster = mode === "cluster" && p.groups.length > 0;

  const CLUSTER_COLORS: Record<string, string> = {
    Diamante: PURPLE,
    Ouro: "#F1C40F",
    Prata: "#9CA3AF",
  };
  const colorForGroup = (name: string, idx: number) =>
    CLUSTER_COLORS[name] ?? PALETTE[idx % PALETTE.length];

  // Compute y-domain (yMin..yMax) — no modo cluster usamos eixo "ajustado" (não parte do zero)
  const allValues: number[] = [];
  if (showCluster) {
    p.groups.forEach((g) => g.values.forEach((v) => allValues.push(v)));
  } else {
    p.total.forEach((v) => allValues.push(v));
  }
  if (p.extra && !showCluster) p.extra.values.forEach((v) => allValues.push(v));
  if (p.reference) allValues.push(p.reference.value);
  const rawMax = Math.max(1, ...allValues);
  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const yMax = p.forceMax ?? (showCluster ? rawMax * 1.05 : rawMax * 1.1);
  const yMin = showCluster && !p.forceMax ? Math.max(0, rawMin * 0.9) : 0;
  const ySpan = Math.max(1, yMax - yMin);

  // SVG layout — modo cluster ganha altura extra. H varia por variante (compacto/expandido);
  // o resto do layout é recalculado em função dela para manter a proporção sem sobrar espaço vazio.
  const W = 400;
  const padL = 44;
  const padR = 16;
  const padB = 30;
  const innerW = W - padL - padR;
  const n = p.months.length;
  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1);
  const geomFor = (H: number, padT: number) => {
    const innerH = H - padT - padB;
    const yAt = (v: number) => padT + innerH - ((v - yMin) / ySpan) * innerH;
    const polylinePoints = (vals: number[]) =>
      vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
    const areaPath = (vals: number[]) => {
      if (vals.length === 0) return "";
      const baseY = padT + innerH;
      const pts = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L ");
      return `M ${xAt(0)},${baseY} L ${pts} L ${xAt(vals.length - 1)},${baseY} Z`;
    };
    return { innerH, yAt, polylinePoints, areaPath };
  };

  const lastTotal = p.total[p.total.length - 1] ?? 0;
  const prevTotal = p.total[p.total.length - 2] ?? 0;
  let deltaText = "—";
  if (n > 1) {
    if (p.deltaMode === "pp") {
      const diff = (lastTotal - prevTotal) * 100;
      deltaText = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} p.p. vs mês ant.`;
    } else {
      const pct = prevTotal > 0 ? (lastTotal - prevTotal) / prevTotal : 0;
      deltaText = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}% vs mês ant.`;
    }
  }

  // Stable gradient id per card instance
  const gradIdRef = useRef(`grad-${Math.random().toString(36).slice(2)}`);

  // Key that changes whenever the underlying data changes → re-triggers CSS animation.
  const animKey =
    p.months.join("|") +
    "#" +
    p.total.join(",") +
    "#" +
    p.groups.map((g) => g.name + ":" + g.values.join(",")).join("|") +
    "#" +
    (showCluster ? "c" : "t");

  function headerRow(variant: "card" | "dialog") {
    const TitleTag = variant === "dialog" ? DialogTitle : "div";
    return (
      <div className="flex items-start justify-between gap-2 mb-2 shrink-0">
        <div>
          <TitleTag className="text-[12px] font-medium text-neutral-100 flex items-center gap-1.5 flex-wrap">
            {p.icon}
            {p.title}
            {p.distribuidores && p.distribuidores.length > 0 && (
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: p.badgeBg, color: p.badgeFg }}
                title={p.distribuidores.join(", ")}
              >
                {p.distribuidores.length === 1
                  ? p.distribuidores[0]
                  : `${p.distribuidores.length} distribuidores`}
              </span>
            )}
          </TitleTag>
          <div className="text-[11px] text-neutral-400 mt-0.5">{p.sub}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ModeToggle mode={mode} setMode={setMode} hasGroups={p.groups.length > 0} />
          {variant === "card" ? (
            <button
              type="button"
              disabled={n === 0}
              onClick={() => setExpanded(true)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Expandir"
            >
              <Maximize2 size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-neutral-700/80 bg-neutral-800/60 text-neutral-200 hover:bg-neutral-700/60 hover:text-white transition-colors"
              title="Fechar"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    <Card>
      {headerRow("card")}
      {chartBody("compact")}
    </Card>

    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent showCloseButton={false} className="w-[min(900px,100vw)] h-[100vh] sm:w-[min(900px,94vw)] sm:h-[92vh] max-w-none sm:max-w-[min(900px,94vw)] p-3 sm:p-4 border-neutral-800 bg-[#1a1a1c] overflow-hidden flex flex-col rounded-none sm:rounded-lg gap-0">
        {headerRow("dialog")}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-stretch justify-center">
          <div className="w-full max-w-[680px] mx-auto flex flex-col items-start">
            {chartBody("expanded")}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );

  function chartBody(variant: "compact" | "expanded") {
    // Mesma escala/proporção (viewBox) do card original em ambas as variantes — no modal
    // o SVG só cresce em pixels (via h-auto) porque o container é mais largo, sem distorcer.
    const H = showCluster ? 260 : 170;
    // No modal, cluster ganha um pouco mais de espaço no topo para os rótulos empilhados
    // não vazarem para fora do viewBox (o que forçava scrollbar no container).
    const padT = variant === "expanded" && showCluster ? 34 : 10;
    const { innerH, yAt, polylinePoints, areaPath } = geomFor(H, padT);
    const gradId = variant === "expanded" ? `${gradIdRef.current}-exp` : gradIdRef.current;
    return (
    <>
      {n === 0 ? (
        <Empty />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`w-full overflow-visible ${
            variant === "expanded" ? "h-auto" : showCluster ? "h-[260px]" : "h-[170px]"
          }`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity="0.45" />
              <stop offset="60%" stopColor={p.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0" />
            </linearGradient>
            {showCluster &&
              p.groups.map((g, idx) => {
                const c = colorForGroup(g.name, idx);
                return (
                  <linearGradient key={`${gradId}-${idx}`} id={`${gradId}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={c} stopOpacity="0" />
                  </linearGradient>
                );
              })}
          </defs>
          {/* Eixos / grid */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#2a2a2c" strokeWidth="0.5" />
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="#2a2a2c" strokeWidth="0.5" />
          <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#2a2a2c" strokeWidth="0.5" strokeDasharray="3 3" />
          <line x1={padL} y1={padT + innerH / 2} x2={W - padR} y2={padT + innerH / 2} stroke="#2a2a2c" strokeWidth="0.5" strokeDasharray="3 3" />
          {/* Y labels */}
          <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="9" fill="#888780">{p.yFormat(yMax)}</text>
          <text x={padL - 6} y={padT + innerH / 2 + 3} textAnchor="end" fontSize="9" fill="#888780">{p.yFormat(yMin + ySpan / 2)}</text>
          <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="9" fill="#888780">{p.yFormat(yMin)}</text>
          {/* X labels */}
          {p.months.map((m, i) => (
            <text key={m} x={xAt(i)} y={padT + innerH + 16} textAnchor="middle" fontSize="10" fill="#888780">
              {fmtMonth(m)}
            </text>
          ))}
          {/* Linha de referência */}
          {p.reference && (
            <>
              <line
                x1={padL}
                y1={yAt(p.reference.value)}
                x2={W - padR}
                y2={yAt(p.reference.value)}
                stroke={RED}
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.7"
              />
              <text x={W - padR} y={yAt(p.reference.value) - 3} textAnchor="end" fontSize="9" fill={RED}>
                {p.reference.label}
              </text>
            </>
          )}
          {/* Linha extra (potencial) — sempre como total, oculta no modo cluster */}
          {p.extra && !showCluster && (
            <g key={`ex-${animKey}`}>
              <polyline
                points={polylinePoints(p.extra.values)}
                fill="none"
                stroke={p.extra.color}
                strokeWidth="1.5"
                strokeDasharray={p.extra.dashed ? "5 3" : undefined}
                pathLength={p.extra.dashed ? undefined : 1}
                className={p.extra.dashed ? undefined : "line-draw"}
              />
              {p.extra.values.map((v, i) => (
                <circle
                  key={`ex-${i}`}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r="3"
                  fill={p.extra!.color}
                  className="line-point-pop"
                  style={{ animationDelay: `${400 + i * 80}ms` }}
                />
              ))}
            </g>
          )}
          {/* Linhas principais */}
          {showCluster ? (
            <g key={`cl-${animKey}`}>
              {p.groups.map((g, idx) => {
                const c = colorForGroup(g.name, idx);
                return (
                  <g key={g.name}>
                    <polyline
                      points={polylinePoints(g.values)}
                      fill="none"
                      stroke={c}
                      strokeWidth="1.8"
                      pathLength={1}
                      className="line-draw"
                      style={{ animationDelay: `${idx * 120}ms` }}
                    />
                    {g.values.map((v, i) => (
                      <circle
                        key={`${g.name}-${i}`}
                        cx={xAt(i)}
                        cy={yAt(v)}
                        r="3"
                        fill={c}
                        className="line-point-pop"
                        style={{ animationDelay: `${idx * 120 + 400 + i * 60}ms` }}
                      />
                    ))}
                  </g>
                );
              })}
              {/* Rótulos com anti-colisão: por mês, empilhar de cima para baixo respeitando espaçamento mínimo */}
              {p.months.map((_, i) => {
                const MIN_GAP = 11;
                const items = p.groups
                  .map((g, idx) => ({
                    name: g.name,
                    color: colorForGroup(g.name, idx),
                    value: g.values[i],
                    y: yAt(g.values[i]),
                  }))
                  .sort((a, b) => a.y - b.y); // do topo para a base
                // Resolve colisões empurrando para baixo
                const placedY: number[] = [];
                items.forEach((it, k) => {
                  let y = it.y - 6; // posição desejada acima do ponto
                  if (k > 0 && y - placedY[k - 1] < MIN_GAP) y = placedY[k - 1] + MIN_GAP;
                  placedY.push(y);
                });
                return items.map((it, k) => (
                  <text
                    key={`lbl-${i}-${it.name}`}
                    x={xAt(i)}
                    y={placedY[k]}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="600"
                    fill={it.color}
                    stroke="#0a0a0a"
                    strokeWidth="2.5"
                    style={{ paintOrder: "stroke" }}
                    className="line-point-pop"
                  >
                    {p.pointFormat(it.value, i)}
                  </text>
                ));
              })}
            </g>
          ) : (
            <g key={`tt-${animKey}`}>
              <path d={areaPath(p.total)} fill={`url(#${gradId})`} className="line-area-fade" />
              <polyline
                points={polylinePoints(p.total)}
                fill="none"
                stroke={p.color}
                strokeWidth="2"
                pathLength={1}
                className="line-draw"
              />

              {p.total.map((v, i) => {
                const subVal = p.pointSubLabel?.values[i];
                const subColor =
                  p.pointSubLabel && subVal !== undefined
                    ? subVal > p.pointSubLabel.threshold
                      ? p.pointSubLabel.activeColor
                      : "#fff"
                    : "#fff";
                const mainY = p.pointSubLabel ? yAt(v) - 7 : yAt(v) - 7;
                const subY = yAt(v) - 18;
                const delay = 500 + i * 70;
                return (
                  <g key={`t-${i}`}>
                    <circle
                      cx={xAt(i)}
                      cy={yAt(v)}
                      r="4"
                      fill={p.color}
                      className="line-point-pop"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                    {p.pointSubLabel && subVal !== undefined && (
                      <text
                        x={xAt(i)}
                        y={subY}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill={subColor}
                        className="line-point-pop"
                        style={{ animationDelay: `${delay + 60}ms` }}
                      >
                        {p.pointSubLabel.format(subVal)}
                      </text>
                    )}
                    <text
                      x={xAt(i)}
                      y={mainY}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="500"
                      fill="#fff"
                      className="line-point-pop"
                      style={{ animationDelay: `${delay + 60}ms` }}
                    >
                      {p.pointFormat(v, i)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

        </svg>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {showCluster ? (
          <>
            {p.groups.map((g, idx) => (
              <LineLegend
                key={g.name}
                color={colorForGroup(g.name, idx)}
                label={g.name}
              />
            ))}
          </>
        ) : (
          <>
            <LineLegend color={p.color} label={p.title.split(" ")[0]} />
            {p.extra && <LineLegend color={p.extra.color} label={p.extra.name} dashed={p.extra.dashed} />}
          </>
        )}
      </div>

      {n > 1 && (
        <span
          className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-2"
          style={{ background: p.badgeBg, color: p.badgeFg }}
        >
          {deltaText}
        </span>
      )}
    </>
    );
  }
}

function LineLegend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="text-[10px] flex items-center gap-1 text-neutral-400">
      <span
        className="inline-block w-3.5 h-[2px] rounded-sm"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}



