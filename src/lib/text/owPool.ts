import { OBJECT_WORDS, STOP_WORDS } from "../../data/words";

// Evocative two-word phrases — mixed in at ~15% rate
export const OW_TWO_WORD = [
  "rain on glass","moth wing","morning frost","iron gate","cracked mirror",
  "autumn leaf","river stone","candle stub","worn shoe","torn letter",
  "brass key","dried flower","copper coin","broken watch","empty bottle",
  "chalk dust","bread crust","ink stain","spider web","storm drain",
];

// Module-level pool cache — populated from Datamuse on first app load
export let owPoolCache: string[] = [];
export let owPoolReady = false;
export async function loadOWPool(): Promise<void> {
  if (owPoolReady) return;
  const topics = ["kitchen","garden","nature","clothing","tools","music","weather","body","furniture","light","forest","ocean","street","workshop","farm"];
  try {
    const results = await Promise.all(
      topics.map(t =>
        fetch(`https://api.datamuse.com/words?topics=${encodeURIComponent(t)}&md=p&max=100`)
          .then(r => r.json() as Promise<{ word: string; tags?: string[] }[]>)
      )
    );
    const nouns = new Set<string>(OBJECT_WORDS);
    results.flat().forEach(r => {
      if (r.tags?.includes("n") && r.word.length >= 3 && !STOP_WORDS.has(r.word) && !/\s/.test(r.word))
        nouns.add(r.word);
    });
    owPoolCache = [...nouns].sort(() => Math.random() - 0.5);
    owPoolReady = true;
  } catch {
    owPoolCache = [...OBJECT_WORDS].sort(() => Math.random() - 0.5);
    owPoolReady = true;
  }
}
export function pickOWWord(): string {
  if (Math.random() < 0.15) return OW_TWO_WORD[Math.floor(Math.random() * OW_TWO_WORD.length)];
  const pool = owPoolReady && owPoolCache.length > 0 ? owPoolCache : OBJECT_WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}
