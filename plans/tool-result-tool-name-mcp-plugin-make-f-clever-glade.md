# Plan: Rhyme Panel — Pick Up Highlighted Word from Lyrics

## Context

The Rhyme & Metre panel currently requires the user to type a word manually. The request is to also feed it from whatever word the user selects/highlights inside any lyric textarea, so the panel updates automatically when you highlight a word you want to rhyme.

## Approach — prop threading + textarea `onSelect` event

All in `src/app/App.tsx`.

### 1. `AutoTA` — detect single-word selection

Add `onWordSelect?: (w: string) => void` prop. Wire an `onSelect` handler to the `<textarea>`:

```typescript
onSelect={e => {
  if (!onWordSelect) return;
  const ta = e.currentTarget;
  const sel = ta.value.substring(ta.selectionStart ?? 0, ta.selectionEnd ?? 0).trim();
  // Only fire for a single-word selection (letters/apostrophes, 2+ chars, no spaces)
  if (sel.length >= 2 && /^[a-zA-Z''-]+$/.test(sel)) {
    onWordSelect(sel.toLowerCase().replace(/[^a-z']/g, ""));
  }
}}
```

### 2. `LyricBlock` — forward the prop

Add `onWordSelect?: (w: string) => void` to `LyricBlock`'s props and forward it to the `<AutoTA>` call.

### 3. App — lift selection state

Add one state variable:
```typescript
const [lyricSelection, setLyricSelection] = useState("");
```

Pass to each `LyricBlock` in the Lyrics tab:
```tsx
onWordSelect={w => setLyricSelection(w)}
```

Pass to `RhymePanel`:
```tsx
<RhymePanel song={song} selectionWord={lyricSelection} />
```

### 4. `RhymePanel` — receive and apply selection

Add `selectionWord?: string` prop. Add a `useEffect` that updates `word` state when it changes:

```typescript
useEffect(() => {
  if (!selectionWord) return;
  setWord(selectionWord);
}, [selectionWord]);
```

The existing debounce effect already watches `word`, so it will auto-fetch. No other changes needed.

**Source indicator:** When the displayed `word` matches the current `selectionWord` (and isn't empty), show a tiny muted label `← from lyrics` next to the word input so the user understands why the panel updated.

```tsx
{word && selectionWord && word === selectionWord && (
  <span className="text-[9px] text-muted-foreground/30 shrink-0" style={{ fontFamily: MONO }}>← lyrics</span>
)}
```

## Key design decisions

- `onSelect` fires on every selection change in the textarea — the single-word regex guard (`/^[a-zA-Z''-]+$/`, no spaces) prevents partial-line or multi-word selections from triggering the panel.
- Selection overrides whatever is in the word input. This matches intent — you deliberately highlighted something.
- The user can still type in the word input to override the selection at any time.
- No global event listeners or refs needed — pure React prop threading.

## Files modified
- `src/app/App.tsx` only (AutoTA, LyricBlock, App state, LyricBlock call sites, RhymePanel)

## Verification
1. Type a lyric, double-click a word to select it → Rhyme panel updates and fetches rhymes for that word
2. Drag-select a word → same behaviour
3. Select a phrase with spaces → panel does not update (guard filters it out)
4. Type a different word in the panel manually → panel fetches that word instead
5. `← lyrics` label appears when panel word matches selection; disappears when user types something new

---

# Plan: Fix Final Tab Crash on Blank Song

## Context

Clicking the "Final" tab on a new blank song crashes the app. `makeEmptySong()` creates its initial section without `chordPositions`, but `FinalSectionView` immediately calls `section.chordPositions.map(...)` and `.filter(...)` on lines 954, 963, 972, 980, 1000, 1007 — throwing `Cannot read properties of undefined (reading 'map')`.

The existing `makeSection()` helper at line 460 correctly includes `chordPositions: []` and `notes: ""`, but `makeEmptySong()` doesn't use it and omits both fields.

## Fix — `src/app/App.tsx` only, one line

Change the section in `makeEmptySong()` from:
```ts
sections: [{ id: uid(), type: "verse", lyrics: "", chordBars: Array(8).fill("") }],
```
to:
```ts
sections: [{ id: uid(), type: "verse", lyrics: "", notes: "", chordBars: Array(8).fill(""), chordPositions: [] }],
```

This satisfies the full `Section` interface (line 13–15).

## Verification
1. New blank song → click "Final" tab → no crash
2. Click into the chord area → chord placement works normally

---

# Plan: Fix Silent Save Failures + Add updated_at Trigger

## Context

The user's SQL schema is correct and complete — no changes needed to the table definition or RLS policies. The save button appears to do nothing (sidebar shows "No saved projects yet" after clicking Save) because `saveSong` silently swallows Supabase errors: it uses `try/finally` with no `catch` and does not destructure `error` from the Supabase response. The same problem exists in the sidebar fetch and auto-save. Additionally, `updated_at` has no UPDATE trigger, so auto-saves don't update the timestamp and sidebar ordering breaks over time.

## SQL — add only this (run in Supabase SQL editor, keep everything else as-is)

```sql
-- Auto-update updated_at on every UPDATE so auto-save refreshes sidebar ordering
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Code changes — `src/app/App.tsx` only

### 1. Fix `saveSong` — surface the error

Current (line ~1771):
```ts
const { data } = await supabase.from("projects")
  .insert({ user_id: user.id, name: defaultProjectName(song.title), data: song })
  .select("id").single();
if (data) { setCurrentProjectId(data.id); setShowSidebar(true); }
```

Fix — destructure `error`, show it if present:
```ts
const { data, error } = await supabase.from("projects")
  .insert({ user_id: user.id, name: defaultProjectName(song.title), data: song })
  .select("id").single();
if (error) { console.error("Save failed:", error.message); setSaveError(error.message); return; }
if (data) { setCurrentProjectId(data.id); setShowSidebar(true); setSaveError(""); }
```

Add `const [saveError, setSaveError] = useState("")` to App state.
Show `saveError` as a small red line in the header next to the Save button.

### 2. Fix `ProjectsSidebar` fetch — handle select errors

Current:
```ts
supabase.from("projects")
  .select("id, name, updated_at, status")
  .order("updated_at", { ascending: false })
  .then(({ data }) => { setProjects((data as Project[]) ?? []); setLoading(false); });
```

Fix:
```ts
.then(({ data, error }) => {
  if (error) console.error("Fetch projects failed:", error.message);
  setProjects((data as Project[]) ?? []);
  setLoading(false);
});
```

### 3. Fix auto-save — handle update errors

Current: `await supabase.from("projects").update(...).eq(...)` then immediately sets "saved".

Fix: destructure `{ error }`, only set "saved" if no error, set "idle" with a warning if there is one.

### 4. Trigger sidebar refresh after first save

The sidebar re-fetches when `refreshKey` changes, which is triggered by `currentProjectId` changing. This chain is correct — but only fires if `setCurrentProjectId(data.id)` actually runs. Once error handling is in place, a successful save will set `currentProjectId`, which increments `refreshKey`, which triggers the fetch. No structural change needed here — fixing the error surfacing is sufficient.

## Files modified
- `src/app/App.tsx` only

## Verification
1. Click Save — if it fails, a red error message appears in the header (e.g. "Save failed: new row violates row-level security policy")
2. If save succeeds, the sidebar immediately shows the new project under Working
3. After any edit, "Auto-saving…" appears after 3s, then "Saved ✓" — and the project's timestamp updates in the sidebar
4. Check browser console for any "Save failed:" or "Fetch projects failed:" messages to diagnose remaining Supabase issues

---

## 1. Layout — Right Projects Sidebar

Change the root layout from `max-w-4xl mx-auto` inside a plain `<main>` to a flex row:
```
[main content flex-1]  [ProjectsSidebar w-56, collapsible]
```

The sidebar toggle lives in the header (a small panel icon button). State: `showSidebar: boolean` (default `true` when logged in, `false` when not).

**ProjectsSidebar** component (replaces current modal ProjectsPanel):
- Fixed right column, full viewport height, scrollable list
- Dark-tinted background: `bg-foreground/[0.03] border-l border-border`
- Small MONO typography throughout to feel unobtrusive
- Header: "Projects" label + collapse chevron
- Active project pinned at top with a subtle indicator dot
- Each project: name + relative timestamp + click to load
- Hover: shows delete button (×)
- "New song" button at bottom

**Auto-naming convention**: when saving a new project with no title, generate name as `YYMMDD` (today's date reversed: year-last-2 + month + day, e.g. `260704`). When the song has a title, name becomes `260704 · River in the Dark`.

```ts
function defaultProjectName(title: string): string {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  return title.trim() ? `${date} · ${title.trim()}` : date;
}
```

---

## 2. Auto-save

Add a debounced auto-save effect in App that fires 3 seconds after any song change, if the user is logged in.

```ts
const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
const [autoSaveState, setAutoSaveState] = useState<"idle"|"pending"|"saving"|"saved">("idle");

useEffect(() => {
  if (!user || !currentProjectId) return; // only auto-save existing projects
  setAutoSaveState("pending");
  clearTimeout(autoSaveTimer.current);
  autoSaveTimer.current = setTimeout(async () => {
    setAutoSaveState("saving");
    await supabase.from("projects").update({ name: defaultProjectName(song.title), data: song }).eq("id", currentProjectId);
    setAutoSaveState("saved");
    setTimeout(() => setAutoSaveState("idle"), 2000);
  }, 3000);
  return () => clearTimeout(autoSaveTimer.current);
}, [song, user, currentProjectId]);
```

**Header indicator** (replaces the old "Saved ✓" flash):
- `"idle"` → nothing
- `"pending"` → nothing (immediate change, don't show until about to save)
- `"saving"` → small `"Auto-saving…"` in muted MONO, near the title
- `"saved"` → `"Saved ✓"` for 2s then fades

Remove the manual **Save** button from the header. First save (new project) is still triggered by the header "Save" action or by the projects sidebar "New song" button — but ongoing saves are automatic. Keep a manual "Save" button only for the initial save of a brand-new unsaved project.

---

## 3. Auth Modal — OAuth Buttons

Add below the email/password form, separated by an "or" divider:

```tsx
<div className="flex items-center gap-3 my-4">
  <div className="flex-1 h-px bg-border" />
  <span className="text-[10px] text-muted-foreground uppercase tracking-widest" style={{fontFamily:MONO}}>or</span>
  <div className="flex-1 h-px bg-border" />
</div>
<div className="flex flex-col gap-2">
  <button onClick={signInGoogle} className="w-full py-2 border border-border rounded-sm text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
    <span>Continue with Google</span>
  </button>
  <button onClick={signInApple} className="w-full py-2 border border-border rounded-sm text-sm text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2">
    <span>Continue with Apple</span>
  </button>
</div>
```

`signInGoogle/signInApple` call `supabase.auth.signInWithOAuth({ provider: "google"|"apple" })`. Note: these require OAuth providers to be configured in the Supabase dashboard — the buttons will exist in the UI but won't work until the user sets up OAuth in Supabase. Add a small note in the modal for this.

---

## 4. Chords — Ideas Panel

Add an **"Ideas"** button to the chords toolbar. State: `showIdeas: boolean`.

When open, renders a panel below the chord grid with three sub-sections:

### 4a. Parallel Key
If detected key is minor (e.g. Am), show chords from the parallel major (A major) labeled "Borrowed from A major". If major (e.g. C), show parallel minor (Cm). These are "modal mixture" / borrowed chords.

```ts
function getParallelChords(root: string, mode: "major"|"minor"): string[] {
  const parallelMode = mode === "major" ? "minor" : "major";
  return getDiatonic(root, parallelMode).map(d => `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : "°"}`);
}
```

Show them as clickable pill badges (clicking copies chord name to clipboard or highlights it).

### 4b. Tension at Transitions
Check each section boundary (verse→chorus, chorus→verse, etc.). If consecutive sections share a starting chord, suggest alternatives:
- **Secondary dominant** of the next section's first chord: the V of the first chord (e.g. if chorus starts on F, the V of F is C, so C7 → F creates more pull)
- **Tritone substitution** of the dominant: e.g. if you'd normally go G→Am, the tritone sub of G is Db, so Db→Am

Display as: "Verse → Chorus both start on [F] · Try ending Verse on: C7 (secondary dominant) · Db (tritone sub)"

### 4c. Bridge Sketch
Show 3–4 chords from the diatonic scale that haven't been used yet in any section, presented as a suggested progression. Label: "Unused chords for a bridge:".

---

## 5. Nashville Number System

Add a `nashville: boolean` state (default `false`) and a toggle button in the Chords tab toolbar: `[# Nashville]` button that toggles between chord names and Nashville numbers.

```ts
function toNashville(chord: string, key: string): string {
  if (!key.trim()) return chord;
  const { root: keyRoot, mode: keyMode } = parseKeyString(key);
  const p = parseChord(chord);
  if (!p) return chord;
  const ri = NOTES.indexOf(keyRoot);
  const ci = NOTES.indexOf(p.root);
  if (ri === -1 || ci === -1) return chord;
  const interval = (ci - ri + 12) % 12;
  const steps = keyMode === "major" ? MAJ_ST : MIN_ST;
  const degIdx = steps.indexOf(interval);
  if (degIdx === -1) return chord; // non-diatonic: show as-is
  const num = degIdx + 1;
  const qual = p.q === "min" ? "-" : p.q === "dim" ? "°" : p.q === "aug" ? "+" : "";
  return `${num}${qual}`;
}
```

In `BarCell`, when `nashville` is true, display `toNashville(value, songKey)` instead of `value`. The stored data stays as chord names — Nashville is a view-only transform. Pass `nashville` and `songKey` props down through `ChordRowGrid` → `BarCell`.

---

## 6. Notes Tab — Reorder Production

New order:
1. Story · Big Idea
2. **Production** (moved up from #4)
3. Notebook
4. Object Writing

Change in the Notes tab render block: move `<ProductionSection>` to position 2, before `<NotebookSection>`.

---

## 7. Inspiration — Filter Section Label Words

Add a `SECTION_IGNORE_WORDS` set and apply it in `extractWordCloud`:

```ts
const SECTION_IGNORE_WORDS = new Set([
  "verse","chorus","bridge","intro","outro","hook","section","pre",
  "song","music","lyric","lyrics","chord","chords","note","notes",
]);
```

In `extractWordCloud`, additionally filter: `!SECTION_IGNORE_WORDS.has(w)`.

---

## 8. Demo Text Update

Update `EMPTY_SONG` / `makeTestSections` to:
- Move production content to `productionNotes` (already done)
- Ensure `generalNotes` (Notebook) contains only creative/associative text
- Add `productionNotes` with reference/technical content

---

## Files Modified
- `src/app/App.tsx` only

## Verification
1. Projects sidebar appears on right, collapses with toggle button in header
2. Active project shown at top with indicator; other projects load on click
3. Auto-save fires 3s after changes when logged in; "Auto-saving…" / "Saved ✓" appear near title
4. New unsaved project still requires first manual save
5. Auth modal shows Google + Apple buttons with "or" divider
6. Ideas panel in Chords shows parallel chords, transition suggestions, bridge sketch
7. Nashville toggle converts displayed bars to numbers (1, 4, 5-, etc.) and back
8. Notes tab order: Story · Big Idea → Production → Notebook → Object Writing
9. Inspiration Words tab no longer shows "verse", "chorus", "note", "lyric" etc.
10. Auto-naming: new project with no title gets name "260704", with title gets "260704 · River in the Dark"
