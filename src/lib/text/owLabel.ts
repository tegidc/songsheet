import { lookupSense } from "./senses";
import { FN_WORDS } from "../../data/words";

export function owLabel(seedWord: string | null | undefined, body: string): string {
  const seed = seedWord?.trim();
  if (seed) return seed;

  const words = body.match(/[a-zA-Z']+/g) ?? [];
  if (words.length === 0) return "";

  for (const w of words) {
    if (lookupSense(w.toLowerCase()) >= 0) return w;
  }
  for (const w of words) {
    if (!FN_WORDS.has(w.toLowerCase())) return w;
  }
  return words[0] ?? "";
}
