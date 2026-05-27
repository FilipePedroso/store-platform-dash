ALTER TABLE public.dataset ADD COLUMN IF NOT EXISTS estrutura_grupos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.dataset_skus_chunks (
  id text NOT NULL DEFAULT 'main',
  chunk_index integer NOT NULL,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (id, chunk_index)
);

GRANT SELECT ON public.dataset_skus_chunks TO anon;
GRANT SELECT ON public.dataset_skus_chunks TO authenticated;
GRANT ALL ON public.dataset_skus_chunks TO service_role;

ALTER TABLE public.dataset_skus_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read dataset_skus_chunks"
ON public.dataset_skus_chunks FOR SELECT
TO public USING (true);