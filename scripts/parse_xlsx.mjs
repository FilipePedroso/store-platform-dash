import * as XLSX from "xlsx";
import fs from "fs";
const buf = fs.readFileSync("/mnt/user-uploads/Histórico-5.xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
console.log("Sheets:", wb.SheetNames);
for (const n of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null });
  console.log(`  ${n}: ${rows.length} rows`);
}
