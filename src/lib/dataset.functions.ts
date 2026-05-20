import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMAIL = "filipe.pedroso@oniz.com.br";
const PASSWORD = "402139";

export const updateDataset = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; password: string; rows: unknown[] }) => {
    if (!input || typeof input !== "object") throw new Error("Payload inválido");
    if (typeof input.email !== "string" || typeof input.password !== "string")
      throw new Error("Credenciais ausentes");
    if (!Array.isArray(input.rows)) throw new Error("Linhas ausentes");
    if (input.rows.length > 50000) throw new Error("Arquivo muito grande");
    return input;
  })
  .handler(async ({ data }) => {
    if (data.email.trim().toLowerCase() !== EMAIL || data.password !== PASSWORD) {
      throw new Error("E-mail ou senha incorretos");
    }
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("dataset").upsert({
      id: "main",
      rows: data.rows,
      row_count: data.rows.length,
      updated_at: updatedAt,
    });
    if (error) throw new Error(error.message);
    return { ok: true, updatedAt, rowCount: data.rows.length };
  });
