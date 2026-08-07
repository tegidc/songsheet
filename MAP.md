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
  the running app: the key field accepts and persists arbitrary text. That
  field is now also the source of truth for every chord calculation — see
  "The declared key is the lens" below.
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
  `enabled: !isMobile` — see "The selected-word variant on touch" under
  Known debt for what was investigated in Phase 5 and why it still stands.

### `src/lib/theory/`
- `chords.ts` — `parseChord`, `normNote`, `getDiatonic`, `inKey`,
  `NASHVILLE_DEGREES`/`nashvilleDegree`/`toNashville`, plus `ROMAN`/`chordToken`/`degreeLabel`/`ChordSuggestion`/
  `buildChordSuggestions` (mobile chord-picker suggestion lists). Note: has
  a mutual (function-body-only) circular import with `key.ts` — `chords.ts`
  needs `parseKeyString` for `toNashville`, `key.ts` needs `parseChord`/
  `getDiatonic`/`normNote` for `detectKey`. This works fine at runtime
  (nothing is evaluated at module-init time) but is worth untangling later.
  Also mutually circular with `substitutions.ts` for the same reason.
- `key.ts` — `detectKey`, `parseDeclaredKey` (strict: null when the field is
  empty or names nothing readable), `parseKeyString` (the lenient wrapper —
  falls back to C major), `formatDetectedKey`.
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
  textarea with word-select callback; its `onTapToEdit` makes the box
  readOnly and hands the tap to the full-screen editor — see "Writing full
  screen" below), `FullScreenEditor`, `CollapsibleSection`, `ConfirmDialog`
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
- `lyrics/` — `LyricBlock` (per-section lyrics editor). `MobileLyricTools`
  is gone (Phase 5): its only real content was the inspiration strip, now
  `tools/InspirationStrip`, and its `onAddVerse`/`onObjectWrite` props were
  already dead.
- `chords/` — `BarCell`, `ChordRowGrid`, `ChordChip`, `ChordPickerSheet`,
  `MobileChordSection`, and `AnalyseChordsPanel` (chord-idea generator UI).
  **Divergence**: `AnalyseChordsPanel` wasn't in the original target list;
  it's the render layer for `lib/theory/ideas.ts` and fits naturally here.
- `final/FinalSectionView.tsx` — the read-only "Final" tab layout combining
  lyrics + chords for one section.
- `tools/` — `InspirationPanel`, `ThesaurusPanel`, `RhymePanel`, and
  `InspirationStrip` (the mobile one-line form of the first three; see
  "The inspiration strip" below).
  **Divergence**: `RhymePanel` wasn't in the original target list (which
  only named two of the three tool panels); added alongside its siblings.
  **Confirmed** live in the running app (Lyrics → Rhyme & Metre) —
  `RhymePanel.tsx` is fully self-contained, fetching directly from the
  Datamuse API (`rel_rhy`/`rel_nry`); it never used `lib/text/rhyme.ts`
  (`detectRhymeScheme`/`findRhymingWords`/`buildFill`, removed as dead
  code — that module's fill-in-the-blank scaffolding has no live caller).

### Writing full screen (mobile, Phase 5)

Tapping a text box on a phone used to focus it in place. iOS zooms the
*visual* viewport to any field under 16px on focus, and everything fixed to
the layout viewport — the inspiration strip included — travels off screen
with that zoom, so the tools could only be reached by scrolling away from
the line being written. The box therefore stops being a box: on mobile it
opens `common/FullScreenEditor`, which owns the whole screen.

Three details are load-bearing, not decoration:

- **Sized from `visualViewport`, not `100vh`.** On iOS `100vh` is the height
  as though no keyboard existed, so a footer pinned to it sits *behind* the
  keyboard. The overlay reads `visualViewport.height`/`offsetTop` and ends
  where the keyboard begins, which is what puts Prev/Next/Done above it.
- **The textarea is exactly 16px.** Below that Safari zooms on focus — the
  zoom being the original bug, the fix is not to trip it.
- **The strip and the footer are siblings of the textarea, not ancestors.**
  Only the textarea scrolls, so neither can scroll away.

The tapped box is `readOnly` on mobile (`AutoTA`'s `onTapToEdit`, and the
same two attributes inline on the Create-page boxes). That is what keeps the
OS keyboard down between the tap and the overlay appearing — a focusable
textarea would raise it, and zoom, first.

`App` holds `fsEdit: { kind: "lyrics" | "create"; index }`. `kind` picks
which list Prev/Next steps through: the song's sections, or the six
Create-page boxes (`CREATE_BOXES` — Big Idea, Beginning, Middle, End,
Production, Notebook, in on-screen order). `changeFsField` writes back by
id. Nothing else in the app opens this way — not the chord grid, not the
object-writing window, which is its own modal with its own tools.

### How a word gets picked on a phone (Phase 6)

Selection cannot do it. On iOS, selecting text **is** how you raise the
Cut/Copy/Paste/Replace callout, and that callout floats over the inspiration
strip — the very thing the selected word was for. Worse, it never reached the
strip anyway: React's `onSelect` is a synthesized event that only dispatches
for the *focused* element (its `SelectEventPlugin` records the element on
`focusin` and drops any `selectionchange` that doesn't match), and on mobile
the lyric boxes are deliberately `readOnly` and never focus. Selecting a word
in one produced a `selectionchange` with `document.activeElement === <body>`,
which React discarded. Verified live: with focus, the lookup ran; without it,
nothing.

So the caret picks the word instead, in two beats:

- **Rest offers.** `FullScreenEditor` watches the caret (`onSelect` plus
  `onKeyUp`/`onClick`/`onChange` as belt and braces) and starts a
  `CARET_REST_MS` (2s) timer on every move. When it expires with the caret
  still collapsed inside a word, `wordAtCaret` (`src/lib/text/caretWord.ts`)
  names it and `onWordOffer` hands it up. Any movement withdraws the standing
  offer first, so an offer never outlives the caret that made it. There is no
  selection at any point, so the OS callout never appears.
- **Tap commits.** The offer is drawn by `InspirationStrip` as a dashed,
  dimmed chip reading *word* · LOOK UP, and it is the only thing on the
  strip's line while it stands. Until it is tapped nothing has happened: no
  lookup, no change to the active word, no mode change. Tapping calls
  `onCommitWord` (App's `commitWordOffer`, which bumps `lyricSelection`) and
  cycles the mode *off fragments only* — `mode === "inspire" ? cycleMode(m) : m`,
  reusing the same `cycleMode` the mode button uses. Committing on Rhyme or
  Synonym leaves it there.

Two suppressions matter: an offer equal to the already-active word is never
made (it would say nothing, and since committing doesn't move the caret the
same word would otherwise be re-offered immediately), and the editor clears
the offer on unmount so a closed editor can't leave one standing.

Desktop is untouched — `AutoTA`'s `onWordSelect` still feeds `lyricSelection`
from a real selection, because a mouse drag focuses the box and raises no
callout.

### The inspiration strip (mobile, Phase 5)

`tools/InspirationStrip` is the mobile one-line form of the Inspiration /
Rhyme / Thesaurus panels. It is mounted twice: fixed under the header on the
Lyrics tab, and pinned inside the full-screen editor. `App` measures the
header (`headerH`, a `ResizeObserver` on it) rather than assuming a height —
the header is no longer fixed-height now it carries the title.

- **One whole fragment, never a trimmed one.** It used to show up to three
  cut to twelve characters each ("and complic…"). It now picks the first
  fragment that fits (≤34 chars), falling back to the shortest available,
  and wraps rather than truncating.
- **The mode control is a word, not a glyph.** It was `✦`, which is the
  object-writing glyph — one sparkle meaning two things. `INSPIRE` /
  `RHYME` / `SYNONYM` in the app's small-caps mono says which kind of
  suggestion is on screen, which no glyph can.
- **Inspiration first, then refresh**, so refresh reads as acting on
  whatever the control beside it names.

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

### The declared key is the lens, not a fact about the song

`song.key` is a freeform text field, and it is what every chord calculation
reads through: Nashville numbers, the grid's in-key/out-of-key treatment, the
picker's suggestion groups, the analysis panel's Common/Parallel pills, the
Ideas generator and the Bridge button. `App.tsx` resolves it once —
`declaredKey = parseDeclaredKey(song.key)`, then
`activeKey = declaredKey ?? liveDetected` — and threads `activeKey` everywhere
those used to receive `detectKey`'s output. Declaring a different key
transposes nothing; the chords are untouched and only their numbering moves.

Detection never writes to `song.key`; it only proposes. Two controls in the
Analyse Chords footer, both always visible:

- **Detect** — the proposal, plus a ↻ that re-runs detection. Clicking the
  proposal itself is what adopts it (it writes the key like any other declare).
  The proposal is *pinned* the moment a key is declared, so filling in more bars
  never moves anything under the analysis; ↻ is then the only thing that
  re-runs it. With no key declared there is no lens of the songwriter's
  choosing yet, so the app reads live detection, exactly as it always has.
- **Set key as ──** — a plain input, committed on Enter or blur. Freeform: it
  never validates or rejects, and an unreadable key simply isn't a lens
  (`parseDeclaredKey` returns null and the live reading is used) rather than
  being corrected or flagged.

`toNashville` covers all twelve semitone distances from the tonic against a
fixed table (`NASHVILLE_DEGREES`: `1 b2 2 b3 3 4 #4 5 b6 6 b7 7`), because once
a key is declared freely most chords may be non-diatonic — that is expected,
not an error state. One spelling per degree always: the number comes from the
pitch distance, not from how the chord was typed, so `Gb` and `F#` in C both
read `#4`. Mode no longer affects the numbering, which does change what a
*minor* declared key shows — F#m/A/D/E in F#m now reads `1- b3 b6 b7` (major-
scale-relative, standard Nashville and Roman-numeral practice) where it used
to read `1- 3 6 7` off the minor scale's own degrees. Chord suffixes are still
ignored throughout (`7`, `sus2`, `add9` — only the root's degree is rendered).

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
- **The selected-word variant on touch — investigated, still off (Phase 5).**
  `useSelectedWord(!isMobile)` means the floating button's `✦ word` form
  never appears on a phone; the plain `✦` does. Three routes were considered.
  *A long-press trigger* is not available: on iOS long-press on text **is**
  the selection gesture, so overloading it means suppressing selection
  itself. *Coexisting with the OS bar* is physically fine — the callout
  floats by the selection, the button is bottom-right — but the button
  cannot survive the tap: tapping it collapses the selection, that fires
  `selectionchange`, `useSelectedWord` clears to null, and the button starts
  an *empty* writing instead of a seeded one. (Desktop only escapes this
  because `onMouseDown` is prevented, which has no touch equivalent that
  still yields a click.) Making it work therefore means holding the last
  word for a grace period after the selection collapses — real, but it
  invents a stale-word window on top of the one already listed below.
  *Dropping the variant on mobile* is the current behaviour and costs
  nothing, because the Lyrics tab's "Object Write [word]" button is driven
  by the textarea's own `onSelect` (not `useSelectedWord`) and works on
  touch. Left as is.
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
