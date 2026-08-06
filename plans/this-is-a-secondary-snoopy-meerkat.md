# Object Writing — Redesign Plan

## Context

The Object Writing tool currently lives embedded inside the song editor's "notes" tab as a collapsible section (`ObjectWritingSection`). The user wants it elevated to a **standalone tool** (its own view), trimmed of the timer and "New Object Writing" controls, with a **Minimize** button replacing the close/delete X, and a **Save** action that deposits text into the Notebook as a named subsection rather than just appending raw text.

---

## Wireframes

### 1. Object Writing — Standalone Floating Panel (default state)

```
┌─────────────────────────────────────────────────────┐
│  Object Writing          [seed word: camera   ] [—] │  ← minimize replaces ×
├─────────────────────────────────────────────────────┤
│  [Detail]  [Object]  [Save]                         │  ← Start/timer removed
├─────────────────────────────────────────────────────┤
│  Sight  Sound  Smell  Taste  Touch  Organic  Kine   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Flint marks – heavy weights hit against rich       │
│  black metal to reveal beneath silver. Pool old,    │
│  poor old camera …                                  │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Scan for senses]                                  │
└─────────────────────────────────────────────────────┘
```

### 2. Minimized State (collapsed to a slim bar)

```
┌────────────────────────────────────────────────────────────┐
│  Object Writing  ·  camera   [Restore ↑]                   │
└────────────────────────────────────────────────────────────┘
```
Sits anchored at the bottom-right of the viewport so it's out of the way but accessible.

### 3. Save → Notebook Subsection

When **Save** is clicked from within a project, a modal/popover asks for an optional title (defaults to seed word if set):

```
┌─────────────────────────────────────┐
│  Save to Notebook                   │
│  Title (optional):  [camera       ] │
│              [Cancel]  [Save →]     │
└─────────────────────────────────────┘
```

This creates a **subsection** inside the Notebook:

```
Notebook
  ├─ General notes…
  ├─ ── camera ──────────────────────  ← named subsection
  │    Flint marks – heavy weights…
  └─ ── bridge imagery ──────────────
       Another saved OW entry…
```

### 4. Notebook data model change

Currently `generalNotes` is a flat string. We need to extend the `Song` type:

```typescript
// Before:
generalNotes?: string;

// After:
generalNotes?: string;          // free-form top section (unchanged)
notebookSections?: {            // NEW — saved OW entries as named subsections
  id: string;
  title: string;                // seed word or user-supplied label
  text: string;
  savedAt: string;
}[];
```

The NotebookSection component renders: the free-form textarea first, then a divider + collapsible cards for each saved subsection below it.

---

## Changes Required

### A. Remove from `ObjectWritingBox`
- Remove timer display (`timerIdx`, `seconds`, `active`, `done` state + UI)
- Remove "Start →" / "Reset" button
- Remove auto-save-on-timer-complete logic
- Remove "New Object Writing" (`addNew()`) button and related header pill navigation
- Keep: Detail, Object, Save, seed word input, senses badges, textarea, Scan for senses

### B. Replace X with Minimize
- In `ObjectWritingBox`, replace `onDelete` prop with `onMinimize`
- Render `—` (Minus icon or `<Minimize2>` from lucide-react) instead of `<X>`
- Add minimized floating bar state in the parent (`ObjectWritingSection` or a new wrapper)

### C. Elevate to Standalone Tool
- Add a new top-level nav entry **"Write"** (or surface it via a dedicated button) alongside the existing song-editor tabs
- Object Writing becomes its own route/view, not inside the "notes" tab
- The panel can still float over the song editor (as seen in the screenshot) — implement as a draggable/fixed overlay that persists across tabs, OR as its own full view
- Recommended: **persistent floating panel** (matches the screenshot intent, doesn't disrupt the existing notes tab layout)

### D. Save → Notebook Subsection
- Add `notebookSections` array to `Song` type and `defaultSong`
- Add Supabase migration or local state update for the new field
- Change `onAddToNotes` callback in the save flow to push to `notebookSections` instead of appending to `generalNotes`
- Update `NotebookSection` to render subsections as collapsible titled cards below the free textarea

### E. Save Modal (optional title)
- Small inline popover on the Save button
- Pre-fills with seed word
- On confirm: adds subsection, shows "Saved ✓" flash, closes popover

---

## Files to Modify

- `src/app/App.tsx`
  - `OWEntry` type (add `minimized?` state if stored)
  - `Song` type — add `notebookSections`
  - `defaultSong` — initialise `notebookSections: []`
  - `ObjectWritingBox` — remove timer/start/reset/new; replace X→Minimize; add Save modal
  - `ObjectWritingSection` — add minimized floating bar; wire minimize/restore
  - `NotebookSection` — render `notebookSections` subsections
  - Integration site (~line 5615) — keep OW in notes tab OR move to floating overlay

---

## Verification

1. Start a project → open Object Writing panel → timer and New Object Writing button should not exist
2. Click `—` → panel collapses to slim bar; click Restore → panel reopens with text intact
3. Write something → click Save → popover appears with seed word pre-filled → confirm → check Notebook shows new subsection with title and text
4. Notebook free textarea still works independently above subsections
5. Multiple saved entries appear as separate titled cards in Notebook
