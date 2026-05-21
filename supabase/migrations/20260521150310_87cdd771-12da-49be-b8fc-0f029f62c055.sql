ALTER TABLE public.dataset DROP COLUMN IF EXISTS ags;
ALTER TABLE public.dataset DROP COLUMN IF EXISTS ags_count;

CREATE TABLE IF NOT EXISTS public.dataset_ags_chunks (
  id TEXT NOT NULL DEFAULT 'main',
  chunk_index INTEGER NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (id, chunk_index)
);

ALTER TABLE public.dataset_ags_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read dataset_ags_chunks"
  ON public.dataset_ags_chunks
  FOR SELECT
  USING (true);