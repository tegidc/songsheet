# AUDIT.md — Songsheet, end of Phase 6

An audit, not a refactor. Everything below Part 4 is a report; nothing in it
has been changed. The three pre-approved fixes are done, each on its own
commit, on the branch **`audit-phase-7`** (branched from `main` at `f1dad3f`
so you can read the diffs before any of it lands).

`pnpm typecheck` — 0 errors. `pnpm build` — clean. Both verified after every
commit, not just at the end.

**The short version.** The codebase is in better shape than three days of
fast splitting has any right to leave it. The module boundaries hold, the
comments explain decisions rather than restating code, and I found no
correctness bug in the theory or text libraries. There is **one live bug**
worth your attention (Part 2, §1 — the sidebar rename), one place where a
tool is confidently wrong in a way I could reproduce (Part 5, §1 — key
detection), and a documented drift between `STYLE.md` and the code that is
mostly the document's fault rather than the code's.

---

## Part 1 — The numbers

Measured at `f1dad3f` (before my commits). Where a fix changed a number, both
are given.

### Line counts — authored code

8,071 lines across 56 authored files (`src/`, excluding the vendored
`app/components/ui/` and `app/components/figma/`). After my three commits:
8,137, the increase being the fretboard removal plus one new 44-line module.

| Lines | File |
|------:|------|
| 1,401 | `src/app/App.tsx` |
| 419 | `src/components/tools/InspirationStrip.tsx` |
| 384 | `src/lib/theory/ideas.ts` |
| 351 | `src/components/chords/AnalyseChordsPanel.tsx` |
| 337 | `src/components/sidebar/ProjectsSidebar.tsx` |
| 325 | `src/components/ow/OWWindow.tsx` |
| 325 | `src/components/create/VoiceNotesSection.tsx` |
| 290 | `src/components/chords/ChordRowGrid.tsx` |
| 276 | `src/components/final/FinalSectionView.tsx` |
| 258 | `src/components/chords/FretboardIdentifier.tsx` |
| 216 | `src/components/tools/InspirationPanel.tsx` |
| 215 | `src/styles/theme.css` |
| 197 | `src/lib/theory/identify.ts` |
| 195 | `src/components/common/FullScreenEditor.tsx` |
| 185 | `src/components/tools/ThesaurusPanel.tsx` |
| 181 | `src/components/tools/RhymePanel.tsx` |
| 171 | `src/sections.ts` |
| 164 | `src/components/ow/StandaloneOWWindow.tsx` |
| 156 | `src/lib/theory/chords.ts` |
| 137 | `src/components/chords/MobileChordSection.tsx` |

**`MAP.md` says `App.tsx` is 1,144 lines. It is 1,401** — Phase 5 and 6 added
271 lines that the document does not account for. That is the single most
out-of-date fact in the docs.

### Components

31 exported components in authored code, plus 1 module-level helper
(`Marker` in `FretboardIdentifier`). Ten are over 200 lines:

`App` (1,401) · `InspirationStrip` (419) · `AnalyseChordsPanel` (351) ·
`ProjectsSidebar` (337) · `OWWindow` (325) · `VoiceNotesSection` (325) ·
`ChordRowGrid` (290) · `FinalSectionView` (276) · `FretboardIdentifier` (258)
· `InspirationPanel` (216).

Only `App.tsx` reads as genuinely oversized, and it is oversized in a
specific, benign way: roughly 630 of its lines are one JSX return. The state
and handlers above it are dense but each one is short. It is long, not
tangled — see Part 2 §3 for the part that *is* tangled.

Seven more "components" are declared **inside** a render body, which is a
different problem and is §1 of Part 2.

### Bundle

Production build, `vite build`:

```
dist/assets/index-*.css   117.88 kB │ gzip:  18.21 kB
dist/assets/index-*.js    648.39 kB │ gzip: 183.88 kB
```

After my commits: 649.12 kB / 184.03 kB gzip (the fretboard removal costs
about 0.7 kB; the dead-code removal saved 0.02 kB, because Rollup was already
dropping all of it).

Largest contributors, attributed by decoding the sourcemap and charging each
byte of minified output to the module it came from:

| kB | Module |
|---:|--------|
| 128.3 | `react-dom` |
| 100.1 | `@supabase/auth-js` |
| 32.6 | **`src/app/App.tsx`** |
| 31.4 | `@supabase/realtime-js` |
| 29.0 | **`vaul`** |
| 25.3 | `@supabase/phoenix` |
| 24.2 | **`tailwind-merge`** |
| 21.9 | `@supabase/storage-js` |
| 15.9 | `@supabase/postgrest-js` |
| 10.5 | `@supabase/supabase-js` |
| 9.9 | `src/components/chords/AnalyseChordsPanel.tsx` |
| 8.8 | `src/components/sidebar/ProjectsSidebar.tsx` |
| 8.1 | `src/lib/theory/ideas.ts` |
| 7.9 | `src/components/ow/OWWindow.tsx` |
| 7.8 | `src/components/final/FinalSectionView.tsx` |

Two things stand out.

**Supabase is 208 kB — a third of the bundle**, and 131 kB of that
(`realtime-js` + `phoenix`) is the realtime websocket client. Nothing in this
app subscribes to anything. It comes in because `createClient` wires realtime
unconditionally; dropping it means a different import path, not a config
flag. Not a small change, and not one to make now.

**`vaul` (29 kB) + `tailwind-merge` (24 kB) = 53 kB, 8% of the bundle, exists
to serve one component.** `ui/drawer.tsx` is the only vendored shadcn file
the app actually imports; it pulls in `vaul`, and it is also the only reason
`ui/utils.ts` (`cn`, hence `tailwind-merge` and `clsx`) is in the graph. Two
components use it: `ChordPickerSheet` and `FinalSectionView`. This is a real
trade you could take back, but the drawer is a genuine mobile behaviour and
hand-rolling it is exactly the kind of change this audit is supposed not to
propose casually.

### Dead code

**46 of 106 TypeScript files are never imported, transitively, from
`main.tsx`** — 45 of the 48 vendored shadcn components plus
`figma/ImageWithFallback.tsx`. That is **5,139 lines**, more than half the
repo's TypeScript by line count.

They cost nothing at runtime: Rollup never sees them, so they are not in the
bundle. They cost you when you grep. Only three vendored files are reachable:
`drawer.tsx`, `use-mobile.ts`, and `utils.ts`.

**I have not deleted them**, and I want to be explicit that this was a
judgement call against the letter of the pre-approval. `MAP.md` describes
this directory as "untouched, vendored code" — a stated decision, not an
oversight — and deleting a vendored component library removes optionality
that costs nothing to keep. If you want them gone, it is one `git rm` of 45
files and I would expect zero behavioural risk; the proof is above. Your
call, not mine.

Genuinely dead authored code, now removed (commit `e770b64`):

- `analyzeStress` and `getStressPattern` — a complete stress-analysis
  implementation with **no caller anywhere in the repo**. See Part 5 §4.
- `octaveOf` — its own comment claimed it was used; it was not.
- 6 unused imports, 2 unused locals (the full `TS6133`/`TS6196` set).

### Exported but never imported elsewhere

Not dead — each is used inside its own file — but the `export` keyword is
noise on all of these, and on a few it is actively misleading because it
implies a shared contract that does not exist:

`FSField` · `fmtDur`, `pickCodec`, `extFromMime`, `MAX_AUDIO_NOTES`,
`MAX_RECORD_SECONDS` · `STATUS_DOT`, `STATUS_LABEL` · `FRAGMENT_INTERVAL`,
`InspirationMode` · `MOBILE_MODES`, `STRIP_FRAGMENT_INTERVAL`, `MobileTool` ·
`RhymeResult` · `ThesaurusResult` · `OW_TWO_WORD`, `owPoolCache`,
`owPoolReady` · `stemWord` · `nashvilleDegree`, `chordToken`, `degreeLabel`,
`NASHVILLE_DEGREES`, `ROMAN`, `CHORD_ROW_ORDER` · `csStr`,
`getChordFunction`, `DEGREE_FUNC`, `ChordFunc` · `ChordReading`,
`Identification` · `lcsAlign` · `PC_NAMES` · `isAutoLabel`,
`matchSectionHeader`, `SECTION_HEADER_RE` · `FretboardChord`.

`owPoolCache` and `owPoolReady` are the two worth a second look: they are
exported **mutable module state**, which is a wider contract than intended.
Nothing outside `owPool.ts` touches them today.

### Duplication

11 duplicated blocks of 6+ identical normalised lines. The significant ones:

- **`RhymePanel` ↔ `ThesaurusPanel` — five separate blocks**, ~90 lines of
  near-identical shell. The largest structural duplication in the codebase.
  See Part 2 §2.
- `InspirationPanel` ↔ `InspirationStrip` — the 8-line `fragmentSource`
  expression, character for character. *Fixed.*
- `RhymePanel` ↔ `ThesaurusPanel` — the 7-line `owWords` block, character for
  character. *Fixed.*
- `App.tsx` internal — the `MobileChordSection`/`ChordRowGrid` prop lists
  (9+7 lines, twice) and the two `ProjectsSidebar` call sites (7 lines).
  Unavoidable without a props object; not worth it.
- `NotebookSection` ↔ `ProductionSection` — a 6-line Expand/Collapse button.
- `AnalyseChordsPanel` internal — a 6-line bar-cell renderer, twice.

### Type errors

**0**, before and after. `tsc --noEmit` is clean, as `MAP.md` claims. Note
that `noUnusedLocals` and `noUnusedParameters` are **off** in the checked-in
`tsconfig.json`, which is why the nine unused locals had accumulated
invisibly. Turning them on is a one-line change and the codebase now passes
with them on — I verified it. That is a recommendation, not a change I made.

---

## Part 2 — Where the design is straining

Ranked by value against risk. Three are worth doing; the rest are recorded
because you asked what is forming, not because I think you should act.

### 1. A component defined inside a render body, holding the rename input — this is a live bug ⚠️

**Highest value, lowest risk. The only thing here I would call a defect.**

`ProjectsSidebar` defines `ProjectRow` inside its own render body
(`ProjectsSidebar.tsx:118`). `ProjectRow` holds local state — `editing`,
`nameVal` — and renders the rename `<input>`.

Every time `ProjectsSidebar` re-renders, `ProjectRow` is a **new function
identity**. React compares element `type` by identity, so a changed type is
an unmount and a fresh mount, not an update. The row's state is destroyed and
the focused input is torn out of the DOM.

`ProjectsSidebar` is not memoised, and `App` passes it four inline arrow
functions, so **every `App` re-render re-renders it**. `App` re-renders on
its own timers: `autoSaveState` goes `saving` → `saved` → (2s later) `idle`,
which is three renders, and the debounced save fires 2s after any edit.

So: start renaming a project, and the next autosave indicator transition
throws away what you have typed and the focus with it.

**Uncertainty, stated plainly:** I traced this statically and did not
reproduce it, because the sidebar only renders for a signed-in user and I
have no credentials. The React mechanism is not in doubt — changed element
type remounts the subtree, and `ProjectRow`'s identity provably changes every
render. What I have not *watched* is the timing collision. To confirm in ten
seconds: start a rename, wait for "Auto-saving…" to appear, see whether the
input survives.

**The fix** is to move `ProjectRow` and `StatusPicker` to module scope and
pass what they need as props. Mechanical, contained to one file, no
behavioural intent changes. The same anti-pattern appears in six other places
(`Chip` ×2, `Chords`, `Chips`, `ChordPill`, `StatusPicker`) but all of those
are stateless, so remounting is invisible — wasteful, not wrong. `ProjectRow`
is the only one holding state.

### 2. Two panels that are one panel

`RhymePanel` (181 lines) and `ThesaurusPanel` (185) are the same component
with two different bodies. They share, block for block: the header with its
collapse chevron, the debounced-fetch effect at the same 620 ms, the
`idle`/`loading`/`done`/`error` state machine, the word input with its
"← lyrics" marker, the results container with its `min-h-[110px]`, the ◆
legend, and — until this audit — the `owWords` derivation.

**What it costs:** every change to the shared shape has to be made twice and
was. The `◆` legend condition already differs between them
(`visible.some(...)` in one, `results.some(...)` in the other) — a divergence
that is arguably correct in both cases but was never a decision, just drift.

**What fixing it risks:** a shared shell means choosing the seam, and the two
bodies differ in more than they look (Rhyme has the syllable filter and
sorts; Thesaurus has three result groups, the copy-vs-object-write branch,
and a `Chip` that is a `<button>` where Rhyme's is a `<span>`). A badly
chosen seam is worse than the duplication. This is a real piece of design
work, not an extraction — an hour, not ten minutes.

I would do it, but only deliberately and only with the app in front of you.

### 3. Two patterns for mirroring state into a ref

`App.tsx` mirrors state into refs so callbacks can read current values. It
does this **two different ways**:

```ts
// Pattern A — synced by effect (song, user, currentProjectId)
useEffect(() => { songRef.current = song; }, [song]);

// Pattern B — assigned eagerly at every write site (owWindow)
owWindowRef.current = next;
setOwWindow(next);
```

Pattern B is used because it has to be — `changeOW` needs the next keystroke
to see the update before React has committed, and the comment says so
(`// set eagerly so the next keystroke sees it`). Pattern A is used
everywhere else.

**What it costs:** Pattern B's correctness depends on *every* write site
remembering to update both. There are six (`openOW`, `patchOWEntry`,
`deleteOWEntry`, `changeOW`, `closeOW`, `deleteCloudOW`) and all six do it
correctly today. A seventh added later that forgets is a silent bug with no
type error and no test to catch it.

**What fixing it risks:** genuinely changing behaviour. Pattern B's eagerness
is load-bearing for the zero-write invariant. I would not unify these. The
cheap mitigation is a one-line setter — `setOWWindow(next)` that does both —
so the pairing cannot be forgotten. Low risk, small win.

A related note, and this one is only an observation: `InspirationStrip`
introduces a *third* pattern for the same idea — `const rollRef =
useRef(rollHalf); rollRef.current = rollHalf;` assigned during render. It is
correct here and the comment explains exactly why (the interval must not
depend on the source text). But that is now three idioms for "read the
current value from a stale closure" in one codebase.

### Effects, refs and timers — are they coherent?

You asked directly. My reading: **coherent, and close to the edge of it.**

The autosave machinery is the strongest part. `suppressNextAutosaveRef`,
`pendingRef` and the `!!user` dependency each solve a specific, documented
failure, and the guards compose correctly — `pendingRef` is only ever set by
the debounce effect, which is what lets `visibilitychange` flush without
being able to write for a song you merely opened. I traced the zero-write
invariant through `loadProject`, `newSong`, `signOut` and the auto-open path
and found no hole.

Three things I would keep an eye on:

- **`suppressNextAutosaveRef` can be left armed.** `signOut` sets it, then
  the debounce effect's `if (!user) return` can run *before* the flag is
  consumed, leaving it `true` for the next sign-in. In practice `loadProject`
  or the auto-open sets it again anyway, so I could not construct a case
  where it swallows a real edit — but it is a flag whose "consumed exactly
  once" contract has an exit path that skips the consumption. I am not
  confident enough to call it a bug; I am confident it is fragile.
- **The `hasMeaningful` gate can strand a deletion.** Removing the *last*
  piece of content of a kind can make `hasMeaningful` false, so the removal
  is never saved. My fretboard fix inherits this (documented in its commit
  and below). It needs a song with no title, no lyrics, no bars and no
  writings to bite, so it is narrow — but it is the shape of bug that gets
  wider as more content types are added to that condition.
- **The keydown effect re-binds on every render.** `useEffect(..., [tab,
  addSection])` where `addSection` is a plain function redefined each render.
  Harmless; wasteful; and it means the dependency array is decorative.

### Known Debt — what has quietly got worse

Checked each entry in `MAP.md` against the code.

| Entry | Status |
|---|---|
| A fretboard chord cannot be removed | **Fixed** (commit `439848e`) |
| Preset name can disagree with tuning | Unchanged. Still a deliberate trade. |
| `tsc --noEmit` zero-error | Still true. |
| Opening a song rewrote its name prefix | Still fixed. |
| Debounce autosave could fire without an edit | Still fixed. |
| Nested `<button>` | Still fixed — and I checked, my fretboard × does not reintroduce it. |
| Sidebar word-cloud `find()` | Still fixed. |
| Selected-word variant on touch | Unchanged. |
| `FloatingOWButton` stale word | Unchanged. |
| Word from uppercase chrome seeds in capitals | Unchanged. |
| Circular imports in `lib/theory/` | Unchanged, still harmless. Verified all cross-references are inside function bodies. |
| In-song cloud sync piggybacks on autosave | **Worse in one respect** — see below. |
| `projects.data` carries writings twice | Unchanged. |

**The one that got more serious:** `syncObjectWritingsToCloud` runs on every
autosave and iterates every object writing in the song, `await`-ing a
Supabase round trip per entry that needs one. It is called from `doSave`
without `await` and without a concurrency guard. With one or two writings
this is invisible. The debounce is 2 s and the force-save 30 s, so a song
with a dozen writings can plausibly have a second sync start while the first
is still in flight — and both would take the "no `cloudId`, insert" branch
for the same entry, because `cloudId` is only stamped back after the insert
returns. That is the *exact* shape of the bug that produced three duplicate
rows in production before (`scripts/repair-ow-duplicates.mjs`). The
identical-body guard added afterwards would probably catch it, since the
first insert would have landed by then — but "probably" is doing real work in
that sentence. **I did not reproduce this**, and it needs a lot of writings
and unlucky timing. I flag it because the failure mode has happened once
already.

Also worth noting, though not debt: **`MAP.md`'s Known Debt section is
growing a "Fixed:" archive** — five of thirteen entries are things that are
no longer debt. That is history, and it is valuable history, but it is now
harder to see what is actually outstanding. Consider splitting it.

### Smaller observations, recorded not recommended

- **Seven shortcut keys, unbounded lists.** `CHORD_ROW_KEYS` gives each row
  seven keys. `colour` is capped at `slice(0, 8)` — an eighth colour chord
  would render with no shortcut. `fretboard` is uncapped and `MAP.md` says
  "seven or eight per song is the expected size", so the eighth is *expected*
  and has no key. Cosmetic, but the mismatch is real.
- **`ThesaurusPanel`'s copy path is unreachable.** `App` always passes
  `onObjectWrite`, so `copyWord`, `copied`, `isCopied` and the `cursor-copy`
  styling never run. Defensible as prop-conditional design; worth knowing it
  is not exercised.
- **`detectKey` is recomputed via a stringified dep** —
  `useMemo(..., [allChords.join("|")])`, and `allChords` itself is rebuilt
  every render without memoisation. Correct, mildly wasteful.
- **`ProjectsSidebar` fetches on `currentProjectId` change** via an effect
  that bumps `refreshKey`, which triggers a second effect that fetches. Two
  effects where one would do, and it means opening a song always costs a
  round trip.

---

## Part 3 — Style drift

`STYLE.md` was derived from the code in Phase 1. Six phases later the code has
moved, and in most cases **the code is right and the document is stale**.

### Type scale — the document is out of date

`STYLE.md` lists: `8px · 9px · 10px · 11px · text-xs · 14px/text-sm`, and
states *"nothing in the interface goes larger than needed for a dialog
heading"* and *"There is no use of Tailwind's default `text-base`/`text-lg`
scale"*.

Actual, counted across authored `.tsx`:

```
67 × text-[10px]    66 × text-[12px]    61 × text-[9px]     42 × text-[11px]
28 × text-xs        11 × text-[8px]      7 × text-[13px]     4 × text-[15px]
 2 × text-[7px]      2 × text-[14px]     2 × text-sm         1 × text-[16px]
 1 × text-[19px]     1 × text-[20px]     1 × text-[22px]     1 × text-[2.6rem]
 1 × text-base       1 × text-xl
```

Six sizes exist that `STYLE.md` does not list — `7px`, `13px`, `15px`,
`16px`, `19px`, `20px`, `22px` — and both `text-base` and `text-xl` are in
use, directly contradicting the document.

Almost all of it is justified:

- `19px`/`22px` — the fretboard's chord name and the analysis panel's key.
  Both are *the answer the tool exists to give*, and both are deliberately
  the largest thing in their box. Good.
- `13px`/`15px`/`16px` — mobile. `16px` is the iOS zoom floor
  (`FullScreenEditor`), and `13px`/`15px` are the mobile chord chips and
  picker input, sized for thumbs. Good.
- `2.6rem` — the desktop song title. Pre-existing.
- `text-base` (the artist field) and `text-xl` (`AuthModal`'s `<h2>`) are the
  two that look like genuine slips: they are the only two places using
  Tailwind's default scale for text, in a codebase whose whole point is that
  it does not.
- `text-[7px]` (`ChordRowGrid`'s shortcut hints) is below the documented
  floor. Two occurrences. Legible only because they are hints.

**Recommendation: update `STYLE.md`**, and separately consider changing those
two default-scale uses to arbitrary values. The document should say the scale
runs `7px → 22px` plus the `2.6rem` title, and should say *why* the large end
exists (a tool's answer earns size).

### The small-caps mono label — the pattern won, the component lost

`STYLE.md` holds up `FL` (`common/FL.tsx`) as the canonical implementation.

`FL` is imported by **exactly one file** (`AuthModal`), used twice. The same
pattern — `text-[9px] uppercase tracking-[...] text-muted-foreground` + mono
— is written out by hand **34 times** across the codebase.

The convention is alive and consistently applied. The component embodying it
is effectively abandoned. Either is fine; having both is the drift.

Worse, the tracking value has forked:

```
27 × tracking-[0.14em]   ← the documented pattern
16 × tracking-[0.12em]
 8 × tracking-widest     ← Tailwind's 0.1em
 2 × tracking-[0.1em]
 2 × tracking-wide       1 × tracking-wider
```

`STYLE.md` documents `tracking-[0.14em]` as *the* label tracking. There are
five values in use. Notably `App.tsx`'s four song-meta labels (Key, Time,
Tempo, Feel) use `tracking-widest` while every other 9px label uses
`tracking-[0.14em]` — those four are visually inconsistent with the rest of
the app, at a size where nobody will ever notice. Fixing them is one
find-and-replace and a pure visual change, which is why I have not done it.

### The opacity ladder has extended downward

`STYLE.md`: `/70 → /60 → /50 → /40 → /30`, with occasional `/35 /45 /55 /65`.

Actual: `/70 /65 /60 /55 /50 /45 /40 /38 /35 /30 /25 /20 /15`.

Three new rungs below the documented floor (`/25` ×8, `/20` ×4, `/15` ×1) and
one genuinely off-ladder value (`/38`, once, in `AnalyseChordsPanel`). The
sub-`/30` values are all "barely-there decorative", which is what the
document says that end is for — so the ladder grew in the direction the
document predicted. `/38` is the only one that looks like a typo for `/35`
or `/40`.

`text-foreground` has quietly acquired its own ladder too — `/85 /80 /75 /70
/65 /60 /55 /40` — which `STYLE.md` does not mention at all.

### Radius — a fourth token appeared

`STYLE.md`: 64 × `rounded-sm`, 13 × `rounded-full`, 5 × `rounded-md`, "when
in doubt, `rounded-sm`".

Actual: 73 × `rounded-sm`, 16 × `rounded-full`, 5 × `rounded-md`, and **14 ×
bare `rounded`** — a fourth radius the document does not mention.

Ten of the fourteen are in `FinalSectionView`, which uses `rounded`
throughout its chord-editing toolbar; the rest are `ChordPickerSheet`,
`ChordRowGrid`, `NotebookSection` and one `<kbd>` in `App.tsx`. This one is
real drift rather than a stale document: `rounded` and `rounded-sm` are
different values, and there is no reason for both.

### What has invented its own treatment

Reviewing everything added in Phases 5–6, only two things invent rather than
reuse, and both are defensible:

- **`InspirationStrip`'s dashed offer chip** —
  `border border-dashed border-accent/45`. `border-dashed` is otherwise used
  only on the "add section" buttons and hover targets. Here it means
  "provisional, not yet applied", which is a genuinely new meaning that needed
  a new treatment. Good invention.
- **`FretboardIdentifier`'s `Marker`** — a 22×18 `rounded-full` pill in
  `bg-foreground text-background`. The only inverted element in the app. It is
  a fingertip on a string; nothing existing would have said that.

Everything else in Phase 6 reuses. The `✦` unification, the small-caps mode
label, the pill treatment on the collapsed glimpse — all correctly borrowed.

**On balance: `STYLE.md` needs an update more than the code needs a
correction.** The two changes I would actually make to the code are the bare
`rounded` → `rounded-sm` sweep and the two default-scale text sizes. Both are
visual changes, so both wait for you.

---

## Part 4 — The three pre-approved fixes

Branch `audit-phase-7`, three commits, each independently revertible.

### `e770b64` — Code that nothing calls, taken out

`analyzeStress` + `getStressPattern`, `octaveOf`, 6 unused imports, 2 unused
locals. Proof is in the commit message: the repo-wide grep, and the full
`TS6133`/`TS6196` set from `tsc` with `noUnusedLocals` on.

**Flagging deliberately:** `analyzeStress` was the only stress-analysis code
in the repo, and Part 5 §4 proposes a metre tool that would want it back. It
is recoverable at `f1dad3f`. I removed it because you pre-approved
unreferenced code and it was unreferenced, but I would rather you knew than
discovered it.

No behaviour change. Bundle 648.39 → 648.37 kB — everything removed was
already being tree-shaken.

### `439848e` — A chord found by mistake can leave again

The `MAP.md` Known Debt item. The × goes on the **chord selector's From
Fretboard chips**, not on the fretboard, because `FretboardIdentifier` writes
the log and never displays it — the selector row is the only place these
chords are visible, so nothing new is added to the page.

It reuses the writing-pill gesture exactly: hidden until hover on desktop,
standing on mobile. A *named* Tailwind group (`group/chip`) because
`ChordRowGrid`'s root is already a `group`. The × is top-left because the
shortcut letter owns top-right. It is a **sibling** of the chord button, never
a child — nested interactive elements were a real bug here once. Chips in the
other rows render byte-identical DOM to before.

Verified in the running app, desktop and mobile: build A minor → identified
as `Am` → `+` → appears in From Fretboard with its `z` shortcut → × is
`opacity: 0` at rest and `1` on hover → click removes it → row returns to
"Nothing added from the fretboard yet". No console errors.

**One edge left alone, deliberately:** a song whose *only* content is
fretboard chords fails the autosave `hasMeaningful` test once the last chord
is removed, so that final removal is not persisted. Widening that gate is a
behaviour change. It needs a song with no title, no lyrics, no bars and no
writings to bite.

### `c39d76c` — Two expressions that were written out twice

Only the provably identical ones. `fragmentSource` (8 lines, character for
character, `InspirationPanel` ↔ `InspirationStrip`) and `owWords` (7 lines,
character for character, `RhymePanel` ↔ `ThesaurusPanel`) are now
`fragmentSourceText(song)` and `owWordSet(song)` in
`src/lib/text/songText.ts`.

Every call site keeps its own `useMemo` and its own unchanged dependency
array, so recomputation timing is bit-for-bit what it was.

The value is not the 15 lines. It is that "what fragments are drawn from"
(everything except Production Notes) and "what counts as a word already
written" are *decisions*, and in two places they can drift apart between the
desktop panel and its mobile twin.

Not touched: the ~90 lines of panel shell those two components still share.
That is Part 2 §2, and it is a design decision, not an extraction.

Verified running: notebook text in, Inspiration draws fragments from it.
649.48 → 649.12 kB.

---

## Part 5 — The tools

Speculative, as asked. One paragraph each, with cost. Ranked by what I think
a songwriter would actually feel.

### 1. Key detection cannot tell a key from its relative minor — and it is wrong about half the time ⚠️

This is not a proposal, it is a defect, and it is the one Part 5 finding I
would act on. `detectKey` scores every root × mode by counting diatonic
membership, and takes the first strict maximum. A major key and its relative
minor have **identical diatonic sets**, so they always score identically, and
the winner is decided purely by iteration order over `NOTES`. I ran it:

```
G major  (G C D Em, ending G)   ->  E minor   (confidence 1.00)   ✗
A minor  (Am F C G, ending Am)  ->  C major   (confidence 1.00)   ✗
B minor  (Bm G D A, ending Bm)  ->  D major   (confidence 1.00)   ✗
F major  (F Bb C Dm, ending F)  ->  D minor   (confidence 1.00)   ✗
E minor  (Em C G D, ending Em)  ->  E minor   ✓   (right by luck)
C major  (C F G Am, ending C)   ->  C major   ✓   (right by luck)
```

Four of eight wrong, each reported with **confidence 1.00** — the confidence
number measures diatonic fit, which is perfect for both candidates, so it
cannot express the one thing actually in doubt. **The fix is small and
well-understood**: the tonic is overwhelmingly the first and last chord of a
progression. Adding a bonus when a candidate's tonic is the final chord, and
a smaller one when it is the first, breaks every one of these ties correctly
and is about six lines in `detectKey`. Cost: six lines, plus honestly
reconsidering what `confidence` should mean, plus your judgement on whether
detection changing its answers is disruptive now that a declared key pins the
proposal. Low risk — detection only ever proposes, never writes `song.key`.

### 2. The sense scan is first-match-wins over an 8-way list with 18 words in two categories

`lookupSense` returns the **first** sense whose word list contains the word,
scanning Sight → Sound → Smell → Taste → Touch → Organic → Kinesthetic →
Verbs. 388 words across the eight, of which **18 appear in two lists**:
`sweet`, `sour`, `bitter` and `reek` are in both Smell and Taste; `sharp`,
`dry`, `smooth` in both Taste and Touch; `see`, `light`, `hum`, `press`,
`move`, `turn`, `stand`, `sit`, `carry`, `reach`, `mean` variously doubled
with Verbs. So "sweet" in "the sweet smell of rain" is always scored as
Smell, never Taste — the earlier list simply wins, everywhere, forever. For a
tool whose entire purpose is showing a songwriter *which senses they are
neglecting*, systematically misfiling the ambiguous words is the failure that
matters most: those are exactly the words that could have filled a gap.
**The smallest honest change** is to let a word carry multiple senses and
show it as belonging to both — the scan already renders per-token, so it is a
data-shape change (`senseIdx: number` → `number[]`) plus a two-tone or
striped mark. Cost: moderate — `lookupSense`, `scanText`, `getDrillWords`,
`owLabel` and the `OWWindow` render all read that field. Alternatively, just
resolving the 18 collisions by hand into whichever list is more apt is an
afternoon of judgement and zero code. I would do the cheap one first.

### 3. The fretboard names shapes but will not show you one

`identify.ts` is the best-built module in the repo — I tested it against
eight standard open shapes and it named every one correctly, including the
honest alternates (`Dsus4` also reading `Gsus2/D`, `Em7` also `G6/E`). But it
only runs one way. In an alternate tuning, "what is this shape called" is the
*second* question; the first is "I want a Bm here — where is it?" The
vocabulary table already contains everything needed to answer it: pick a root
and a formula, then search fret positions 0–12 across six strings for
playable sets whose pitch classes match. **This is the single change that
would most increase what the fretboard is worth in DADGAD or C G C E A C**,
which is the whole reason the tool exists. Cost: real but bounded — a search
over roughly 13⁶ combinations needs pruning (cap the fret span at 4, require
the root in the bass, score by hand shape), so call it 80–120 lines of new
code in `identify.ts` plus a small input and a result display. It is the
biggest item on this list and the one I would build if you only build one.

### 4. There is a metre tool implied everywhere and implemented nowhere

`RhymePanel` is titled **"Rhyme & Metre"**. Its only metre feature is a
syllable-count filter, and the counts come from the Datamuse API's
`numSyllables`, not from the app. `countSyllables` exists locally and is used
only by the skeleton generator. `analyzeStress` — a full per-word stress
analysis returning section-coloured lines — existed, worked, and had no
caller in any phase; I removed it in `e770b64` and it is recoverable at
`f1dad3f`. Meanwhile `SCOL`'s own comment in `constants.ts` refers to
"stress-analysis views" that do not exist. **The proposal is to make the
panel's title true**: show the syllable count per line of the focused
section, and mark lines whose count breaks the pattern the other lines
establish. That is the thing a songwriter actually checks — not absolute
metre, but *this line is two syllables longer than its rhyming partner*. Cost:
low, and lower than it looks, because `lineSyllableCount` already exists and
is already trusted by the skeleton generator. A dozen lines of computation
and a small display. `getStressPattern`'s stress guessing (alternating after
the first syllable, function words unstressed) is too naive to show anyone
and I would not restore it — syllable *counts* are honest, guessed *stress*
is not.

### 5. Fragments ignore everything the app knows about the writing

`pickFragmentGroup` builds a pool of every 4+ character non-stop word plus
every 2–3 word run containing a content word, then picks 1–3 uniformly at
random. Its comment says the randomness is deliberate — "deliberately avoids
frequency ranking" — and I think that is right: frequency ranking would
surface the words you have already overused, which is the opposite of
useful. But it currently has no notion of *quality* either, so "and complic"
and "the cracked window" are equally likely, and the strip's fits-or-shortest
rule then systematically prefers the short dull ones because they fit.
**The cheapest real improvement** is to prefer phrases containing a word the
sense lists recognise — the app already has 388 sensory words and
`lookupSense` is already imported by `owLabel` — weighting sensory phrases up
rather than filtering non-sensory ones out, so the pool stays wide. Cost:
about five lines in `pickFragmentGroup` and one import. Small, self-contained,
and it would make the strip's two halves noticeably better company. The risk
is taste, not correctness: if it makes the fragments feel samey, revert it.

### 6. The bridge generator analyses; the idea generator does not

Worth naming the asymmetry because it is instructive. `generateBridgeIdea`
profiles the existing sections — tonic-heavy, chord-dense, always resolves,
already borrows — and *selects a strategy in priority order* to contrast with
what it found. `generateIdea` builds a pool of every applicable technique and
picks **uniformly at random**, retrying up to ten times. Both are good; the
bridge one is smarter. Making `generateIdea` weight its pool by what the
section needs — favour colour techniques for a fully-diatonic section, favour
simplification for a chord-dense one — would reuse the analysis
`generateBridgeIdea` already performs. Cost: low-to-moderate, mostly
extracting the characteristic analysis from `generateBridgeIdea` into a
shared helper (~30 lines) and weighting the pool. This is the least urgent
item here; the random generator is genuinely fun and "fun" is a legitimate
requirement for an idea button.

---

## What I did not do

- Did not delete the 45 unreachable vendored shadcn files (5,139 lines).
  Proof they are unreachable is in Part 1; `MAP.md` says keeping them is
  deliberate. Your call.
- Did not fix the `ProjectRow` remount, though I think it is a live bug —
  it is a bug fix, not one of the three pre-approved categories.
- Did not touch `detectKey`, despite reproducing it being wrong.
- Did not correct any style drift, including the bare-`rounded` sweep and the
  two default-scale text sizes.
- Did not extract the `RhymePanel`/`ThesaurusPanel` shell.
- Did not update `MAP.md` or `STYLE.md`, both of which now have known-stale
  facts (App.tsx's line count; the type scale; `FL`; the radius set).
- Did not turn on `noUnusedLocals`, though the codebase now passes with it.

If you want three things from this list, I would take them in this order:
**the `ProjectRow` fix** (real bug, contained, low risk), **the `detectKey`
tie-break** (reproducibly wrong, six lines), and **updating `STYLE.md`** (the
document is now behind the code, and a stale style guide is worse than none).
