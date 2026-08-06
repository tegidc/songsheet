-- Baseline: document the projects table that Figma Make bootstrapped.
-- Every statement is idempotent — safe to run against a live database
-- that already has this table and its data.

create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users not null,
  name        text        not null default '',
  data        jsonb       not null default '{}',
  status      text        not null default 'working'
                check (status in ('working', 'finished', 'archived')),
  updated_at  timestamptz not null default now()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Guard: only create the trigger if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'projects_updated_at'
      and tgrelid = 'projects'::regclass
  ) then
    create trigger projects_updated_at
      before update on projects
      for each row execute function set_updated_at();
  end if;
end;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table projects enable row level security;

-- Drop first so re-running the migration is safe
drop policy if exists "Users manage own projects" on projects;

create policy "Users manage own projects"
  on projects for all
  using (auth.uid() = user_id);

-- ── Index ─────────────────────────────────────────────────────────────────────

-- Covers the main query: all projects for a user, ordered by recency
create index if not exists projects_user_updated
  on projects (user_id, updated_at desc);
