# Phase 5 — Object Writing Expansion (updated)

## Context
Three improvements to the Object Writing system, ordered from simplest to most complex. All live primarily in `src/app/App.tsx` (3851-line monolith). Feature 5-3 also requires a Supabase migration.

---

## Recommended Build Order

### 5-2 first — Timer UX (isolated, zero schema risk)
### 5-1 second — Global "Write this word" (UI wiring, no schema change)
### 5-3 last — Standalone OW + word cloud (schema change, new UI surface)

---

## 5-2 — Object Writing Timer UX

**Context:** Two friction points: text contrast doesn't signal timer state, and starting requires two clicks.

### Changes in `ObjectWritingBox` (~line 2898)

1. **Text shade during timer**
   - Track `running` boolean (already exists as timer interval ref check).
   - Apply a Tailwind class conditionally to the textarea: `text-foreground/50` while running, `text-foreground` when stopped/ended.
   - No animation — pure className swap when timer transitions.

2. **Auto-focus on Start**
   - Add `textareaRef = useRef<HTMLTextAreaElement>()` inside `ObjectWritingBox`.
   - After setting `running = true`, call `textareaRef.current?.focus()`.

3. **Typing auto-starts timer**
   - On `onChange` of the textarea, if timer is not running and text length goes from 0→1 (or just if timer hasn't started), trigger the same start logic.
   - Guard: only auto-start if `timerStarted` is false, so mid-edit changes don't reset.

---

## 5-1 — Global "Object Write this word"

**Context:** Drill-down currently only surfaces inside an existing OW entry. Goal: surface the action from lyrics text selection, from thesaurus chip clicks, and add an OW index to the section header.

### A — Lyrics section button

**Where:** `LyricBlock` component (~line 2680). Already captures `lyricSelection` state.

- When `lyricSelection` is set (a word is highlighted in any lyric textarea), render a small pill/button near the section toolbar: `✦ Object Write "<word>"`.
- On click: call a new callback `onObjectWrite(word: string)` passed down from App.
- In App, `onObjectWrite` appends a new `OWEntry` to `song.objectWritings` seeded with that word and switches to the Notes tab (where OW lives), scrolling to the new entry.

**Passing the callback:** `onObjectWrite` needs to flow: `App → LyricBlock`. Already has `onWordSelect` pattern to follow.

### B — Synonyms/Antonyms chip clicks

**Where:** `ThesaurusPanel` → `Chip` component (~line 2514).

- Current hover copies to clipboard; keep that behavior only for the **Fragments** section chips (if they share the same component, gate by a prop `mode="fragment" | "thesaurus"`).
- For thesaurus chips: on click, instead of clipboard copy, call `onObjectWrite(word)` — same callback passed down from App through `ThesaurusPanel`.
- Visual hint: replace the clipboard icon on hover with a small ✦ icon + "Object Write" tooltip.

### C — OW Section header index

**Where:** `ObjectWritingSection` (~line 3122), specifically its header render.

- Compute list of `seedWord` values from `song.objectWritings` (deduplicated, lowercased).
- Render below (or inline with) the section title as a flowing inline list:
  `word * word * word *`  using a muted/accent text style.
- Each word in the index is clickable → creates a new OW entry seeded with that word (re-write on an existing object).

### New shared callback

```ts
const handleObjectWrite = useCallback((word: string) => {
  const newEntry: OWEntry = { id: nanoid(), text: "", seedWord: word };
  setSong(s => ({ ...s, objectWritings: [...s.objectWritings, newEntry] }));
  setTab("notes"); // navigate to Notes tab
  // After next render, scroll the new entry into view via a ref or scrollIntoView
}, []);
```

Pass `onObjectWrite={handleObjectWrite}` to `LyricBlock` and `ThesaurusPanel`.

---

## 5-3 — Standalone Object Writing + Word Cloud

**Context:** Writers want to practise OW outside any song. Completed sessions accumulate into a cross-song word cloud in the Projects tab.

### Schema change

New migration: `supabase/migrations/20260726_standalone_ow.sql`

```sql
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
```

### New TypeScript type

```ts
interface StandaloneOW {
  id: string;
  seed_word: string;
  body: string;
  written_at: string;
}
```

### Flow

1. **Entry point:** In `ProjectsSidebar` (~line 1482), beneath the songs list, add a section "Object Writing Sessions" with a "+ New session" button.
2. **Session modal/panel:** A Dialog (Radix UI) opens with:
   - Text input: "What's your object?" (seed word)
   - Timer selector (same TIMER_OPTS as existing OW)
   - Textarea for writing (same shade-during-timer UX from 5-2)
   - Start button (auto-focus, auto-start on type — same as 5-2)
   - On timer end / Stop: save row to `standalone_ow` table via Supabase insert.
3. **Word cloud:** Below the "+ New session" button, fetch all `standalone_ow` rows for the user. Render as a flowing word cloud — each word scaled by frequency (if same seed_word appears multiple times). Use simple inline `fontSize` scaling (no extra lib needed). Muted palette, serif or mono for variety.
4. **Entry detail view:** Clicking a cloud word opens a second Dialog showing:
   - The written text (read-only textarea or pre)
   - Three buttons: **Close** | **Copy text** | **Create song from writing**
   - "Create song from writing" calls existing `createNewProject()` logic, then injects the `body` as the first lyric section content and the `seed_word` as the project name, then closes the dialog.

### Data fetching

- Load standalone OW entries on sidebar open (or on auth state set).
- Optimistic insert: push to local state immediately, then confirm from Supabase response.

---

## Critical Files

| File | Changes |
|------|---------|
| `src/app/App.tsx` | All UI and state changes for 5-1, 5-2, 5-3 |
| `supabase/migrations/20260726_standalone_ow.sql` | New table for 5-3 |
| `src/lib/supabase.ts` | Add typed query helpers for `standalone_ow` |

---

---

## 5-4 — Dynamic Object Word Pool

**Context:** The current `OBJECT_WORDS` array is 50 hardcoded entries, many two-word pairs. The goal is a much wider, more random pool of mostly single concrete nouns, drawn dynamically from Datamuse (already used in the app for thesaurus/rhyme), with a curated fallback and a small allowance of evocative two-word phrases.

### Strategy: Datamuse `topics` + noun filtering + module-level cache

**Datamuse endpoint:**
```
GET https://api.datamuse.com/words?topics=TOPIC&md=p&max=100
```
The `md=p` flag adds a `tags` array to each result. Entries with `"n"` in tags are nouns. We query multiple object-writing-relevant topics in parallel, filter to nouns, deduplicate, then cache.

**Topics to query** (chosen for concrete, sensory richness):
`kitchen`, `garden`, `nature`, `clothing`, `tools`, `music`, `weather`, `body`, `furniture`, `light`

### Changes in `src/app/App.tsx`

1. **Replace `OBJECT_WORDS` constant** with a leaner curated fallback list of ~60 single-word concrete nouns (no multi-word pairs in the fallback). Keep ~10 evocative two-word phrases in a separate `OW_TWO_WORD` list that gets mixed in at a ~15% rate.

2. **Add module-level cache** (two `let` variables at the top of the file, after the constants):
   ```ts
   let owPoolCache: string[] = [];
   let owPoolReady = false;
   ```

3. **Add `loadOWPool()` async function** (module-level, called once):
   ```ts
   async function loadOWPool(): Promise<void> {
     if (owPoolReady) return;
     const topics = ["kitchen","garden","nature","clothing","tools","music","weather","body","furniture","light"];
     try {
       const results = await Promise.all(
         topics.map(t =>
           fetch(`https://api.datamuse.com/words?topics=${t}&md=p&max=100`)
             .then(r => r.json() as Promise<{ word: string; tags?: string[] }[]>)
         )
       );
       const nouns = new Set<string>();
       results.flat().forEach(r => {
         if (r.tags?.includes("n") && r.word.length >= 3 && !STOP_WORDS.has(r.word))
           nouns.add(r.word);
       });
       // merge with curated single-word fallback
       OBJECT_WORDS.forEach(w => nouns.add(w));
       owPoolCache = [...nouns].sort(() => Math.random() - 0.5);
       owPoolReady = true;
     } catch {
       // silently fall back to hardcoded list
       owPoolCache = [...OBJECT_WORDS].sort(() => Math.random() - 0.5);
       owPoolReady = true;
     }
   }
   ```

4. **Trigger `loadOWPool()`** once in App's `useEffect` on mount (fire-and-forget, no loading state needed — it just silently enriches the pool).

5. **Update `pickOWWord()` helper** (replaces the inline `Math.random()` in both `handleObject` usages):
   ```ts
   function pickOWWord(): string {
     const pool = owPoolReady ? owPoolCache : OBJECT_WORDS;
     // ~15% chance of a two-word phrase
     if (Math.random() < 0.15) return OW_TWO_WORD[Math.floor(Math.random() * OW_TWO_WORD.length)];
     return pool[Math.floor(Math.random() * pool.length)];
   }
   ```

6. **Update both `handleObject` usages** (in `ObjectWritingBox` ~line 3355 and `StandaloneOWDialog` ~line 1539) to call `pickOWWord()` instead of the inline random array access.

### Critical files
- `src/app/App.tsx` — all changes (constants, cache vars, loadOWPool, pickOWWord, two handleObject calls, one useEffect)

### Verification
- Click "Object" in the built-in OW box — should cycle through varied single-word nouns
- Click it 10+ times — should see broader variety than the current 50-item list
- Occasionally (roughly 1 in 7) a two-word phrase should appear
- If network is unavailable, fallback list still works

---

## Verification

- **5-2:** Start OW entry → textarea text is lighter → stop → text returns to full opacity. Click Start → cursor lands in box. Click into box and type first character without clicking Start → timer begins.
- **5-1:** Highlight a word in any lyric → pill button appears → click → new OW entry appears in Notes tab seeded with that word. Click a thesaurus chip → new OW entry created. OW section header lists all prior seed words with `*` separators.
- **5-3:** Click "+ New session" in sidebar → dialog opens → complete session → entry saved → word cloud updates. Click cloud word → detail dialog with three action buttons works correctly including song creation.
