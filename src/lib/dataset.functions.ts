import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EMAIL = "filipe.pedroso@oniz.com.br";
const PASSWORD = "402139";

function checkCreds(email: string, password: string) {
  if (email.trim().toLowerCase() !== EMAIL || password !== PASSWORD) {
    throw new Error("E-mail ou senha incorretos");
  }
}

/**
 * Atualiza a tabela principal `dataset` (aba "Dados") e limpa os chunks
 * existentes da aba "dados ags". Em seguida o cliente envia os chunks
 * via `appendAgsChunk` para evitar timeouts.
 */
export const updateDataset = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      email: string;
      password: string;
      rows: unknown[];
      estrutura?: unknown[];
      iniciativas?: unknown[];
    }) => {
      if (!input || typeof input !== "object") throw new Error("Payload inválido");
      if (typeof input.email !== "string" || typeof input.password !== "string")
        throw new Error("Credenciais ausentes");
      if (!Array.isArray(input.rows)) throw new Error("Linhas ausentes");
      if (input.rows.length > 50000) throw new Error("Arquivo muito grande");
      if (input.estrutura != null && !Array.isArray(input.estrutura))
        throw new Error("Estrutura inválida");
      if (input.iniciativas != null && !Array.isArray(input.iniciativas))
        throw new Error("Iniciativas inválidas");
      return input;
    },
  )
  .handler(async ({ data }) => {
    checkCreds(data.email, data.password);
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("dataset").upsert({
      id: "main",
      rows: data.rows as unknown as never,
      row_count: data.rows.length,
      updated_at: updatedAt,
      estrutura: (data.estrutura ?? []) as unknown as never,
      iniciativas: (data.iniciativas ?? []) as unknown as never,
    });
    if (error) throw new Error(error.message);
    // Limpa chunks antigos da aba "dados ags"
    const { error: delErr } = await supabaseAdmin
      .from("dataset_ags_chunks")
      .delete()
      .eq("id", "main");
    if (delErr) throw new Error(delErr.message);
    return { ok: true, updatedAt, rowCount: data.rows.length };
  });

/** Envia um chunk de linhas da aba "dados ags" — chamado em loop pelo cliente. */
export const appendAgsChunk = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      email: string;
      password: string;
      chunkIndex: number;
      rows: unknown[];
    }) => {
      if (!input || typeof input !== "object") throw new Error("Payload inválido");
      if (typeof input.email !== "string" || typeof input.password !== "string")
        throw new Error("Credenciais ausentes");
      if (typeof input.chunkIndex !== "number" || input.chunkIndex < 0)
        throw new Error("chunkIndex inválido");
      if (!Array.isArray(input.rows)) throw new Error("Linhas ausentes");
      if (input.rows.length > 5000) throw new Error("Chunk muito grande");
      return input;
    },
  )
  .handler(async ({ data }) => {
    checkCreds(data.email, data.password);
    const { error } = await supabaseAdmin.from("dataset_ags_chunks").upsert({
      id: "main",
      chunk_index: data.chunkIndex,
      rows: data.rows as unknown as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true, chunkIndex: data.chunkIndex, count: data.rows.length };
  });
