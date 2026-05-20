import * as XLSX from "xlsx";
import seed from "@/data/historico-seed.json";
import { supabase } from "@/integrations/supabase/client";

export type Row = {
  rede: string;
  distribuidor: string;
  cluster: string;
  clusterMix: string;
  canal: string;
  canalMix: string;
  cnpjs: number;
  targetUnidades: number;
  qtdAG: number;
  agBatidos: number;
  sortimento: number; // 0..1
  faturamento: number;
  potencial: number;
  gerado: number;
  mes: string; // YYYY-MM-DD
};

export type DataMeta = { updatedAt: string; rowCount: number };

const SEED_META: DataMeta = { updatedAt: "2025-01-01T00:00:00Z", rowCount: (seed as Row[]).length };

/** Carrega o dataset compartilhado da Cloud. Se ainda não houver upload, usa o seed embarcado. */
export async function loadRowsFromCloud(): Promise<{ rows: Row[]; meta: DataMeta }> {
  try {
    const { data, error } = await supabase
      .from("dataset")
      .select("rows, row_count, updated_at")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;
    const rows = (data?.rows as Row[] | null) ?? [];
    if (rows.length === 0) {
      return { rows: seed as Row[], meta: SEED_META };
    }
    return {
      rows,
      meta: { updatedAt: data!.updated_at, rowCount: data!.row_count ?? rows.length },
    };
  } catch {
    return { rows: seed as Row[], meta: SEED_META };
  }
}

const COL_MAP: Record<string, keyof Row> = {
  "Rede": "rede",
  "Distribuidor": "distribuidor",
  "Cluster": "cluster",
  "Cluster Mix": "clusterMix",
  "Canal": "canal",
  "Canal Mix": "canalMix",
  "Nº de CNPJ's": "cnpjs",
  "Nº de CNPJs": "cnpjs",
  "Target de Unidades por Activation Group": "targetUnidades",
  "Qtd. AG": "qtdAG",
  "Ag. Batidos": "agBatidos",
  "% Sortimento": "sortimento",
  "Faturamento Mês Atual": "faturamento",
  "Potencial de Investimento (Garantindo SOS & CKO)": "potencial",
  "Investimento Gerado (Garantindo SOS & CKO)": "gerado",
  "Mês": "mes",
};

function excelDateToISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    }
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return v;
  }
  return "";
}

export async function parseXlsxFile(file: File): Promise<Row[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "dados") ?? wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });

  const rows: Row[] = json
    .map((raw) => {
      const out: Partial<Row> = {};
      for (const [key, value] of Object.entries(raw)) {
        const mapped = COL_MAP[key.trim()];
        if (!mapped) continue;
        if (mapped === "mes") {
          out.mes = excelDateToISO(value);
        } else if (
          mapped === "rede" ||
          mapped === "distribuidor" ||
          mapped === "cluster" ||
          mapped === "clusterMix" ||
          mapped === "canal" ||
          mapped === "canalMix"
        ) {
          out[mapped] = value == null ? "" : String(value);
        } else {
          const n = typeof value === "number" ? value : value == null ? 0 : Number(value);
          out[mapped] = Number.isFinite(n) ? n : 0;
        }
      }
      return out as Row;
    })
    .filter((r) => r.rede && r.mes);

  if (rows.length === 0) throw new Error("Nenhuma linha válida encontrada na aba 'Dados'");
  return rows;
}

export function formatUpdatedAt(meta: DataMeta): string {
  try {
    const d = new Date(meta.updatedAt);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return meta.updatedAt;
  }
}
