# Plan: Mobile Lyric Bar — Compact Top Strip

## Context

The current mobile lyric tools (`MobileLyricTools`, lines 4700–4747) sit at the bottom as a fixed tab bar that opens a full Drawer sheet for each of the three panels (Inspire, Rhyme, Synonyms). The user wants all three collapsed into a single compact bar pinned to the **top** of the lyrics view, showing 3–4 words inline, with a mode-cycle icon to switch between tools and a refresh icon to rotate through the current tool's suggestions. No drawer, no sheet — everything inline in one bar.

---

## What Already Exists (reuse)

| Thing | Location | Reuse |
|---|---|---|
| `pickFragmentGroup(fragmentSource)` | line ~302 | Drive inspire words |
| `FRAGMENT_INTERVAL = 15000` | line ~3051 | Auto-cycle timer |
| `fragmentSource` memo pattern | InspirationPanel lines 3062–3069 | Replicate in bar |
| Datamuse rhyme fetch pattern | RhymePanel lines 3283–3311 | `rel_rhy` + `rel_nry` |
| Datamuse thesaurus fetch pattern | ThesaurusPanel lines 3466–3493 | `rel_syn` + `ml` |
| `selectionWord` prop | MobileLyricTools props | Word source for rhyme/synonyms |
| Mode glyphs `✦ ◈ ⇄` | MobileLyricTools buttons | Reuse as mode indicators |
| Spacer div height calc | line ~4732 | Repurpose for top offset |

---

## New Component: `MobileLyricBar`

Replaces `MobileLyricTools` entirely. Same call site (`isMobile && tab === "lyrics"`), same props.

### Layout

```
┌──────────────────────────────────────────────┐  ← fixed top (below 49px nav)
│  [words · words · words]  flex-1  │ [↻] [◈] │
└──────────────────────────────────────────────┘
  ↑ 40px tall, bg-background, border-b border-border
```

- **Left/centre**: word display — up to ~28 chars, overflow hidden, single line
- **Right**: `[↻ cycle]` then `[mode icon — tap to advance mode]`
- Below bar: an invisible spacer div (`h-10`) so lyrics don't hide under the bar

### State

```ts
const [mode, setMode]       = useState<"inspire"|"rhyme"|"synonyms">("inspire");
const [cycleIdx, setCycleIdx] = useState(0);

// inspire
const [fragment, setFragment] = useState<string[]>([]);
const [fading, setFading]     = useState(false);

// rhyme
const [rhymes, setRhymes]     = useState<{word:string;near:boolean}[]>([]);

// synonyms
const [syns, setSyns]         = useState<string[]>([]);
```

### Mode cycling

```ts
const MODES = ["inspire", "rhyme", "synonyms"] as const;
const nextMode = () => {
  setMode(m => MODES[(MODES.indexOf(m) + 1) % 3]);
  setCycleIdx(0);
};
```

Mode icons (same as existing): `✦` inspire · `◈` rhyme · `⇄` synonyms

### Inspire logic

- `fragmentSource` memo: identical to `InspirationPanel` (notes + bigIdea + story + OWs)
- On mount and `cycleIdx` change: call `pickFragmentGroup(fragmentSource)` → take first result, truncate to 28 chars
- Auto-cycle: `setInterval(FRAGMENT_INTERVAL)` while `mode === "inspire"`, calls `setCycleIdx(i => i+1)` (triggers fragment refresh via effect)
- `↻` button: `setCycleIdx(i => i+1)` manually

### Rhyme logic

- Watch `selectionWord` + mode change — when `mode === "rhyme"` and word exists, fetch:
  ```ts
  const [pRes, nRes] = await Promise.all([
    fetch(`https://api.datamuse.com/words?rel_rhy=${word}&max=20`),
    fetch(`https://api.datamuse.com/words?rel_nry=${word}&max=20`),
  ]);
  ```
- Store flat array: first 12 perfect rhymes, then 12 near rhymes
- Display: `rhymes.slice(cycleIdx * 3, cycleIdx * 3 + 3)` → up to 2 perfect + 1 near (or just 3 from the slice)
- `↻`: `setCycleIdx(i => (i + 1) % Math.ceil(rhymes.length / 3))`
- No word selected: show `"select a word ↑"` hint

### Synonym logic

- Same fetch pattern using `rel_syn` + `ml` from ThesaurusPanel
- Flat array of synonyms
- Display: `syns.slice(cycleIdx * 3, cycleIdx * 3 + 3)`
- Same `↻` cycle behaviour

### Word display

Words shown as small tappable pills. Tapping a word copies it to clipboard (quick access). Pills: `text-[11px] px-1.5 py-0.5 rounded border border-border/30 text-foreground/80`.

Character limit: each word truncated to 12 chars; max 3 shown.

---

## Positioning Changes

- Remove the **bottom spacer div** (`height: "calc(56px + ..."`) from MobileLyricTools
- The new bar is `fixed top-[49px] inset-x-0 z-30 h-10`
- Add a **top spacer div** `h-10` above the lyrics section content so text doesn't hide under bar
- The lyrics section is rendered inside the scrollable tab content — the spacer goes at the top of the lyrics section JSX

---

## Files to Change

| File | Change |
|---|---|
| `src/app/App.tsx` | Replace `MobileLyricTools` component; update spacer positioning in lyrics section |

---

## Verification

1. Mobile Lyrics tab — bar appears at top, below nav header, 40px tall
2. Default mode shows inspire — fragment words appear and auto-cycle every 15s
3. Tap `↻` — new fragment words appear immediately
4. Tap mode icon `✦` → switches to `◈` Rhyme, shows "select a word ↑"
5. Highlight a word in lyrics → rhyme mode shows 2 rhymes + 1 near
6. Tap `↻` in rhyme mode → cycles to next 3 rhymes
7. Tap mode icon again → `⇄` Synonyms, shows synonyms for selected word
8. Tap mode again → back to `✦` Inspire
9. Lyrics text not hidden under bar (spacer working)
10. Desktop unaffected

---

# Plan: Object Writing — Save, Index & Inspiration Integration

## Context

Object Writing in Create > Notes lets users free-write against a timed prompt. Entries update the song in real-time but there is no explicit Save button, no auto-save on timer completion, no per-entry visual section dividers, and no seed-word index in the header. The user wants all four, plus confirmation that OW text feeds the Inspiration panel (it already does — no code change needed there).

---

## What Already Exists

| Thing | Where |
|---|---|
| `ObjectWritingBox` | lines 4202–4465 — timer, textarea, `done` state, `onChange` each keystroke |
| `ObjectWritingSection` | lines 4469–4538 — wraps boxes in `CollapsibleSection`, has inline seed-word index already |
| `CollapsibleSection` | lines 4069–4086 — `title`, `subtitle`, `defaultOpen`, `isMobile`, `children` |
| `InspirationPanel.fragmentSource` | lines 3041–3048 — already maps `song.objectWritings` ✅ |
| `OWEntry` interface | line 19 — `{ id, text, seedWord? }` |
| Song auto-save | periodic effect persists song; OW entries already save via `onChange` on every keystroke |

---

## Changes Required

### 1. `OWEntry` interface — add `savedAt`
```ts
interface OWEntry { id: string; text: string; seedWord?: string; savedAt?: string; }
```
Set on explicit Save or auto-save. Entries without it are "in progress".

### 2. `CollapsibleSection` — add `headerExtra` + controlled open

Add two optional props:
- `headerExtra?: React.ReactNode` — rendered below title/subtitle inside the header button (pills use `e.stopPropagation()`)
- `open?: boolean` + `onOpenChange?: (v: boolean) => void` — controlled mode so `ObjectWritingSection` can force-open when a pill is clicked while collapsed

### 3. `ObjectWritingBox` — Save button + auto-save on timer end

- Add `onSave?: () => void` prop
- Add local `justSaved` boolean state (2 s flash)
- **Save action**: calls `onSave?.()` + sets `justSaved = true`, clears after 2 s
- **Save button**: in the controls row, disabled when textarea is empty; shows "Saved ✓" flash in accent colour
- **Auto-save**: `useEffect` on `done` — fires save action once when timer reaches 0

### 4. `ObjectWritingSection` — per-entry dividers + header index

**Lift `open` state out** of `CollapsibleSection` into `ObjectWritingSection` (use controlled mode) so pill clicks can force-open.

**Per-entry divider** — wrap each `ObjectWritingBox` in a scroll target div:
```tsx
<div id={`ow-${entry.id}`}>
  <div className="...divider header...">
    <span>{entry.seedWord || "—"}</span>
    {entry.savedAt && <span>{format(new Date(entry.savedAt), "d MMM, HH:mm")}</span>}
  </div>
  <ObjectWritingBox ... onSave={() => markSaved(entry.id)} />
</div>
```

**Header index pills** — passed as `headerExtra`:
```tsx
<div onClick={e => e.stopPropagation()} className="flex flex-wrap gap-1 mt-1">
  {entries.filter(e => e.seedWord).map(e => (
    <button key={e.id} onClick={() => {
      setOwOpen(true);   // force section open
      setTimeout(() => document.getElementById(`ow-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }} className="text-[8px] uppercase ... font-mono ...">
      {e.seedWord}
    </button>
  ))}
</div>
```

### 5. Inspiration — no changes
`InspirationPanel` already sources `song.objectWritings` text. ✅

---

## Files to Change

| File | Change |
|---|---|
| `src/app/App.tsx` | `OWEntry` (add `savedAt`), `CollapsibleSection` (headerExtra + controlled open), `ObjectWritingBox` (Save button + auto-save), `ObjectWritingSection` (dividers + index) |

Uses existing `date-fns` (`format`) — already installed.

---

## Verification

1. Create > Notes > Object Writing — start session, timer ends → auto-saves, timestamp appears in divider
2. Click Save mid-session → "Saved ✓" flash, timestamp set
3. Collapse section → seed word pills visible in header
4. Click a pill while collapsed → section opens + scrolls to that entry
5. Inspiration panel → fragments cycle through OW text ✅

---

# Plan: Supabase Schema Baseline Migration

## Context

The `projects` table is the core persistence layer for SongSheet but has no CREATE TABLE migration — Figma Make bootstrapped it silently. Only one ALTER (adding `status`) and two later tables (`standalone_ow`, `audio-notes` bucket) are documented. This means the schema only exists in Supabase's live database with no reproducible definition. The goal is to write a safe baseline migration that documents the full expected schema without breaking the live database.

---

## What's Missing

| Object | Status |
|--------|--------|
| `projects` CREATE TABLE | ❌ No migration |
| `projects` RLS policy | ❌ No migration |
| `projects` `updated_at` auto-trigger | ❌ No migration |
| `projects.status` column | ✅ 20260718 |
| `standalone_ow` full table + RLS | ✅ 20260726 |
| `audio-notes` bucket + RLS | ✅ 20260802 |

---

## New Migration File

**`supabase/migrations/20260101_projects_baseline.sql`** (early timestamp so it sorts before the ALTER migration)

```sql
-- Baseline: document the projects table that Figma Make bootstrapped.
-- All statements use IF NOT EXISTS / DO NOTHING so they are safe to run
-- against a live database that already has this table.

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null default '',
  data        jsonb not null default '{}',
  status      text not null default 'working'
                check (status in ('working','finished','archived')),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- RLS: users can only see and modify their own projects
alter table projects enable row level security;

create policy "Users manage own projects"
  on projects for all
  using (auth.uid() = user_id);

-- Index for the common query: fetch all projects for a user ordered by recency
create index if not exists projects_user_updated
  on projects (user_id, updated_at desc);
```

**Key safety choices:**
- `create table if not exists` — no-ops if table already exists
- `create or replace function` — idempotent
- `create trigger` will error if trigger already exists — wrap in a DO block with exception handling in actual file
- `create policy` will error if policy already exists — use `drop policy if exists` first
- `create index if not exists` — idempotent

---

## Files to Change

| File | Change |
|------|--------|
| `supabase/migrations/20260101_projects_baseline.sql` | New file — full projects schema |

No App.tsx changes needed.

---

## Verification

1. Apply migration to Supabase — should complete with no errors on both a fresh DB and the live DB
2. Confirm `projects` table still has all existing rows intact
3. Edit a project in the app → confirm `updated_at` changes automatically
4. Sign out and try to query projects → confirm RLS blocks unauthenticated access
5. Confirm the `status` ALTER migration (20260718) still runs cleanly after the baseline (it will attempt to add a column that already exists — needs an `IF NOT EXISTS` guard there too)

---

---

# Plan: Audio Notes (Record · Import · Export)

## Context

SongSheet has no audio infrastructure. The user wants voice/audio notes that live inside the Create tab's existing collapsible sections — record a melody idea, import an existing voice memo, export any note as a file. "Limited" means capped duration and count to stay practical. All audio lives in Supabase Storage; the Song model holds metadata + URLs.

---

## Scope

- **Song-level** "Voice Notes" collapsible section in the Create tab (alongside Notebook, Production, etc.)
- **Record** via browser `MediaRecorder` API (no new packages)
- **Import** an existing audio file from device (any format the browser supports: m4a, mp3, webm, wav)
- **Export** any note as a download to the device
- Max **5 notes per song**, each **max 90 seconds** recorded (imported files have no duration cap)
- Playback, rename label, delete — all inline

---

## Data Model Changes

### New type in `App.tsx`
```ts
interface AudioNote {
  id: string;          // uid()
  label: string;       // editable, defaults to "Note 1", "Note 2", …
  storagePath: string; // "{userId}/{projectId}/{id}.webm" (or original ext for imports)
  url: string;         // signed URL refreshed on load (1h TTL)
  duration: number;    // seconds (0 if unknown)
  createdAt: string;   // ISO timestamp
}
```

### `Song` interface — add one field
```ts
audioNotes?: AudioNote[];
```

### Song normalizer (where `raw.chordBars`, etc. are defaulted ~line 4139)
```ts
audioNotes: Array.isArray(raw.audioNotes) ? raw.audioNotes : [],
```

---

## Supabase Migration

New file: `supabase/migrations/20260802_audio_notes_bucket.sql`

```sql
insert into storage.buckets (id, name, public)
values ('audio-notes', 'audio-notes', false)
on conflict do nothing;

create policy "Users manage own audio notes"
on storage.objects for all
using (
  bucket_id = 'audio-notes'
  and auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## Component: `VoiceNotesSection`

Single new component in `App.tsx`, rendered in the Create tab between Story·Big Idea and Production.

### Record flow
1. Click **Record** → `getUserMedia({ audio: true })` → start `MediaRecorder`
2. Timer counts up; auto-stops at 90 s
3. On stop: assemble `Blob`, upload to `audio-notes/{userId}/{projectId}/{id}.webm`
4. Create signed URL (1 h), push new `AudioNote` into `song.audioNotes`, call `updateSong`

### Import flow
1. Hidden `<input type="file" accept="audio/*">` triggered by **Import** button
2. On file select: upload raw file bytes to Storage at `audio-notes/{userId}/{projectId}/{id}.{ext}`
3. Attempt to read duration via `new Audio()` → `loadedmetadata` event
4. Same metadata push + `updateSong` as recording

### Export flow
1. Click export icon on a note
2. Fetch the signed URL → `blob` → `URL.createObjectURL` → programmatic `<a download>` click
3. Filename: `{label}.{ext}`

### Playback
- One shared `playingId` state; each note has a hidden `<audio>` ref
- Custom play/pause button; progress bar via `timeupdate` event
- Signed URLs refreshed on component mount via `supabase.storage.createSignedUrl`

### Delete
- `supabase.storage.from('audio-notes').remove([storagePath])`
- Remove from `song.audioNotes`, call `updateSong`

### UI sketch
```
┌ Voice Notes ──────────────────────────────── [▾] ┐
│  [● Record]  [↑ Import]                           │
│                                                    │
│  ▶ ━━━━━━━━━━━━━  Note 1         0:34  [↓] [✕]   │
│  ▶ ━━━━━━          Chorus idea   0:12  [↓] [✕]   │
│                                                    │
│  3 / 5 notes  ·  recorded, tap to play            │
└────────────────────────────────────────────────────┘
```
- `[● Record]` disabled at 5 notes (recorded); `[↑ Import]` still works at any count
- Label is click-to-edit inline
- `[↓]` = export download, `[✕]` = delete

---

## Constraints & Edge Cases

- **Unauthenticated**: show "Sign in to record or import voice notes" — no record/import/export buttons; section still renders (collapsed)
- **No projectId yet** (new unsaved song): disable record/import with "Save your song first to add voice notes" — first auto-save creates the project ID
- **Browser `MediaRecorder` codec**: prefer `audio/webm;codecs=opus`; fall back to whatever `MediaRecorder.isTypeSupported` returns first
- **Project delete** (line ~1967): add `supabase.storage.from('audio-notes').remove(song.audioNotes.map(n => n.storagePath))` before deleting the project row
- **Mobile**: record and import both work on mobile browsers; file input with `accept="audio/*"` also surfaces "Record Audio" on iOS

---

## Files to Change

| File | Change |
|------|--------|
| `src/app/App.tsx` | `AudioNote` type · `audioNotes?` on `Song` · normalizer default · `VoiceNotesSection` component · wire into Create tab · cleanup on project delete |
| `supabase/migrations/20260802_audio_notes_bucket.sql` | New migration — bucket + RLS policy |

No new npm packages.

---

## Verification

1. Create tab → Voice Notes section visible (collapsed on mobile, open on desktop)
2. Click Record → mic permission prompt → timer → Stop → note appears with playback bar
3. Click Import → file picker → select `.m4a` → note appears
4. Click play → audio plays; clicking another note stops the first
5. Click label → inline edit → blur saves
6. Click export `↓` → file downloads with correct name
7. Click `✕` → note removed from UI and from Supabase Storage
8. Add 5 notes → Record button shows disabled state
9. Sign out → section shows sign-in prompt
10. Delete project → Storage files removed before DB row deletion
11. Reload → notes still present, signed URLs refreshed
