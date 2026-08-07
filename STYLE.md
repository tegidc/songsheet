# STYLE.md — Songsheet visual conventions

Derived entirely from existing code (`src/styles/theme.css`,
`src/styles/fonts.css`, `src/data/constants.ts`, and usage patterns across
`src/components/`). Nothing here is prescriptive/new — it documents what
the app already does, for anyone extending it consistently.

## Fonts

Three font stacks, defined once in `src/data/constants.ts`:

```ts
export const MONO  = "'DM Mono', monospace";
export const SANS  = "'DM Sans', sans-serif";
export const SERIF = "'Lora', serif";
```

Loaded via `src/styles/fonts.css` (Google Fonts: Lora 400/500/600 + italic
400, DM Sans 300/400/500, DM Mono 300/400).

Usage pattern, consistent across every component:
- **`MONO`** — UI chrome: field labels, buttons, small metadata (timers,
  status text, section headers, hotkey hints), the small-uppercase label
  pattern (see below). If it's a control or a piece of interface furniture
  rather than the user's own words, it's mono.
- **`SERIF`** — the user's actual written content: lyrics, notebook text,
  object-writing bodies, story/big-idea text. Anywhere prose the songwriter
  wrote is being displayed or edited.
- **`SANS`** — structural/secondary text: input values that aren't lyrics
  (song title, artist, key/tempo fields), descriptions, dialog copy,
  subtitles under section headers.

## Small-uppercase-mono label pattern

The recurring field/section-header label style, used everywhere from
`FL` (`src/components/common/FL.tsx`) to section headers inside panels:

```
text-[9px] uppercase tracking-[0.14em] text-muted-foreground
```

(font-family `MONO`). A slightly larger `text-[10px]` variant of the same
pattern is used for section/collapsible headers (see
`CollapsibleSection.tsx`), otherwise identical: uppercase, `tracking-[0.14em]`,
`text-muted-foreground`, mono.

## Colour tokens

Defined in `src/styles/theme.css` as CSS custom properties, consumed via
Tailwind's `@theme inline` mapping (`bg-background`, `text-foreground`,
`border-border`, etc.) — light theme is the only theme actually designed
(`--background: #F5F1EB`, warm off-white paper; `--foreground: #1C1814`,
near-black ink); a `.dark` block exists with oklch-based shadcn defaults
but nothing in the app currently switches into it.

- **`accent`** (`#C4A882`, warm tan/gold) — the one colour used for active/
  interactive emphasis: focus rings (`focus:border-accent`), hover states
  on otherwise-muted controls, the object-writing sparkle glyph (`✦`).
  Used sparingly — most of the UI is deliberately monochrome (foreground/
  muted-foreground/border), with `accent` reserved for "this is live/
  selected/interactive right now."
- **`muted-foreground` opacity ladder** — rather than a fixed set of grey
  tokens, most secondary text uses `text-muted-foreground` with a Tailwind
  opacity modifier, chosen per-context along a soft ladder:
  `/70` → `/60` → `/50` → `/40` → `/30` (with occasional finer steps —
  `/35`, `/45`, `/55`, `/65` — where a component needed something between).
  Convention: **less important or more "chrome-like" text gets a lower
  opacity**. Roughly: `/60`–`/70` for secondary-but-readable labels,
  `/40`–`/50` for placeholder-adjacent or de-emphasized text, `/30` and
  below for barely-there decorative text (e.g. dimmed word-cloud entries,
  disabled-looking chrome).
- Section-type background tints (`SCOL` in `src/data/constants.ts`) are
  hard-coded hex values per `SectionType` (e.g. `bg-[#CDD4CE]` for verse),
  not theme tokens — a separate, muted pastel palette used only for
  section-block backgrounds in the chord grid and stress-analysis views.

## Borders & radius

- **`border-border`** is the only border colour used throughout (itself
  `rgba(28, 24, 20, 0.14)` — a low-opacity tint of the foreground ink, so
  it reads correctly against the warm paper background without a separate
  grey token).
- **`rounded-sm`** is the default radius almost everywhere (buttons,
  panels, dialogs, input underlines-as-boxes) — 64 occurrences vs. 13
  `rounded-full` (pills/badges/dots — sense badges, status dots, chord
  chips) and 5 `rounded-md` (a handful of larger containers). When in
  doubt, `rounded-sm`.

## Type scale

The actual sizes in use, smallest to largest, all via Tailwind arbitrary
values rather than the default `text-sm`/`text-base` scale:
`text-[8px]` (rare, tightest metadata) · `text-[9px]` (the small-uppercase
label pattern) · `text-[10px]` (section headers, secondary labels) ·
`text-[11px]` (small buttons/controls) · `text-xs` (12px — the default body
size for most UI text and form inputs) · `text-[14px]` / `text-sm` variants
for a few emphasized spots · nothing in the interface goes larger than
needed for a dialog heading. There is no use of Tailwind's default `text-
base`/`text-lg`/etc. scale — every size is deliberately chosen from this
smaller custom set, keeping the whole UI text-dense and quiet.

## Mobile breakpoint

`src/app/components/ui/use-mobile.ts` exports `useIsMobile()`, backed by
`MOBILE_BREAKPOINT = 768` (a `matchMedia` listener on `max-width: 767px`).
`App.tsx` calls it once (`const isMobile = useIsMobile()`) and threads the
boolean down as an explicit `isMobile?: boolean` prop through the
component tree — there is no context/provider, every component that needs
to branch on mobile layout receives it as a prop from its parent
(`ChordRowGrid`, `MobileChordSection`, `FinalSectionView`,
`CollapsibleSection`, `NotebookSection`, `ProductionSection`,
`StoryAndBigIdea`, `ObjectWritingBox`, `ObjectWritingSection`, `LyricBlock`,
`VoiceNotesSection`, etc. all take it). Some components (`MobileChordSection`,
`InspirationStrip`, `FullScreenEditor`) are entirely separate mobile-only
implementations rather than a single component branching internally — the
split happens at the call site in `App.tsx`/parent components, not inside a
shared component via conditional rendering everywhere.

Two mobile sizes are not free choices:

- **16px is the floor for anything a phone will focus**, and it is enforced
  once rather than remembered per field. Below 16px iOS Safari zooms the
  visual viewport on focus, which carries every `position: fixed` element off
  screen, and nothing zooms back out. Phase 5 fixed it a field at a time; the
  object-writing window then reintroduced it, so `src/styles/theme.css` now
  carries a single `@media (max-width: 767px)` rule raising every focusable
  `input`/`textarea` to exactly 16px. Three things about it are deliberate:
  it is scoped to `:not([readonly])`, because `readOnly` is how this app says
  "tapping me opens the full-screen editor, I never focus" and those boxes
  are the main reading surfaces; it uses `!important`, because it has to beat
  Tailwind arbitrary classes and inline `style={{ fontSize }}` and a floor
  that loses on specificity is not a floor; and it excludes non-text input
  types, whose font-size means nothing. **You do not need to size new mobile
  fields by hand** — write the desktop size you want and the rule handles the
  phone. The small type elsewhere survives precisely because those boxes are
  `readOnly` on mobile.
- **`100vh` is wrong on iOS** — it is the height as though no keyboard
  existed. Anything that must sit above the keyboard is sized from
  `window.visualViewport` instead (`FullScreenEditor`).
