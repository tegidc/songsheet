import { FUNCTION_HUES, fontHref, themeById, type ThemeDef } from "./themes";

/**
 * Theme → CSS custom properties on :root.
 *
 * Two layers of variables come out of one theme:
 *
 *  1. The theme's own tokens, named for what they are (`--ink`, `--rule`,
 *     `--panel`, `--font-display`…), used by the Swiss layout directly.
 *  2. The shadcn/Tailwind variables the rest of the app was already written
 *     against (`--background`, `--foreground`, `--muted-foreground`,
 *     `--border`, `--accent`…). Mapping these is what makes every existing
 *     `bg-background` / `text-foreground` / `border-border` class follow the
 *     theme without that component being touched.
 *
 * Contrast is enforced here rather than trusted: `--accent-text` is the accent
 * darkened (or lightened) until it reads at 4.5:1 as text on the page, and the
 * chord-function marker colours are nudged to 3:1 (the graphics threshold) on
 * both the page and the panel. Hue is kept; only lightness moves.
 */

// ── Colour maths ───────────────────────────────────────────────────────────
const hexToRgb = (h: string) => {
  const s = h.replace("#", "");
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
};
const rgbToHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const lum = (h: string) => {
  const [r, g, b] = hexToRgb(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h: number, s: number, l: number) {
  if (s === 0) return rgbToHex(l, l, l);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex(f(h + 1 / 3), f(h), f(h - 1 / 3));
}
/** `color`, with only its lightness moved, until it reaches `ratio` against `surface`. */
export function ensureContrast(color: string, surface: string, ratio: number): string {
  if (contrast(color, surface) >= ratio) return color.toUpperCase();
  const [h, s, l0] = rgbToHsl(...hexToRgb(color));
  const darken = lum(surface) > 0.18;
  for (let i = 1; i <= 100; i++) {
    const l = darken ? l0 - i * 0.01 : l0 + i * 0.01;
    if (l < 0 || l > 1) break;
    const c = hslToHex(h, s, l);
    if (contrast(c, surface) >= ratio) return c;
  }
  return darken ? "#000000" : "#FFFFFF";
}

// Section-type tints, as hues mixed into the page colour, so they sit right on
// a dark page as well as a light one. (Formerly fixed pastel hexes.)
const SECTION_HUES: Record<string, string> = {
  intro: "#8C7B66", verse: "#5E8A6A", "pre-chorus": "#9A6A68", chorus: "#C9A55A",
  bridge: "#6E6AA0", hook: "#9A9A5A", outro: "#6A7F90", custom: "#7A7570",
};

export function themeVars(t: ThemeDef): Record<string, string> {
  const mix = (pct: number, a = t.ink, b = t.bg) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const accentText = ensureContrast(t.accent, t.bg, 4.5);
  const ruleSoft = t.dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)";
  const fn = (hue: string) => ({
    page: ensureContrast(hue, t.bg, 3),
    panel: ensureContrast(hue, t.panel, 3),
  });
  const home = fn(FUNCTION_HUES.home), lift = fn(FUNCTION_HUES.lift), pull = fn(FUNCTION_HUES.pull);
  const vars: Record<string, string> = {
    // Theme tokens
    "--bg": t.bg, "--ink": t.ink, "--muted-ink": t.muted,
    "--rule": t.rule, "--rule-soft": ruleSoft,
    "--accent-fill": t.accent, "--accent-text": accentText,
    "--panel": t.panel, "--panel-ink": t.panelInk, "--panel-muted": t.panelMuted, "--panel-rule": t.panelRule,
    "--font-display": t.display, "--font-body": t.body, "--font-label": t.label,
    "--font-title": t.title, "--font-sheet": t.sheet,
    "--title-weight": String(t.titleWeight), "--title-tracking": t.titleTracking,
    "--chord-tracking": t.chordTracking, "--radius-selector": t.radius,
    "--fn-home": home.page, "--fn-lift": lift.page, "--fn-pull": pull.page,
    "--fn-home-panel": home.panel, "--fn-lift-panel": lift.panel, "--fn-pull-panel": pull.panel,
    // shadcn / Tailwind layer
    "--background": t.bg, "--foreground": t.ink,
    "--card": mix(4), "--card-foreground": t.ink,
    "--popover": t.bg, "--popover-foreground": t.ink,
    "--primary": t.ink, "--primary-foreground": t.bg,
    "--secondary": mix(7), "--secondary-foreground": t.ink,
    "--muted": mix(9), "--muted-foreground": t.muted,
    "--accent": accentText, "--accent-foreground": t.bg,
    "--destructive": ensureContrast(t.dark ? "#E0705F" : "#A3291C", t.bg, 4.5), "--destructive-foreground": t.bg,
    "--border": ruleSoft,
    "--input-background": mix(5), "--switch-background": mix(28),
    "--ring": mix(35, t.ink, "transparent"),
    "--radius": `calc(${t.radiusBase} + 4px)`,
  };
  for (const [type, hue] of Object.entries(SECTION_HUES)) {
    vars[`--sec-${type}`] = mix(t.dark ? 22 : 18, hue);
  }
  return vars;
}

const VAR_CACHE_KEY = "songsheet-theme-vars";

/**
 * Apply a theme: variables on :root, the colour scheme, the browser/status-bar
 * colour, and that theme's fonts — swapping the one stylesheet link so only the
 * active theme's families are ever requested.
 *
 * The resolved variables are cached so `index.html`'s boot script can paint the
 * right theme before React loads (no flash of Swiss on a Radio phone).
 */
export function applyTheme(id: string) {
  const t = themeById(id);
  const root = document.documentElement;
  const vars = themeVars(t);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = t.id;
  root.style.colorScheme = t.dark ? "dark" : "light";

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
  meta.content = t.bg;

  const href = fontHref(t);
  let link = document.getElementById("theme-fonts") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "theme-fonts"; link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;

  try {
    localStorage.setItem(VAR_CACHE_KEY, JSON.stringify({
      id: t.id, dark: t.dark, bg: t.bg, href, vars,
    }));
  } catch { /* private mode */ }
}
