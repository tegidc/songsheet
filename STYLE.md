# STYLE.md — Songsheet visual system

One layout, three themes, each with a dark face. The layout is a mid-century Swiss-poster grid; a
**theme changes tokens only** — colours, fonts, weights, tracking, radius —
never where anything sits. Everything here is implemented; nothing is
aspirational.

## The grid

- **Two columns everywhere on the Chords screen and in the chrome:** a narrow
  label column of **56px** and a content column (`grid-template-columns:
  56px minmax(0, 1fr)`, `gap-x-3`). `Row` in `components/chords/swiss.tsx` is
  the one implementation; the masthead, tabs and selector panel use the same
  56px measure.
- **Labels** in the left column are small (12px), lower-case, in the theme's
  label face: `play`, `view`, `verse / 01`, `chorus / 01`, `key`, `add`,
  `in key`, `used`.
- **Sections are separated by 1px full-width rules in ink** (`--rule`).
  No cards, no shadows, no tinted section boxes on the Chords screen.
- Page margins: 20px phone, 32px desktop, content capped at `max-w-4xl`.
- Touch targets: every tappable chord, tab and setting is **at least 44px tall**.

### Masthead and chrome

- **Header:** a 48px sticky bar of plain icons — songs & settings (folder),
  writing (notepad: back to the song sheet), object writing ✦, word cloud —
  and the save state; the view you are in is drawn in ink, the rest muted.
  Signed in, the app **opens on a fresh object writing** (untimed until you
  start it); closing it is the song sheet. No border, no wordmark on phones.
- **Masthead:** the project's start date stacked small in the label column
  (`26 / 07 / 18` — the YYMMDD prefix; today for an unsaved song), the title
  large and tight beside it: theme title face, `--title-weight`,
  `--title-tracking`, line-height 0.95, `clamp(34px, 9vw, 56px)`. Lower-case
  while read, true case while typed. Song details sit behind one quiet line
  under it.
- **Rings:** three concentric 1px ink outlines and a filled `--accent-fill`
  disc, partly off the top-right (`Masthead.tsx` `Rings`). Decorative,
  `aria-hidden`, behind content (`main` is `isolate`, rings `-z-10`); the
  root clips horizontal overflow so they never cause sideways scroll.
- **Tabs:** `create / lyrics / chords / final`, lower-case, on the 56px grid
  with `→` in the label column. Active: extra-bold, ink. Others: medium, muted.
  A rule beneath.

### Chords screen

Top to bottom: `view` (`selector`, `nashville`, `○ play ⇪` as text
toggles, bold when on; Play's dot fills with the accent; on desktop **Caps
Lock is Play** — locked plays, unlocked edits; phones also have `analyse`) · the Analyse panel when open · one
row per section · `key` · `add` (section types as words) · the selector dock ·
the fretboard identifier.

- **Chord rows:** two per line on phones (`w-1/2`), flowing at ≥136px on
  desktop. The songwriter's own row breaks still start new lines. Name in the
  display face, **20px bold, 18px past seven characters** (a little smaller
  still on a 320px phone), `--chord-tracking`. The name stands alone by default; with *Show numerals*
  on, the **Roman numeral sits small and muted beside it** (wraps under on
  narrow phones), and the selector pills carry their degree labels
  (`borrowed` and the off-key `•` always show). Off-key chords are drawn in
  `--accent-text`. Phrase markers are a 1px ink rule on the bar's right edge,
  taking no width.
- **Key:** the key in force as a 44px letter in the title face — it *is* the
  freeform "set key as" field — with `detected Am · 61% · set ↻` small beside
  it. Same behaviour as the Analyse panel's Detect/Set, which remain.
- **Chord selector:** an inverted block (`--panel` / `--panel-ink`) at the
  bottom — docked (sticky) on desktop when the selector is on, and in Play
  mode; on phones it is the bar drawer, wearing the same skin. The rotating
  heading is the control; the other sets are listed muted beside it; USED
  stays on its own line. Pills are 46px, `--panel-rule` hairline,
  `--radius-selector`. **Behaviour, rows, rotation, shortcuts and placement
  are unchanged** — this is a skin.
- **The selector is the one chord tool (desktop).** Analyse and the
  fretboard are no longer boxes on the page. Under **In key**, one small
  panel-muted line: `key C · detected Am 61% set ↻ · ideas bridge` — the key
  field, detection, and the two generators, which open beneath it. Under
  **From fretboard**, the neck itself, full panel width, framed by a rule
  instead of a box; `+` adds the shape to that row's pills. Page-token
  components embedded in the panel are re-pinned to panel colours
  (`PANEL_TOKENS` in `SelectorTools.tsx`). Phones keep the Analyse toggle,
  the key row and the neck at the foot of the screen until the phone pass.

### Create, Lyrics, Final — tokens only (this pass)

These screens keep their existing layout and take the theme through the
token mapping below. What a later layout pass would change:

- **Create:** drop the card boxes for ruled sections on the 56px grid, labels
  (`story`, `notes`, `notebook`…) in the left column.
- **Lyrics:** section headers into the label column (as the Chords rows),
  lyric text in the content column; the add-section chips as the Chords
  screen's `add` line; tool panels as ruled rows rather than boxes.
- **Final:** section labels in the left column, sheet in the right; on phones,
  chord-over-syllable units that wrap together (flex-wrap of
  chord+syllable pairs) instead of fixed `ch` positions, with inline chords as
  a fallback — the single biggest phone improvement left.
- **Fretboard identifier:** lose its box; tuning controls as a `tuning` row.
- Floating ✦ button: rises above the selector dock when the dock is showing.

## Tokens

Defined per theme in `src/lib/theme/themes.ts` (the one source of truth),
resolved to CSS custom properties on `:root` by `src/lib/theme/apply.ts`.
`styles/theme.css` carries Swiss as the pre-script default.

| Token | Use |
|---|---|
| `--bg` `--ink` `--muted-ink` | page, text, secondary text |
| `--rule` / `--rule-soft` | section rules (ink) / hairlines (14% black or 18% white) |
| `--accent-fill` | discs, dots, the Play knob, caret — never text |
| `--accent-text` | accent as text: the accent, darkened/lightened until it reads 4.5:1 |
| `--panel` `--panel-ink` `--panel-muted` `--panel-rule` | the inverted selector block |
| `--font-display` `--font-body` `--font-label` `--font-title` | chord names / prose & structure / interface / title & key |
| `--font-sheet` | **always monospace** — the Final tab aligns chords to lyric letters in `ch` |
| `--title-weight` `--title-tracking` `--chord-tracking` | type character |
| `--radius-selector` | the selector pills — each theme's one shape signature |
| `--fn-home` `--fn-lift` `--fn-pull` (+ `-panel`) | chord-function marks, contrast-adjusted per surface |
| `--sec-<type>` | section tints for Lyrics/Final headers: a hue mixed into `--bg` |

The shadcn/Tailwind variables the app was written against are **mapped from
these** (`--background`=bg, `--foreground`=ink, `--muted-foreground`=muted,
`--border`=rule-soft, `--accent`=accent-text, `--card`/`--muted`/`--secondary`
= ink mixed into bg at 4/9/7%, `--radius` from the theme's base radius), which
is why every existing `bg-background` / `text-foreground` / `border-border`
class follows the theme untouched.

Fonts are roles, not families: `MONO` = label, `SANS`/`SERIF` = body,
`DISPLAY`, `TITLE`, `SHEET` in `data/constants.ts` are `var(--font-…)`
strings. Never name a family in a component.

**Font loading:** one `<link id="theme-fonts">`, swapped on theme change, so
only the active theme's families are ever requested. `index.html`'s boot
script applies the cached theme (variables, `color-scheme`, `theme-color`,
font link) before the app loads, so a dark theme never flashes light.

## Themes

Three themes, and a **Dark** switch that gives any of them its dark face.
The dark faces are drawn by hand, not computed — an inverted cream reads
muddy — and share each theme's fonts, weights and radii exactly.

| | light bg / ink / accent | dark bg / ink / accent | panel (light → dark) | display / title | radius |
|---|---|---|---|---|---|
| **Swiss** (default) | #F5F4F0 / #111111 / #D3271C | #121212 / #F2F1EC / #E5483C | ink block → paper block | Inter Tight, 800 −0.035em | 0 |
| **Lead Sheet** | #FAF8F3 / #1E1C1A / #B3261E | #171615 / #F3F1EC / #E0574E | ink block → paper block | Courier Prime / Special Elite | 999px |
| **Teak** | #F4EFE6 / #2E2B27 / #8A4F2A | #221D18 / #EFE6D8 / #D08A5A | light oak → dark oak | Jost, 300 | 12px |

Lead Sheet's page moved from cream (#F4EEDF) to near-white. Sheet mono: IBM
Plex Mono (Swiss), Courier Prime (Lead Sheet), DM Mono (Teak).

### Contrast (WCAG, checked by `apply.ts`'s own maths)

All six faces pass 4.5:1 for every text pair: ink/bg 12.3–17.2, muted/bg
5.4–7.3, accent-as-text 4.7–6.2, panel-ink/panel 10.4–17.2,
panel-muted/panel 5.1–7.9. No accent needed darkening.

Chord-function marks (graphics, 3:1): the ▲ pull yellow #E0AE16 becomes an
ochre on light surfaces (#AD8611 Swiss, #B28A11 Lead Sheet, #A88311 Teak;
#9A780F on Teak's oak panel; #A88311 / #AD8611 on the paper panels of
dark Swiss / dark Lead Sheet).
Home/lift keep #3A6FD1 / #D7372B everywhere. Teak's rules (#B98A66 light,
#8C6A50 dark) are decorative separators, left as designed. The UI never puts
text on an accent fill.

## Chord function marks

`lib/theory/function.ts`, shown when *Show chord function* is on, before the
name in song rows and selector pills: ● home (I iii vi) · ■ lift (ii IV) ·
▲ pull (V vii°) · ◆ borrowed (ink). Read through the key in force, using the
same degree maths as the Nashville numbers. A chord is diatonic when every
note it sounds — suffix and slash bass included — is in the key's scale.
Minor keys use the same degree rule (i ♭III ♭VI home, ii° iv lift, v ♭VII
pull) and allow the raised leading tone on chords built on 5 and 7 (E7, G♯°
in A minor). Marks are decorative; *Show numerals* says the same thing as
text.

## Now playing

In Play mode the sounding chord in a song row gets a 12px `--accent-fill`
dot before its name and weight 800; the dot moves with the next tap.
Selector pills and other chords flash instead (`flash()` in
`lib/audio/PlayContext.tsx`).

## Rules that hold in every theme

- **The 16px input floor** (`theme.css`): every focusable field under the
  mobile breakpoint is forced to 16px so iOS never zooms. The only exemption
  is `data-large-type`, for fields that set their own size *above* 16px
  (masthead title, key letter, the picker's typed chord). Never put it on
  anything that can render smaller.
- The Final tab's lyric sheet is `--font-sheet` (mono) and the character
  width is re-measured on theme change and font load.
- Section rules use `--rule`; hairlines inside a section use `border-border`.
- `rounded-sm` remains the default corner, now derived from each theme's base
  radius (0 in Swiss and Sleeve). Pill radius is `--radius-selector` alone.
- Colour never names a hex in a component. The only hexes left in `src`
  outside `lib/theme/` are the Word Cloud's own palettes.
