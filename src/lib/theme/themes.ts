/**
 * The three themes, each with a hand-drawn dark face. A theme is TOKENS ONLY — colours, fonts, weights, tracking,
 * radius — never layout. Every component reads these through CSS custom
 * properties (see `apply.ts` and `styles/theme.css`), so switching theme is
 * one write to `document.documentElement.style` and no React re-render of the
 * sheet at all.
 *
 * Font roles:
 *   display  chord names (grid, selector pills)
 *   body     structural text and the songwriter's prose
 *   label    interface furniture: small labels, buttons, metadata
 *   title    the song title, the big key letter
 *   sheet    MONOSPACE, always. The Final tab positions chords over lyric
 *            letters in `ch` units and measures one character to map clicks,
 *            so the lyric sheet must be a fixed-width face in every theme.
 *            Themes without a mono of their own get a neutral one.
 */

/** The colour half of a theme — what the dark toggle swaps. */
export interface Palette {
  bg: string; ink: string; muted: string;
  rule: string;
  accent: string;
  panel: string; panelInk: string; panelMuted: string; panelRule: string;
}

export interface ThemeDef extends Palette {
  id: string;
  name: string;
  dark: boolean;
  display: string; body: string; label: string; title: string; sheet: string;
  titleWeight: number; titleTracking: string; chordTracking: string;
  /** Radius of the chord selector's pills — the theme's one shape signature. */
  radius: string;
  /** Radius of everything else (buttons, panels). Kept small: pills on a whole UI would be a layout change. */
  radiusBase: string;
  /** Google Fonts `family=` parameters — only these are fetched, and only for the active theme. */
  fonts: string[];
}

interface ThemeSpec extends Omit<ThemeDef, keyof Palette | "dark"> {
  light: Palette;
  /** Hand-set, not computed: an inverted cream reads muddy, so each dark is drawn as its own palette. */
  darkPalette: Palette;
}

const sans = (f: string) => `'${f}', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif`;
const mono = (f: string) => `'${f}', ui-monospace, 'SF Mono', Menlo, monospace`;
const display = (f: string, fallback: string) => `'${f}', ${fallback}`;

const SPECS: ThemeSpec[] = [
  {
    id: "swiss", name: "Swiss",
    light: {
      bg: "#F5F4F0", ink: "#111111", muted: "#5A5955", rule: "#111111", accent: "#D3271C",
      panel: "#111111", panelInk: "#F5F4F0", panelMuted: "#A9A8A2", panelRule: "#444444",
    },
    darkPalette: {
      bg: "#121212", ink: "#F2F1EC", muted: "#A3A29C", rule: "#F2F1EC", accent: "#E5483C",
      panel: "#F2F1EC", panelInk: "#121212", panelMuted: "#55544F", panelRule: "#B5B4AE",
    },
    display: sans("Inter Tight"), body: sans("Inter Tight"), label: sans("Inter Tight"),
    title: sans("Inter Tight"), sheet: mono("IBM Plex Mono"),
    titleWeight: 800, titleTracking: "-0.035em", chordTracking: "-0.02em", radius: "0px", radiusBase: "0px",
    fonts: ["Inter+Tight:wght@400;500;700;800", "IBM+Plex+Mono:wght@400;500"],
  },
  {
    id: "lead", name: "Lead Sheet",
    light: {
      bg: "#FAF8F3", ink: "#1E1C1A", muted: "#5F5A50", rule: "#1E1C1A", accent: "#B3261E",
      panel: "#2A2724", panelInk: "#FAF8F3", panelMuted: "#B7AF9F", panelRule: "#5A554C",
    },
    darkPalette: {
      bg: "#171615", ink: "#F3F1EC", muted: "#A8A398", rule: "#F3F1EC", accent: "#E0574E",
      panel: "#F3F1EC", panelInk: "#171615", panelMuted: "#5A554C", panelRule: "#B7AF9F",
    },
    display: mono("Courier Prime"), body: mono("Courier Prime"), label: mono("Courier Prime"),
    title: display("Special Elite", "'Courier New', monospace"), sheet: mono("Courier Prime"),
    titleWeight: 400, titleTracking: "0em", chordTracking: "0em", radius: "999px", radiusBase: "4px",
    fonts: ["Courier+Prime:wght@400;700", "Special+Elite"],
  },
  {
    id: "teak", name: "Teak",
    light: {
      bg: "#F4EFE6", ink: "#2E2B27", muted: "#66615A", rule: "#B98A66", accent: "#8A4F2A",
      panel: "#E7DCCB", panelInk: "#2E2B27", panelMuted: "#5F5A52", panelRule: "#C9B59C",
    },
    darkPalette: {
      bg: "#221D18", ink: "#EFE6D8", muted: "#B5A895", rule: "#8C6A50", accent: "#D08A5A",
      panel: "#2F2821", panelInk: "#EFE6D8", panelMuted: "#B5A895", panelRule: "#4D4136",
    },
    display: sans("Jost"), body: sans("Jost"), label: sans("Jost"),
    title: sans("Jost"), sheet: mono("DM Mono"),
    titleWeight: 300, titleTracking: "0em", chordTracking: "0em", radius: "12px", radiusBase: "8px",
    fonts: ["Jost:wght@300;400;500;600", "DM+Mono:wght@400"],
  },
];

/** The three themes, each as its light face — for the picker's swatches. */
export const THEMES: ThemeDef[] = SPECS.map(s => resolve(s, false));

function resolve({ light, darkPalette, ...rest }: ThemeSpec, dark: boolean): ThemeDef {
  return { ...rest, ...(dark ? darkPalette : light), dark };
}

export const DEFAULT_THEME = "swiss";
/** A theme, light or dark. Unknown ids (the four retired themes among them) fall back to Swiss. */
export const themeById = (id: string, dark = false): ThemeDef =>
  resolve(SPECS.find(s => s.id === id) ?? SPECS[0], dark);
/** The dark face of a theme, for the picker's swatches. */
export const darkFace = (id: string): Palette => (SPECS.find(s => s.id === id) ?? SPECS[0]).darkPalette;

/** The Google Fonts stylesheet for one theme, and nothing else. */
export const fontHref = (t: ThemeDef) =>
  `https://fonts.googleapis.com/css2?${t.fonts.map(f => `family=${f}`).join("&")}&display=swap`;

/** Chord-function marker hues (B4). Adjusted per surface for contrast — see `apply.ts`. */
export const FUNCTION_HUES = { home: "#3A6FD1", lift: "#D7372B", pull: "#E0AE16" } as const;
