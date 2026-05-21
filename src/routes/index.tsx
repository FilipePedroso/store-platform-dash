import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Upload,
  X,
  Lock,
} from "lucide-react";
import {
  loadRowsFromCloud,
  parseXlsxFile,
  formatUpdatedAt,
  type Row,
  type AgRow,
  type DataMeta,
} from "@/lib/dashboard-data";
import { updateDataset } from "@/lib/dataset.functions";
import { useServerFn } from "@tanstack/react-start";
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

function Dashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [agRows, setAgRows] = useState<AgRow[]>([]);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const updateDatasetFn = useServerFn(updateDataset);

  const refresh = async () => {
    const { rows, agRows, meta } = await loadRowsFromCloud();
    setRows(rows);
    setAgRows(agRows);
    setMeta(meta);
  };

  useEffect(() => {
    refresh();
  }, []);

  const months = useMemo(() => uniqueMonths(rows), [rows]);
  const selectedMonths = useMemo(() => {
    if (filters.mes.length > 0) return filters.mes;
    const latest = latestMonth(rows);
    return latest ? [latest] : [];
  }, [filters.mes, rows]);
  const isAccumulated = filters.mes.length > 1 || filters.mes.length === months.length;

  const baseRows = useMemo(() => applyBaseFilters(rows, filters), [rows, filters]);
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

  // Aplica os mesmos filtros (base + mês) ao dataset "dados ags"
  const agMonthRows = useMemo(() => {
    const inList = (v: string, list: string[]) => list.length === 0 || list.includes(v);
    const monthSet = new Set(selectedMonths);
    return agRows.filter(
      (r) =>
        inList(r.cluster, filters.cluster) &&
        inList(r.canal, filters.canal) &&
        inList(r.rede, filters.rede) &&
        inList(r.distribuidor, filters.distribuidor) &&
        monthSet.has(r.mes),
    );
  }, [agRows, filters, selectedMonths]);

  // Tabela "Grupos não batidos": positivação == 0
  const gruposNaoBatidos = useMemo(
    () =>
      agMonthRows
        .filter((r) => Number(r.positivacao) === 0)
        .map((r) => ({
          rede: r.rede,
          target: r.targetUnidades,
          atributo: r.atributo,
          valor: r.valor,
        }))
        .sort((a, b) => a.rede.localeCompare(b.rede) || a.atributo.localeCompare(b.atributo)),
    [agMonthRows],
  );

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
  const clusterOpts = useMemo(() => optionsFor(rows, filters, "cluster"), [rows, filters]);
  const canalOpts = useMemo(() => optionsFor(rows, filters, "canal"), [rows, filters]);
  const redeOpts = useMemo(() => optionsFor(rows, filters, "rede"), [rows, filters]);
  const distribOpts = useMemo(() => optionsFor(rows, filters, "distribuidor"), [rows, filters]);
  const monthOpts = useMemo(() => optionsFor(rows, filters, "mes"), [rows, filters]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const credsRef = useRef<{ email: string; password: string } | null>(null);

  const handleUpload = async (file: File) => {
    setUploadError(null);
    const creds = credsRef.current;
    if (!creds) {
      setUploadError("Faça login novamente para atualizar");
      return;
    }
    setUploading(true);
    try {
      const parsed = await parseXlsxFile(file);
      await updateDatasetFn({
        data: { ...creds, rows: parsed.rows, agRows: parsed.agRows },
      });
      await refresh();
      setFilters(EMPTY_FILTERS);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Falha ao atualizar os dados");
    } finally {
      setUploading(false);
      credsRef.current = null;
    }
  };

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
          {uploadError && (
            <p className="text-[11px] text-red-400 mt-1">⚠ {uploadError}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setLoginOpen(true)}
            disabled={uploading}
            className="rounded-full px-3 py-1.5 text-[11px] flex items-center gap-1.5 border bg-[#0E2E4D] border-[#378ADD] text-[#8BBEEC] font-medium hover:bg-[#13395f] disabled:opacity-50"
          >
            <Upload size={12} /> {uploading ? "Enviando..." : "Atualizar dados (.xlsx)"}
          </button>
        </div>
      </div>

      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={(email, password) => {
            credsRef.current = { email, password };
            setLoginOpen(false);
            fileRef.current?.click();
          }}
        />
      )}


      {/* Filtros */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        clusterOpts={clusterOpts}
        canalOpts={canalOpts}
        redeOpts={redeOpts}
        distribOpts={distribOpts}
        monthOpts={monthOpts}
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
        <KpiCard
          color={PURPLE}
          icon={<Receipt size={13} style={{ color: PURPLE }} />}
          label="Faturamento mês atual"
          value={fmtBRL(kpis.faturamento)}
          valueColor="#A39DE5"
          sub={`AGs batidos: ${kpis.agBatidos.toLocaleString("pt-BR")} / ${kpis.qtdAG.toLocaleString("pt-BR")}`}
          progressLabel="% AGs"
          progressValue={fmtPct(kpis.pctAGs)}
          progressPct={kpis.pctAGs * 100}


        />
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
        />
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
        />
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
        />
      </div>


      {/* Linha intermediária */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2.5 mb-3">
        <ClusterCard data={clusters} />
        <ChannelSortimentoCard rows={sortimentoByCanal} />
      </div>

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-3">
        <MonthlyEvolutionCard data={evolution} />
        <RankingCard rows={ranking} />
        <ChannelMixCard rows={canalMix} />
      </div>

      {/* Grupos não batidos (dataset 'dados ags') */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <GruposNaoBatidosCard
          rows={gruposNaoBatidos}
          redeValues={filters.rede}
          redeOptions={redeOpts}
          onRedeChange={(v) => setFilters({ ...filters, rede: v })}
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
};

function FilterBar(p: FilterBarProps) {
  const hasAny =
    p.filters.cluster.length ||
    p.filters.canal.length ||
    p.filters.rede.length ||
    p.filters.distribuidor.length ||
    p.filters.mes.length;
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
    // If dropdown (min 200px) would overflow on the right, align it to the right edge of the button
    setAlignRight(rect.left + 200 > vw - 8);
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

  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
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
          className={`absolute z-20 mt-1 min-w-[200px] max-h-[300px] overflow-auto bg-[#1a1a1c] border border-neutral-800 rounded-md shadow-lg py-1 text-[11px] ${
            alignRight ? "right-0" : "left-0"
          }`}
          style={{ maxWidth: "calc(100vw - 16px)" }}
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
                onClick={() => toggle(opt)}
                className={`flex items-center gap-2 w-full text-left px-3 py-1 hover:bg-neutral-800 ${
                  checked ? "text-[#8BBEEC] font-medium" : "text-neutral-200"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border ${
                    checked ? "bg-[#378ADD] border-[#378ADD]" : "border-neutral-600"
                  }`}
                >
                  {checked && <Check size={9} className="text-white" />}
                </span>
                {fmt(opt)}
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
    <>
      <div className="text-[12px] font-medium text-neutral-100 mb-0.5 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      <div className="text-[11px] text-neutral-400 mb-3">{sub}</div>
    </>
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

}) {
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

function RankingCard({ rows }: { rows: { rede: string; sortimento: number; gerado: number }[] }) {
  return (
    <Card>
      <CardTitle
        icon={<Star size={13} className="text-neutral-400" />}
        title="Ranking de redes"
        sub="Top 5 por investimento gerado"
      />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="max-h-[150px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#404040 transparent" }}
        >
          <table className="w-full text-[11px]" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 bg-[#141416] z-10">
              <tr className="text-neutral-400 font-medium border-b border-neutral-800">
                <th className="text-left pb-1.5 w-5 font-medium">#</th>
                <th className="text-left pb-1.5 font-medium">Rede</th>
                <th className="text-left pb-1.5 w-10 font-medium">Sort.</th>
                <th className="text-right pb-1.5 w-16 font-medium">Invest.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const color =
                  r.sortimento >= 0.9 ? GREEN : r.sortimento >= 0.85 ? ORANGE : RED;
                return (
                  <tr key={r.rede} className="border-b border-neutral-800 last:border-0">
                    <td className="py-1 text-neutral-400 font-medium">{i + 1}</td>
                    <td className="py-1 text-neutral-200 truncate" title={r.rede}>
                      {r.rede}
                    </td>
                    <td className="py-1 font-medium" style={{ color }}>
                      {fmtPct(r.sortimento, 0)}
                    </td>
                    <td className="py-1 text-right font-medium text-neutral-200">
                      {fmtBRL(r.gerado)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="h-px bg-neutral-800 my-2" />
      <div className="flex gap-2.5">
        <LegendDot color={GREEN} label="≥90%" />
        <LegendDot color={ORANGE} label="85–89%" />
        <LegendDot color={RED} label="<85%" />
      </div>
    </Card>
  );
}

function ChannelMixCard({ rows }: { rows: { canal: string; pct: number }[] }) {
  return (
    <Card>
      <CardTitle
        icon={<Layers size={13} className="text-neutral-400" />}
        title="AGs batidos por canal"
        sub="% de atingimento do target por canal"
      />
      {rows.length === 0 && <Empty />}
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const color = r.pct >= 0.75 ? GREEN : r.pct >= 0.6 ? ORANGE : RED;
          return (
            <div key={r.canal} className="flex items-center gap-2">
              <div className="text-[11px] text-neutral-400 w-[74px] text-right truncate" title={r.canal}>
                {r.canal}
              </div>
              <div className="flex-1 h-[18px] bg-neutral-800 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-1.5"
                  style={{ width: `${Math.min(100, r.pct * 100)}%`, background: color }}
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

function LoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().toLowerCase() === "filipe.pedroso@oniz.com.br" && password === "402139") {
      onSuccess(email.trim(), password);
    } else {
      setError("Credenciais inválidas");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-[#1a1a1c] border border-neutral-800 rounded-xl p-5 w-full max-w-sm"
      >
        <div className="flex items-center gap-2 mb-3">
          <Lock size={14} style={{ color: BLUE }} />
          <h2 className="text-[13px] font-medium text-neutral-100">Acesso restrito</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-neutral-500 hover:text-neutral-200"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 mb-4">
          Informe suas credenciais para atualizar os dados.
        </p>
        <label className="block text-[11px] text-neutral-400 mb-1">E-mail</label>
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-[#0f0f10] border border-neutral-800 rounded px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-[#378ADD] mb-3"
        />
        <label className="block text-[11px] text-neutral-400 mb-1">Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-[#0f0f10] border border-neutral-800 rounded px-2 py-1.5 text-[12px] text-neutral-100 outline-none focus:border-[#378ADD] mb-3"
        />
        {error && <p className="text-[11px] text-red-400 mb-2">⚠ {error}</p>}
        <button
          type="submit"
          className="w-full rounded-md px-3 py-1.5 text-[12px] bg-[#0E2E4D] border border-[#378ADD] text-[#8BBEEC] font-medium hover:bg-[#13395f]"
        >
          Entrar
        </button>
      </form>
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

  // Compute global y-max across visible series
  const allValues: number[] = [];
  if (showCluster) {
    p.groups.forEach((g) => g.values.forEach((v) => allValues.push(v)));
  } else {
    p.total.forEach((v) => allValues.push(v));
  }
  if (p.extra) p.extra.values.forEach((v) => allValues.push(v));
  if (p.reference) allValues.push(p.reference.value);
  const yMax = p.forceMax ?? Math.max(1, ...allValues) * 1.1;

  // SVG layout
  const W = 400;
  const H = 170;
  const padL = 44;
  const padR = 16;
  const padT = 10;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = p.months.length;
  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1);
  const yAt = (v: number) => padT + innerH - (v / yMax) * innerH;

  const firstTotal = p.total[0] ?? 0;
  const lastTotal = p.total[p.total.length - 1] ?? 0;
  let deltaText = "—";
  if (n > 1 && p.months.length > 0) {
    if (p.deltaMode === "pp") {
      deltaText = `${(lastTotal - firstTotal) >= 0 ? "+" : ""}${((lastTotal - firstTotal) * 100).toFixed(1)} p.p. ${fmtMonth(p.months[0])} → ${fmtMonth(p.months[n - 1])}`;
    } else {
      const pct = firstTotal > 0 ? (lastTotal - firstTotal) / firstTotal : 0;
      deltaText = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}% ${fmtMonth(p.months[0])} → ${fmtMonth(p.months[n - 1])}`;
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
          <div className="text-[12px] font-medium text-neutral-100 flex items-center gap-1.5">
            {p.icon}
            {p.title}
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
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[170px] overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity="0.45" />
              <stop offset="60%" stopColor={p.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0" />
            </linearGradient>
            {showCluster &&
              p.groups.map((g, idx) => {
                const c = PALETTE[idx % PALETTE.length];
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
          <text x={padL - 6} y={padT + innerH / 2 + 3} textAnchor="end" fontSize="9" fill="#888780">{p.yFormat(yMax / 2)}</text>
          <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" fontSize="9" fill="#888780">{p.yFormat(0)}</text>
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
          {/* Linha extra (potencial) — sempre como total */}
          {p.extra && (
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
            p.groups.map((g, idx) => {
              const c = PALETTE[idx % PALETTE.length];
              return (
                <g key={g.name}>
                  <path d={areaPath(g.values)} fill={`url(#${gradId}-${idx})`} />
                  <polyline points={polylinePoints(g.values)} fill="none" stroke={c} strokeWidth="1.8" />
                  {g.values.map((v, i) => (
                    <circle key={`${g.name}-${i}`} cx={xAt(i)} cy={yAt(v)} r="3" fill={c} />
                  ))}
                </g>
              );
            })
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
                color={PALETTE[idx % PALETTE.length]}
                label={g.name}
              />
            ))}
            {p.extra && <LineLegend color={p.extra.color} label={p.extra.name} dashed={p.extra.dashed} />}
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

