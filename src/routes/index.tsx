import { createFileRoute } from "@tanstack/react-router";
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  Star,
  ChevronDown,
  ChevronRight,
  X,
  Download,
  Rocket,
  Users,
  Maximize2,
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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCountUp } from "@/lib/use-count-up";
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
} from "@/lib/dashboard-data";



import {
  EMPTY_FILTERS,
  applyAllFilters,
  applyBaseFilters,
  computeAgsByCanalMix,
  computeByCluster,
  computeEvolution,
  computeKpis,
  computeMonthlySeries,
  computeRanking,
  fmtBRL,
  fmtMonth,
  fmtPct,
  latestMonth,
  reduceAtingimento,
  reduceRedesOk,
  reduceSumFaturamento,
  reduceSumGerado,
  reduceSumPotencial,
  optionsFor,
  uniqueMonths,
  type Filters,
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
const PALETTE = [GREEN, PURPLE, ORANGE, BLUE, RED, LIGHT_BLUE, "#5DCAA5", "#F1B257"];

export function Dashboard() {
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [allAgRows, setAllAgRows] = useState<AgRow[]>([]);
  const [estrutura, setEstrutura] = useState<EstruturaRow[]>([]);
  const [allIniciativas, setAllIniciativas] = useState<IniciativaRow[]>([]);
  const [estruturaGrupos, setEstruturaGrupos] = useState<EstruturaGrupoRow[]>([]);
  const [allSkuRows, setAllSkuRows] = useState<SkuRow[]>([]);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const refresh = async () => {
    const { rows, agRows, estrutura, iniciativas, estruturaGrupos, skuRows, meta } =
      await loadRowsFromCloud();
    setAllRows(rows);
    setAllAgRows(agRows);
    setEstrutura(estrutura);
    setAllIniciativas(iniciativas);
    setEstruturaGrupos(estruturaGrupos);
    setAllSkuRows(skuRows);
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

  const baseRows = useMemo(() => applyBaseFilters(rows, dFilters), [rows, dFilters]);
  const monthRows = useMemo(() => {
    const set = new Set(selectedMonths);
    return baseRows.filter((r) => set.has(r.mes));
  }, [baseRows, selectedMonths]);
  const kpis = useMemo(
    () => computeKpis(rows, baseRows, selectedMonths),
    [rows, baseRows, selectedMonths],
  );
  const clusters = useMemo(() => computeByCluster(monthRows), [monthRows]);
  const sortimentoByCanal = useMemo(() => {
    const map = new Map<string, { ok: Set<string>; all: Set<string> }>();
    for (const r of monthRows) {
      const k = r.canal || "—";
      const cur = map.get(k) ?? { ok: new Set<string>(), all: new Set<string>() };
      cur.all.add(r.rede);
      if (r.sortimento >= 0.9) cur.ok.add(r.rede);
      map.set(k, cur);
    }
    return [...map.entries()]
      .map(([canal, v]) => ({ canal, pct: v.all.size > 0 ? v.ok.size / v.all.size : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [monthRows]);
  const sortimentoByCluster = useMemo(() => {
    const order = ["Diamante", "Ouro", "Prata"] as const;
    const colors: Record<string, string> = {
      Diamante: PURPLE,
      Ouro: "#F1C40F",
      Prata: "#9CA3AF",
    };
    const map = new Map<string, { ok: Set<string>; all: Set<string> }>();
    for (const r of monthRows) {
      const k = r.cluster || "—";
      const cur = map.get(k) ?? { ok: new Set<string>(), all: new Set<string>() };
      cur.all.add(r.rede);
      if (r.sortimento >= 0.9) cur.ok.add(r.rede);
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
  }, [monthRows]);
  const evolution = useMemo(() => computeEvolution(baseRows), [baseRows]);
  const ranking = useMemo(() => computeRanking(monthRows, 9999), [monthRows]);
  const canalMix = useMemo(() => computeAgsByCanalMix(monthRows), [monthRows]);

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

  // Tabela "Grupos não batidos": positivação == 0
  const gruposNaoBatidos = useMemo(() => {
    const sortMap = new Map<string, number>();
    for (const r of monthRows) {
      const cur = sortMap.get(r.rede);
      sortMap.set(r.rede, cur == null ? r.sortimento : Math.max(cur, r.sortimento));
    }
    return agMonthRows
      .filter((r) => Number(r.positivacao) === 0)
      .map((r) => ({
        rede: r.rede,
        sortimento: sortMap.get(r.rede) ?? 0,
        target: r.targetUnidades,
        atributo: r.atributo,
        valor: r.valor,
      }))
      .sort((a, b) => a.rede.localeCompare(b.rede) || a.atributo.localeCompare(b.atributo));
  }, [agMonthRows, monthRows]);

  // Tabela "Sortimento de Mix": todos os grupos (batidos ou não)
  const sortimentoMix = useMemo(() => {
    const sortMap = new Map<string, number>();
    for (const r of monthRows) {
      const cur = sortMap.get(r.rede);
      sortMap.set(r.rede, cur == null ? r.sortimento : Math.max(cur, r.sortimento));
    }
    return agMonthRows
      .map((r) => ({
        rede: r.rede,
        sortimento: sortMap.get(r.rede) ?? 0,
        target: r.targetUnidades,
        atributo: r.atributo,
        valor: r.valor,
      }))
      .sort((a, b) => a.rede.localeCompare(b.rede) || a.atributo.localeCompare(b.atributo));
  }, [agMonthRows, monthRows]);


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
      const ok = new Set(monthData.filter((r) => r.sortimento >= 0.9).map((r) => r.rede)).size;
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
            Histórico de performance das redes participantes ·{" "}
            <span className="text-neutral-300">{meta.rowCount}</span> linhas · atualizado em{" "}
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
      <SectionLabel>
        Indicadores principais
        {isAccumulated
          ? ` · Acumulado (${selectedMonths.length} meses)`
          : selectedMonths.length === 1
            ? ` · ${fmtMonth(selectedMonths[0])}`
            : ""}
      </SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
        <KpiCard
          color={GREEN}
          icon={<Banknote size={13} style={{ color: GREEN }} />}
          label="Investimento gerado"
          value={fmtBRL(kpis.gerado)}
          valueColor="#3DD9A4"
          sub={`Potencial: ${fmtBRL(kpis.potencial)}`}
          progressLabel="Atingimento"
          progressValue={fmtPct(kpis.atingimentoVerba)}
          progressPct={Math.min(100, kpis.atingimentoVerba * 100)}
          rightStat={{ label: "Faturamento", value: fmtBRL(kpis.faturamento) }}
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
          categoryTitle="Por Cluster"
          categoryBreakdown={sortimentoByCluster}
          color={BLUE}
          icon={<Check size={13} style={{ color: BLUE }} />}
          label="Redes com sortimento ≥ 90%"
          value={
            <>
              {kpis.redesSortimentoOk}{" "}
              <span className="text-[14px] text-neutral-400 font-normal">
                / {kpis.redesAtivas}
              </span>
            </>
          }
          valueColor="#5FA8E8"
          sub="Redes ativas no período"
          progressLabel="Taxa de conversão"
          progressValue={fmtPct(kpis.taxaConversao)}
          progressPct={kpis.taxaConversao * 100}
          progressTarget={60}
          badge={
            kpis.redesOkDelta == null
              ? { text: "sem mês anterior", bg: "#1a1a1c", fg: "#888" }
              : {
                  text: `${kpis.redesOkDelta >= 0 ? "+" : ""}${kpis.redesOkDelta} redes vs mês ant.`,
                  bg: "#0E2E4D",
                  fg: "#8BBEEC",
                }
          }
          footerRight={
            <span
              className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#241F4D", color: "#A39DE5" }}
            >
              {kpis.cnpjsAtivos.toLocaleString("pt-BR")} CNPJs ativos
            </span>
          }

        />
        <KpiCard
          color={ORANGE}
          icon={<Target size={13} style={{ color: ORANGE }} />}
          label="% Atingimento da verba"
          value={fmtPct(kpis.atingimentoVerba)}
          valueColor="#F1B257"
          sub="Invest. Gerado / Potencial"
          progressLabel="Meta: 85%"
          progressValue={
            kpis.atingimentoDeltaPP == null
              ? "—"
              : `${kpis.atingimentoDeltaPP >= 0 ? "+" : ""}${kpis.atingimentoDeltaPP.toFixed(1)} p.p.`
          }
          progressPct={Math.min(100, kpis.atingimentoVerba * 100)}
          badge={
            kpis.atingimentoVerba >= 0.85
              ? { text: "▲ Meta atingida", bg: "#11402F", fg: "#7DE5BD" }
              : { text: "▼ Abaixo da meta", bg: "#3D2A10", fg: "#F1B257" }
          }
        />
        <div className="relative min-h-0">
          <div className="sm:absolute sm:inset-0">
            <IniciativasCard data={iniciativasStats} />
          </div>
        </div>

      </div>

      {/* Histórico mês a mês */}
      <SectionLabel>
        Histórico mês a mês
        {histGerado.months.length > 0
          ? ` · ${fmtMonth(histGerado.months[0])} → ${fmtMonth(histGerado.months[histGerado.months.length - 1])}`
          : ""}
      </SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-3">
        <LineHistoryCard
          icon={<Banknote size={13} style={{ color: GREEN }} />}
          title="Investimento gerado vs potencial"
          sub="Valores acumulados mensais (R$)"
          color={GREEN}
          months={histGerado.months}
          total={histGerado.total}
          groups={histGerado.groups}
          extra={{ name: "Potencial", values: histPotencial.total, color: LIGHT_BLUE, dashed: true }}
          yFormat={(n) => fmtBRL(n)}
          pointFormat={(n) => fmtBRL(n)}
          badgeBg="#11402F"
          badgeFg="#7DE5BD"
          distribuidores={dFilters.distribuidor}
        />
        {(() => {
          const singleRede = dFilters.rede.length === 1 ? dFilters.rede[0] : null;
          if (singleRede) {
            const sortPorMes = histRedesOk.months.map((m) => {
              let v = 0;
              for (const r of baseRows) {
                if (r.mes === m && r.rede === singleRede && r.sortimento > v) v = r.sortimento;
              }
              return v;
            });
            return (
              <LineHistoryCard
                icon={<Check size={13} style={{ color: BLUE }} />}
                title="Redes com sortimento ≥ 90%"
                sub="Sortimento"
                color={BLUE}
                months={histRedesOk.months}
                total={sortPorMes}
                groups={[]}
                yFormat={(n) => fmtPct(n, 0)}
                pointFormat={(n) => fmtPct(n, 1)}
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
              title="Redes com sortimento ≥ 90%"
              sub="Qtd. de redes atingindo o mix mínimo"
              color={BLUE}
              months={histRedesOk.months}
              total={histRedesOk.total}
              groups={histRedesOk.groups}
              yFormat={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              pointFormat={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
              pointSubLabel={{
                values: histConversao,
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
          months={histAtingimento.months}
          total={histAtingimento.total}
          groups={histAtingimento.groups}
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
          months={histFaturamento.months}
          total={histFaturamento.total}
          groups={histFaturamento.groups}
          yFormat={(n) => fmtBRL(n)}
          pointFormat={(n) => fmtBRL(n)}
          badgeBg="#241F4D"
          badgeFg="#A39DE5"
          distribuidores={dFilters.distribuidor}
        />
      </div>


      {/* Linha intermediária */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2.5 mb-3">
        <ClusterCard data={clusters} />
        <ChannelSortimentoCard rows={sortimentoByCanal} />
      </div>

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2.5 mb-3">
        <RankingCard rows={ranking} />
        <TeamPerformanceCard monthRows={monthRows} estrutura={estrutura} filters={dFilters} />
      </div>


      {/* Grupos não batidos (dataset 'dados ags') */}
      <div className="grid grid-cols-1 gap-2.5 mb-3">
        <GruposNaoBatidosCard
          rows={gruposNaoBatidos}
          skusByGroup={skusByGroup}
          skuVolumeMap={skuVolumeMap}
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
        />

      </div>


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
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
        label="Cód.Gv/Cv"
        values={p.filters.gv}
        options={p.gvOpts}
        onChange={(v) => p.setFilters({ ...p.filters, gv: v })}
        searchable
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Cód.Sv"
        values={p.filters.sv}
        options={p.svOpts}
        onChange={(v) => p.setFilters({ ...p.filters, sv: v })}
        searchable
      />
      <FilterChip
        icon={<Network size={12} />}
        label="Cód.Rv"
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
  const [alignRight, setAlignRight] = useState(false);
  const [maxHeight, setMaxHeight] = useState(300);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const active = values.length > 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setAlignRight(rect.left + 200 > vw - 8);
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      setOpenUp(true);
      setMaxHeight(Math.max(160, Math.min(300, spaceAbove)));
    } else {
      setOpenUp(false);
      setMaxHeight(Math.max(160, Math.min(300, spaceBelow)));
    }
  }, [open]);

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
      {open && (
        <div
          className={`absolute z-20 min-w-[200px] overflow-auto bg-[#1a1a1c] border border-neutral-800 rounded-md shadow-lg py-1 text-[11px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600 ${
            alignRight ? "right-0" : "left-0"
          } ${openUp ? "bottom-full mb-1" : "mt-1"}`}
          style={{ maxWidth: "calc(100vw - 16px)", maxHeight: `${maxHeight}px`, scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
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
        </div>
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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5 ${className}`}
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
          style={{ width: `${Math.max(0, Math.min(100, progressPct))}%`, background: color }}
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

/* ---------------- Cards ---------------- */

type IniciativaStat = {
  name: string;
  ok: number;
  total: number;
  byCluster: { label: string; ok: number; total: number; color: string }[];
};

function IniciativasCard({ data }: { data: IniciativaStat[] }) {
  return (
    <div
      className="bg-[#1a1a1c] rounded-b-xl border border-neutral-800/80 p-3.5 flex flex-col h-[480px] md:h-full min-h-0"
      style={{ borderTop: `3px solid ${PURPLE}` }}
    >
      <div className="text-[11px] text-neutral-400 mb-2 flex items-center gap-1.5 tracking-wide uppercase">
        <Rocket size={13} style={{ color: PURPLE }} />
        Iniciativas
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-2.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
      >
        {data.length === 0 ? (
          <div className="text-[11px] text-neutral-500">Sem dados para os filtros atuais.</div>
        ) : (
          data.map((it, idx) => {
            const pct = it.total > 0 ? it.ok / it.total : 0;
            return (
              <div
                key={it.name}
                className={idx > 0 ? "pt-2.5 border-t border-neutral-800/70" : ""}
              >
                <div className="text-[12px] font-medium text-neutral-100 mb-1 truncate" title={it.name}>
                  {it.name}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-neutral-300 mb-1.5">
                  <span className="tabular-nums">
                    <span className="font-semibold text-neutral-100">{it.ok}</span>
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
                    {(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                  </span>
                </div>
                <div className="h-[5px] bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.max(0, Math.min(100, pct * 100))}%`,
                      background: PURPLE,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


function ClusterCard({ data }: { data: { cluster: string; potencial: number; gerado: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.potencial, d.gerado)));
  return (
    <Card>
      <CardTitle
        icon={<BarChart3 size={13} className="text-neutral-400" />}
        title="Investimento gerado vs potencial — por cluster"
        sub="Comparativo entre potencial e valor gerado"
      />
      <div className="flex gap-3 mb-2.5 ml-[82px] text-[10px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: LIGHT_BLUE }} />
          Potencial
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GREEN }} />
          Gerado
        </span>
      </div>
      {data.length === 0 && <Empty />}
      <div className="flex flex-col gap-2.5">
        {data.map((c) => {
          const pPct = (c.potencial / max) * 100;
          const gPct = (c.gerado / max) * 100;
          const ratio = c.potencial > 0 ? c.gerado / c.potencial : 0;
          const gColor = ratio >= 0.7 ? GREEN : ratio >= 0.5 ? ORANGE : RED;
          return (
            <div key={c.cluster}>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="text-[11px] text-neutral-400 w-[78px] text-right shrink-0 truncate" title={c.cluster}>
                  {c.cluster}
                </div>
                <div className="flex-1 h-[18px] bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end pr-1.5"
                    style={{ width: `${pPct}%`, background: LIGHT_BLUE }}
                  >
                    <span className="text-[10px] font-medium text-[#0C447C]">{fmtBRL(c.potencial)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-[78px] shrink-0" />
                <div className="flex-1 h-[13px] bg-neutral-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center justify-end pr-1.5"
                    style={{ width: `${gPct}%`, background: gColor }}
                  >
                    <span className="text-[9px] font-medium text-white">{fmtBRL(c.gerado)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChannelSortimentoCard({ rows }: { rows: { canal: string; pct: number }[] }) {
  return (
    <Card>
      <CardTitle
        icon={<BarChart3 size={13} className="text-neutral-400" />}
        title="Sortimento ≥ 90% — por canal"
        sub="% de redes que atingiram o mix por canal"
      />
      {rows.length === 0 && <Empty />}
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const color = r.pct >= 0.75 ? GREEN : r.pct >= 0.6 ? ORANGE : RED;
          return (
            <div key={r.canal} className="flex items-center gap-2">
              <div
                className="text-[11px] text-neutral-400 w-[88px] text-right truncate"
                title={r.canal}
              >
                {r.canal}
              </div>
              <div className="flex-1 h-[18px] bg-neutral-800 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-1.5"
                  style={{ width: `${Math.max(6, Math.min(100, r.pct * 100))}%`, background: color }}
                >
                  <span className="text-[10px] font-medium text-white">{fmtPct(r.pct, 0)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-px bg-neutral-800 my-2" />
      <div className="flex gap-2.5">
        <LegendDot color={GREEN} label="≥75%" />
        <LegendDot color={ORANGE} label="60–74%" />
        <LegendDot color={RED} label="<60%" />
      </div>
    </Card>
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
  expanded = false,
}: {
  rows: {
    rede: string;
    sortimento: number;
    gerado: number;
    potencial: number;
    qtdAG: number;
    agBatidos: number;
    gapAgs: number;
    gapAgs90: number;
  }[];
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
            <th className={`text-center pb-1 ${expanded ? "w-8 sm:w-14" : "w-9 sm:w-12"} font-medium`}>Sort.</th>
            <th className={`text-center pb-1 ${expanded ? "w-12 sm:w-20" : "w-12 sm:w-16"} font-medium leading-tight`}>
              <div>Ags</div><div>atingidos</div>
            </th>
            <th className={`text-center pb-1 ${expanded ? "w-12 sm:w-24" : "w-14 sm:w-20"} font-medium leading-tight`}>
              <div>Gap Ags</div><div>.p ≥ 90%</div>
            </th>
            <th className={`text-center pb-1 ${expanded ? "w-14 sm:w-20" : "w-12 sm:w-16"} font-medium`}>Potencial</th>
            <th className={`text-center pb-1 ${expanded ? "w-14 sm:w-20" : "w-12 sm:w-16"} font-medium`}>Invest.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const color =
              r.sortimento >= 0.9 ? "#22C55E" : r.sortimento >= 0.85 ? ORANGE : RED;
            return (
              <tr key={r.rede} className="border-b border-neutral-800 last:border-0">
                <td className="py-1 text-neutral-400 font-medium">{i + 1}</td>
                <td className="py-1 text-neutral-200 truncate" title={r.rede}>
                  {r.rede}
                </td>
                <td className="py-1 text-center font-medium" style={{ color }}>
                  {fmtPct(r.sortimento, 0)}
                </td>
                <td className="py-1 text-center font-medium">
                  <span style={{ color }}>{r.agBatidos}</span>
                  <span className="text-neutral-200"> / {r.qtdAG}</span>
                </td>
                <td className="py-1 text-center text-neutral-200">
                  {r.gapAgs90.toLocaleString("pt-BR")}
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

function RankingCard({
  rows,
}: {
  rows: {
    rede: string;
    sortimento: number;
    gerado: number;
    potencial: number;
    qtdAG: number;
    agBatidos: number;
    gapAgs: number;
    gapAgs90: number;
  }[];
}) {
  const fmtInt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const fmtBRNum = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [expanded, setExpanded] = useState(false);
  const handleDownloadCsv = () => {
    const headers = ["#", "Rede", "Sortimento", "Ags batidos", "Qtd AG", "Gap Ags p>=90%", "Potencial", "Investimento"];
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(";")];
    rows.forEach((r, i) => {
      lines.push([i + 1, r.rede, fmtPct(r.sortimento, 0), r.agBatidos, r.qtdAG, r.gapAgs90, fmtBRNum(r.potencial), fmtBRNum(r.gerado)].map(escape).join(";"));
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
      i + 1, r.rede, fmtPct(r.sortimento, 0),
      `${r.agBatidos} / ${r.qtdAG}`, fmtInt(r.gapAgs90), fmtBRL(r.potencial), fmtBRL(r.gerado),
    ]);
    autoTable(doc, {
      startY: 60,
      head: [["#", "Rede", "Sortimento", "Ags atingidos", "Gap Ags p>=90%", "Potencial", "Investimento"]],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`ranking-redes-${new Date().toISOString().slice(0, 10)}.pdf`);
  };
  return (
    <>
      <Card>
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
          <RankingTable rows={rows} />
        )}
        <div className="h-px bg-neutral-800 my-2" />
        <div className="flex gap-2.5">
          <LegendDot color={GREEN} label="≥90%" />
          <LegendDot color={ORANGE} label="85–89%" />
          <LegendDot color={RED} label="<85%" />
        </div>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="w-[min(920px,100vw)] h-[100vh] sm:w-[min(920px,94vw)] sm:h-[92vh] max-w-none sm:max-w-[min(920px,94vw)] p-0 border-neutral-800 bg-[#1a1a1c] overflow-hidden flex flex-col rounded-none sm:rounded-lg">
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
              <RankingTable rows={rows} expanded />
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
}: {
  monthRows: Row[];
  estrutura: EstruturaRow[];
  filters: Filters;
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
      const isOk = r.sortimento >= 0.9;
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
    <Card>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-[12px] font-medium text-neutral-100 mb-0.5 flex items-center gap-1.5">
            <Users size={13} className="text-neutral-400" />
            Performance por Equipe
          </div>
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <Check size={11} style={{ color: BLUE }} />
            Redes com sortimento ≥ 90%
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
}: {
  rows: { rede: string; sortimento: number; target: number; atributo: string; valor: number }[];
  skusByGroup: Map<string, { ean: string; descricao: string }[]>;
  skuVolumeMap: Map<string, number>;
  title?: string;
  subtitleMode?: "default" | "count";
  showCadastroL3M?: boolean;
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
    const headers = showCadastroL3M
      ? ["Rede", "Sort.", "Grupo", "EAN", "Descrição SKU", "Vendido(Un)", "Cadastro", "Qtd. Cadastro"]
      : ["Rede", "Sortimento", "Grupo", "EAN", "Descrição SKU", "Target", "Vendido(Un)", "Faltante"];
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
          [r.rede, fmtPct(r.sortimento, 0), r.atributo, "Total", "Total", r.target, r.valor, faltante]
            .map(escape)
            .join(";"),
        );
      }
      for (const sku of skus) {
        const vol = skuVolumeMap.get(`${r.rede}|${r.atributo}|${sku.ean}`) ?? 0;
        const cadastroLabel = vol > 0 ? "Item Cadastrado" : "Item não Cadastrado";
        if (showCadastroL3M) {
          lines.push(
            [r.rede, fmtPct(r.sortimento, 0), r.atributo, sku.ean, sku.descricao ?? "", vol, cadastroLabel, qtdLabel]
              .map(escape)
              .join(";"),
          );
        } else {
          lines.push(
            [r.rede, fmtPct(r.sortimento, 0), r.atributo, sku.ean, sku.descricao ?? "", "", vol, ""]
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
          fmtPct(r.sortimento, 0),
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
            fmtPct(r.sortimento, 0),
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
            fmtPct(r.sortimento, 0),
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
          ? ["Rede", "Sort.", "Grupo", "EAN", "Descrição SKU", "Vendido(Un)", "Cadastro", "Qtd. Cadastro"]
          : ["Rede", "Sortimento", "Grupo", "EAN", "Descrição SKU", "Target", "Vendido(Un)", "Faltante"],
      ],
      body,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [38, 38, 40], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save(`${fileSlug}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };


  return (
    <div className="bg-[#1a1a1c] rounded-xl border border-neutral-800/80 p-3.5">
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
        />
      )}
    </div>
  );
}

const GRUPOS_GRID_COLS =
  "grid-cols-[28%_1fr_36px_48px_56px_48px] sm:grid-cols-[26%_1fr_48px_64px_80px_64px]";
const GRUPOS_GRID_COLS_EXT =
  "grid-cols-[180px_minmax(220px,1fr)_48px_80px_140px_200px] sm:grid-cols-[220px_minmax(260px,1fr)_56px_88px_160px_240px]";


type GruposRow = { rede: string; sortimento: number; target: number; atributo: string; valor: number };
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
}: {
  rows: GruposRow[];
  skusByGroup: Map<string, { ean: string; descricao: string }[]>;
  skuVolumeMap: Map<string, number>;
  expanded: Set<string>;
  toggleExpand: (key: string) => void;
  fmtInt: (n: number) => string;
  showCadastroL3M?: boolean;
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
        <div className="text-center pb-1 sm:pb-1.5">{showCadastroL3M ? "Sort." : "%"}</div>
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
              r.sortimento >= 0.9 ? "#22C55E" : r.sortimento >= 0.85 ? ORANGE : RED;
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
                  {fmtPct(r.sortimento, 0)}
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
  pointFormat: (n: number) => string;
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

function LineHistoryCard(p: LineHistoryProps) {
  const [mode, setMode] = useState<"total" | "cluster">("total");
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

  // SVG layout — modo cluster ganha altura extra
  const W = 400;
  const H = showCluster ? 260 : 170;
  const padL = 44;
  const padR = 16;
  const padT = 10;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = p.months.length;
  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1);
  const yAt = (v: number) => padT + innerH - ((v - yMin) / ySpan) * innerH;


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

  const polylinePoints = (vals: number[]) =>
    vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const areaPath = (vals: number[]) => {
    if (vals.length === 0) return "";
    const baseY = padT + innerH;
    const pts = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L ");
    return `M ${xAt(0)},${baseY} L ${pts} L ${xAt(vals.length - 1)},${baseY} Z`;
  };

  // Stable gradient id per card instance
  const gradIdRef = useRef(`grad-${Math.random().toString(36).slice(2)}`);
  const gradId = gradIdRef.current;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[12px] font-medium text-neutral-100 flex items-center gap-1.5 flex-wrap">
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
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{p.sub}</div>
        </div>
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
                  disabled={m === "cluster" && p.groups.length === 0}
                >
                  {m === "total" ? "Total" : "Por cluster"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {n === 0 ? (
        <Empty />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${showCluster ? "h-[260px]" : "h-[170px]"} overflow-visible`}>
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
            <>
              <polyline
                points={polylinePoints(p.extra.values)}
                fill="none"
                stroke={p.extra.color}
                strokeWidth="1.5"
                strokeDasharray={p.extra.dashed ? "5 3" : undefined}
              />
              {p.extra.values.map((v, i) => (
                <circle key={`ex-${i}`} cx={xAt(i)} cy={yAt(v)} r="3" fill={p.extra!.color} />
              ))}
            </>
          )}
          {/* Linhas principais */}
          {showCluster ? (
            <>
              {p.groups.map((g, idx) => {
                const c = colorForGroup(g.name, idx);
                return (
                  <g key={g.name}>
                    <polyline points={polylinePoints(g.values)} fill="none" stroke={c} strokeWidth="1.8" />
                    {g.values.map((v, i) => (
                      <circle key={`${g.name}-${i}`} cx={xAt(i)} cy={yAt(v)} r="3" fill={c} />
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
                  >
                    {p.pointFormat(it.value)}
                  </text>
                ));
              })}
            </>
          ) : (
            <>
              <path d={areaPath(p.total)} fill={`url(#${gradId})`} />
              <polyline
                points={polylinePoints(p.total)}
                fill="none"
                stroke={p.color}
                strokeWidth="2"
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
                return (
                  <g key={`t-${i}`}>
                    <circle cx={xAt(i)} cy={yAt(v)} r="4" fill={p.color} />
                    {p.pointSubLabel && subVal !== undefined && (
                      <text
                        x={xAt(i)}
                        y={subY}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill={subColor}
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
                    >
                      {p.pointFormat(v)}
                    </text>
                  </g>
                );
              })}
            </>
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
    </Card>
  );
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



