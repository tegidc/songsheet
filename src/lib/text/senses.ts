import { SENSES, ALL_SENSE_WORDS } from "../../data/senses";
import { STOP_WORDS } from "../../data/words";

export function stemWord(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed"))  return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ly"))  return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("er"))  return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s"))   return w.slice(0, -1);
  return w;
}
export function lookupSense(clean: string): number {
  for (let i = 0; i < SENSES.length; i++) {
    if (SENSES[i].words.includes(clean) || SENSES[i].words.includes(stemWord(clean)))
      return i;
  }
  return -1;
}
export function scanText(text: string): { token: string; senseIdx: number | null }[] {
  if (!text.trim()) return [];
  return text.split(/(\s+)/).map(token => {
    const clean = token.toLowerCase().replace(/[^a-z]/g, "");
    const idx = lookupSense(clean);
    return { token, senseIdx: idx >= 0 ? idx : null };
  });
}
export function extractDetailWord(allText: string): string | null {
  const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  const candidates = words.filter(w =>
    !STOP_WORDS.has(w) && !ALL_SENSE_WORDS.has(w) && !ALL_SENSE_WORDS.has(stemWord(w))
  );
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
export function getDrillWords(scan: ReturnType<typeof scanText>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of scan) {
    if (t.senseIdx !== null) continue;
    const w = t.token.toLowerCase().replace(/[^a-z]/g, "");
    if (w.length < 3 || STOP_WORDS.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length === 3) break;
  }
  return out;
}
