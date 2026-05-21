import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMAIL = "filipe.pedroso@oniz.com.br";
const PASSWORD = "402139";

export const updateDataset = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { email: string; password: string; rows: unknown[]; agRows?: unknown[] }) => {
      if (!input || typeof input !== "object") throw new Error("Payload inválido");
      if (typeof input.email !== "string" || typeof input.password !== "string")
        throw new Error("Credenciais ausentes");
      if (!Array.isArray(input.rows)) throw new Error("Linhas ausentes");
      if (input.rows.length > 50000) throw new Error("Arquivo muito grande");
      const agRows = Array.isArray(input.agRows) ? input.agRows : [];
      if (agRows.length > 500000) throw new Error("Aba 'dados ags' muito grande");
      return { ...input, agRows };
    },
  )
  .handler(async ({ data }) => {
    if (data.email.trim().toLowerCase() !== EMAIL || data.password !== PASSWORD) {
      throw new Error("E-mail ou senha incorretos");
    }
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("dataset").upsert({
      id: "main",
      rows: data.rows as unknown as never,
      row_count: data.rows.length,
      ags: data.agRows as unknown as never,
      ags_count: data.agRows.length,
      updated_at: updatedAt,
    });
    if (error) throw new Error(error.message);
    return {
      ok: true,
      updatedAt,
      rowCount: data.rows.length,
      agsCount: data.agRows.length,
    };
  });
