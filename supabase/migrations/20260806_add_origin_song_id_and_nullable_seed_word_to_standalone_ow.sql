alter table public.standalone_ow
  add column if not exists origin_song_id uuid references public.projects(id) on delete set null;

alter table public.standalone_ow
  alter column seed_word drop not null;

create index if not exists standalone_ow_origin_song_id_idx
  on public.standalone_ow (origin_song_id);
