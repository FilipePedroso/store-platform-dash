create table public.dataset (
  id text primary key default 'main',
  rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.dataset enable row level security;

create policy "public can read dataset"
  on public.dataset for select
  using (true);

insert into public.dataset (id, rows, row_count) values ('main', '[]'::jsonb, 0)
on conflict (id) do nothing;
