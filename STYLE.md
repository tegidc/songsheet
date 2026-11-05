# STYLE.md — Songsheet visual system

One layout, seven themes. The layout is a mid-century Swiss-poster grid; a
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

- **Header:** a 48px sticky bar of plain icons (songs & settings, object
  writing ✦, word cloud) and the save state. No border, no wordmark on phones.
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

Top to bottom: `play` (switch + instrument) · `view` (analyse, selector,
nashville as text toggles, bold when on) · the Analyse panel when open · one
row per section · `key` · `add` (section types as words) · the selector dock ·
the fretboard identifier.

- **Chord rows:** two per line on phones (`w-1/2`), flowing at ≥136px on
  desktop. The songwriter's own row breaks still start new lines. Name in the
  display face, **20px bold, 18px past seven characters** (a little smaller
  still on a 320px phone), `--chord-tracking`; the **Roman numeral small and
  muted beside it** (wraps under on narrow phones). Off-key chords are drawn in
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

| | bg | ink | accent → as text | panel | display / label / title | title | radius |
|---|---|---|---|---|---|---|---|
| **Swiss** (default) | #F5F4F0 | #111111 | #D3271C | #111111 | Inter Tight | 800, −0.035em | 0 |
| **Hi-Fi** | #EDEAE3 | #2A2926 | #D9531E → **#B54519** | #2A2926 | Archivo / IBM Plex Mono / Archivo | 700 | 999px |
| **Teak** | #F4EFE6 | #2E2B27 | #8A4F2A | #E7DCCB | Jost | 300 | 12px |
| **Atomic** | #F3E6CC | #4A2E1B | #D9A22B → **#826017** | #4A2E1B | Josefin Sans / — / DM Serif Display | 400 | 999px |
| **Sleeve** (dark) | #121212 | #F1EDE4 | #3C82D0 | #F1EDE4 | Oswald / Oswald / Oswald, body Work Sans | 700 | 0 |
| **Radio** (dark) | #2B1D14 | #EFE3C8 | #F2B33D | #1A110B | Barlow / — / Poiret One | 400 | 4px |
| **Lead Sheet** | #F4EEDF | #1E1C1A | #B3261E | #2A2724 | Courier Prime / — / Special Elite | 400 | 999px |

Sheet mono per theme: IBM Plex Mono (Swiss, Hi-Fi, Sleeve), DM Mono (Teak,
Atomic, Radio), Courier Prime (Lead Sheet).

### Contrast (WCAG, checked by `apply.ts`'s own maths)

All text pairs pass 4.5:1 in all seven themes: ink/bg 10.0–17.2, muted/bg
5.3–7.1, panel-ink/panel 10.4–17.2, panel-muted/panel 5.1–8.1.

What was adjusted (hue kept, lightness moved, by `ensureContrast`):

- **Accent as text** failed in Hi-Fi (3.36) and Atomic (1.86): `--accent-text`
  is #B54519 (4.56) and #826017 (4.68). The fill colours are untouched.
- **Chord-function marks** (graphics, 3:1): the ▲ pull yellow #E0AE16 is
  ~1.8:1 on every light page, so on light pages it becomes an ochre
  (#AD8611 Swiss, #A47F10 Hi-Fi/Atomic, #A88311 Teak/Lead); on Teak's light
  panel #9A780F, on Sleeve's light panel #A88311. Atomic's dark-brown panel
  lifts home/lift to #4F7ED6 / #DC4F45. Everything else keeps the specified
  #3A6FD1 / #D7372B / #E0AE16.
- **Text on accent fills:** the UI never puts text on an accent fill (discs,
  dots and the Play knob carry none). For the record, the best text colour on
  the accent reaches only 3.6:1 in Hi-Fi; if a later design needs text on the
  accent there, use `--accent-text` as the fill.
- **Rules** in Teak (#B98A66, 2.7:1) and Radio (#5A4331, 1.8:1) are
  decorative separators, not component boundaries, and are left as designed.

## Chord function marks

`lib/theory/function.ts`, shown when *Show chord function* is on, before the
name in song rows and selector pills: ● home (I iii vi) · ■ lift (ii IV) ·
▲ pull (V vii°) · ◆ borrowed (ink). Read through the key in force, using the
same degree maths as the Nashville numbers. A chord is diatonic when every
note it sounds — suffix and slash bass included — is in the key's scale.
Minor keys use the same degree rule (i ♭III ♭VI home, ii° iv lift, v ♭VII
pull) and allow the raised leading tone on chords built on 5 and 7 (E7, G♯°
in A minor). Marks are decorative; the numeral beside the name says the
same thing as text.

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
