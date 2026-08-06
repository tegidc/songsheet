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
- **`standalone_ow`** — object-writing sessions started from the sidebar,
  independent of any song.
  - `id uuid`, `user_id uuid` (FK, RLS-scoped), `seed_word text`,
    `body text`, `written_at timestamptz`.
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
  `id`, `text`, `seedWord?`, `savedAt?`.
- `NbEntry` — a saved notebook fragment: `id`, `title`, `text`, `savedAt`.
- `AudioNote` — a voice-note reference: `id`, `label`, `storagePath` (path
  in the `audio-notes` bucket), `url`, `duration`, `createdAt`.

`src/sections.ts` holds the factory/normalization helpers for this shape:
`makeEmptySong`/`EMPTY_SONG`, `makeSection`, `normalizeSection` (defensive
reader for rows coming back from Supabase — fills in any field that may be
missing on old rows), `renumberSections`, `isAutoLabel`,
`parseLyricsIntoSections`/`matchSectionHeader`/`SECTION_HEADER_RE` (paste-in
detection of section headers), `completionScore`, `makeTestSections` (demo
data).

### The two object-writing stores — one-way flow

There are **two separate places object-writing text lives**, and they do
**not** sync with each other:

1. `song.objectWritings` (`OWEntry[]`) — writing sessions started from
   inside a song's Create tab, saved as part of that song's `data` jsonb.
   Rendered by `src/components/ow/ObjectWritingSection.tsx` /
   `ObjectWritingBox.tsx`.
2. `standalone_ow` (Supabase table) — writing sessions started from the
   sidebar (`src/components/ow/StandaloneOWDialog.tsx`), independent of any
   song, shown as a word cloud and list in
   `src/components/sidebar/ProjectsSidebar.tsx` /
   `StandaloneOWDetail.tsx`.

Data flows **cloud → song only, one way**: `ProjectsSidebar` has an
"Add to song" action (`onAddOWToSong`) that copies a `standalone_ow` row
into the currently-open song's `song.objectWritings` array. There is no
reverse path — writing a session inside a song never creates or updates a
`standalone_ow` row, and editing/deleting a `standalone_ow` entry never
touches any song that previously imported a copy of it. The two stores can
silently diverge (e.g. editing the copy inside a song does not affect the
original standalone row, and vice versa).

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
- `music.ts` — `KEYS`, `MODES`, `TSIGS`, `NOTES`, `FLAT` (flat→sharp
  enharmonic map), `MAJ_ST`/`MIN_ST` (diatonic scale-degree semitone
  offsets), `MAJ_Q`/`MIN_Q` (diatonic chord qualities per degree).
- `constants.ts` — `SDEFS` (section-type definitions: label/short
  label/hotkey), `SCOL` (section background colour classes), `TIMER_OPTS`
  (object-writing timer choices), `CW`/`CH`/`FS` (chord-grid cell
  dimensions), `MONO`/`SANS`/`SERIF` (font stacks), `PHRASE_MARKER`/
  `ROW_BREAK`/`isEditorialBar` (chord-bar editorial sentinels).

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
- `substitutions.ts` — `getParallelChords`, `getSecondaryDominant`,
  `getTritoneSubstitution`.
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
- `rhyme.ts` — `FillWord`, `detectRhymeScheme`, `findRhymingWords`,
  `buildFill` (fill-in-the-blank scaffolding for the Rhyme tool).
- `cloud.ts` — `extractWordCloud`, `extractSensoryFragments`.
- `fragments.ts` — `pickFragmentGroup`, `buildSkeletonLyrics` (Inspiration
  panel's fragment/skeleton-verse generators). **Divergence**: not in the
  original target module list, split out of `cloud.ts` because it's a
  distinct concern (skeleton-verse generation vs. word-cloud extraction).
- `owPool.ts` — `OW_TWO_WORD`, `owPoolCache`, `owPoolReady`, `loadOWPool`
  (fetches noun pool from the Datamuse API on first load), `pickOWWord`.
  **Divergence**: not in the original target list; this is fetch/cache
  logic, not data, so it didn't belong in `data/words.ts`.

### `src/sections.ts` / `src/format.ts`
See "Data model" above for `sections.ts`. `format.ts` — `uid` (short
random id generator used everywhere an `id` field is needed),
`formatRelativeTime`, `defaultProjectName`.

### `src/components/`
- `common/` — `FL` (small-caps mono field label), `II`/`SI` (labelled
  text/select inputs), `AutoTA` (auto-growing textarea with word-select
  callback), `CollapsibleSection`.
- `auth/AuthModal.tsx` — email/password + Google/Apple OAuth sign-in.
- `sidebar/ProjectsSidebar.tsx` — project list (grouped by status) +
  standalone object-writing word cloud/list. Also exports `STATUS_DOT`/
  `STATUS_LABEL` (per-`ProjectStatus` colour dot and label). **Known bug**:
  see "Known debt" below.
- `ow/` — `StandaloneOWDialog`/`StandaloneOWDetail` (sidebar-driven
  sessions), `ObjectWritingBox`/`ObjectWritingSection` (in-song sessions).
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

### `src/app/App.tsx`
Top-level state (song, tab, auth, sidebar, autosave, undo state for chord
ideas/bridge ideas), the autosave effect (debounced + periodic forced save
to `projects.data`), tab routing, and JSX composition only — 835 lines,
down from 5,586. `src/app/components/ui/` (48 shadcn files) and
`src/app/components/figma/ImageWithFallback.tsx` are untouched, vendored
code.

## Known debt

- **`tsc --noEmit` reports 2 pre-existing type errors** (present before
  this refactor and unchanged by it — the build does not type-check, so
  these have never blocked anything):
  1. `src/components/sidebar/ProjectsSidebar.tsx` — a `setStandaloneOWs`
     updater's callback can return `(StandaloneOW | undefined)[]` (an
     `.filter(Boolean)`-less `.map` that can produce `undefined` entries)
     where `StandaloneOW[]` is expected.
  2. `src/app/App.tsx` — a reference to `setShowOWPanel`, a setter that
     doesn't exist (likely a rename left half-done at some point;
     the actual state/setter pair in scope is `showGlobalOW`/
     `setShowGlobalOW`).
- **Sidebar word-cloud `find()` bug** (`src/components/sidebar/
  ProjectsSidebar.tsx`, inside the "Object Writing Sessions" block): the
  word cloud is built from `owWordFreq`, which is keyed by lowercased,
  trimmed `seed_word` — so two `standalone_ow` sessions with the same seed
  word collapse into a single word-cloud entry. Clicking that entry does
  `standaloneOWs.find(e => e.seed_word.toLowerCase().trim() === word)`,
  which always returns the *first* matching row. If a user has written more
  than one session for the same seed word, every session after the first
  is unreachable from the word cloud (still visible/deletable elsewhere if
  another list view exists, but not reachable via this click path). Not
  fixed here per task scope — documented for a future pass.
- **`src/imports/` PNGs** (`image.png`, `image-1.png` through `image-4.png`)
  are not imported anywhere in `src/` (confirmed by grepping for their
  filenames). Left in place rather than deleted — they may be Figma design
  references worth keeping for now, but nothing in the shipped app uses
  them.
- **Circular imports** between `lib/theory/chords.ts` ↔ `lib/theory/key.ts`
  and `lib/theory/chords.ts` ↔ `lib/theory/substitutions.ts` (see module
  map above) — harmless at runtime since all cross-references are inside
  function bodies, not module-init-time, but worth flattening in a later
  pass.
