create table if not exists standalone_ow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  seed_word text not null,
  body text not null,
  written_at timestamptz default now()
);

alter table standalone_ow enable row level security;

create policy "own rows" on standalone_ow
  for all using (auth.uid() = user_id);
