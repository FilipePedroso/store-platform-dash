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

export type AgRow = {
  rede: string;
  distribuidor: string;
  cluster: string;
  clusterMix: string;
  canal: string;
  canalMix: string;
  cnpjs: number;
  targetUnidades: number;
  atributo: string;
  valor: number;
  mes: string;
  loadingDpp: number;
  positivacao: number;
};

export type EstruturaRow = {
  rede: string;
  rv: string;
  sv: string;
  gv: string;
  rvNome: string;
  svNome: string;
  gvNome: string;
  distribuidor: string;
};

export type IniciativaRow = {
  distribuidor: string;
  cluster: string;
  canal: string;
  rede: string;
  /** chave = nome da iniciativa, valor = 0 ou 1 */
  iniciativas: Record<string, number>;
};

export type DataMeta = { updatedAt: string; rowCount: number; agsCount: number };

const SEED_META: DataMeta = {
  updatedAt: "2025-01-01T00:00:00Z",
  rowCount: (seed as Row[]).length,
  agsCount: 0,
};

/** Carrega o dataset compartilhado da Cloud. Se ainda não houver upload, usa o seed embarcado. */
export async function loadRowsFromCloud(): Promise<{
  rows: Row[];
  agRows: AgRow[];
  estrutura: EstruturaRow[];
  iniciativas: IniciativaRow[];
  meta: DataMeta;
}> {
  try {
    const { data, error } = await supabase
      .from("dataset")
      .select("rows, row_count, updated_at, estrutura, iniciativas")
      .eq("id", "main")
      .maybeSingle();
    if (error) throw error;
    const rows = (data?.rows as Row[] | null) ?? [];
    const estrutura = ((data as { estrutura?: EstruturaRow[] } | null)?.estrutura as EstruturaRow[] | null) ?? [];
    const iniciativas = ((data as { iniciativas?: IniciativaRow[] } | null)?.iniciativas as IniciativaRow[] | null) ?? [];
    if (rows.length === 0) {
      return { rows: seed as Row[], agRows: [], estrutura: [], iniciativas: [], meta: SEED_META };
    }

    // Carrega todos os chunks da aba "dados ags"
    const agRows: AgRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: chunks, error: chunkErr } = await supabase
        .from("dataset_ags_chunks")
        .select("rows")
        .eq("id", "main")
        .order("chunk_index", { ascending: true })
        .range(from, from + PAGE - 1);
      if (chunkErr) break;
      if (!chunks || chunks.length === 0) break;
      for (const c of chunks) {
        const arr = (c.rows as AgRow[] | null) ?? [];
        for (const r of arr) agRows.push(r);
      }
      if (chunks.length < PAGE) break;
    }

    return {
      rows,
      agRows,
      estrutura,
      iniciativas,
      meta: {
        updatedAt: data!.updated_at,
        rowCount: data!.row_count ?? rows.length,
        agsCount: agRows.length,
      },
    };
  } catch {
    return { rows: seed as Row[], agRows: [], estrutura: [], iniciativas: [], meta: SEED_META };
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

const AG_COL_MAP: Record<string, keyof AgRow> = {
  "Rede": "rede",
  "Distribuidor": "distribuidor",
  "Cluster": "cluster",
  "Cluster Mix": "clusterMix",
  "Canal": "canal",
  "Canal Mix": "canalMix",
  "Nº de CNPJ's": "cnpjs",
  "Nº de CNPJs": "cnpjs",
  "Target de Unidades por Activation Group": "targetUnidades",
  "Atributo": "atributo",
  "Valor": "valor",
  "Mês": "mes",
  "loading dpp": "loadingDpp",
  "Loading DPP": "loadingDpp",
  "positivação": "positivacao",
  "Positivação": "positivacao",
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

export async function parseXlsxFile(
  file: File,
): Promise<{ rows: Row[]; agRows: AgRow[]; estrutura: EstruturaRow[]; iniciativas: IniciativaRow[] }> {
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

  // Parse "dados ags" sheet if present (case-insensitive)
  const agsSheetName = wb.SheetNames.find((n) => n.toLowerCase() === "dados ags");
  let agRows: AgRow[] = [];
  if (agsSheetName) {
    const wsAg = wb.Sheets[agsSheetName];
    const jsonAg = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsAg, {
      defval: null,
      raw: true,
    });
    agRows = jsonAg
      .map((raw) => {
        const out: Partial<AgRow> = {};
        for (const [key, value] of Object.entries(raw)) {
          const mapped = AG_COL_MAP[key.trim()];
          if (!mapped) continue;
          if (mapped === "mes") {
            out.mes = excelDateToISO(value);
          } else if (
            mapped === "rede" ||
            mapped === "distribuidor" ||
            mapped === "cluster" ||
            mapped === "clusterMix" ||
            mapped === "canal" ||
            mapped === "canalMix" ||
            mapped === "atributo"
          ) {
            out[mapped] = value == null ? "" : String(value);
          } else {
            const n = typeof value === "number" ? value : value == null ? 0 : Number(value);
            out[mapped] = Number.isFinite(n) ? n : 0;
          }
        }
        return out as AgRow;
      })
      .filter((r) => r.rede && r.mes);
  }

  // Parse "estrutura" sheet if present
  const estSheetName = wb.SheetNames.find((n) => n.toLowerCase() === "estrutura");
  let estrutura: EstruturaRow[] = [];
  if (estSheetName) {
    const wsE = wb.Sheets[estSheetName];
    const jsonE = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsE, {
      defval: null,
      raw: true,
    });
    const norm = (v: unknown) => (v == null ? "" : String(v).trim());
    estrutura = jsonE
      .map((raw) => {
        const out: EstruturaRow = { rede: "", rv: "", sv: "", gv: "", rvNome: "", svNome: "", gvNome: "", distribuidor: "" };
        for (const [k, v] of Object.entries(raw)) {
          const key = k.trim().toLowerCase();
          if (key === "rede") out.rede = norm(v);
          else if (key === "rv") out.rv = norm(v);
          else if (key === "sv") out.sv = norm(v);
          else if (key === "gv") out.gv = norm(v);
          else if (key === "rv nome") out.rvNome = norm(v);
          else if (key === "sv nome") out.svNome = norm(v);
          else if (key === "gv nome") out.gvNome = norm(v);
          else if (key === "distribuidor") out.distribuidor = norm(v);
        }
        return out;
      })
      .filter((r) => r.rede);
  }

  // Parse "iniciativas" sheet if present
  const iniSheetName = wb.SheetNames.find((n) => n.toLowerCase() === "iniciativas");
  let iniciativas: IniciativaRow[] = [];
  if (iniSheetName) {
    const wsI = wb.Sheets[iniSheetName];
    const jsonI = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsI, {
      defval: null,
      raw: true,
    });
    const norm = (v: unknown) => (v == null ? "" : String(v).trim());
    const fixed = new Set(["distribuidor", "cluster", "canal", "rede"]);
    iniciativas = jsonI
      .map((raw) => {
        const out: IniciativaRow = {
          distribuidor: "",
          cluster: "",
          canal: "",
          rede: "",
          iniciativas: {},
        };
        for (const [k, v] of Object.entries(raw)) {
          const keyRaw = k.trim();
          const key = keyRaw.toLowerCase();
          if (key === "distribuidor") out.distribuidor = norm(v);
          else if (key === "cluster") out.cluster = norm(v);
          else if (key === "canal") out.canal = norm(v);
          else if (key === "rede") out.rede = norm(v);
          else if (!fixed.has(key)) {
            const n = typeof v === "number" ? v : v == null ? 0 : Number(v);
            out.iniciativas[keyRaw] = Number.isFinite(n) && n > 0 ? 1 : 0;
          }
        }
        return out;
      })
      .filter((r) => r.rede);
  }

  return { rows, agRows, estrutura, iniciativas };
}

export function formatUpdatedAt(meta: DataMeta): string {
  try {
    const d = new Date(meta.updatedAt);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return meta.updatedAt;
  }
}
