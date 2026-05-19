import { createFileRoute } from "@tanstack/react-router";
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
  PieChart,
  TrendingUp,
  Star,
  ChevronDown,
} from "lucide-react";

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

function Dashboard() {
  return (
    <div className="min-h-screen bg-[#0f0f10] text-neutral-200 p-4">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-[15px] font-medium text-neutral-100 flex items-center gap-2">
          <LayoutDashboard size={16} style={{ color: BLUE }} />
          Store Platform — Painel de Resultados
        </h1>
        <p className="text-[11px] text-neutral-400 mt-1">
          Histórico de performance das redes participantes
        </p>
      </div>

      {/* Filtros */}
      <FilterBar />

      {/* Indicadores */}
      <SectionLabel>Indicadores principais</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
        <KpiCard
          color={GREEN}
          icon={<Banknote size={13} style={{ color: GREEN }} />}
          label="Investimento gerado"
          value="R$ 4,2M"
          valueColor="#3DD9A4"
          sub="Potencial: R$ 5,8M"
          progressLabel="Atingimento"
          progressValue="72,4%"
          progressPct={72}
          badge={{ text: "+8,3% vs mês anterior", bg: "#11402F", fg: "#7DE5BD" }}
        />
        <KpiCard
          color={BLUE}
          icon={<Check size={13} style={{ color: BLUE }} />}
          label="Redes com sortimento ≥ 90%"
          value={
            <>
              38{" "}
              <span className="text-[14px] text-neutral-400 font-normal">
                / 54
              </span>
            </>
          }
          valueColor="#5FA8E8"
          sub="Redes ativas na plataforma"
          progressLabel="Taxa de conversão"
          progressValue="70,4%"
          progressPct={70}
          badge={{ text: "+5 redes vs mês anterior", bg: "#0E2E4D", fg: "#8BBEEC" }}
        />
        <KpiCard
          color={ORANGE}
          icon={<Target size={13} style={{ color: ORANGE }} />}
          label="% Atingimento da verba"
          value="72,4%"
          valueColor="#F1B257"
          sub="Invest. Gerado / Potencial"
          progressLabel="Meta: 85%"
          progressValue="-12,6 p.p."
          progressPct={72}
          badge={{ text: "▼ Abaixo da meta", bg: "#3D2A10", fg: "#F1B257" }}
        />
        <KpiCard
          color={PURPLE}
          icon={<Receipt size={13} style={{ color: PURPLE }} />}
          label="Faturamento mês atual"
          value="R$ 12,7M"
          valueColor="#A39DE5"
          sub="AGs batidos: 312 / 420"
          progressLabel="% AGs"
          progressValue="74,3%"
          progressPct={74}
          badge={{ text: "54 CNPJs ativos", bg: "#241F4D", fg: "#A39DE5" }}
        />
      </div>

      {/* Linha intermediária */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-2.5 mb-3">
        <ClusterCard />
        <ChannelDonutCard />
      </div>

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <MonthlyEvolutionCard />
        <RankingCard />
        <ChannelMixCard />
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium text-neutral-400 mb-2 tracking-wider uppercase">
      {children}
    </div>
  );
}

function FilterBar() {
  const filters = [
    { label: "Todos os clusters", icon: <Layers size={12} />, active: true },
    { label: "Canal", icon: <MapPin size={12} /> },
    { label: "Rede", icon: <Network size={12} /> },
    { label: "Distribuidor", icon: <Building2 size={12} /> },
    { label: "Mês", icon: <CalendarRange size={12} /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className="text-[11px] font-medium text-neutral-400 mr-1">
        Filtros:
      </span>
      {filters.map((f) => (
        <button
          key={f.label}
          className={`rounded-full px-3 py-1 text-[11px] flex items-center gap-1.5 border transition-colors ${
            f.active
              ? "bg-[#0E2E4D] border-[#378ADD] text-[#8BBEEC] font-medium"
              : "bg-[#1a1a1c] border-neutral-800 text-neutral-400 hover:border-neutral-700"
          }`}
        >
          {f.icon}
          {f.label}
          <ChevronDown size={12} />
        </button>
      ))}
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
  badge,
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
  badge: { text: string; bg: string; fg: string };
}) {
  return (
    <div
      className="bg-[#1a1a1c] rounded-b-xl border border-neutral-800/80 p-3.5"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-[22px] font-medium leading-none" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-[11px] text-neutral-400 mt-1.5">{sub}</div>
      <div className="flex justify-between text-[10px] text-neutral-400 mt-2">
        <span>{progressLabel}</span>
        <span className="font-medium" style={{ color: valueColor }}>
          {progressValue}
        </span>
      </div>
      <div className="h-[5px] bg-neutral-800 rounded mt-1.5 overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${progressPct}%`, background: color }}
        />
      </div>
      <span
        className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-2"
        style={{ background: badge.bg, color: badge.fg }}
      >
        {badge.text}
      </span>
    </div>
  );
}

function ClusterCard() {
  const data = [
    { name: "Cluster A", potPct: 92, potVal: "R$ 846k", genPct: 78, genVal: "R$ 718k", genColor: GREEN },
    { name: "Cluster B", potPct: 80, potVal: "R$ 736k", genPct: 58, genVal: "R$ 533k", genColor: GREEN },
    { name: "Cluster C", potPct: 72, potVal: "R$ 662k", genPct: 67, genVal: "R$ 616k", genColor: GREEN },
    { name: "Cluster D", potPct: 60, potVal: "R$ 552k", genPct: 41, genVal: "R$ 377k", genColor: ORANGE },
    { name: "Cluster E", potPct: 50, potVal: "R$ 460k", genPct: 48, genVal: "R$ 441k", genColor: GREEN },
  ];
  return (
    <Card>
      <CardTitle
        icon={<BarChart3 size={13} className="text-neutral-400" />}
        title="Investimento gerado vs potencial — por cluster"
        sub="Comparativo entre potencial e valor gerado (R$ mil)"
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
      <div className="flex flex-col gap-2.5">
        {data.map((c) => (
          <div key={c.name}>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-[11px] text-neutral-400 w-[78px] text-right shrink-0">
                {c.name}
              </div>
              <div className="flex-1 h-[18px] bg-neutral-800 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-1.5"
                  style={{ width: `${c.potPct}%`, background: LIGHT_BLUE }}
                >
                  <span className="text-[10px] font-medium text-[#0C447C]">{c.potVal}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-[78px] shrink-0" />
              <div className="flex-1 h-[13px] bg-neutral-800 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center justify-end pr-1.5"
                  style={{ width: `${c.genPct}%`, background: c.genColor }}
                >
                  <span className="text-[9px] font-medium text-white">{c.genVal}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChannelDonutCard() {
  // Segments: 44, 24, 20, 12  -> total 100; circumference for r=46 ~ 289
  const C = 2 * Math.PI * 46;
  const segs = [
    { pct: 44, color: GREEN, label: "Autosserviço" },
    { pct: 24, color: PURPLE, label: "Atacado" },
    { pct: 20, color: ORANGE, label: "Food Service" },
    { pct: 12, color: LIGHT_BLUE, label: "Outros" },
  ];
  let offset = 0;
  return (
    <Card className="flex flex-col">
      <CardTitle
        icon={<PieChart size={13} className="text-neutral-400" />}
        title="Sortimento ≥ 90% por canal"
        sub="Distribuição das redes que atingiram o mix"
      />
      <svg viewBox="0 0 160 140" width="100%" className="block mx-auto">
        <circle cx="80" cy="68" r="46" fill="none" stroke="#2a2a2d" strokeWidth="24" />
        {segs.map((s, i) => {
          const len = (s.pct / 100) * C;
          const dashOffset = -offset;
          offset += len;
          return (
            <circle
              key={i}
              cx="80"
              cy="68"
              r="46"
              fill="none"
              stroke={s.color}
              strokeWidth="24"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 80 68)"
            />
          );
        })}
        <text x="80" y="64" textAnchor="middle" fontSize="19" fontWeight="500" fill="#8BBEEC">
          70%
        </text>
        <text x="80" y="78" textAnchor="middle" fontSize="9" fill="#888">
          atingiram ≥90%
        </text>
      </svg>
      <div className="mt-2">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[11px] text-neutral-400 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            {s.label}
            <span className="ml-auto font-medium text-neutral-200">{s.pct}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MonthlyEvolutionCard() {
  const months = [
    { m: "Jan", pct: 52, val: "R$ 2,4M", color: "#9FE1CB" },
    { m: "Fev", pct: 62, val: "R$ 2,9M", color: "#5DCAA5" },
    { m: "Mar", pct: 59, val: "R$ 2,7M", color: "#5DCAA5" },
    { m: "Abr", pct: 75, val: "R$ 3,5M", color: GREEN },
    { m: "Mai", pct: 90, val: "R$ 4,2M", color: "#0F6E56" },
  ];
  return (
    <Card>
      <CardTitle
        icon={<TrendingUp size={13} className="text-neutral-400" />}
        title="Evolução mensal"
        sub="Investimento gerado (R$ M)"
      />
      <div className="flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.m} className="flex items-center gap-2 text-[11px]">
            <span className="w-[30px] text-neutral-400">{m.m}</span>
            <div className="flex-1 h-3.5 bg-neutral-800 rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${m.pct}%`, background: m.color }} />
            </div>
            <span className="w-[42px] text-right font-medium text-neutral-200">{m.val}</span>
          </div>
        ))}
      </div>
      <div className="h-px bg-neutral-800 my-2" />
      <span className="text-[10px] text-neutral-400">
        <span className="text-[#3DD9A4] font-medium">+75%</span> crescimento Jan → Mai
      </span>
    </Card>
  );
}

function RankingCard() {
  const rows = [
    { rank: 1, name: "Rede Alpha", sort: "97%", sortColor: "#3DD9A4", val: "R$ 820k" },
    { rank: 2, name: "Rede Beta", sort: "94%", sortColor: "#3DD9A4", val: "R$ 710k" },
    { rank: 3, name: "Rede Gama", sort: "91%", sortColor: GREEN, val: "R$ 630k" },
    { rank: 4, name: "Rede Delta", sort: "89%", sortColor: ORANGE, val: "R$ 540k" },
    { rank: 5, name: "Rede Sigma", sort: "84%", sortColor: RED, val: "R$ 410k" },
  ];
  return (
    <Card>
      <CardTitle
        icon={<Star size={13} className="text-neutral-400" />}
        title="Ranking de redes"
        sub="Top 5 por investimento gerado"
      />
      <table className="w-full text-[11px]" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr className="text-neutral-400 font-medium border-b border-neutral-800">
            <th className="text-left pb-1.5 w-5 font-medium">#</th>
            <th className="text-left pb-1.5 font-medium">Rede</th>
            <th className="text-left pb-1.5 w-10 font-medium">Sort.</th>
            <th className="text-right pb-1.5 w-14 font-medium">Invest.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rank} className="border-b border-neutral-800 last:border-0">
              <td className="py-1 text-neutral-400 font-medium">{r.rank}</td>
              <td className="py-1 text-neutral-200">{r.name}</td>
              <td className="py-1 font-medium" style={{ color: r.sortColor }}>
                {r.sort}
              </td>
              <td className="py-1 text-right font-medium text-neutral-200">{r.val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-px bg-neutral-800 my-2" />
      <div className="flex gap-2.5">
        <LegendDot color={GREEN} label="≥90%" />
        <LegendDot color={ORANGE} label="85–89%" />
        <LegendDot color={RED} label="<85%" />
      </div>
    </Card>
  );
}

function ChannelMixCard() {
  const rows = [
    { label: "Autosserviço", pct: 81, color: GREEN },
    { label: "Atacado", pct: 74, color: GREEN },
    { label: "Food Service", pct: 68, color: ORANGE },
    { label: "Farma", pct: 55, color: ORANGE },
    { label: "Outros", pct: 48, color: RED },
  ];
  return (
    <Card>
      <CardTitle
        icon={<Layers size={13} className="text-neutral-400" />}
        title="AGs batidos por canal mix"
        sub="% de atingimento do target por canal"
      />
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <div className="text-[11px] text-neutral-400 w-[74px] text-right">{r.label}</div>
            <div className="flex-1 h-[18px] bg-neutral-800 rounded overflow-hidden">
              <div
                className="h-full rounded flex items-center justify-end pr-1.5"
                style={{ width: `${r.pct}%`, background: r.color }}
              >
                <span className="text-[10px] font-medium text-white">{r.pct}%</span>
              </div>
            </div>
          </div>
        ))}
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
