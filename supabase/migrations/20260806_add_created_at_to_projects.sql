-- projects.created_at — the song's genuine start date.
--
-- Until now the only record of when a song was started was the YYMMDD prefix
-- baked into projects.name, which the app had to parse back out (and which a
-- manual rename could destroy). This column holds it properly; the app derives
-- the name prefix from it and only falls back to parsing the name.
--
-- Backfilled from each song's real start date rather than defaulting every
-- existing row to now(): for rows that carry a YYMMDD name prefix that date is
-- authoritative, otherwise updated_at is the best evidence available.

alter table public.projects
  add column if not exists created_at timestamptz not null default now();

update public.projects
set created_at = case
  when name ~ '^\d{6}'
    then to_timestamp(substring(name from 1 for 6), 'YYMMDD')
  else updated_at
end
where created_at is null or created_at > updated_at;
