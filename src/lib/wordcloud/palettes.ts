// Palette and typography options for the Word Cloud canvas — self-contained to
// this feature. The app has no app-wide theme system to hook into (a single
// fixed light palette in styles/theme.css, plus an unused .dark class), so
// these are a new, small set of options scoped to this view only.

export interface WordCloudPalette {
  bg: string;
  ink: string;
  mist: string;
  accent: string;
  line: string;
}

export const PALETTES: Record<string, WordCloudPalette> = {
  "Earthy Sand":   { bg: "#F4F1EA", ink: "#2B2A27", mist: "rgba(140,120,95,0.5)",   accent: "#B08968", line: "rgba(43,42,39,0.16)" },
  "Slate Minimal": { bg: "#121214", ink: "#F5F5F7", mist: "rgba(180,180,190,0.55)", accent: "#9AA0AA", line: "rgba(245,245,247,0.18)" },
  "Nordic Mist":   { bg: "#2E3440", ink: "#ECEFF4", mist: "rgba(180,196,214,0.55)", accent: "#88C0D0", line: "rgba(236,239,244,0.18)" },
  "OLED Cosmic":   { bg: "#000000", ink: "#FFFFFF", mist: "rgba(140,120,220,0.5)",  accent: "#7C6FE0", line: "rgba(255,255,255,0.14)" },
  "Deep Blue":     { bg: "#0A1C33", ink: "#FFFFFF", mist: "rgba(186,212,244,0.55)", accent: "#7FB2FF", line: "rgba(255,255,255,0.16)" },
};

export const DEFAULT_PALETTE = "Earthy Sand";

export const FONT_STACKS: Record<string, string> = {
  "Editorial Serif":  "Georgia, 'Times New Roman', serif",
  "Clean Sans-Serif":  "system-ui, -apple-system, 'Helvetica Neue', sans-serif",
  "Technical Mono":    "ui-monospace, 'SF Mono', 'Courier New', monospace",
};

export const DEFAULT_TYPOGRAPHY = "Editorial Serif";

export function isDarkBg(hex: string): boolean {
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Hex readings of the same 8 sense categories `src/data/senses.ts` already
 * defines (amber/blue/emerald/rose/purple/orange/teal/violet), in the same
 * order — `tint` is the Tailwind *-100 pastel (matches the editor's highlight
 * mark), `dot` is the *-800 deep reading of the same hue. Canvas fillStyle
 * needs raw colour, not Tailwind classes, so these mirror `SENSES[i].tw`/`.mark`
 * rather than replacing them — the editor keeps using its own Tailwind classes.
 */
export const SENSE_HEX: { tint: string; dot: string }[] = [
  { tint: "#FEF3C7", dot: "#92400E" }, // Sight    — amber
  { tint: "#DBEAFE", dot: "#1E40AF" }, // Sound    — blue
  { tint: "#D1FAE5", dot: "#065F46" }, // Smell    — emerald
  { tint: "#FFE4E6", dot: "#9F1239" }, // Taste    — rose
  { tint: "#F3E8FF", dot: "#6B21A8" }, // Touch    — purple
  { tint: "#FFEDD5", dot: "#9A3412" }, // Organic  — orange
  { tint: "#CCFBF1", dot: "#115E59" }, // Kinesthetic — teal
  { tint: "#EDE9FE", dot: "#5B21B6" }, // Verbs    — violet
];

/** On a dark ground the editor's pastel reads well; on a pale one it washes out. */
export function senseColour(senseIdx: number, palette: WordCloudPalette): string {
  const hex = SENSE_HEX[senseIdx];
  if (!hex) return palette.mist;
  return isDarkBg(palette.bg) ? hex.tint : hex.dot;
}
