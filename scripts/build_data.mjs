import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const SRC = process.argv[2] || "public/data/historico.xlsx";
const OUT_DIR = "public/data";

const buf = fs.readFileSync(SRC);
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) { const pad = n => String(n).padStart(2, "0"); return `${d.y}-${pad(d.m)}-${pad(d.d)}`; }
  }
  if (typeof v === "string") { const d = new Date(v); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); return v; }
  return "";
}

const COL_MAP = {"Rede":"rede","Distribuidor":"distribuidor","Cluster":"cluster","Cluster Mix":"clusterMix","Canal":"canal","Canal Mix":"canalMix","Nº de CNPJ's":"cnpjs","Nº de CNPJs":"cnpjs","Target de Unidades por Activation Group":"targetUnidades","Qtd. AG":"qtdAG","Ag. Batidos":"agBatidos","% Sortimento":"sortimento","Faturamento Mês Atual":"faturamento","Potencial de Investimento (Garantindo SOS & CKO)":"potencial","Investimento Gerado (Garantindo SOS & CKO)":"gerado","Mês":"mes"};
const AG_COL_MAP = {"Rede":"rede","Distribuidor":"distribuidor","Cluster":"cluster","Cluster Mix":"clusterMix","Canal":"canal","Canal Mix":"canalMix","Nº de CNPJ's":"cnpjs","Nº de CNPJs":"cnpjs","Target de Unidades por Activation Group":"targetUnidades","Atributo":"atributo","Valor":"valor","Mês":"mes","loading dpp":"loadingDpp","Loading DPP":"loadingDpp","positivação":"positivacao","Positivação":"positivacao"};

const findSheet = (...names) => wb.SheetNames.find(n => names.includes(n.toLowerCase()));
const sheetJson = name => name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true }) : [];

const dadosName = findSheet("dados") || wb.SheetNames[0];
const strCols = new Set(["rede","distribuidor","cluster","clusterMix","canal","canalMix"]);
const rows = sheetJson(dadosName).map(raw => {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const m = COL_MAP[k.trim()]; if (!m) continue;
    if (m === "mes") out.mes = excelDateToISO(v);
    else if (strCols.has(m)) out[m] = v == null ? "" : String(v);
    else { const n = typeof v === "number" ? v : v == null ? 0 : Number(v); out[m] = Number.isFinite(n) ? n : 0; }
  }
  return out;
}).filter(r => r.rede && r.mes);

const agStrCols = new Set(["rede","distribuidor","cluster","clusterMix","canal","canalMix","atributo"]);
const agRows = sheetJson(findSheet("dados ags")).map(raw => {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const m = AG_COL_MAP[k.trim()]; if (!m) continue;
    if (m === "mes") out.mes = excelDateToISO(v);
    else if (agStrCols.has(m)) out[m] = v == null ? "" : String(v);
    else { const n = typeof v === "number" ? v : v == null ? 0 : Number(v); out[m] = Number.isFinite(n) ? n : 0; }
  }
  return out;
}).filter(r => r.rede && r.mes);

const norm = v => v == null ? "" : String(v).trim();

const estrutura = sheetJson(findSheet("estrutura")).map(raw => {
  const out = { rede:"",rv:"",sv:"",gv:"",rvNome:"",svNome:"",gvNome:"",distribuidor:"" };
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
}).filter(r => r.rede);

const fixed = new Set(["distribuidor","cluster","canal","rede"]);
const iniciativas = sheetJson(findSheet("iniciativas")).map(raw => {
  const out = { distribuidor:"",cluster:"",canal:"",rede:"",iniciativas:{} };
  for (const [k, v] of Object.entries(raw)) {
    const keyRaw = k.trim(); const key = keyRaw.toLowerCase();
    if (key === "distribuidor") out.distribuidor = norm(v);
    else if (key === "cluster") out.cluster = norm(v);
    else if (key === "canal") out.canal = norm(v);
    else if (key === "rede") out.rede = norm(v);
    else if (!fixed.has(key)) { const n = typeof v === "number" ? v : v == null ? 0 : Number(v); out.iniciativas[keyRaw] = Number.isFinite(n) && n > 0 ? 1 : 0; }
  }
  return out;
}).filter(r => r.rede);

const estruturaGrupos = sheetJson(findSheet("estrutura_grupos","estrutura grupos")).map(raw => {
  const out = { categoria:"",marca:"",activationGroup:"",ean:"",descricao:"" };
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase();
    if (key === "categoria") out.categoria = norm(v);
    else if (key === "marca") out.marca = norm(v);
    else if (key === "activation group" || key === "activationgroup") out.activationGroup = norm(v);
    else if (key === "ean") out.ean = norm(v);
    else if (key === "descrição" || key === "descricao") out.descricao = norm(v);
  }
  return out;
}).filter(r => r.activationGroup && r.ean);

const skuRows = sheetJson(findSheet("dados_skus","dados skus")).map(raw => {
  const out = { rede:"",activationGroup:"",dsEan:"",volume:0,mes:"",distribuidor:"",canal:"",cluster:"" };
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim().toLowerCase();
    if (key === "rede") out.rede = norm(v);
    else if (key === "activation group" || key === "activationgroup") out.activationGroup = norm(v);
    else if (key === "ds_ean" || key === "dsean" || key === "ean") out.dsEan = norm(v);
    else if (key === "volume") { const n = typeof v === "number" ? v : v == null ? 0 : Number(v); out.volume = Number.isFinite(n) ? n : 0; }
    else if (key === "mês" || key === "mes") out.mes = excelDateToISO(v);
    else if (key === "distribuidor") out.distribuidor = norm(v);
    else if (key === "canal") out.canal = norm(v);
    else if (key === "cluster") out.cluster = norm(v);
  }
  return out;
}).filter(r => r.rede && r.dsEan);

const stat = fs.statSync(SRC);
const meta = {
  updatedAt: stat.mtime.toISOString(),
  rowCount: rows.length,
  agsCount: agRows.length,
  skusCount: skuRows.length,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const write = (name, obj) => {
  const json = JSON.stringify(obj);
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, json);
  const gz = zlib.gzipSync(json).length;
  console.log(`  ${name}: ${(json.length/1024/1024).toFixed(2)} MB (gz ${(gz/1024/1024).toFixed(2)} MB)`);
};
write("rows.json", rows);
write("ags.json", agRows);
write("skus.json", skuRows);
write("estrutura.json", estrutura);
write("iniciativas.json", iniciativas);
write("estrutura_grupos.json", estruturaGrupos);
write("meta.json", meta);
console.log("OK");
