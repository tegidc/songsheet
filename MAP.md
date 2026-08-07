# MAP.md — Songsheet codebase map

Name-anchored, not line-anchored: look symbols up by name in the file, not
by the line number quoted here (line numbers rot as the file changes).

## Data model

### Supabase tables (see `supabase/migrations/*.sql`)

- **`projects`** — one row per saved song.
  - `id uuid`, `user_id uuid` (FK `auth.users`, RLS-scoped), `name text`,
    `status text` (`working` | `finished` | `archived`), `updated_at timestamptz`
    (auto-updated by the `set_updated_at` trigger).
  - `data jsonb` — the entire `Song` object (see below) serialized as-is.
    This is the only place song content lives server-side; there is no
    relational breakdown of sections/chords/lyrics.
  - RLS: `auth.uid() = user_id`, all operations.
- **`standalone_ow`** — object-writing sessions, either started from the
  sidebar or mirrored here from inside a song (see "The two object-writing
  stores" below).
  - `id uuid`, `user_id uuid` (FK, RLS-scoped), `seed_word text` (nullable —
    a writing can exist with no focus word), `body text` (not null),
    `written_at timestamptz`, `origin_song_id uuid` (FK `projects(id)`,
    `on delete set null` — deliberate: deleting a song must not delete the
    writing it produced).
  - RLS: `auth.uid() = user_id`, all operations.
- **Storage bucket `audio-notes`** (private) — voice-note recordings.
  Objects are keyed by `<user_id>/...`; RLS policy on `storage.objects`
  restricts access to the folder matching `auth.uid()`.

### `Song` shape (the `projects.data` jsonb payload)

Defined in `src/types.ts`. Top-level fields: `title`, `artist`, `key`,
`tempo`, `timeSignature`, `feel`, `sections: Section[]`, `generalNotes`,
`productionNotes`, `bigIdea`, `story: { beginning, middle, end }`,
`objectWritings: OWEntry[]`, `notebookSections?: NbEntry[]`,
`audioNotes?: AudioNote[]`, `sectionNaming` (per-`SectionType`
number-vs-letter numbering preference).

- `Section` — one verse/chorus/etc: `id`, `type: SectionType`, `label`,
  `shortLabel`, `chordBars: string[]` (one entry per bar/beat slot, including
  the editorial sentinels `"|"` phrase-marker and `"\n"` row-break — see
  `isEditorialBar` in `src/data/constants.ts`), `chordPositions: CP[]`
  (chord-to-lyric-character anchor points), `lyrics`, `notes`.
- `OWEntry` — an object-writing entry *embedded in the song*:
  `id`, `text`, `seedWord?`, `savedAt?`, `cloudId?` (the mirrored
  `standalone_ow` row — only set on entries written inside the song and
  successfully synced; pill is "Linked"), `imported?` (true when the entry
  came from the cloud via "Add to song" rather than being typed here; pill
  is "Loose", never syncs back), `sourceId?` (provenance only, for imported
  entries — the `standalone_ow` row it was copied from; not a live link).
- `NbEntry` — a saved notebook fragment: `id`, `title`, `text`, `savedAt`.
- `AudioNote` — a voice-note reference: `id`, `label`, `storagePath` (path
  in the `audio-notes` bucket), `url`, `duration`, `createdAt`.

`src/sections.ts` holds the factory/normalization helpers for this shape:
`makeEmptySong`/`EMPTY_SONG`, `makeSection`, `normalizeSection` (defensive
reader for rows coming back from Supabase — fills in any field that may be
missing on old rows), `renumberSections`, `isAutoLabel`,
`parseLyricsIntoSections`/`matchSectionHeader`/`SECTION_HEADER_RE` (paste-in
detection of section headers).

### The two object-writing stores — now synced both ways

There are **two separate places object-writing text lives**:

1. `song.objectWritings` (`OWEntry[]`) — writings started from inside a
   song, saved as part of that song's `data` jsonb. Listed by
   `src/components/ow/ObjectWritingSection.tsx`, written in an `OWWindow`.
2. `standalone_ow` (Supabase table) — writings started from the sidebar or
   the header ✦, independent of any song, shown as a word cloud in
   `src/components/sidebar/ProjectsSidebar.tsx` and written in the same
   `OWWindow` via `StandaloneOWWindow.tsx`.

**Song → cloud (Linked)**: entries typed inside a song (no `cloudId`, not
`imported`, non-empty text) get mirrored into `standalone_ow` as part of the
song's own autosave cycle (`doSave`/`syncObjectWritingsToCloud` in
`src/app/App.tsx`) — first save inserts a row and stamps the returned id
back onto the entry as `cloudId`; later saves update that row by id. If the
update matches zero rows (the cloud row was deleted independently) the code
clears `cloudId` and inserts a fresh row rather than erroring. The song's
existing debounced-save trigger was widened to also fire on
non-empty/non-imported object-writing edits (previously it only watched
title/lyrics/chords), otherwise a song containing only a writing would never
save and the writing would never mirror.

**Legacy-import guard**: entries written before `cloudId`/`imported` existed
have neither field set, indistinguishable at a glance from a genuinely new
in-song writing. Before inserting (the "no `cloudId`" branch above),
`syncObjectWritingsToCloud` checks whether a `standalone_ow` row for this
user already has an identical `body`. A match means the entry is almost
certainly a pre-Phase-2 import (the cloud row predates it and has no
`origin_song_id`) — it's adopted as loose (`imported: true`, `sourceId` =
the matching row) instead of inserted as a duplicate. This was added after
the flaw shipped and produced 3 real duplicate rows in production (see
`scripts/repair-ow-duplicates.mjs`, a one-off fix for exactly that);
`scripts/backfill-ow.mjs` uses the same identical-body check.

**Cloud → song (Loose)**: `ProjectsSidebar`'s "Add to song" action
(`onAddOWToSong`) still copies a `standalone_ow` row into the currently-open
song's `song.objectWritings`, now marking the new entry `imported: true`
and `sourceId` (the source row's id, provenance-only — not a live link,
intentionally: the same writing imported into two songs must be able to
diverge). Imported/Loose entries never sync back to `standalone_ow`.

Only Linked entries (typed in a song) sync automatically; Loose entries
(imported from the cloud) are one-shot copies by design. See `OWEntry`
above for the field-level contract.

**Loose → cloud, by hand (Phase 4)**: because a loose entry never syncs,
its window (and only its window) offers two deliberate gestures, wired in
`App.tsx` over `src/lib/owCloud.ts`. *Update original* overwrites the
`sourceId` row behind a `ConfirmDialog` showing that row's label and date;
*Save as new* inserts a fork and repoints `sourceId` at it, so provenance
names a row that exists. With no `sourceId`, or when the update matches
zero rows because the original was deleted, only the insert is possible —
both paths fall back to it automatically and say which happened. The entry
stays loose either way; neither gesture creates a link.

**Cloud → gone (Phase 4)**: `deleteStandaloneOW(id, alsoFromSongs)` in
`src/lib/owCloud.ts`, reached only from the discreet trash control on the
bottom edge of a standalone writing's own window. It scans every
`projects` row for entries whose `cloudId` *or* `sourceId` is this id and
rewrites the ones that match — removing them (`alsoFromSongs`) or
converting them to loose with `cloudId` cleared. That conversion is load-
bearing: a linked entry left pointing at a deleted row would be re-inserted
as a brand-new row by `syncObjectWritingsToCloud` on the song's next save.
`App.deleteCloudOW` applies the identical rewrite (`applyCloudDeleteToEntries`)
to the song held in memory, which would otherwise overwrite the database
change on its next autosave — but only when that song actually holds the
writing, so an unrelated open song isn't dirtied.

### One window, and no save button

Every object writing is edited by `OWWindow`, whatever opened it. The three
components that used to do this (`StandaloneOWDialog` composing from the
sidebar, `StandaloneOWDetail` reading from the sidebar, `ObjectWritingBox`
inline on the Create page) differed only in whether a timer ran and which
actions sat in the footer, so those are the two props that vary:
`timerStart` (seconds, or `null` for an existing writing) and a `footer`
slot. A collapsed pill is this component collapsed, not a summary of it —
expanded it is always this editor, with the same sense scan.

Timer defaults: 10 minutes (`TIMER_OPTS[3]`) for a plain new writing,
2 minutes (`TIMER_OPTS[1]`) when it starts from a word already chosen —
the Lyrics "Object Write [word]" button, `ThesaurusPanel`'s `onObjectWrite`,
or drilling into a sense word. The duration is chosen with the chevrons
before typing and locks at the first keystroke.

**The lifecycle is inverted** (Phase 3): nothing is saved by a button.
- Typing is what starts the timer and what creates the record. The same
  keystroke does both.
- `standalone_ow` writings: `StandaloneOWWindow` inserts on the first
  character and updates on an 800ms debounce, serialized through a
  `saving`/`dirty` ref pair so a burst can't race two inserts. It flushes
  on unmount and on `visibilitychange`.
- In-song writings: `App` holds the open one as a draft and appends it to
  `song.objectWritings` on the keystroke that first gives it text, so the
  window can be opened and closed without touching the song (this is what
  keeps the zero-write invariant true). From there the song's own autosave
  mirrors it to the cloud as before. `App` flushes that autosave on
  `visibilitychange` too, gated on `pendingRef`.
- Done/Close/X only put the window away. Never pressing Done — dismissing
  the window, hiding the tab — still saves. A writing with no text is never
  written at all, and a committed writing emptied out again leaves the song
  when its window closes.

The sidebar lists every `standalone_ow` row chronologically, newest first,
keyed by row `id` (Phase 4 — replacing the word cloud, whose label-keyed
first-match `find()` hid duplicates; see "Known debt").

## Module map

### `src/types.ts`
All shared interfaces/types: `SectionType`, `Tab`, `CP`, `Section`,
`OWEntry`, `NbEntry`, `AudioNote`, `Song`, `ProjectStatus`, `Project`,
`StandaloneOW`. Imported by nearly every other module.

### `src/data/`
- `senses.ts` — `SENSES` (the 8 sensory-category word lists used by the
  object-writing sense-scan feature), `ALL_SENSE_WORDS`.
- `words.ts` — `OBJECT_WORDS` (fallback noun pool for the "Object" picker),
  `STOP_WORDS`, `FN_WORDS` (function words, used for stress-pattern
  guessing), `SECTION_IGNORE_WORDS` (excluded from word-cloud/fragment
  extraction).
- `music.ts` — `TSIGS`, `NOTES`, `FLAT` (flat→sharp
  enharmonic map), `MAJ_ST`/`MIN_ST` (diatonic scale-degree semitone
  offsets), `MAJ_Q`/`MIN_Q` (diatonic chord qualities per degree).
  **Confirmed**: `KEYS`/`MODES` (removed as dead code) had no live feature
  depending on them — `song.key` is a plain freeform text `<input>`
  (`App.tsx`, placeholder `"Am"`), not a dropdown; key *detection*
  (`lib/theory/key.ts` `detectKey`) hardcodes `["major","minor"] as const`
  inline rather than reading `MODES` (which also listed modal names —
  dorian, mixolydian, etc — that detection never used). Verified live in
  the running app: the key field accepts and persists arbitrary text.
- `constants.ts` — `SDEFS` (section-type definitions: label/short
  label/hotkey), `SCOL` (section background colour classes), `TIMER_OPTS`
  (object-writing timer choices), `CW`/`CH`/`FS` (chord-grid cell
  dimensions), `MONO`/`SANS`/`SERIF` (font stacks), `PHRASE_MARKER`/
  `ROW_BREAK`/`isEditorialBar` (chord-bar editorial sentinels).

### `src/lib/` (top level)
- `supabase.ts` — the shared client.
- `owCloud.ts` — cloud operations on `standalone_ow` that are *not* part of
  a song's autosave: `fetchOWRow`, `updateOriginal` (false when it matches
  zero rows), `saveAsNew`, `deleteStandaloneOW` and the pure
  `applyCloudDeleteToEntries` it shares with `App`. See "the two
  object-writing stores" above.
- `useSelectedWord.ts` — the word selected anywhere on the page, or null,
  feeding `FloatingOWButton`. Reads textarea/input selections directly as
  well as `window.getSelection()`, since a selection inside a textarea is
  invisible to the latter in some browsers and most of this app's text is in
  textareas. Multi-word selections return null rather than guessing. Passed
  `enabled: !isMobile` — on touch, selecting text raises the OS copy/paste
  bar and needs a different trigger (Phase 5).

### `src/lib/theory/`
- `chords.ts` — `parseChord`, `normNote`, `getDiatonic`, `inKey`,
  `toNashville`, plus `ROMAN`/`chordToken`/`degreeLabel`/`ChordSuggestion`/
  `buildChordSuggestions` (mobile chord-picker suggestion lists). Note: has
  a mutual (function-body-only) circular import with `key.ts` — `chords.ts`
  needs `parseKeyString` for `toNashville`, `key.ts` needs `parseChord`/
  `getDiatonic`/`normNote` for `detectKey`. This works fine at runtime
  (nothing is evaluated at module-init time) but is worth untangling later.
  Also mutually circular with `substitutions.ts` for the same reason.
- `key.ts` — `detectKey`, `parseKeyString`, `formatDetectedKey`.
- `substitutions.ts` — `getParallelChords`, `getSecondaryDominant`.
- `ideas.ts` — `IdeaResult`, `ChordFunc`, `getChordFunction`,
  `generateIdea` (the 12-technique chord-rewrite idea generator),
  `generateBridgeIdea` (bridge-section chord suggestion). Used by
  `components/chords/AnalyseChordsPanel.tsx`.
- `layout.ts` — `distributeChords`, `syncBarsToPositions`,
  `resolveOverlaps`, `sortCP`, `lcsAlign` (chord-position ↔ lyric-character
  anchoring, used when bar counts change under an existing chord layout).

### `src/lib/text/`
- `senses.ts` — `stemWord`, `lookupSense`, `scanText`, `getDrillWords`,
  `extractDetailWord` (object-writing sense-scan).
- `prosody.ts` — `countSyllables`, `getStressPattern`, `analyzeStress`,
  `lineSyllableCount`.
- `owLabel.ts` — `owLabel(seedWord, body)`: pure function that picks a
  display label for a writing — the seed word if there is one, otherwise
  the first sensory word in the body (via `lookupSense`), otherwise the
  first word not in `FN_WORDS`, otherwise just the first word. Used
  anywhere a writing (linked, loose, or standalone) is labelled, since
  `seed_word`/`seedWord` can now be empty.
- `fragments.ts` — `pickFragmentGroup`, `buildSkeletonLyrics` (Inspiration
  panel's fragment/skeleton-verse generators). **Divergence**: not in the
  original target module list; a distinct concern from word-cloud
  extraction. **Confirmed** live in the running app (Create → Lyrics →
  Inspiration → Fragments) — this is the real implementation; `lib/text/
  cloud.ts` (`extractWordCloud`/`extractSensoryFragments`, removed as dead
  code) was a same-purpose module that nothing ever called.
- `owPool.ts` — `OW_TWO_WORD`, `owPoolCache`, `owPoolReady`, `loadOWPool`
  (fetches noun pool from the Datamuse API on first load), `pickOWWord`.
  **Divergence**: not in the original target list; this is fetch/cache
  logic, not data, so it didn't belong in `data/words.ts`.

### `src/sections.ts` / `src/format.ts`
See "Data model" above for `sections.ts`. `format.ts` — `uid` (short
random id generator used everywhere an `id` field is needed),
`formatRelativeTime`, `defaultProjectName`.

### `src/components/`
- `common/` — `FL` (small-caps mono field label), `AutoTA` (auto-growing
  textarea with word-select callback), `CollapsibleSection`, `ConfirmDialog`
  (a confirm carrying a `detail` line — what is about to be replaced or
  deleted — and a `note` about what the negative answer does; with `onDeny`
  it becomes a three-way Yes/No/dismiss, where the negative button *acts*
  and only backdrop or Escape backs out. `window.confirm` gives OK/Cancel
  and one line, which fits neither the overwrite preview nor the
  cloud-delete question).
- `auth/AuthModal.tsx` — email/password + Google/Apple OAuth sign-in.
- `sidebar/ProjectsSidebar.tsx` — project list (grouped by status) + every
  `standalone_ow` row as a chronological list, newest first, uncapped and
  scrolling, in the same row treatment as the projects list above it
  (Phase 4 — replacing the word cloud). Also exports `STATUS_DOT`/
  `STATUS_LABEL` (per-`ProjectStatus` colour dot and label).
- `ow/` — `OWWindow` (the single editor for one writing, whatever opened
  it — see "One window" below; its optional `onDelete` renders the discreet
  bottom-edge trash control), `StandaloneOWWindow` (its container for
  `standalone_ow` rows, and the only place the cloud-delete confirm lives),
  `OWPillRow` (the song's writings as pills, between the Notebook and the
  object writing area; loose ones carry a hollow dot, and the delete × takes
  a pill out of *this song only*, whichever kind it is), `ObjectWritingSection`
  (what remains of the old section: the two ways to acquire a writing — start
  one, or open the picker), `OWCloudPicker` (shuffled handful + Shuffle, plus
  a search box; one import at a time and the picker stays open, since a batch
  would flood the pill row and Inspiration), `FloatingOWButton` (bottom-right,
  every tab; plain ✦ opens an empty writing on 10 minutes, ✦ + word opens
  seeded on 2).
- `create/` — `StoryAndBigIdea`, `NotebookSection`, `ProductionSection`,
  `VoiceNotesSection` (records/uploads to the `audio-notes` bucket).
- `lyrics/` — `LyricBlock` (per-section lyrics editor), `MobileLyricTools`
  (bottom-sheet Inspire/Rhyme/Synonyms switcher for mobile).
- `chords/` — `BarCell`, `ChordRowGrid`, `ChordChip`, `ChordPickerSheet`,
  `MobileChordSection`, and `AnalyseChordsPanel` (chord-idea generator UI).
  **Divergence**: `AnalyseChordsPanel` wasn't in the original target list;
  it's the render layer for `lib/theory/ideas.ts` and fits naturally here.
- `final/FinalSectionView.tsx` — the read-only "Final" tab layout combining
  lyrics + chords for one section.
- `tools/` — `InspirationPanel`, `ThesaurusPanel`, and `RhymePanel`.
  **Divergence**: `RhymePanel` wasn't in the original target list (which
  only named two of the three tool panels); added alongside its siblings.
  **Confirmed** live in the running app (Lyrics → Rhyme & Metre) —
  `RhymePanel.tsx` is fully self-contained, fetching directly from the
  Datamuse API (`rel_rhy`/`rel_nry`); it never used `lib/text/rhyme.ts`
  (`detectRhymeScheme`/`findRhymingWords`/`buildFill`, removed as dead
  code — that module's fill-in-the-blank scaffolding has no live caller).

### Opening on the last song

Signing in — or arriving with a stored session — loads the most recently
worked song rather than a blank sheet (`App.tsx`, the `autoOpenedRef`
effect). `updated_at` desc, the same order the sidebar shows, excluding
`archived` (archiving is a statement you're done with it; rows predating the
status column have `status` null and count as working). It reuses
`loadProject` with `{ auto: true }`, which skips only the sidebar side
effect — the user didn't ask for the sidebar, so its state is left alone.

Two guards make it safe. It fires **once per sign-in**, not once per `user`
object, because `onAuthStateChange` also fires on token refresh and
re-running it would replace a song mid-edit. And because the fetch is in
flight while the app is already usable, it re-checks `currentProjectIdRef`
and `isPristineSong(songRef.current)` before loading — a song opened by hand
or a blank sheet already written into is never clobbered. `loadProject`
already sets `suppressNextAutosaveRef`, so the auto-open keeps the zero-write
invariant: verified live, a song opened this way and left alone for 78s
(past both the 2s debounce and the 30s force-save) had an unchanged
`updated_at`.

`signOut` now blanks the song as well as the session — leaving the previous
account's song on screen is wrong on its own, and it would also stop the
auto-open firing for someone signing back in without a reload.

### `src/app/App.tsx`
Top-level state (song, tab, auth, sidebar, autosave, undo state for chord
ideas/bridge ideas), the autosave effect (debounced + periodic forced save
to `projects.data`), tab routing, and JSX composition only — 1,144 lines,
down from 5,586 (up from 835 at the end of Phase 3: Phase 4 added the
loose-pill save-to-cloud handlers, the cloud-delete handler and the picker/
floating-button wiring). `src/app/components/ui/` (48 shadcn files) and
`src/app/components/figma/ImageWithFallback.tsx` are untouched, vendored
code.

## Known debt

- **`tsc --noEmit` is now zero-error** and wired up as `pnpm typecheck`,
  run as a non-blocking CI step (`.github/workflows/deploy.yml`) that warns
  without failing the deploy. The 2 pre-existing errors (a `.map` producing
  `(StandaloneOW | undefined)[]` in `ProjectsSidebar.tsx`, and a stray
  `setShowOWPanel` reference in `App.tsx` that should have been
  `setShowGlobalOW`) were both typing slips, not real bugs — fixed by
  guarding the `undefined` case and correcting the setter name.
- **Fixed: opening a song rewrote its `YYMMDD` name prefix.** `doSave`'s
  update branch built `projects.name` from `defaultProjectName(song.title)`
  on every save, which always mints *today's* date — present since the
  initial import commit (`4232483`), predates every refactor phase, not
  introduced by Phase 2. `defaultProjectName` is gone; `src/format.ts` now
  has `newProjectPrefix()` (today's date, insert-only), `prefixFromDate
  (when)`, `parseProjectPrefix(name)` (pulls the `YYMMDD` back out of a
  stored name) and `projectNameWithPrefix(prefix, title)`. `App.tsx` tracks
  the open project's prefix in `currentProjectPrefixRef`, set in
  `loadProject` from the row's `created_at` — the genuine start date, added
  and backfilled in Phase 3 (`supabase/migrations/
  20260806_add_created_at_to_projects.sql`), with `parseProjectPrefix` kept
  only as a fallback for a row without one — and reused on every save;
  `newSong`/new-project-insert mint a fresh one. Manual renames via the
  sidebar (`ProjectsSidebar` `renamePrj`) are untouched by this and still
  write whatever text the user typed directly — a separate, pre-existing
  behavior (autosave overwrites the title portion back to `song.title` on
  the next save regardless) not addressed here.
- **Fixed: the debounce-autosave effect could fire without any edit.**
  `useEffect([song, user])` treated *any* change to the `song` object as
  "user edited something" — including `loadProject` replacing it wholesale
  with existing content, which reliably scheduled a save 2s after opening
  any song with a title/lyrics, silently touching `updated_at` (and, before
  the fix above, the name prefix) on a mere open. This also predates Phase
  2 (present since the initial commit); Phase 2 only widened *what* counts
  as meaningful content, not this root cause. Fixed two ways: (1)
  `suppressNextAutosaveRef`, set right before `setSong()` in `loadProject`/
  `newSong`, consumed by the debounce effect to skip scheduling exactly
  once when the song was just replaced rather than edited (not set in
  `createSongFromOW` — that call fills a new song with real content the
  user asked to bring in, which should save like any other edit); (2) the
  effect's dependency changed from `user` to `!!user`, since Supabase's
  `onAuthStateChange` hands back a new `user` object on token refresh even
  when nothing about the sign-in state changed, which was re-arming the
  effect on its own. Verified directly: opened a saved scratch project,
  waited past the debounce, confirmed `updated_at` identical before/after.
- **Fixed: nested `<button>` in `ObjectWritingSection`/`CollapsibleSection`.**
  `CollapsibleSection`'s header is now a `<div role="button" tabIndex={0}>`
  with manual Enter/Space handling instead of a real `<button>`, so the
  pill `<button>`s rendered into its `headerExtra` are siblings-in-spirit
  rather than nested interactive elements. Verified live: 0 nested buttons
  in the DOM, header click toggles the section, pill click doesn't.
- **Fixed: sidebar word-cloud `find()` bug.** The cloud was built from a
  frequency map keyed by lowercased `owLabel(seed_word, body)` and resolved
  clicks with a first-match `find()`, so two `standalone_ow` rows sharing a
  label collapsed into one entry and every row after the first was
  unreachable. Phase 4 replaced the cloud with a chronological list keyed by
  row `id` (newest first, uncapped, scrolling), which removes the
  possibility rather than patching the lookup.
- **`FloatingOWButton` can hold a stale word.** `useSelectedWord` re-reads
  on `selectionchange`, but unmounting the element a selection sits in
  (switching tabs, collapsing a section) doesn't always fire that event, so
  the button can keep offering a word whose text is no longer on screen.
  Harmless — it seeds a word the user did select moments earlier — but it
  should clear.
- **A word selected from uppercase chrome seeds in capitals.**
  `Selection.toString()` returns *rendered* text, so a word taken from
  something styled `uppercase` (the chord-grid hint line, section headers)
  arrives as e.g. `NAVIGATE`. Only affects mono UI chrome; lyrics, notebook
  and story text are never uppercased. Verified live.
- **Circular imports** between `lib/theory/chords.ts` ↔ `lib/theory/key.ts`
  and `lib/theory/chords.ts` ↔ `lib/theory/substitutions.ts` (see module
  map above) — harmless at runtime since all cross-references are inside
  function bodies, not module-init-time, but worth flattening in a later
  pass.
- **In-song cloud sync still piggybacks on the song's debounced autosave**
  (`doSave` in `src/app/App.tsx`). Phase 3 gave standalone writings their
  own save path but left this one alone: a linked entry syncs when the
  song's autosave fires, and an entry created before the song has ever been
  saved (`origin_song_id: null` at insert time) never gets its
  `origin_song_id` backfilled once the song does get an id — it stays
  `null` until something else touches that row.
- **`projects.data` still carries in-song writings as well as
  `standalone_ow` mirroring them.** Phase 3 unified the editor and the
  lifecycle, not the storage; an in-song writing is still two records kept
  in step by `syncObjectWritingsToCloud`.
