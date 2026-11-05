/**
 * The seven themes. A theme is TOKENS ONLY — colours, fonts, weights, tracking,
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

export interface ThemeDef {
  id: string;
  name: string;
  dark: boolean;
  bg: string; ink: string; muted: string;
  rule: string;
  accent: string;
  panel: string; panelInk: string; panelMuted: string; panelRule: string;
  display: string; body: string; label: string; title: string; sheet: string;
  titleWeight: number; titleTracking: string; chordTracking: string;
  /** Radius of the chord selector's pills — the theme's one shape signature. */
  radius: string;
  /** Radius of everything else (buttons, panels). Kept small: pills on a whole UI would be a layout change. */
  radiusBase: string;
  /** Google Fonts `family=` parameters — only these are fetched, and only for the active theme. */
  fonts: string[];
}

const sans = (f: string) => `'${f}', ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', sans-serif`;
const serif = (f: string) => `'${f}', ui-serif, Georgia, serif`;
const mono = (f: string) => `'${f}', ui-monospace, 'SF Mono', Menlo, monospace`;
const display = (f: string, fallback: string) => `'${f}', ${fallback}`;

export const THEMES: ThemeDef[] = [
  {
    id: "swiss", name: "Swiss", dark: false,
    bg: "#F5F4F0", ink: "#111111", muted: "#5A5955", rule: "#111111", accent: "#D3271C",
    panel: "#111111", panelInk: "#F5F4F0", panelMuted: "#A9A8A2", panelRule: "#444444",
    display: sans("Inter Tight"), body: sans("Inter Tight"), label: sans("Inter Tight"),
    title: sans("Inter Tight"), sheet: mono("IBM Plex Mono"),
    titleWeight: 800, titleTracking: "-0.035em", chordTracking: "-0.02em", radius: "0px", radiusBase: "0px",
    fonts: ["Inter+Tight:wght@400;500;700;800", "IBM+Plex+Mono:wght@400;500"],
  },
  {
    id: "hifi", name: "Hi-Fi", dark: false,
    bg: "#EDEAE3", ink: "#2A2926", muted: "#625F59", rule: "#2A2926", accent: "#D9531E",
    panel: "#2A2926", panelInk: "#EDEAE3", panelMuted: "#B0ACA4", panelRule: "#55524C",
    display: sans("Archivo"), body: sans("Archivo"), label: mono("IBM Plex Mono"),
    title: sans("Archivo"), sheet: mono("IBM Plex Mono"),
    titleWeight: 700, titleTracking: "-0.02em", chordTracking: "-0.01em", radius: "999px", radiusBase: "6px",
    fonts: ["Archivo:wght@400;500;700", "IBM+Plex+Mono:wght@400;500"],
  },
  {
    id: "teak", name: "Teak", dark: false,
    bg: "#F4EFE6", ink: "#2E2B27", muted: "#66615A", rule: "#B98A66", accent: "#8A4F2A",
    panel: "#E7DCCB", panelInk: "#2E2B27", panelMuted: "#5F5A52", panelRule: "#C9B59C",
    display: sans("Jost"), body: sans("Jost"), label: sans("Jost"),
    title: sans("Jost"), sheet: mono("DM Mono"),
    titleWeight: 300, titleTracking: "0em", chordTracking: "0em", radius: "12px", radiusBase: "8px",
    fonts: ["Jost:wght@300;400;500;600", "DM+Mono:wght@400"],
  },
  {
    id: "atomic", name: "Atomic", dark: false,
    bg: "#F3E6CC", ink: "#4A2E1B", muted: "#6E5440", rule: "#4A2E1B", accent: "#D9A22B",
    panel: "#4A2E1B", panelInk: "#F3E6CC", panelMuted: "#D8C6A6", panelRule: "#7A5E48",
    display: sans("Josefin Sans"), body: sans("Josefin Sans"), label: sans("Josefin Sans"),
    title: serif("DM Serif Display"), sheet: mono("DM Mono"),
    titleWeight: 400, titleTracking: "0em", chordTracking: "0em", radius: "999px", radiusBase: "6px",
    fonts: ["Josefin+Sans:wght@400;600;700", "DM+Serif+Display", "DM+Mono:wght@400"],
  },
  {
    id: "sleeve", name: "Sleeve", dark: true,
    bg: "#121212", ink: "#F1EDE4", muted: "#A19D95", rule: "#F1EDE4", accent: "#3C82D0",
    panel: "#F1EDE4", panelInk: "#121212", panelMuted: "#4A4A4A", panelRule: "#B5B0A6",
    display: display("Oswald", "'Arial Narrow', sans-serif"), body: sans("Work Sans"),
    label: display("Oswald", "'Arial Narrow', sans-serif"), title: display("Oswald", "'Arial Narrow', sans-serif"),
    sheet: mono("IBM Plex Mono"),
    titleWeight: 700, titleTracking: "0em", chordTracking: "0.01em", radius: "0px", radiusBase: "0px",
    fonts: ["Oswald:wght@400;500;700", "Work+Sans:wght@400;500;600", "IBM+Plex+Mono:wght@400;500"],
  },
  {
    id: "radio", name: "Radio", dark: true,
    bg: "#2B1D14", ink: "#EFE3C8", muted: "#C2A784", rule: "#5A4331", accent: "#F2B33D",
    panel: "#1A110B", panelInk: "#EFE3C8", panelMuted: "#C2A784", panelRule: "#4A3527",
    display: sans("Barlow"), body: sans("Barlow"), label: sans("Barlow"),
    title: display("Poiret One", "ui-sans-serif, sans-serif"), sheet: mono("DM Mono"),
    titleWeight: 400, titleTracking: "0.02em", chordTracking: "0em", radius: "4px", radiusBase: "4px",
    fonts: ["Barlow:wght@400;500;600;700", "Poiret+One", "DM+Mono:wght@400"],
  },
  {
    id: "lead", name: "Lead Sheet", dark: false,
    bg: "#F4EEDF", ink: "#1E1C1A", muted: "#5F5A50", rule: "#1E1C1A", accent: "#B3261E",
    panel: "#2A2724", panelInk: "#F4EEDF", panelMuted: "#B7AF9F", panelRule: "#5A554C",
    display: mono("Courier Prime"), body: mono("Courier Prime"), label: mono("Courier Prime"),
    title: display("Special Elite", "'Courier New', monospace"), sheet: mono("Courier Prime"),
    titleWeight: 400, titleTracking: "0em", chordTracking: "0em", radius: "999px", radiusBase: "4px",
    fonts: ["Courier+Prime:wght@400;700", "Special+Elite"],
  },
];

export const DEFAULT_THEME = "swiss";
export const themeById = (id: string): ThemeDef => THEMES.find(t => t.id === id) ?? THEMES[0];

/** The Google Fonts stylesheet for one theme, and nothing else. */
export const fontHref = (t: ThemeDef) =>
  `https://fonts.googleapis.com/css2?${t.fonts.map(f => `family=${f}`).join("&")}&display=swap`;

/** Chord-function marker hues (B4). Adjusted per surface for contrast — see `apply.ts`. */
export const FUNCTION_HUES = { home: "#3A6FD1", lift: "#D7372B", pull: "#E0AE16" } as const;
