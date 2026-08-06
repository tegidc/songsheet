import { useState, useRef, useCallback, useEffect, useMemo, type RefObject } from "react";
import { Plus, Trash2, Music, Music2, AlertCircle, Copy, ChevronDown,
  X, FolderOpen, ChevronUp, LogIn, Repeat2, ClipboardPaste, RefreshCw, Minus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useIsMobile } from "./components/ui/use-mobile";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "./components/ui/drawer";

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType = "verse"|"chorus"|"bridge"|"pre-chorus"|"outro"|"intro"|"hook"|"custom";
type Tab = "lyrics"|"chords"|"notes"|"final";

interface CP { id: string; lineIdx: number; charIdx: number; chord: string }
interface Section {
  id: string; type: SectionType; label: string; shortLabel: string;
  chordBars: string[]; chordPositions: CP[]; lyrics: string; notes: string;
}
interface OWEntry { id: string; text: string; seedWord?: string; savedAt?: string; }
interface NbEntry { id: string; title: string; text: string; savedAt: string; }
interface AudioNote {
  id: string; label: string; storagePath: string; url: string;
  duration: number; createdAt: string;
}
interface Song {
  title: string; artist: string; key: string;
  tempo: string; timeSignature: string; feel: string;
  sections: Section[]; generalNotes: string;
  productionNotes: string;
  bigIdea: string;
  story: { beginning: string; middle: string; end: string };
  objectWritings: OWEntry[];
  notebookSections?: NbEntry[];
  audioNotes?: AudioNote[];
  sectionNaming: Partial<Record<SectionType, "number" | "letter">>;
}
type ProjectStatus = "working" | "finished" | "archived";
interface Project { id: string; name: string; updated_at: string; status: ProjectStatus }
interface StandaloneOW { id: string; seed_word: string; body: string; written_at: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const SDEFS = [
  { v: "intro"      as SectionType, l: "Intro",      s: "Intro",  k: "i" },
  { v: "verse"      as SectionType, l: "Verse",      s: "Verse",  k: "v" },
  { v: "pre-chorus" as SectionType, l: "Pre-Chorus", s: "Pre.",   k: "p" },
  { v: "chorus"     as SectionType, l: "Chorus",     s: "Chorus", k: "c" },
  { v: "bridge"     as SectionType, l: "Bridge",     s: "Bridge", k: "b" },
  { v: "hook"       as SectionType, l: "Hook",       s: "Hook",   k: "h" },
  { v: "outro"      as SectionType, l: "Outro",      s: "Outro",  k: "o" },
  { v: "custom"     as SectionType, l: "Custom",     s: "§",      k: "x" },
];
const SCOL: Record<SectionType, string> = {
  intro: "bg-[#D8D2C8]", verse: "bg-[#CDD4CE]", "pre-chorus": "bg-[#D4CECD]",
  chorus: "bg-[#D4C4A4]/60", bridge: "bg-[#CCCAD8]", hook: "bg-[#D4D2C4]",
  outro: "bg-[#CACDD0]", custom: "bg-[#DDD7CE]",
};
const KEYS  = ["C","C#","Db","D","D#","Eb","E","F","F#","Gb","G","G#","Ab","A","A#","Bb","B"];
const MODES = ["major","minor","dorian","mixolydian","phrygian","lydian","other"];
const TSIGS = ["4/4","3/4","6/8","5/4","7/8","12/8"];
const CW = 64, CH = 40, FS = 12;
const MONO = "'DM Mono', monospace";
const SANS = "'DM Sans', sans-serif";
const SERIF = "'Lora', serif";

// Editorial-only bar sentinels — stripped before any chord/key analysis
const PHRASE_MARKER = "|";   // visible phrase-boundary glyph │
const ROW_BREAK     = "\n";  // invisible line-wrap within a section
const isEditorialBar = (b: string) => b === PHRASE_MARKER || b === ROW_BREAK;

// ─── Object Writing ───────────────────────────────────────────────────────────

const TIMER_OPTS = [60, 120, 300, 600]; // 1, 2, 5, 10 min

// Single-word concrete nouns — fallback when network unavailable
const OBJECT_WORDS = [
  "candle","kettle","brick","mirror","needle","rope","lantern","button",
  "bottle","feather","ribbon","blade","comb","thimble","latch","hinge",
  "cobweb","ember","pebble","thorn","splinter","rust","bark","moss",
  "ash","chalk","thread","wire","coin","nail","hook","staple","clasp",
  "stamp","lens","wick","flint","wax","spool","latch","wedge","peg",
  "shingle","tile","plank","slate","mortar","beam","rafter","post",
  "knob","hinge","bolt","rivet","clasp","buckle","brooch","bead",
  "acorn","cone","seed","husk","shell","hull","pod","stem","root",
  "twig","bough","bark","sap","resin","pollen","spore","lichen",
  "fog","frost","dew","hail","sleet","gust","draught","soot","smoke",
  "wool","linen","tweed","felt","velvet","burlap","gauze","lace",
  "drum","string","reed","fret","bow","bell","chime","mallet","pick",
  "ladle","tong","whisk","grater","pestle","cleaver","skillet","mug",
  "drawer","shelf","rung","sill","ledge","lintel","eave","gutter",
  "stamp","ticket","receipt","envelope","label","tag","seal","wax",
];

// Evocative two-word phrases — mixed in at ~15% rate
const OW_TWO_WORD = [
  "rain on glass","moth wing","morning frost","iron gate","cracked mirror",
  "autumn leaf","river stone","candle stub","worn shoe","torn letter",
  "brass key","dried flower","copper coin","broken watch","empty bottle",
  "chalk dust","bread crust","ink stain","spider web","storm drain",
];

// Module-level pool cache — populated from Datamuse on first app load
let owPoolCache: string[] = [];
let owPoolReady = false;

async function loadOWPool(): Promise<void> {
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

function pickOWWord(): string {
  if (Math.random() < 0.15) return OW_TWO_WORD[Math.floor(Math.random() * OW_TWO_WORD.length)];
  const pool = owPoolReady && owPoolCache.length > 0 ? owPoolCache : OBJECT_WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","as","is","was","are","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "not","it","its","this","that","these","those","i","you","he","she","we",
  "they","me","him","her","us","them","my","your","his","our","their",
  "what","which","who","when","where","how","if","then","there","here",
  "just","some","any","all","no","up","out","more","also","so","than",
  "into","about","over","after","before","very","too","can","now","get",
  "got","go","went","come","came","one","two","three","time","like","know",
]);

const SENSES = [
  {
    label: "Sight",
    tw: "bg-amber-100 text-amber-800",
    mark: "bg-amber-200",
    words: ["see","look","glow","dark","bright","flash","shimmer","shine","shadow","blur","color","colour","light","haze","glare","flicker","gleam","pale","vivid","dim","sparkle","dazzle","reflect","silhouette","transparent","visible","glint","loom","watch","stare","gaze","peer","glimpse","spy","observe","notice","appear","fade","blaze","beam","ray","shade","tint","hue"],
  },
  {
    label: "Sound",
    tw: "bg-blue-100 text-blue-800",
    mark: "bg-blue-200",
    words: ["hear","ring","echo","hum","whisper","creak","crash","bang","murmur","roar","silence","quiet","loud","hiss","buzz","clatter","thud","snap","rumble","groan","screech","drone","muffled","resonate","vibrate","tick","clang","rustle","howl","shriek","rattle","clap","knock","tap","ping","pop","crack","squeak","chirp","hum","toll","chime"],
  },
  {
    label: "Smell",
    tw: "bg-emerald-100 text-emerald-800",
    mark: "bg-emerald-200",
    words: ["smell","scent","aroma","odor","odour","stale","fresh","musty","damp","sweet","sour","bitter","pungent","fragrance","reek","waft","acrid","smoky","earthy","rotten","perfume","incense","mildew","pine","petrichor","decay","tang","reek","whiff","stench","sniff","inhale","exhale"],
  },
  {
    label: "Taste",
    tw: "bg-rose-100 text-rose-800",
    mark: "bg-rose-200",
    words: ["taste","sweet","bitter","salty","sour","savory","savoury","flavor","flavour","bland","rich","sharp","tangy","metallic","syrup","acid","dry","smooth","thick","thin","watery","chewy","crisp","raw","ripe","burnt","sugar","salt","spice","zest","mellow","tart","chalky","oily","creamy"],
  },
  {
    label: "Touch",
    tw: "bg-purple-100 text-purple-800",
    mark: "bg-purple-200",
    words: ["touch","soft","rough","smooth","warm","cold","hard","sharp","dull","slick","sticky","wet","dry","brittle","tender","pressure","grip","scratch","scrape","brush","stroke","rub","press","pinch","squeeze","grab","texture","surface","coarse","silky","gritty","numb","tingle","sting","prick","abrasive","bristle","fuzzy","velvety","jagged","slippery"],
  },
  {
    label: "Organic",
    tw: "bg-orange-100 text-orange-800",
    mark: "bg-orange-200",
    words: ["breath","breathe","pulse","sweat","blood","heartbeat","heart","bone","skin","muscle","hunger","thirst","nausea","dizzy","ache","pain","tire","exhaust","shiver","tremble","flush","beat","lung","throat","stomach","gut","nerve","body","flesh","vein","artery","blink","swallow","choke","gasp","cough","sigh","yawn","sneeze","cry"],
  },
  {
    label: "Kinesthetic",
    tw: "bg-teal-100 text-teal-800",
    mark: "bg-teal-200",
    words: ["move","walk","run","step","sway","drift","turn","spin","slide","glide","rush","crawl","float","fall","rise","sink","leap","jump","stagger","stumble","lurch","march","pace","wander","stand","sit","kneel","crouch","lean","balance","hover","hang","bend","curl","heavy","light","weightless","weight","gravity","press","lift","drop","carry","drag","haul","momentum","tension","pull","push","stretch","reach","resist"],
  },
  {
    label: "Verbs",
    tw: "bg-violet-100 text-violet-800",
    mark: "bg-violet-200",
    words: ["break","build","burn","catch","change","choose","come","cut","dig","draw","drink","drive","eat","feel","fight","find","fly","forget","give","go","grow","hold","keep","know","leave","let","lose","make","mean","meet","pay","put","read","say","see","sell","send","show","sit","speak","spend","stand","take","teach","tell","think","throw","understand","wear","win","write","allow","become","begin","believe","bring","call","carry","cause","consider","continue","create","decide","describe","develop","die","end","exist","explain","fail","follow","form","happen","help","include","kill","learn","lead","live","mean","move","need","offer","open","play","provide","reach","remain","remember","return","seem","serve","stay","stop","suggest","support","turn","use","wait","want","work"],
  },
];

// Basic suffix stripping for more natural word matching
function stemWord(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed"))  return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ly"))  return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("er"))  return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s"))   return w.slice(0, -1);
  return w;
}

const ALL_SENSE_WORDS = new Set(SENSES.flatMap(s => s.words));

function lookupSense(clean: string): number {
  for (let i = 0; i < SENSES.length; i++) {
    if (SENSES[i].words.includes(clean) || SENSES[i].words.includes(stemWord(clean)))
      return i;
  }
  return -1;
}

function scanText(text: string): { token: string; senseIdx: number | null }[] {
  if (!text.trim()) return [];
  return text.split(/(\s+)/).map(token => {
    const clean = token.toLowerCase().replace(/[^a-z]/g, "");
    const idx = lookupSense(clean);
    return { token, senseIdx: idx >= 0 ? idx : null };
  });
}

function extractDetailWord(allText: string): string | null {
  const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  const candidates = words.filter(w =>
    !STOP_WORDS.has(w) && !ALL_SENSE_WORDS.has(w) && !ALL_SENSE_WORDS.has(stemWord(w))
  );
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getDrillWords(scan: ReturnType<typeof scanText>): string[] {
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

// ─── Inspiration Utilities ────────────────────────────────────────────────────

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (w.length > 3 && w.endsWith("e") && !/[aeiouy]{2}e$/.test(w)) n = Math.max(1, n - 1);
  return Math.max(1, n);
}

const FN_WORDS = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","as","is","was","are","it","i","my","your","her","his","our","their","me","him","us","them","be","do","not","so","if","up","out","no"]);

function getStressPattern(word: string): boolean[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const syls = countSyllables(w);
  if (syls === 1) return [!FN_WORDS.has(w)];
  return Array.from({ length: syls }, (_, i) => i % 2 === 0);
}

const SECTION_IGNORE_WORDS = new Set([
  "verse","chorus","bridge","intro","outro","hook","section","pre",
  "song","music","lyric","lyrics","chord","chords","note","notes",
  "beginning","middle","object","writing","production","notebook",
]);

function extractWordCloud(text: string, n = 22): { word: string; size: 1|2|3 }[] {
  const freq = new Map<string, number>();
  (text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).forEach(w => {
    if (!STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  });
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  if (!sorted.length) return [];
  const max = sorted[0][1];
  return sorted.map(([word, count]) => {
    const ratio = count / max;
    const size: 1|2|3 = ratio > 0.6 ? 3 : ratio > 0.3 ? 2 : 1;
    return { word, size };
  });
}

function extractSensoryFragments(text: string, n = 3): string[] {
  const clauses = text.split(/[.!?,]\s+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 4);
  const sensory = clauses.filter(c =>
    c.toLowerCase().split(/\s+/).some(w => lookupSense(w.replace(/[^a-z]/g, "")) >= 0)
  );
  const pool = sensory.length >= n ? sensory : [...sensory, ...clauses.filter(c => !sensory.includes(c))];
  // Deterministic shuffle via seeded index not available; use array slice with spread
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ─── Fragment & Skeleton Utilities ───────────────────────────────────────────

// Pick a random group of 1–3 items (single words + short phrases) from source text.
// Deliberately avoids frequency ranking — selection is genuinely random each call.
function pickFragmentGroup(allText: string): string[] {
  if (!allText.trim()) return [];

  // De-duplicated meaningful words (4+ chars, no stop words)
  const wordPool = [...new Set(
    (allText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])
      .filter(w => !STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w))
  )];

  // Short phrases: 2–3 word runs where at least one word is a content word
  const phrasePool: string[] = [];
  const sentences = allText
    .replace(/[\r\n]+/g, ". ")
    .split(/[.!?,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  sentences.forEach(sent => {
    const tokens = sent.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    for (let i = 0; i < tokens.length; i++) {
      for (const len of [2, 3]) {
        if (i + len > tokens.length) break;
        const chunk = tokens.slice(i, i + len);
        const clean = chunk.map(t => t.toLowerCase().replace(/[^a-z]/g, "")).filter(Boolean);
        const hasContent = clean.some(w => !STOP_WORDS.has(w) && w.length >= 4);
        if (hasContent) {
          const phrase = chunk.join(" ").replace(/[^a-zA-Z\s'-]/g, "").trim();
          if (phrase.length >= 4) phrasePool.push(phrase);
        }
      }
    }
  });

  const combined = [...wordPool, ...phrasePool].filter(Boolean);
  if (!combined.length) return [];

  // Fisher-Yates partial pick: 1, 2, or 3 items
  const count = 1 + Math.floor(Math.random() * 3);
  const pool = [...combined];
  const selected: string[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const j = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(j, 1)[0]);
  }
  return selected;
}

// Build fill-in-the-blanks skeleton verse based on a template section's shape.
// Mostly blank slots (———) with a handful of sensory anchor words from source text.
function buildSkeletonLyrics(templateSection: Section | null, sourceText: string): string {
  const templateLines = templateSection
    ? (templateSection.lyrics ?? "").split("\n").filter(l => l.trim())
    : [];
  const lineCount = templateLines.length > 0 ? Math.min(templateLines.length, 8) : 4;
  const sylPerLine = templateLines.length > 0
    ? templateLines.map(l => Math.max(3, lineSyllableCount(l)))
    : Array(lineCount).fill(8);

  const sourceWords = [...new Set(
    (sourceText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])
      .filter(w => !STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w))
  )].sort(() => Math.random() - 0.5);

  let wIdx = 0;
  const nextWord = () => sourceWords.length > 0 ? sourceWords[wIdx++ % sourceWords.length] : null;
  const blanks   = (n: number) => Array(Math.max(1, n)).fill("———").join(" ");

  return Array.from({ length: lineCount }, (_, i) => {
    const syls  = sylPerLine[i] ?? 8;
    const slots = Math.max(3, Math.round(syls / 1.7));
    const r     = Math.random();

    if (r < 0.25 || sourceWords.length === 0) {
      return blanks(slots);
    } else if (r < 0.72) {
      const anchor = nextWord();
      if (!anchor) return blanks(slots);
      const before = Math.floor(Math.random() * (slots - 1));
      const after  = slots - 1 - before;
      const parts: string[] = [];
      if (before > 0) parts.push(blanks(before));
      parts.push(anchor);
      if (after  > 0) parts.push(blanks(after));
      return parts.join(" ");
    } else {
      const a1 = nextWord(); const a2 = nextWord();
      if (!a1 || !a2) return blanks(slots);
      return [a1, blanks(Math.max(1, slots - 2)), a2].join(" ");
    }
  }).join("\n");
}

function analyzeStress(sections: { label: string; type: string; lyrics: string }[]): {
  label: string; colorClass: string;
  lines: { text: string; words: { raw: string; stresses: boolean[] }[] }[];
}[] {
  return sections
    .filter(s => (s.lyrics ?? "").trim())
    .map(s => ({
      label: s.label ?? s.type,
      colorClass: SCOL[s.type as SectionType] ?? "bg-muted",
      lines: s.lyrics.split("\n").filter(l => l.trim()).map(line => ({
        text: line,
        words: line.split(/\s+/).filter(Boolean).map(raw => ({
          raw, stresses: getStressPattern(raw),
        })),
      })),
    }));
}

interface FillWord { text: string; isPlaceholder: boolean }

function lineSyllableCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + countSyllables(w), 0);
}

function detectRhymeScheme(lines: string[]): { scheme: string; lastWords: string[] } {
  const nonEmpty = lines.filter(l => l.trim());
  const lastWords = nonEmpty.map(l => {
    const w = l.trim().split(/\s+/).pop() ?? "";
    return w.toLowerCase().replace(/[^a-z]/g, "");
  });
  const groups = new Map<string, string>();
  let idx = 0;
  const letters = lastWords.map(w => {
    const key = w.slice(-3);
    if (!groups.has(key)) groups.set(key, String.fromCharCode(65 + idx++));
    return groups.get(key)!;
  });
  return { scheme: letters.join(""), lastWords };
}

function findRhymingWords(lastWords: string[], sourceText: string, n = 8): string[] {
  const candidates = (sourceText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [])
    .filter(w => !STOP_WORDS.has(w));
  const targetEndings = [...new Set(lastWords.map(w => w.slice(-3)))];
  const results: string[] = [];
  for (const w of candidates) {
    const ending = w.slice(-3);
    if (targetEndings.includes(ending) && !lastWords.includes(w) && !results.includes(w)) {
      results.push(w);
      if (results.length >= n) break;
    }
  }
  return results;
}

function buildFill(
  lines: { words: { raw: string; stresses: boolean[] }[] }[]
): FillWord[][] {
  return lines.map(line =>
    line.words.map(({ raw, stresses }) => {
      if (Math.random() < 0.38) return { text: raw, isPlaceholder: false };
      // Replace with stress-matched syllable sounds
      return { text: stresses.map(s => s ? "da" : "ba").join(" "), isPlaceholder: true };
    })
  );
}

// ─── Section Renaming ─────────────────────────────────────────────────────────

function isAutoLabel(label: string, type: SectionType): boolean {
  const def = SDEFS.find(d => d.v === type);
  if (!def) return false;
  return label === def.l || (label.startsWith(def.l) && /\s+(\d+|[A-Z])$/.test(label));
}

function renumberSections(
  sections: Section[],
  naming: Partial<Record<SectionType, "number" | "letter">>
): Section[] {
  const typeCounts = new Map<SectionType, number>();
  sections.forEach(s => typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1));
  const typeIdx = new Map<SectionType, number>();
  return sections.map(s => {
    const idx = (typeIdx.get(s.type) ?? 0) + 1;
    typeIdx.set(s.type, idx);
    if (!isAutoLabel(s.label, s.type)) return s;
    const def = SDEFS.find(d => d.v === s.type)!;
    const total = typeCounts.get(s.type)!;
    const style = naming[s.type] ?? "number";
    const suffix = style === "letter"
      ? ` ${String.fromCharCode(64 + idx)}`
      : ` ${idx}`;
    return { ...s, label: `${def.l}${suffix}`, shortLabel: `${def.s}${suffix}` };
  });
}

// ─── Chord Analysis ───────────────────────────────────────────────────────────

const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT: Record<string,string> = {Db:"C#",Eb:"D#",Fb:"E",Gb:"F#",Ab:"G#",Bb:"A#",Cb:"B"};
const normNote = (n: string) => FLAT[n] ?? n;

function parseKeyString(k: string): { root: string; mode: "major"|"minor" } {
  const minor = k.endsWith("m");
  const root = normNote(minor ? k.slice(0, -1) : k);
  return { root: NOTES.includes(root) ? root : "C", mode: minor ? "minor" : "major" };
}

function formatDetectedKey(root: string, mode: "major"|"minor") {
  return mode === "minor" ? `${root}m` : root;
}

function defaultProjectName(title: string): string {
  const now = new Date();
  const date = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return title.trim() ? `${date} · ${title.trim()}` : date;
}

function toNashville(chord: string, key: string): string {
  if (!key.trim() || !chord.trim()) return chord;
  const { root: keyRoot, mode: keyMode } = parseKeyString(key);
  const p = parseChord(chord);
  if (!p) return chord;
  const ri = NOTES.indexOf(keyRoot);
  const ci = NOTES.indexOf(p.root);
  if (ri === -1 || ci === -1) return chord;
  const interval = (ci - ri + 12) % 12;
  const steps = keyMode === "major" ? MAJ_ST : MIN_ST;
  const degIdx = steps.indexOf(interval);
  if (degIdx === -1) return chord;
  const qual = p.q === "min" ? "-" : p.q === "dim" ? "°" : p.q === "aug" ? "+" : "";
  return `${degIdx + 1}${qual}`;
}

function getParallelChords(root: string, mode: "major"|"minor"): string[] {
  const parallel = mode === "major" ? "minor" : "major";
  return getDiatonic(root, parallel).map(d => `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : "°"}`);
}

function getSecondaryDominant(chord: string): string | null {
  // V of chord = major chord a perfect 5th above chord root
  const p = parseChord(chord);
  if (!p) return null;
  const ri = NOTES.indexOf(p.root);
  if (ri === -1) return null;
  const domRoot = NOTES[(ri + 7) % 12]; // perfect 5th above
  return `${domRoot}7`;
}

function getTritoneSubstitution(chord: string): string | null {
  const p = parseChord(chord);
  if (!p) return null;
  const ri = NOTES.indexOf(p.root);
  if (ri === -1) return null;
  const triRoot = NOTES[(ri + 6) % 12]; // tritone = 6 semitones
  return `${triRoot}7`;
}

function parseChord(s: string): { root: string; q: "maj"|"min"|"dim"|"aug" } | null {
  if (!s.trim()) return null;
  const m = s.trim().replace(/\/.*$/, "").match(/^([A-G][#b]?)(m(?!aj)|dim|aug)?/i);
  if (!m) return null;
  const root = normNote(m[1][0].toUpperCase() + m[1].slice(1));
  if (!NOTES.includes(root)) return null;
  const q = (m[2] ?? "").toLowerCase();
  return { root, q: q === "m" ? "min" : q === "dim" ? "dim" : q === "aug" ? "aug" : "maj" };
}

const MAJ_ST = [0,2,4,5,7,9,11], MIN_ST = [0,2,3,5,7,8,10];
const MAJ_Q  = ["maj","min","min","maj","maj","min","dim"];
const MIN_Q  = ["min","dim","maj","min","min","maj","maj"];

function getDiatonic(root: string, mode: "major"|"minor") {
  const ri = NOTES.indexOf(root);
  if (ri === -1) return [];
  const steps = mode === "major" ? MAJ_ST : MIN_ST;
  const quals = mode === "major" ? MAJ_Q : MIN_Q;
  return steps.map((s, i) => ({ root: NOTES[(ri + s) % 12], q: quals[i] }));
}

function detectKey(chords: string[]): { key: string; mode: "major"|"minor"; confidence: number } | null {
  const parsed = chords.map(parseChord).filter(Boolean) as NonNullable<ReturnType<typeof parseChord>>[];
  if (!parsed.length) return null;
  let best = { key: "C", mode: "major" as "major"|"minor", score: 0 };
  for (const root of NOTES)
    for (const mode of ["major", "minor"] as const) {
      const dc = getDiatonic(root, mode);
      const score = parsed.reduce((s, p) =>
        s + (dc.some(d => d.root === p.root && d.q === p.q) ? 2 : dc.some(d => d.root === p.root) ? 1 : 0), 0);
      if (score > best.score) best = { key: root, mode, score };
    }
  const confidence = best.score / (parsed.length * 2);
  return confidence >= 0.3 ? { ...best, confidence } : null;
}

function inKey(chord: string, key: string, mode: "major"|"minor") {
  const p = parseChord(chord);
  if (!p) return true;
  return getDiatonic(key, mode).some(d => d.root === p.root && d.q === p.q);
}

// ─── Chord Picker Suggestions (mobile input tool) ──────────────────────────────

const ROMAN = ["I","II","III","IV","V","VI","VII"];

function chordToken(root: string, q: "maj"|"min"|"dim"|"aug"): string {
  return `${root}${q === "maj" ? "" : q === "min" ? "m" : q === "dim" ? "°" : "+"}`;
}

// Roman-numeral label for a diatonic degree — case reflects quality
function degreeLabel(degIdx: number, q: "maj"|"min"|"dim"|"aug"): string {
  const r = ROMAN[degIdx] ?? "";
  if (q === "min") return r.toLowerCase();
  if (q === "dim") return r.toLowerCase() + "°";
  if (q === "aug") return r + "+";
  return r;
}

interface ChordSuggestion { chord: string; label: string }

// Build categorised chord suggestions for the picker, given the detected key
// and the chords already used in the song.
function buildChordSuggestions(
  detected: { key: string; mode: "major"|"minor" } | null,
  usedChords: string[],
): { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] } {
  const seen = new Set<string>();
  const norm = (c: string) => { const p = parseChord(c); return p ? chordToken(p.root, p.q) : c.trim(); };

  // In-key diatonic chords with roman labels
  const inKey: ChordSuggestion[] = detected
    ? getDiatonic(detected.key, detected.mode).map((d, i) => {
        const chord = chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug");
        seen.add(chord);
        return { chord, label: degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug") };
      })
    : NOTES.map(r => ({ chord: r, label: "" }));
  if (!detected) NOTES.forEach(r => seen.add(r));

  // Chords already used in the song (unique, excluding ones already in-key)
  const usedSeen = new Set<string>();
  const used: ChordSuggestion[] = [];
  for (const c of usedChords) {
    const n = norm(c);
    if (!n || usedSeen.has(n)) continue;
    usedSeen.add(n);
    if (!seen.has(n)) used.push({ chord: n, label: detected ? (inKey.some(k => k.chord === n) ? "" : "•") : "" });
  }

  // "More colour" — secondary dominants of diatonic degrees + borrowed from parallel
  const colour: ChordSuggestion[] = [];
  const push = (chord: string | null, label: string) => {
    if (!chord) return;
    const n = norm(chord);
    if (!n || seen.has(n) || usedSeen.has(n)) return;
    seen.add(n);
    colour.push({ chord: n, label });
  };
  if (detected) {
    const diat = getDiatonic(detected.key, detected.mode);
    // Secondary dominants toward the pillar degrees (ii, IV, V, vi)
    [1, 3, 4, 5].forEach(i => {
      const d = diat[i];
      if (d) push(getSecondaryDominant(chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug")), `V/${degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug")}`);
    });
    // Borrowed from the parallel mode
    getParallelChords(detected.key, detected.mode).forEach(c => push(c, "borrowed"));
  }

  return { inKey, used, colour: colour.slice(0, 8) };
}

// ─── Wildcard Idea Generator ──────────────────────────────────────────────────

interface IdeaResult {
  technique: string;
  description: string;
  sectionId: string;
  sectionLabel: string;
  bars: string[];          // same length as section.chordBars
}

function csStr(d: { root: string; q: string }): string {
  return `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : d.q === "dim" ? "dim" : "+"}`;
}

// Tonic / Predominant / Dominant function per diatonic degree (indices 0–6)
type ChordFunc = "T" | "P" | "D" | "X";
const DEGREE_FUNC: ChordFunc[] = ["T", "P", "T", "P", "D", "T", "D"];

function getChordFunction(chord: string, key: string, mode: "major" | "minor"): ChordFunc {
  const p = parseChord(chord);
  if (!p) return "X";
  const diat = getDiatonic(key, mode);
  const deg = diat.findIndex(d => d.root === p.root && d.q === p.q);
  return deg >= 0 ? DEGREE_FUNC[deg] : "X";
}

function generateIdea(song: Song, detected: { key: string; mode: "major"|"minor" } | null, targetSectionId?: string): IdeaResult | null {
  const candidates = song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
  if (!candidates.length) return null;

  const section = targetSectionId
    ? (candidates.find(s => s.id === targetSectionId) ?? candidates[Math.floor(Math.random() * candidates.length)])
    : candidates[Math.floor(Math.random() * candidates.length)];
  const bars    = section.chordBars;
  const key     = detected?.key  ?? "C";
  const mode    = detected?.mode ?? "major";
  const ki      = NOTES.indexOf(key);
  const diat    = getDiatonic(key, mode);
  const par     = mode === "major" ? "minor" : "major";
  const dp      = getDiatonic(key, par);
  const steps   = mode === "major" ? MAJ_ST : MIN_ST;

  // Real (non-editorial) bars with original indices into `bars`
  const realBars = bars.map((b, i) => ({ bar: b, i })).filter(({ bar }) => bar.trim() && !isEditorialBar(bar));
  if (!realBars.length) return null;

  // Function per real bar
  const funcs: ChordFunc[] = realBars.map(({ bar }) =>
    detected ? getChordFunction(bar, key, mode) : "X"
  );
  const hasF = (f: ChordFunc) => funcs.includes(f);

  // Patch by original index; editorial bars pass through untouched
  const apply = (patch: { [k: number]: string }): string[] =>
    bars.map((b, i) => (i in patch ? patch[i] : b));

  // Closest diatonic degree (for parallel-mode mapping)
  const findDeg = (bar: string): number => {
    const p = parseChord(bar); if (!p) return 0;
    const ci = NOTES.indexOf(p.root);
    const semi = (ci - ki + 12) % 12;
    let best = 0, bestD = 12;
    steps.forEach((s, di) => { const d = Math.min(Math.abs(s - semi), 12 - Math.abs(s - semi)); if (d < bestD) { bestD = d; best = di; } });
    return best;
  };

  type Tech = { technique: string; description: string; bars: string[] };
  const pool: (() => Tech | null)[] = [];

  // ── 1. Tonic swap (I ↔ vi) — Tonic bucket ─────────────────────────────
  if (hasF("T") && detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }, j) => {
      if (funcs[j] !== "T") return;
      const p = parseChord(bar); if (!p) return;
      if (p.root === diat[0].root && p.q === diat[0].q) patch[i] = csStr(diat[5]);
      else if (p.root === diat[5].root && p.q === diat[5].q) patch[i] = csStr(diat[0]);
    });
    if (!Object.keys(patch).length) return null;
    return {
      technique: "Tonic swap",
      description: `I ↔ vi — every tonic chord flipped to its relative; same weight, different colour`,
      bars: apply(patch),
    };
  });

  // ── 2. Predominant swap (IV ↔ ii) — only where next chord is D or T ──
  if (hasF("P") && detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }, j) => {
      if (funcs[j] !== "P") return;
      const nf = j + 1 < funcs.length ? funcs[j + 1] : undefined;
      if (nf !== "D" && nf !== "T") return;
      const p = parseChord(bar); if (!p) return;
      patch[i] = (p.root === diat[3].root && p.q === diat[3].q) ? csStr(diat[1]) : csStr(diat[3]);
    });
    if (!Object.keys(patch).length) return null;
    return {
      technique: "Predominant swap",
      description: `IV ↔ ii before resolution — same pull toward the dominant, lighter or richer depending on direction`,
      bars: apply(patch),
    };
  });

  // ── 3. Dominant swap (V ↔ vii°) — only when next is T ────────────────
  if (hasF("D") && detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }, j) => {
      if (funcs[j] !== "D") return;
      if (j + 1 >= funcs.length || funcs[j + 1] !== "T") return;
      const p = parseChord(bar); if (!p) return;
      patch[i] = (p.root === diat[4].root && p.q === diat[4].q) ? csStr(diat[6]) : csStr(diat[4]);
    });
    if (!Object.keys(patch).length) return null;
    return {
      technique: "Dominant swap",
      description: `V ↔ vii° before a tonic landing — same pull, different tension and voicing`,
      bars: apply(patch),
    };
  });

  // ── 4. Secondary dominant — V/X inserted before a non-tonic diatonic bar
  if (detected && realBars.length >= 2) pool.push(() => {
    const targets = realBars.filter((_, j) => funcs[j] === "P" || funcs[j] === "D");
    if (!targets.length) return null;
    const lateTargets = targets.filter((_, j) => j >= Math.floor(targets.length / 2));
    const pool2 = lateTargets.length ? lateTargets : targets;
    const target = pool2[Math.floor(Math.random() * pool2.length)];
    const realIdx = realBars.indexOf(target);
    if (realIdx === 0) return null;
    const prev = realBars[realIdx - 1];
    const p = parseChord(target.bar); if (!p) return null;
    const secDomRoot = NOTES[(NOTES.indexOf(p.root) + 7) % 12];
    return {
      technique: "Secondary dominant",
      description: `${secDomRoot}7 (V/${p.root}) replaces the bar before ${target.bar} — borrowed pull toward a non-tonic chord`,
      bars: apply({ [prev.i]: `${secDomRoot}7` }),
    };
  });

  // ── 5. Tritone sub — Dominant-function bars only ──────────────────────
  if (hasF("D") && detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }, j) => {
      if (funcs[j] !== "D") return;
      const p = parseChord(bar); if (!p) return;
      patch[i] = `${NOTES[(NOTES.indexOf(p.root) + 6) % 12]}7`;
    });
    if (!Object.keys(patch).length) return null;
    const n = Object.keys(patch).length;
    return {
      technique: "Tritone sub",
      description: `${n} dominant chord${n !== 1 ? "s" : ""} swapped for their tritone — bends gravity sideways without leaving orbit`,
      bars: apply(patch),
    };
  });

  // ── 6. Backdoor dominant (bVII7) — final cadence only ─────────────────
  if (detected) pool.push(() => {
    const bVIIr = NOTES[(ki + 10) % 12];
    let targetI = realBars[realBars.length - 1].i;
    for (let j = realBars.length - 1; j >= 0; j--) {
      if (funcs[j] === "D") { targetI = realBars[j].i; break; }
    }
    return {
      technique: "Backdoor dominant",
      description: `${bVIIr}7 (bVII) at the final cadence — borrowed from the parallel, pulls home sideways`,
      bars: apply({ [targetI]: `${bVIIr}7` }),
    };
  });

  // ── 7. Neapolitan (bII) — exactly one P-function bar, cap at 1 ────────
  if (detected) pool.push(() => {
    const naplR = NOTES[(ki + 1) % 12];
    const pBars = realBars.filter((_, j) => funcs[j] === "P");
    const fallback = realBars.filter((_, j) => j > 0 && j < realBars.length - 1);
    const pool2 = pBars.length ? pBars : fallback;
    if (!pool2.length) return null;
    const target = pool2[Math.floor(Math.random() * pool2.length)];
    return {
      technique: "Neapolitan",
      description: `bII (${naplR}) as a predominant substitute — half-step above the tonic, suddenly major, a trapdoor underfoot`,
      bars: apply({ [target.i]: naplR }),
    };
  });

  // ── 8. Modal mixture — cap at 1–2 bars, weight toward the turn ────────
  if (detected && realBars.length >= 2) pool.push(() => {
    const cnt = Math.min(2, Math.max(1, Math.round(realBars.length * 0.35)));
    const laterBars = realBars.slice(Math.max(0, realBars.length - Math.ceil(realBars.length * 0.55)));
    const shuffled = [...laterBars].sort(() => Math.random() - 0.5).slice(0, cnt);
    if (!shuffled.length) return null;
    const patch: { [k: number]: string } = {};
    shuffled.forEach(({ bar, i }) => { patch[i] = csStr(dp[findDeg(bar)]); });
    return {
      technique: "Modal mixture",
      description: `${cnt} chord${cnt !== 1 ? "s" : ""} borrowed from ${key}${par === "minor" ? "m" : ""} — colour from the other mode, weighted toward the turn`,
      bars: apply(patch),
    };
  });

  // ── 9. Chromatic planing — semitone approach into a large root-motion bar
  if (realBars.length >= 3) pool.push(() => {
    const pairs: { a: typeof realBars[0]; b: typeof realBars[0] }[] = [];
    for (let j = 0; j < realBars.length - 1; j++) {
      const pa = parseChord(realBars[j].bar); const pb = parseChord(realBars[j + 1].bar);
      if (!pa || !pb) continue;
      const dist = Math.min(
        Math.abs(NOTES.indexOf(pa.root) - NOTES.indexOf(pb.root)),
        12 - Math.abs(NOTES.indexOf(pa.root) - NOTES.indexOf(pb.root))
      );
      if (dist >= 2) pairs.push({ a: realBars[j], b: realBars[j + 1] });
    }
    if (!pairs.length) return null;
    const { a, b } = pairs[Math.floor(Math.random() * pairs.length)];
    const pb = parseChord(b.bar)!;
    const approachRoot = NOTES[(NOTES.indexOf(pb.root) - 1 + 12) % 12];
    return {
      technique: "Chromatic planing",
      description: `Chromatic approach into ${b.bar} — semitone below it, same quality, slides in as a passing transition`,
      bars: apply({ [a.i]: `${approachRoot}${pb.q === "min" ? "m" : ""}` }),
    };
  });

  // ── 10. Deceptive resolution (V → vi instead of V → I) ───────────────
  if (hasF("D") && hasF("T") && detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    for (let j = 0; j < realBars.length - 1; j++) {
      if (funcs[j] === "D" && funcs[j + 1] === "T") {
        const next = realBars[j + 1];
        const p = parseChord(next.bar);
        if (p && p.root === diat[0].root) { patch[next.i] = csStr(diat[5]); break; }
      }
    }
    if (!Object.keys(patch).length) return null;
    return {
      technique: "Deceptive resolution",
      description: `V lands on vi instead of I — tonic dodges at the last moment, leaves the phrase open`,
      bars: apply(patch),
    };
  });

  // ── 11. Tonic pedal (slash chords over root) — non-T chords only ─────
  if (detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }, j) => {
      if (funcs[j] === "T") return;
      const p = parseChord(bar);
      if (p && p.root !== key) patch[i] = `${bar}/${key}`;
    });
    if (!Object.keys(patch).length) return null;
    return {
      technique: "Tonic pedal",
      description: `Non-tonic chords float over a ${key} bass — grounding, slightly tense, quietly strange`,
      bars: apply(patch),
    };
  });

  // ── 12. Full parallel-key recast (whole-section bucket) ──────────────
  if (detected) pool.push(() => {
    const patch: { [k: number]: string } = {};
    realBars.forEach(({ bar, i }) => { patch[i] = csStr(dp[findDeg(bar)]); });
    return {
      technique: "Parallel recast",
      description: `Entire section recast in ${key}${par === "minor" ? "m" : ""} — every degree flipped, a different emotional universe`,
      bars: apply(patch),
    };
  });

  // Pick one technique at random; retry up to 10× if it returns null
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!pool.length) break;
    const result = pool[Math.floor(Math.random() * pool.length)]();
    if (result) return { ...result, sectionId: section.id, sectionLabel: section.label };
  }
  return null;
}

// ─── Bridge Generator ─────────────────────────────────────────────────────────

function generateBridgeIdea(song: Song, detected: { key: string; mode: "major"|"minor" } | null): IdeaResult | null {
  if (!detected) return null;
  const { key, mode } = detected;
  const ki = NOTES.indexOf(key);
  const diat = getDiatonic(key, mode);

  // Only look at non-bridge sections for the "existing" profile
  const sourceSections = song.sections.filter(s => s.type !== "bridge" && (s.chordBars ?? []).some(b => b.trim()));
  if (!sourceSections.length) return null;
  const allBars = sourceSections.flatMap(s => s.chordBars).filter(b => b.trim() && !isEditorialBar(b));

  // Parallel diatonic set (borrowed pool)
  const par = mode === "major" ? "minor" : "major";
  const dp = getDiatonic(key, par);

  // Helpers
  const dc = (i: number) => csStr(diat[i]);
  const pc = (i: number) => csStr(dp[i]);

  // Target section for Apply (existing bridge, else last section with chords)
  const bridgeSection = song.sections.find(s => s.type === "bridge" && (s.chordBars ?? []).some(b => b.trim()))
    ?? song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim())).at(-1)!;
  const barCount = Math.max(4, Math.min(bridgeSection.chordBars.length, 8));

  const fill = (pattern: string[]): string[] => {
    const out: string[] = [];
    while (out.length < barCount) out.push(...pattern);
    return out.slice(0, barCount);
  };

  // ── Characteristic analysis ──────────────────────────────────────────────
  const tonicRoot = diat[0].root, tonicQ = diat[0].q;
  const tonicCount = allBars.filter(b => { const p = parseChord(b); return p && p.root === tonicRoot && p.q === tonicQ; }).length;
  const tonicRatio = tonicCount / allBars.length;
  const tonicHeavy = tonicRatio > 0.35;

  const uniqueChords = new Set(allBars.map(b => { const p = parseChord(b); return p ? `${p.root}${p.q}` : b; })).size;
  const chordDense = uniqueChords >= 6;
  const chordSparse = uniqueChords <= 3;

  const borrowedCount = allBars.filter(b => !inKey(b, key, mode)).length;
  const fullyDiatonic = borrowedCount === 0;

  const lastBar = allBars[allBars.length - 1];
  const lastP = parseChord(lastBar);
  const closesOnTonic = lastP && lastP.root === tonicRoot && lastP.q === tonicQ;

  // ── Strategy selection (priority order) ─────────────────────────────────

  // 1. Tonic-heavy + fully diatonic → anti-tonic with parallel borrowing
  if (tonicHeavy && fullyDiatonic) return {
    technique: "Anti-tonic · borrow",
    description: `${Math.round(tonicRatio * 100)}% of bars sit on ${key} — bridge avoids the tonic and borrows ${pc(5)} and ${pc(6)} from the parallel ${mode === "major" ? "minor" : "major"}.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([pc(5), dc(3), pc(6), dc(4)]),
  };

  // 2. Tonic-heavy but already borrows → anti-tonic, stay diatonic
  if (tonicHeavy) return {
    technique: "Anti-tonic",
    description: `Existing sections lean on ${key} — bridge circles through IV · vi · ii · V without touching the tonic.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill(mode === "major" ? [dc(3), dc(5), dc(1), dc(4)] : [dc(2), dc(5), dc(3), dc(6)]),
  };

  // 3. Chord-dense → strip back to 2 chords
  if (chordDense) return {
    technique: "Stripped back",
    description: `Existing sections use ${uniqueChords} different chords — bridge pares it to two, letting space do the work.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([dc(0), dc(3)]),
  };

  // 4. Chord-sparse → add movement with a mixed walk
  if (chordSparse) return {
    technique: "Chord walk",
    description: `Existing sections stay with ${uniqueChords} chords — bridge adds movement with a diatonic walk that borrows ${pc(5)}.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([dc(0), pc(5), dc(3), dc(4)]),
  };

  // 5. Fully diatonic → borrow from parallel
  if (fullyDiatonic) return {
    technique: "Modal mixture",
    description: `Existing sections are fully diatonic — bridge borrows ${pc(5)} and ${pc(6)} from the parallel ${mode === "major" ? "minor" : "major"} for colour.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([pc(5), dc(3), pc(6), dc(0)]),
  };

  // 6. Always resolves to tonic → open-ended bridge landing on V
  if (closesOnTonic) return {
    technique: "Open cadence",
    description: `Existing sections always resolve home — bridge withholds the tonic and lands on ${dc(4)}, leaving it open.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([dc(3), dc(1), dc(5), dc(4)]),
  };

  // 7. Fallback — non-tonic opener with borrowed close
  return {
    technique: "Contrast",
    description: `Bridge opens on vi and slips in a borrowed ${pc(6)} before coming home — a different angle on the same key.`,
    sectionId: bridgeSection.id, sectionLabel: bridgeSection.label,
    bars: fill([dc(5), dc(3), pc(6), dc(0)]),
  };
}

function AnalyseChordsPanel({ song, detected, idea, ideaUndo, onReroll, onApply, onUndo,
  bridge, bridgeUndo, onBridgeGenerate, onBridgeApply, onBridgeUndo, onClose, onSetKey }: {
  song: Song;
  detected: { key: string; mode: "major"|"minor" } | null;
  idea: IdeaResult | null;
  ideaUndo: { newSectionId: string } | null;
  onReroll: (sectionId?: string) => void;
  onApply: (sectionId: string, bars: string[]) => void;
  onUndo: () => void;
  bridge: IdeaResult | null;
  bridgeUndo: { sectionId: string; bars: string[] } | null;
  onBridgeGenerate: () => void;
  onBridgeApply: (sectionId: string, bars: string[]) => void;
  onBridgeUndo: () => void;
  onClose: () => void;
  onSetKey: () => void;
}) {
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);

  const sectionsWithChords = song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => sectionsWithChords[0]?.id ?? "");
  const effectiveSectionId = sectionsWithChords.find(s => s.id === selectedSectionId)?.id ?? sectionsWithChords[0]?.id ?? "";

  const handleIdeasToggle = () => {
    if (!ideasOpen && !idea) onReroll(effectiveSectionId);
    setIdeasOpen(o => !o);
    if (bridgeOpen) setBridgeOpen(false);
  };

  const handleBridgeToggle = () => {
    if (!bridgeOpen && !bridge) onBridgeGenerate();
    setBridgeOpen(o => !o);
    if (ideasOpen) setIdeasOpen(false);
  };

  const diatonicChords = detected
    ? getDiatonic(detected.key, detected.mode).map(d =>
        `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : "°"}`)
    : [];
  const parallelChords = detected ? getParallelChords(detected.key, detected.mode) : [];
  const noChords = !song.sections.some(s => (s.chordBars ?? []).some(b => b.trim()));

  const ChordPill = ({ chord, dim }: { chord: string; dim?: boolean }) => (
    <span
      className={`inline-block text-[11px] px-2 py-0.5 border border-border/30 rounded-sm bg-muted/15 ${dim ? "text-muted-foreground/45" : "text-foreground/65"}`}
      style={{ fontFamily: MONO }}>
      {chord}
    </span>
  );

  return (
    <div className="mb-5 border border-border rounded-sm overflow-hidden bg-card">
      {/* Segment header */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Analyse Chords
        </span>
        <button onClick={onClose} className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="px-4 py-3">
        {!detected ? (
          <p className="text-[12px] text-muted-foreground/40 italic py-1" style={{ fontFamily: SERIF }}>
            Fill in more bars to detect a key.
          </p>
        ) : (
          <>
            {/* Key name */}
            <div className="flex items-baseline gap-2.5 mb-4">
              <span className="text-[22px] font-medium leading-none text-foreground" style={{ fontFamily: SERIF }}>
                {formatDetectedKey(detected.key, detected.mode)}
              </span>
              <span className="text-[10px] text-muted-foreground/45 uppercase tracking-widest" style={{ fontFamily: MONO }}>
                {detected.mode}
              </span>
            </div>

            {/* Common chords */}
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/45 mb-1.5" style={{ fontFamily: MONO }}>
                Common
              </div>
              <div className="flex flex-wrap gap-1">
                {diatonicChords.map((ch, i) => <ChordPill key={i} chord={ch} />)}
              </div>
            </div>

            {/* Parallel chords */}
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/45 mb-1.5" style={{ fontFamily: MONO }}>
                Parallel · {detected.mode === "major" ? `${detected.key}m` : detected.key}
              </div>
              <div className="flex flex-wrap gap-1">
                {parallelChords.map((ch, i) => <ChordPill key={i} chord={ch} dim />)}
              </div>
            </div>

            <div className="mb-4" />

            {/* Footer actions */}
            <div className="flex items-center gap-2">
              <button onClick={onSetKey}
                className="text-[10px] text-muted-foreground/55 hover:text-foreground transition-colors border border-border/40 rounded-sm px-2.5 py-1"
                style={{ fontFamily: MONO }}>
                Set {formatDetectedKey(detected.key, detected.mode)} as key
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={handleBridgeToggle}
                  className={`text-[10px] px-3 py-1 border rounded-sm transition-colors ${
                    bridgeOpen
                      ? "border-foreground/30 text-foreground bg-muted/40"
                      : "border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-foreground/20"
                  }`}
                  style={{ fontFamily: MONO }}>
                  Bridge {bridgeOpen ? "▴" : "▾"}
                </button>
                <button
                  onClick={handleIdeasToggle}
                  className={`text-[10px] px-3 py-1 border rounded-sm transition-colors ${
                    ideasOpen
                      ? "border-foreground/30 text-foreground bg-muted/40"
                      : "border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-foreground/20"
                  }`}
                  style={{ fontFamily: MONO }}>
                  Ideas {ideasOpen ? "▴" : "▾"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Ideas — inline expansion */}
      {ideasOpen && (
        <div className="border-t border-border/50">
          {/* Ideas sub-header */}
          <div className="px-4 py-2 bg-muted/15 flex items-center gap-2 flex-wrap">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60" style={{ fontFamily: MONO }}>
              Wildcard
            </span>
            {/* Section selector — only when there are multiple sections */}
            {sectionsWithChords.length > 1 && (
              <select
                value={effectiveSectionId}
                onChange={e => { setSelectedSectionId(e.target.value); onReroll(e.target.value); }}
                className="text-[9px] bg-transparent border border-border/40 rounded-sm px-1.5 py-0.5 text-muted-foreground/70 focus:outline-none cursor-pointer hover:border-foreground/30 transition-colors"
                style={{ fontFamily: MONO }}>
                {sectionsWithChords.map(s => (
                  <option key={s.id} value={s.id}>{s.shortLabel || s.label}</option>
                ))}
              </select>
            )}
            {idea && (
              <span className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 bg-background"
                style={{ fontFamily: MONO }}>{idea.technique}</span>
            )}
            <button onClick={() => onReroll(effectiveSectionId)}
              className="ml-auto text-[15px] text-foreground/55 hover:text-foreground transition-colors leading-none px-1.5 py-0.5 border border-border/40 rounded-sm hover:border-foreground/30"
              style={{ fontFamily: MONO }} title="Roll another idea">↻</button>
          </div>

          <div className="px-4 py-3">
            {noChords ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Add chords to a section first.
              </p>
            ) : !idea ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Press ↻ to roll a wildcard idea.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground/60 italic mb-3 leading-relaxed" style={{ fontFamily: SERIF }}>
                  {idea.description}
                </p>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40" style={{ fontFamily: MONO }}>
                    {idea.sectionLabel}
                  </span>
                  <div className="flex items-center gap-3">
                    {ideaUndo && (
                      <button onClick={onUndo}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
                        style={{ fontFamily: MONO }}>
                        ← Undo
                      </button>
                    )}
                    <button onClick={() => onApply(idea.sectionId, idea.bars)}
                      className="text-[10px] text-accent hover:text-foreground transition-colors"
                      style={{ fontFamily: MONO }}>
                      Add section →
                    </button>
                  </div>
                </div>

                {/* Bar grid — respects ROW_BREAK rows to match section formatting */}
                <div className="rounded-sm border border-border/40 overflow-hidden"
                  style={{
                    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.11) 1px, transparent 1px)`,
                    backgroundSize: `${CW}px ${CH}px`,
                  }}>
                  {(() => {
                    const rows: string[][] = [[]];
                    idea.bars.forEach(b => {
                      if (b === ROW_BREAK) rows.push([]);
                      else rows[rows.length - 1].push(b);
                    });
                    return rows.map((row, ri) => (
                      <div key={ri} className={`flex overflow-x-auto${ri > 0 ? " border-t border-border/[0.07]" : ""}`}
                        style={{ scrollbarWidth: "none" }}>
                        {row.map((bar, bi) => (
                          <div key={bi}
                            className={`shrink-0 flex items-center justify-center text-[12px] border-r border-border/20 last:border-r-0 ${bar === PHRASE_MARKER ? "text-muted-foreground/30" : "text-foreground/70"}`}
                            style={{ width: bar === PHRASE_MARKER ? 22 : CW, height: CH, fontFamily: MONO }}>
                            {bar === PHRASE_MARKER ? "│" : bar.trim()}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bridge — inline expansion */}
      {bridgeOpen && (
        <div className="border-t border-border/50">
          {/* Bridge sub-header */}
          <div className="px-4 py-2 bg-muted/15 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60" style={{ fontFamily: MONO }}>
              Bridge
            </span>
            {bridge && (
              <span className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 bg-background"
                style={{ fontFamily: MONO }}>{bridge.technique}</span>
            )}
            <button onClick={onBridgeGenerate}
              className="ml-auto text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }} title="Regenerate bridge idea">↻</button>
          </div>

          <div className="px-4 py-3">
            {noChords ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Add chords to other sections first.
              </p>
            ) : !bridge ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>…</p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground/60 italic mb-3 leading-relaxed" style={{ fontFamily: SERIF }}>
                  {bridge.description}
                </p>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40" style={{ fontFamily: MONO }}>
                    → {bridge.sectionLabel}
                  </span>
                  <div className="flex items-center gap-3">
                    {bridgeUndo && (
                      <button onClick={onBridgeUndo}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
                        style={{ fontFamily: MONO }}>
                        ← Undo
                      </button>
                    )}
                    <button onClick={() => onBridgeApply(bridge.sectionId, bridge.bars)}
                      className="text-[10px] text-accent hover:text-foreground transition-colors"
                      style={{ fontFamily: MONO }}>
                      Apply →
                    </button>
                  </div>
                </div>

                {/* Bar grid */}
                <div className="flex overflow-x-auto rounded-sm border border-border/40"
                  style={{
                    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.11) 1px, transparent 1px)`,
                    backgroundSize: `${CW}px ${CH}px`,
                    scrollbarWidth: "none",
                  }}>
                  {bridge.bars.filter(b => b !== ROW_BREAK).map((bar, i) => (
                    <div key={i}
                      className={`shrink-0 flex items-center justify-center text-[12px] border-r border-border/20 last:border-r-0 ${bar === PHRASE_MARKER ? "text-muted-foreground/30" : "text-foreground/70"}`}
                      style={{ width: bar === PHRASE_MARKER ? 22 : CW, height: CH, fontFamily: MONO }}>
                      {bar === PHRASE_MARKER ? "│" : bar.trim()}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);
const sortCP = (cps: CP[]) => [...cps].sort((a, b) => a.lineIdx !== b.lineIdx ? a.lineIdx - b.lineIdx : a.charIdx - b.charIdx);

function resolveOverlaps(positions: CP[]): CP[] {
  const result = positions.map(cp => ({ ...cp }));
  const byLine = new Map<number, CP[]>();
  for (const cp of result) {
    if (!byLine.has(cp.lineIdx)) byLine.set(cp.lineIdx, []);
    byLine.get(cp.lineIdx)!.push(cp);
  }
  for (const line of byLine.values()) {
    line.sort((a, b) => a.charIdx - b.charIdx);
    for (let i = 0; i < line.length - 1; i++) {
      const min = line[i].charIdx + line[i].chord.length + 1;
      if (line[i + 1].charIdx < min) line[i + 1].charIdx = min;
    }
  }
  return result;
}

function makeSection(type: SectionType, n = 1): Section {
  const d = SDEFS.find(s => s.v === type)!;
  const sfx = n > 1 ? ` ${n}` : "";
  return { id: uid(), type, label: d.l + sfx, shortLabel: d.s + sfx,
    chordBars: ["","","",""], chordPositions: [], lyrics: "", notes: "" };
}

function distributeChords(bars: string[], lyrics: string): CP[] {
  const ne = bars.filter(b => b.trim() && !isEditorialBar(b));
  if (!ne.length) return [];
  const lines = (lyrics || "").split("\n");
  if (!lines.some(l => l.trim())) return ne.map((chord, i) => ({ id: uid(), lineIdx: 0, charIdx: i * 5, chord }));
  const lens = lines.map(l => Math.max(l.length, 1));
  const total = lens.reduce((s, l) => s + l + 1, 0);
  return ne.map((chord, i) => {
    let t = Math.floor((i / ne.length) * total);
    for (let l = 0; l < lines.length; l++) {
      if (t <= lens[l]) return { id: uid(), lineIdx: l, charIdx: t, chord };
      t -= lens[l] + 1;
    }
    return { id: uid(), lineIdx: lines.length - 1, charIdx: 0, chord };
  });
}

// Returns for each index in newSeq the matching index in oldSeq (or null if new/unmatched)
function lcsAlign(oldSeq: string[], newSeq: string[]): (number | null)[] {
  const m = oldSeq.length, n = newSeq.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldSeq[i-1] === newSeq[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const result: (number | null)[] = new Array(n).fill(null);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldSeq[i-1] === newSeq[j-1]) { result[j-1] = i-1; i--; j--; }
    else if (dp[i-1][j] >= dp[i][j-1]) i--;
    else j--;
  }
  return result;
}

function syncBarsToPositions(newBars: string[], oldBars: string[], current: CP[], lyrics: string): CP[] {
  const newNe = newBars.filter(b => b.trim() && !isEditorialBar(b));
  const oldNe = oldBars.filter(b => b.trim() && !isEditorialBar(b));
  const sorted = sortCP(current.filter(p => p.chord.trim()));

  if (!newNe.length) return [];
  if (!sorted.length || !oldNe.length) return distributeChords(newBars, lyrics);

  // Same count — just rename chords in place, keep all positions
  if (newNe.length === oldNe.length) {
    return sorted.map((cp, i) => ({ ...cp, chord: newNe[i] ?? cp.chord }));
  }

  // Count changed — use LCS to preserve positions for surviving bars; place new bars near their neighbours
  const alignment = lcsAlign(oldNe, newNe);
  const result: CP[] = [];

  for (let j = 0; j < newNe.length; j++) {
    const oldIdx = alignment[j];
    if (oldIdx !== null && oldIdx < sorted.length) {
      result.push({ ...sorted[oldIdx], chord: newNe[j] });
    } else {
      // New bar: place just after the previous result entry if possible
      const prev = result.length > 0 ? result[result.length - 1] : null;
      if (prev) {
        result.push({ id: uid(), lineIdx: prev.lineIdx, charIdx: prev.charIdx + prev.chord.length + 2, chord: newNe[j] });
      } else {
        const fb = distributeChords([newNe[j]], lyrics);
        result.push(fb[0] ?? { id: uid(), lineIdx: 0, charIdx: 0, chord: newNe[j] });
      }
    }
  }

  return resolveOverlaps(result);
}

function formatRelativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Tiny UI ──────────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return <span className="block text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5" style={{ fontFamily: MONO }}>{children}</span>;
}
function II({ label, value, onChange, placeholder, mono = false, style }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={style}><FL>{label}</FL>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="bg-transparent border-b border-border text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent pb-0.5 w-full transition-colors"
        style={{ fontFamily: mono ? MONO : SANS }} />
    </div>
  );
}
function SI({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div><FL>{label}</FL>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="appearance-none bg-transparent border-b border-border text-xs text-foreground focus:outline-none focus:border-accent pb-0.5 pr-4 cursor-pointer transition-colors"
          style={{ fontFamily: MONO }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-0 top-1 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────

function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode]       = useState<"signin"|"signup">("signin");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      if (mode === "signin") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
        onClose();
      } else {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) throw e;
        setDone(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background border border-border rounded-sm w-full max-w-sm p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium" style={{ fontFamily: SERIF }}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        {done ? (
          <p className="text-xs text-muted-foreground" style={{ fontFamily: SANS }}>
            Check your email to confirm your account, then sign in.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <FL>Email</FL>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-transparent border-b border-border pb-0.5 text-xs text-foreground focus:outline-none focus:border-accent transition-colors placeholder:text-muted-foreground/40"
                  style={{ fontFamily: SANS }} placeholder="you@example.com" />
              </div>
              <div>
                <FL>Password</FL>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  className="w-full bg-transparent border-b border-border pb-0.5 text-xs text-foreground focus:outline-none focus:border-accent transition-colors placeholder:text-muted-foreground/40"
                  style={{ fontFamily: SANS }} placeholder="••••••••" />
              </div>
              {error && <p className="text-xs text-red-500" style={{ fontFamily: MONO }}>{error}</p>}
            </div>
            <button onClick={submit} disabled={loading}
              className="w-full py-2 bg-foreground text-background text-xs rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ fontFamily: SANS }}>
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>

            {/* OAuth divider */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={{ fontFamily: MONO }}>or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
                className="w-full py-2 border border-border rounded-sm text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
                style={{ fontFamily: SANS }}>
                Continue with Google
              </button>
              <button
                onClick={() => supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.origin } })}
                className="w-full py-2 border border-border rounded-sm text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
                style={{ fontFamily: SANS }}>
                Continue with Apple
              </button>
            </div>

            <p className="text-xs text-center text-muted-foreground mt-4" style={{ fontFamily: SANS }}>
              {mode === "signin" ? "No account? " : "Already have one? "}
              <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="underline hover:text-foreground transition-colors">
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Projects Sidebar ─────────────────────────────────────────────────────────

const STATUS_DOT: Record<ProjectStatus, string> = {
  working:  "bg-accent",
  finished: "bg-emerald-500/70",
  archived: "bg-muted-foreground/30",
};
const STATUS_LABEL: Record<ProjectStatus, string> = {
  working:  "Working",
  finished: "Finished",
  archived: "Archived",
};

// ─── Standalone OW Session Dialog ────────────────────────────────────────────

function StandaloneOWDialog({
  onClose, onSaved,
}: {
  onClose: () => void;
  onSaved: (entry?: StandaloneOW) => void;
}) {
  const [seedWord, setSeedWord]     = useState("");
  const [body, setBody]             = useState("");
  const [timerIdx, setTimerIdx]     = useState(3);
  const [seconds, setSeconds]       = useState(TIMER_OPTS[3]);
  const [active, setActive]         = useState(false);
  const [done, setDone]             = useState(false);
  const [saving, setSaving]         = useState(false);
  const [scanResult, setScanResult] = useState<ReturnType<typeof scanText> | null>(null);
  const [hoverSense, setHoverSense] = useState<{ label: string; examples: string[] } | null>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(id); setActive(false); setDone(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const adjustTimer = (dir: -1 | 1) => {
    if (active || done) return;
    const next = Math.max(0, Math.min(TIMER_OPTS.length - 1, timerIdx + dir));
    setTimerIdx(next);
    setSeconds(TIMER_OPTS[next]);
  };

  const startTimer = () => {
    if (!done && seedWord.trim()) {
      setActive(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const resetTimer = () => {
    setActive(false); setDone(false);
    setTimerIdx(3); setSeconds(TIMER_OPTS[3]);
    setScanResult(null);
  };

  const handleBodyChange = (v: string) => {
    if (!active && !done && body === "" && seedWord.trim()) setActive(true);
    setBody(v);
    setScanResult(null);
  };

  const handleObject = () => { setSeedWord(pickOWWord()); };

  const handleSenseHover = (sense: typeof SENSES[0]) => {
    const pool = [...sense.words];
    const picks: string[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    setHoverSense({ label: sense.label, examples: picks });
  };

  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    if (!body.trim() || !seedWord.trim()) return;
    setSaving(true);
    setSaveError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setSaveError("Sign in to save sessions."); return; }
    const { data, error } = await supabase.from("standalone_ow")
      .insert({ user_id: user.id, seed_word: seedWord.trim(), body: body.trim() })
      .select("id, seed_word, body, written_at")
      .single();
    setSaving(false);
    if (error) { setSaveError("Save failed — " + error.message); return; }
    if (data) { onSaved(data as StandaloneOW); onClose(); }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const isLow = seconds <= 60 && active;
  const timerDisplay = done ? "0:00" : active ? `${mm}:${ss}` : `${TIMER_OPTS[timerIdx] / 60}:00`;
  const counts = scanResult ? SENSES.map((_, i) => scanResult.filter(t => t.senseIdx === i).length) : null;
  const drillWords = scanResult ? getDrillWords(scanResult) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
            Object Writing Session
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* Controls row: timer · start · object · seed word */}
          <div className="flex items-center gap-2">
            {/* Timer */}
            <div className="flex items-center gap-1 shrink-0">
              {!active && !done && (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => adjustTimer(1)} disabled={timerIdx === TIMER_OPTS.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors leading-none">
                    <ChevronUp size={10} />
                  </button>
                  <button onClick={() => adjustTimer(-1)} disabled={timerIdx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors leading-none">
                    <ChevronDown size={10} />
                  </button>
                </div>
              )}
              <span className={`tabular-nums text-[12px] ml-0.5 ${isLow ? "text-red-500" : "text-muted-foreground"}`}
                style={{ fontFamily: MONO }}>{timerDisplay}</span>
            </div>

            {/* Start / Reset */}
            {done ? (
              <button onClick={resetTimer}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Reset</button>
            ) : !active ? (
              <button onClick={startTimer} disabled={!seedWord.trim()}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 shrink-0"
                style={{ fontFamily: MONO }}>Start →</button>
            ) : null}

            {/* Object button — hidden while running */}
            {!active && !done && (
              <button onClick={handleObject} title="Random object"
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Object</button>
            )}

            {/* Seed word input — fills remaining space */}
            <input
              value={seedWord}
              onChange={e => setSeedWord(e.target.value)}
              placeholder="focus word…"
              disabled={active || done}
              className="flex-1 min-w-0 bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors disabled:opacity-40"
              style={{ fontFamily: SERIF, fontStyle: seedWord ? "italic" : "normal" }}
              onKeyDown={e => e.key === "Enter" && startTimer()}
            />
          </div>

          {/* Sense badges */}
          <div className="flex flex-wrap gap-1.5 relative">
            {SENSES.map(s => (
              <span key={s.label}
                className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full cursor-default relative`}
                style={{ fontFamily: MONO }}
                onMouseEnter={() => handleSenseHover(s)}
                onMouseLeave={() => setHoverSense(null)}>
                {s.label}
                {hoverSense?.label === s.label && (
                  <span className="absolute bottom-full left-0 mb-1.5 whitespace-nowrap bg-foreground text-background text-[10px] px-2 py-1 rounded-sm z-10 pointer-events-none"
                    style={{ fontFamily: MONO }}>
                    {hoverSense.examples.join(" · ")}
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Writing area */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => handleBodyChange(e.target.value)}
            placeholder={seedWord.trim() ? "Write freely. No editing, no judgement. Anchor to the senses above…" : "Enter a focus word above first"}
            rows={9}
            className={`w-full bg-transparent text-sm placeholder:text-muted-foreground/30 focus:outline-none resize-none leading-[1.85] transition-colors duration-300 ${active ? "text-foreground/40" : "text-foreground"}`}
            style={{ fontFamily: SERIF }}
          />

          {/* Sense scan */}
          {body.trim() && !scanResult && (
            <button onClick={() => setScanResult(scanText(body))}
              className="self-start text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>
              Scan for senses
            </button>
          )}

          {scanResult && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Sense scan</span>
                <button onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
              </div>
              <div className="text-xs leading-[1.9] mb-3 p-3 bg-muted/20 rounded-sm border border-border/60"
                style={{ fontFamily: SERIF }}>
                {scanResult.map((t, i) =>
                  t.senseIdx !== null ? (
                    <mark key={i} className={`${SENSES[t.senseIdx].mark} rounded-sm px-0.5`}
                      title={SENSES[t.senseIdx].label}>{t.token}</mark>
                  ) : <span key={i}>{t.token}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SENSES.map((s, i) => counts![i] > 0 && (
                  <span key={s.label} className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full`} style={{ fontFamily: MONO }}>
                    {s.label} ×{counts![i]}
                  </span>
                ))}
                {counts!.every(c => c === 0) && (
                  <span className="text-[12px] text-muted-foreground" style={{ fontFamily: MONO }}>
                    No sense words detected — write more concretely.
                  </span>
                )}
              </div>
              {drillWords.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: MONO }}>Dig deeper →</span>
                  {drillWords.map(w => (
                    <button key={w} onClick={() => { setSeedWord(w); setScanResult(null); }}
                      className="text-[12px] px-2 py-0.5 border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                      style={{ fontFamily: MONO }}>{w}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <button onClick={onClose}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              style={{ fontFamily: MONO }}>Discard</button>
            <div className="flex items-center gap-3">
              {saveError && (
                <span className="text-[11px] text-red-500" style={{ fontFamily: MONO }}>{saveError}</span>
              )}
              <button onClick={handleSave}
                disabled={!body.trim() || !seedWord.trim() || saving}
                className="text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30"
                style={{ fontFamily: MONO }}>
                {saving ? "Saving…" : "Save session"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Standalone OW Detail Dialog ──────────────────────────────────────────────

function StandaloneOWDetail({
  entry, onClose, onCreateSong, onAddToSong,
}: {
  entry: StandaloneOW;
  onClose: () => void;
  onCreateSong: (seedWord: string, body: string) => void;
  onAddToSong?: (seedWord: string, body: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToSong = () => {
    onAddToSong?.(entry.seed_word, entry.body);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.body).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-[11px] italic text-foreground/70" style={{ fontFamily: SERIF }}>{entry.seed_word}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <pre className="text-sm leading-[1.85] text-foreground/80 whitespace-pre-wrap max-h-80 overflow-y-auto"
            style={{ fontFamily: SERIF }}>{entry.body}</pre>
        </div>
        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between gap-2">
          <button onClick={onClose}
            className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>Close</button>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy}
              className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              style={{ fontFamily: MONO }}>{copied ? "Copied ✓" : "Copy text"}</button>
            {onAddToSong && (
              <button onClick={handleAddToSong} disabled={added}
                className={`text-[12px] px-2.5 py-1 border rounded-sm transition-colors ${added ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }}>{added ? "Added ✓" : "Add to song"}</button>
            )}
            <button onClick={() => { onCreateSong(entry.seed_word, entry.body); onClose(); }}
              className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>Create song from writing</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Projects Sidebar ─────────────────────────────────────────────────────────

function ProjectsSidebar({ onLoad, onNew, onSignOut, currentProjectId, onCreateSongFromOW, onAddOWToSong, owRefreshKey, mobile = false, onClose }: {
  onLoad: (id: string, song: Song) => void;
  onNew: () => void;
  onSignOut: () => void;
  currentProjectId: string | null;
  onCreateSongFromOW: (seedWord: string, body: string) => void;
  onAddOWToSong?: (seedWord: string, body: string) => void;
  owRefreshKey: number;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [open, setOpen]                 = useState<Record<ProjectStatus, boolean>>({
    working: true, finished: false, archived: false,
  });
  const [standaloneOWs, setStandaloneOWs] = useState<StandaloneOW[]>([]);
  const [owOpen, setOwOpen]               = useState(false);
  const [owSession, setOwSession]         = useState(false);
  const [owDetail, setOwDetail]           = useState<StandaloneOW | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase.from("projects")
      .select("id, name, updated_at, status")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Fetch projects failed:", error.message);
        setProjects((data as Project[]) ?? []);
        setLoading(false);
      });
  }, [refreshKey]);

  useEffect(() => { setRefreshKey(k => k + 1); }, [currentProjectId]);

  // Fetch standalone OW entries (re-runs when owRefreshKey bumps — e.g. saved from header button)
  useEffect(() => {
    supabase.from("standalone_ow")
      .select("id, seed_word, body, written_at")
      .order("written_at", { ascending: false })
      .then(({ data }) => setStandaloneOWs((data as StandaloneOW[]) ?? []));
  }, [owRefreshKey]);

  // Word cloud frequency map
  const owWordFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    standaloneOWs.forEach(e => {
      const w = e.seed_word.toLowerCase().trim();
      freq[w] = (freq[w] ?? 0) + 1;
    });
    return freq;
  }, [standaloneOWs]);

  const owWordsSorted = useMemo(() => {
    const words = Object.entries(owWordFreq);
    const maxFreq = Math.max(1, ...words.map(([, f]) => f));
    return words.map(([word, freq]) => ({ word, freq, size: 10 + Math.round((freq / maxFreq) * 6) }))
      .sort((a, b) => b.freq - a.freq);
  }, [owWordFreq]);

  const load = async (id: string) => {
    const { data } = await supabase.from("projects").select("data").eq("id", id).single();
    if (data) onLoad(id, data.data as Song);
  };

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    // Remove any audio note files from Storage first
    const { data: proj } = await supabase.from("projects").select("data").eq("id", id).single();
    const audioNotes: AudioNote[] = (proj?.data as Song)?.audioNotes ?? [];
    if (audioNotes.length) {
      await supabase.storage.from("audio-notes").remove(audioNotes.map(n => n.storagePath));
    }
    await supabase.from("projects").delete().eq("id", id);
    setProjects(p => p.filter(pr => pr.id !== id));
  };

  const setStatus = async (id: string, next: ProjectStatus) => {
    await supabase.from("projects").update({ status: next }).eq("id", id);
    setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: next } : pr));
    setOpen(o => ({ ...o, [next]: true }));
  };

  const renamePrj = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
    setProjects(p => p.map(pr => pr.id === id ? { ...pr, name: name.trim() } : pr));
  };

  const active = currentProjectId ? projects.find(p => p.id === currentProjectId) : null;
  const others = projects.filter(p => p.id !== currentProjectId);
  const groups: ProjectStatus[] = ["working", "finished", "archived"];

  /* ── Sub-components ── */
  const StatusPicker = ({ id, current }: { id: string; current: ProjectStatus }) => (
    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {(["working","finished","archived"] as ProjectStatus[]).map(s => (
        <button key={s} onClick={e => { e.stopPropagation(); setStatus(id, s); }}
          className="flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all"
          title={STATUS_LABEL[s]}>
          <span className={`rounded-full transition-all ${
            s === current
              ? `w-2.5 h-2.5 ${STATUS_DOT[s]} ring-1 ring-offset-1 ring-foreground/20`
              : `w-1.5 h-1.5 ${STATUS_DOT[s]} opacity-35 hover:opacity-70`
          }`} />
        </button>
      ))}
    </div>
  );

  const ProjectRow = ({ p }: { p: Project }) => {
    const [editing, setEditing] = useState(false);
    const [nameVal, setNameVal] = useState(p.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

    const commitRename = () => {
      setEditing(false);
      renamePrj(p.id, nameVal || p.name);
    };

    return (
      <div onClick={() => !editing && load(p.id)}
        className="w-full text-left px-3 py-2 border-b border-border/30 hover:bg-foreground/[0.04] transition-colors group cursor-pointer">
        <div className="flex items-center gap-1 min-w-0">
          {editing ? (
            <input ref={inputRef} value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setNameVal(p.name); } }}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-transparent border-b border-accent text-[10px] text-foreground focus:outline-none pb-px"
              style={{ fontFamily: MONO }} />
          ) : (
            <span className="text-[10px] text-foreground/60 truncate leading-snug flex-1 min-w-0"
              style={{ fontFamily: MONO }}>{p.name}</span>
          )}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="text-muted-foreground/40 hover:text-foreground transition-colors p-0.5"
              title="Rename">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3z"/>
              </svg>
            </button>
            <StatusPicker id={p.id} current={p.status ?? "working"} />
            <button onClick={e => del(p.id, e)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5">
              <X size={9} />
            </button>
          </div>
        </div>
        <span className="text-[9px] text-muted-foreground/40" style={{ fontFamily: MONO }}>
          {formatRelativeTime(p.updated_at)}
        </span>
      </div>
    );
  };

  return (
    <aside className={mobile
        ? "w-full max-w-[85vw] h-full border-r border-border flex flex-col bg-background shadow-2xl"
        : "w-64 shrink-0 border-r border-border flex flex-col bg-foreground/[0.025]"}
      style={mobile ? undefined : { minHeight: "calc(100vh - 49px)" }}>

      {/* Header */}
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70"
          style={{ fontFamily: MONO }}>Projects</span>
        {mobile && (
          <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 -mr-1" title="Close">
            <X size={14} />
          </button>
        )}
      </div>

      {/* New song — top */}
      <div className="px-3 py-2 border-b border-border/40">
        <button onClick={onNew}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          style={{ fontFamily: MONO }}>
          + New song
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

        {/* Active project pinned */}
        {active && (
          <div className="px-3 py-2.5 border-b border-border/50 bg-foreground/[0.04] group">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[active.status ?? "working"]}`} />
              <span className="text-[10px] text-foreground/80 truncate leading-tight flex-1 min-w-0"
                style={{ fontFamily: MONO }}>{active.name}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <StatusPicker id={active.id} current={active.status ?? "working"} />
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/50 ml-3" style={{ fontFamily: MONO }}>
              {formatRelativeTime(active.updated_at)}
            </span>
          </div>
        )}

        {loading ? (
          <div className="px-3 py-6 text-[10px] text-muted-foreground/50 text-center"
            style={{ fontFamily: MONO }}>Loading…</div>
        ) : others.length === 0 && !active ? (
          <div className="px-3 py-6 text-[10px] text-muted-foreground/40 text-center italic"
            style={{ fontFamily: MONO }}>Start writing — your song saves automatically</div>
        ) : (
          groups.map(status => {
            const group = others.filter(p => (p.status ?? "working") === status);
            if (group.length === 0) return null;
            const isOpen = open[status];
            return (
              <div key={status} className="border-b border-border/30 last:border-b-0">
                <button onClick={() => setOpen(o => ({ ...o, [status]: !o[status] }))}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-foreground/[0.03] transition-colors">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
                      style={{ fontFamily: MONO }}>
                      {STATUS_LABEL[status]}{!isOpen && ` (${group.length})`}
                    </span>
                  </div>
                  <ChevronDown size={9}
                    className={`text-muted-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && group.map(p => <ProjectRow key={p.id} p={p} />)}
              </div>
            );
          })
        )}
      </div>

      {/* ── Object Writing Sessions ── */}
      <div className="border-t border-border/30">
        <button onClick={() => setOwOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-foreground/[0.03] transition-colors">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-accent/60">✦</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
              style={{ fontFamily: MONO }}>
              Object Writing{standaloneOWs.length > 0 ? ` (${standaloneOWs.length})` : ""}
            </span>
          </div>
          <ChevronDown size={9}
            className={`text-muted-foreground/40 transition-transform ${owOpen ? "rotate-180" : ""}`} />
        </button>

        {owOpen && (
          <div className="px-3 pb-3">
            <button onClick={() => setOwSession(true)}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors mb-3 block"
              style={{ fontFamily: MONO }}>
              + New session
            </button>

            {/* Word cloud */}
            {owWordsSorted.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                {owWordsSorted.map(({ word, size }) => {
                  const entry = standaloneOWs.find(e => e.seed_word.toLowerCase().trim() === word);
                  return (
                    <button key={word}
                      onClick={() => entry && setOwDetail(entry)}
                      className="text-muted-foreground/50 hover:text-accent transition-colors italic leading-tight"
                      style={{ fontFamily: SERIF, fontSize: size }}>
                      {word}
                    </button>
                  );
                })}
              </div>
            )}

            {standaloneOWs.length === 0 && (
              <p className="text-[10px] text-muted-foreground/30 italic" style={{ fontFamily: SERIF }}>
                Sessions will appear here as a word cloud.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sign out — bottom, muted */}
      <div className="px-3 py-3 border-t border-border/30">
        <button onClick={onSignOut}
          className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          style={{ fontFamily: MONO }}>
          Sign out
        </button>
      </div>

      {/* Standalone OW session dialog */}
      {owSession && (
        <StandaloneOWDialog
          onClose={() => setOwSession(false)}
          onSaved={entry => setStandaloneOWs(prev => [entry, ...prev])}
        />
      )}

      {/* Standalone OW detail dialog */}
      {owDetail && (
        <StandaloneOWDetail
          entry={owDetail}
          onClose={() => setOwDetail(null)}
          onCreateSong={(seedWord, body) => { onCreateSongFromOW(seedWord, body); setOwDetail(null); }}
          onAddToSong={onAddOWToSong}
        />
      )}
    </aside>
  );
}

// ─── Chords Tab ───────────────────────────────────────────────────────────────

function BarCell({ value, onChange, onKD, onFocus, reff, isDiatonic, warnWavy, nashville, songKey }: {
  value: string; onChange: (v: string) => void;
  onKD?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  reff?: React.Ref<HTMLInputElement>; isDiatonic: boolean; warnWavy: boolean;
  nashville?: boolean; songKey?: string;
}) {
  const displayValue = nashville && songKey && value.trim() ? toNashville(value, songKey) : value;
  return (
    <div className={`shrink-0 flex items-center justify-center ${!isDiatonic && value.trim() ? "bg-amber-50/50" : ""}`}
      style={{ width: CW, height: CH }}>
      {nashville && value.trim() ? (
        <span className={["text-center text-[12px] select-none",
          !isDiatonic && value.trim() ? "text-amber-700" : "text-foreground/70",
          warnWavy && value.trim() ? "underline decoration-red-400 decoration-wavy" : ""].join(" ")}
          style={{ fontFamily: MONO }}>{displayValue}</span>
      ) : (
        <input ref={reff} value={value} onChange={e => { const v = e.target.value; onChange(v ? v[0].toUpperCase() + v.slice(1) : v); }} onKeyDown={onKD} onFocus={onFocus}
          maxLength={8} placeholder="—"
          className={["w-full h-full bg-transparent text-center text-[12px] focus:outline-none caret-accent placeholder:text-muted-foreground/20",
            !isDiatonic && value.trim() ? "text-amber-700" : "text-foreground",
            warnWavy && value.trim() ? "underline decoration-red-400 decoration-wavy" : ""].join(" ")}
          style={{ fontFamily: MONO }} />
      )}
    </div>
  );
}

function ChordRowGrid({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, detected, warnFirst, nashville, songKey,
  onCopyBars, onPasteBars, onRepeatBars, suggestions, showSuggest }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  detected: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  nashville?: boolean; songKey?: string;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions?: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
  showSuggest?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);
  const bars = section.chordBars;
  const setBar = (i: number, v: string) => { const n = [...bars]; n[i] = v; onBarsChange(n); };

  const addBar = () => {
    onBarsChange([...bars, ""]);
    setTimeout(() => refs.current[bars.length]?.focus(), 20);
  };

  // Index of the last real (non-editorial) bar, for Tab-to-add-bar
  const lastRealIdx = bars.reduce((last, b, i) => !isEditorialBar(b) ? i : last, -1);

  const applyChordAt = (barIdx: number, chord: string) => {
    const n = [...bars]; n[barIdx] = chord; onBarsChange(n);
    let next = barIdx + 1;
    while (next < bars.length && isEditorialBar(bars[next])) next++;
    if (next < bars.length) {
      setTimeout(() => refs.current[next]?.focus(), 10);
    } else {
      const extended = [...bars, ""]; extended[barIdx] = chord; onBarsChange(extended);
      setTimeout(() => refs.current[bars.length]?.focus(), 20);
    }
  };

  const onSuggestChord = (chord: string) => {
    if (focusedBarIdx !== null) applyChordAt(focusedBarIdx, chord);
  };

  // Keys for chord shortcut rows (mirrors a QWERTY keyboard layout)
  const INKEY_KEYS  = ["1","2","3","4","5","6","7"];
  const COLOUR_KEYS = ["q","w","e","r","t","y","u"];

  const kd = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Chord suggestion shortcuts — only when panel is active and bar is empty or modifier held
    if (showSuggest && suggestions && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const kidx = INKEY_KEYS.indexOf(e.key);
      if (kidx !== -1 && suggestions.inKey[kidx]) {
        e.preventDefault();
        applyChordAt(i, suggestions.inKey[kidx].chord);
        return;
      }
      const cidx = COLOUR_KEYS.indexOf(e.key.toLowerCase());
      if (cidx !== -1 && suggestions.colour[cidx]) {
        e.preventDefault();
        applyChordAt(i, suggestions.colour[cidx].chord);
        return;
      }
    }

    // Tab on last real bar → append new bar
    if (e.key === "Tab" && !e.shiftKey && i === lastRealIdx) { e.preventDefault(); addBar(); }

    // Arrow navigation — skip editorial bars
    if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      let next = i + 1;
      while (next < bars.length && isEditorialBar(bars[next])) next++;
      refs.current[next]?.focus();
    }
    if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      // If the bar directly behind is a ROW_BREAK, Backspace at position 0
      // is handled below; ArrowLeft should still jump over it
      let prev = i - 1;
      while (prev >= 0 && isEditorialBar(bars[prev])) prev--;
      refs.current[prev]?.focus();
    }

    // Backspace at col 0 with a ROW_BREAK directly behind → remove the row break (merge rows)
    if (e.key === "Backspace"
        && e.currentTarget.selectionStart === 0
        && e.currentTarget.selectionEnd === 0
        && i > 0 && bars[i - 1] === ROW_BREAK) {
      e.preventDefault();
      const n = [...bars];
      n.splice(i - 1, 1);
      onBarsChange(n);
      // The current bar is now at i-1; wait for rerender then focus it
      setTimeout(() => refs.current[i - 1]?.focus(), 20);
      return;
    }

    // Backspace on empty last bar → remove it (trim any trailing ROW_BREAKs too)
    if (e.key === "Backspace" && !e.currentTarget.value && i === bars.length - 1 && bars.length > 1) {
      e.preventDefault();
      let n = bars.slice(0, -1);
      while (n.length > 0 && n[n.length - 1] === ROW_BREAK) n = n.slice(0, -1);
      onBarsChange(n.length > 0 ? n : [""]);
      const prevReal = n.reduce((last, b, j) => !isEditorialBar(b) ? j : last, -1);
      setTimeout(() => { if (prevReal >= 0) refs.current[prevReal]?.focus(); }, 20);
      return;
    }

    // Enter → insert a ROW_BREAK after the current bar, start a new visual row
    if (e.key === "Enter") {
      e.preventDefault();
      const n = [...bars];
      // If already at end, add ROW_BREAK + empty bar; otherwise just insert ROW_BREAK
      if (i >= bars.length - 1) {
        n.push(ROW_BREAK, "");
      } else {
        n.splice(i + 1, 0, ROW_BREAK);
      }
      onBarsChange(n);
      // Focus the first real bar after the new ROW_BREAK
      setTimeout(() => {
        let next = i + 2;
        while (next < n.length && isEditorialBar(n[next])) next++;
        refs.current[next]?.focus();
      }, 20);
    }
  };

  // Split bars into visual rows on ROW_BREAK sentinels
  const visualRows: { bar: string; idx: number }[][] = [[]];
  bars.forEach((bar, barIdx) => {
    if (bar === ROW_BREAK) visualRows.push([]);
    else visualRows[visualRows.length - 1].push({ bar, idx: barIdx });
  });

  const dotBg = {
    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.18) 1px, transparent 1px)`,
    backgroundSize: `${CW}px ${CH}px`,
    scrollbarWidth: "none" as const,
  };

  return (
    <div className="group flex items-stretch border-b border-border/60 last:border-b-0">
      {/* Section label column */}
      <div className={`${SCOL[section.type]} shrink-0 flex flex-col justify-center px-2 border-r border-border`}
        style={{ width: 136, minHeight: CH }}>
        {/* Row 1: label + dup / copy / paste */}
        <div className="flex items-center gap-1">
          <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
            className="bg-transparent text-[10px] uppercase tracking-[0.12em] text-muted-foreground focus:outline-none flex-1 min-w-0 truncate hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }} />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={onDuplicate} title="Duplicate section" className="text-muted-foreground hover:text-foreground transition-colors"><Copy size={10} /></button>
            <button onClick={onCopyBars} title="Copy chords"
              className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
              style={{ fontFamily: MONO }}>cc</button>
            {onPasteBars ? (
              <button onClick={onPasteBars} title="Paste chords"
                className="text-accent hover:text-foreground transition-colors">
                <ClipboardPaste size={10} />
              </button>
            ) : (
              <span className="text-muted-foreground/20 cursor-default"><ClipboardPaste size={10} /></span>
            )}
          </div>
        </div>
        {/* Row 2: up / down */}
        <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMove(-1)} disabled={idx === 0} title="Move up"
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronUp size={10} /></button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} title="Move down"
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronDown size={10} /></button>
        </div>
        {/* Row 3: repeat / delete / naming */}
        <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onRepeatBars} title="Repeat progression"
            className="text-muted-foreground hover:text-foreground transition-colors">
            <Repeat2 size={10} />
          </button>
          <button onClick={onDelete} title="Delete section" className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={10} /></button>
          <button onClick={onToggleNaming} title={namingStyle === "number" ? "Switch to A/B" : "Switch to 1/2"}
            className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
            style={{ fontFamily: MONO }}>{namingStyle === "number" ? "#" : "A"}</button>
        </div>
      </div>

      {/* Multi-row bar grid */}
      <div className="flex-1 overflow-x-auto flex flex-col" style={dotBg}>
        {visualRows.map((row, ri) => (
          <div key={ri} className={`flex items-stretch${ri > 0 ? " border-t border-border/[0.07]" : ""}`}>
            {row.map(({ bar, idx: barIdx }) =>
              bar === PHRASE_MARKER ? (
                /* Phrase-boundary marker — click to remove */
                <button key={barIdx} onClick={() => setBar(barIdx, "")}
                  title="Phrase marker — click to remove"
                  className="shrink-0 flex items-center justify-center text-muted-foreground/25 hover:text-muted-foreground/55 transition-colors"
                  style={{ width: 26, height: CH }}>
                  <span style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1 }}>│</span>
                </button>
              ) : (
                <BarCell key={barIdx} value={bar}
                  onChange={v => {
                    // Intercept single-char marker triggers before they reach the bar
                    if (v === "-" || v === ",") setBar(barIdx, PHRASE_MARKER);
                    else setBar(barIdx, v);
                  }}
                  onKD={kd(barIdx)}
                  onFocus={() => setFocusedBarIdx(barIdx)}
                  reff={el => { refs.current[barIdx] = el; }}
                  isDiatonic={!detected || !bar.trim() || isEditorialBar(bar) || inKey(bar, detected.key, detected.mode as "major"|"minor")}
                  warnWavy={warnFirst && barIdx === 0 && !isEditorialBar(bar)}
                  nashville={nashville} songKey={songKey} />
              )
            )}
            {/* Add-bar button only on the last visual row */}
            {ri === visualRows.length - 1 && (
              <div className="shrink-0 flex items-center justify-center" style={{ width: CW, height: CH }}>
                <button onClick={addBar}
                  className="w-5 h-5 rounded-full border border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center">
                  <Plus size={10} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Desktop chord suggestion panel */}
        {showSuggest && suggestions && (
          <div className="border-t border-border/40 px-3 py-2.5 bg-muted/20">
            {focusedBarIdx === null && (
              <p className="text-[10px] text-muted-foreground/60 italic" style={{ fontFamily: MONO }}>
                Click a bar above, then use shortcuts or click a chord
              </p>
            )}
            {(() => {
              const SuggestGroup = ({ heading, items, keyRow }: { heading: string; items: ChordSuggestion[]; keyRow?: string[] }) =>
                items.length ? (
                  <div className="flex items-start gap-2 mr-5 mb-1">
                    <span className="text-[8px] uppercase tracking-[0.14em] text-muted-foreground shrink-0 mt-2 w-9 text-right leading-tight" style={{ fontFamily: MONO }}>{heading}</span>
                    <div className="flex flex-wrap gap-1">
                      {items.map((s, si) => (
                        <button key={s.chord + s.label} onClick={() => onSuggestChord(s.chord)}
                          className="relative flex flex-col items-center justify-center min-w-[42px] px-2 pt-3 pb-1 rounded border border-border bg-background hover:bg-muted hover:border-foreground/30 transition-colors"
                          style={{ fontFamily: MONO }}>
                          {keyRow?.[si] && (
                            <span className="absolute top-0.5 right-1 text-[7px] text-muted-foreground/50 leading-none" style={{ fontFamily: MONO }}>{keyRow[si]}</span>
                          )}
                          <span className="text-[11px] text-foreground leading-tight">{s.chord}</span>
                          {s.label && <span className="text-[7px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{s.label}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;

              return (
                <div>
                  <div className="flex flex-wrap">
                    <SuggestGroup heading="In key" items={suggestions.inKey} keyRow={INKEY_KEYS} />
                    <SuggestGroup heading="Used" items={suggestions.used} />
                    <SuggestGroup heading="Colour" items={suggestions.colour} keyRow={COLOUR_KEYS} />
                  </div>
                  {suggestions.inKey.length === 0 && suggestions.used.length === 0 && suggestions.colour.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/60 italic" style={{ fontFamily: MONO }}>
                      Add chords to see suggestions
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mobile Chord Picker + Section ──────────────────────────────────────────────

function ChordChip({ chord, label, onTap }: { chord: string; label: string; onTap: () => void }) {
  return (
    <button onClick={onTap}
      className="flex flex-col items-center justify-center min-w-[54px] px-2.5 py-1.5 rounded-md border border-border bg-background active:bg-muted transition-colors"
      style={{ fontFamily: MONO }}>
      <span className="text-[13px] text-foreground leading-tight">{chord}</span>
      {label && <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{label}</span>}
    </button>
  );
}

function ChordPickerSheet({ open, title, value, suggestions, onClose, onSet, onClear, onDelete, onStep, canPrev, canNext }: {
  open: boolean; title: string; value: string;
  suggestions: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
  onClose: () => void;
  onSet: (chord: string, advance: boolean) => void;   // set current bar; advance to next when true
  onClear: () => void;
  onDelete: () => void;
  onStep: (dir: -1 | 1) => void;
  canPrev: boolean; canNext: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value, open]);

  const Group = ({ heading, items }: { heading: string; items: ChordSuggestion[] }) =>
    items.length ? (
      <div className="mb-4">
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-2" style={{ fontFamily: MONO }}>{heading}</div>
        <div className="flex flex-wrap gap-2">
          {items.map(s => <ChordChip key={s.chord + s.label} chord={s.chord} label={s.label} onTap={() => onSet(s.chord, true)} />)}
        </div>
      </div>
    ) : null;

  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">Choose a chord for this bar</DrawerDescription>
        <div className="overflow-y-auto px-4 pb-6 pt-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: MONO }}>{title}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => onStep(-1)} disabled={!canPrev} title="Previous bar"
                className="p-1.5 rounded border border-border text-muted-foreground disabled:opacity-25 active:bg-muted transition-colors"><ChevronUp size={13} className="-rotate-90" /></button>
              <button onClick={() => onStep(1)} disabled={!canNext} title="Next bar"
                className="p-1.5 rounded border border-border text-muted-foreground disabled:opacity-25 active:bg-muted transition-colors"><ChevronUp size={13} className="rotate-90" /></button>
            </div>
          </div>

          {/* Keyboard input — free editing, always available */}
          <div className="flex items-center gap-2 mb-4">
            <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus placeholder="Type a chord…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSet(draft.trim(), true); } }}
              className="flex-1 min-w-0 bg-transparent border border-border rounded-md px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/40"
              style={{ fontFamily: MONO }} />
            <button onClick={() => onSet(draft.trim(), true)}
              className="shrink-0 px-3 py-2 rounded-md border border-foreground/30 text-[13px] text-foreground bg-muted/40 active:bg-muted transition-colors"
              style={{ fontFamily: MONO }}>Set</button>
          </div>

          <Group heading="In key" items={suggestions.inKey} />
          <Group heading="Used so far" items={suggestions.used} />
          <Group heading="More colour" items={suggestions.colour} />

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button onClick={onClear}
              className="text-[12px] px-3 py-1.5 rounded-sm border border-border text-muted-foreground active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Clear</button>
            <button onClick={onDelete}
              className="text-[12px] px-3 py-1.5 rounded-sm border border-border text-destructive active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Delete bar</button>
            <button onClick={onClose}
              className="ml-auto text-[12px] px-4 py-1.5 rounded-sm border border-foreground/30 text-foreground bg-muted/40 active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Done</button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MobileChordSection({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, detected, warnFirst,
  onCopyBars, onPasteBars, onRepeatBars, suggestions }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  detected: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
}) {
  const [showActions, setShowActions] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const bars = section.chordBars;
  const setBar = (i: number, v: string) => { const n = [...bars]; n[i] = v; onBarsChange(n); };

  const isReal = (i: number) => i >= 0 && i < bars.length && !isEditorialBar(bars[i]);
  const nextReal = (from: number) => { let i = from + 1; while (i < bars.length && isEditorialBar(bars[i])) i++; return i < bars.length ? i : -1; };
  const prevReal = (from: number) => { let i = from - 1; while (i >= 0 && isEditorialBar(bars[i])) i--; return i >= 0 ? i : -1; };

  const addBar = () => { const n = [...bars, ""]; onBarsChange(n); setSel(n.length - 1); };

  // Set the selected bar, optionally advancing to the next real bar (append if needed)
  const setSelected = (chord: string, advance: boolean) => {
    if (sel === null) return;
    const n = [...bars]; n[sel] = chord;
    if (!advance) { onBarsChange(n); return; }
    const nxt = nextReal(sel);
    if (nxt === -1) { n.push(""); onBarsChange(n); setSel(n.length - 1); }
    else { onBarsChange(n); setSel(nxt); }
  };

  const step = (dir: -1 | 1) => {
    if (sel === null) return;
    const t = dir === 1 ? nextReal(sel) : prevReal(sel);
    if (t !== -1) setSel(t);
    else if (dir === 1) addBar();
  };

  // Split into visual rows on ROW_BREAK
  const visualRows: { bar: string; idx: number }[][] = [[]];
  bars.forEach((bar, barIdx) => {
    if (bar === ROW_BREAK) visualRows.push([]);
    else visualRows[visualRows.length - 1].push({ bar, idx: barIdx });
  });

  const actionBtn = "flex items-center gap-1 text-[11px] text-muted-foreground active:text-foreground transition-colors";

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* Section header (sits above the bars) */}
      <div className={`${SCOL[section.type]} flex items-center gap-2 px-3 py-2`}>
        <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
          className="bg-transparent text-[11px] uppercase tracking-[0.12em] text-foreground/80 focus:outline-none flex-1 min-w-0 truncate"
          style={{ fontFamily: MONO }} />
        <button onClick={() => setShowActions(v => !v)}
          className="shrink-0 text-muted-foreground active:text-foreground transition-colors px-1.5 py-0.5 text-[13px] leading-none tracking-wide"
          style={{ fontFamily: MONO }} title="Section actions">⋯</button>
      </div>

      {/* Collapsible action row */}
      {showActions && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-muted/30 border-t border-border/50" style={{ fontFamily: MONO }}>
          <button onClick={() => onMove(-1)} disabled={idx === 0} className={`${actionBtn} disabled:opacity-25`}><ChevronUp size={12} />Up</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} className={`${actionBtn} disabled:opacity-25`}><ChevronDown size={12} />Down</button>
          <button onClick={onDuplicate} className={actionBtn}><Copy size={12} />Duplicate</button>
          <button onClick={onCopyBars} className={actionBtn}><span className="text-[10px]">cc</span>Copy</button>
          {onPasteBars && <button onClick={onPasteBars} className={`${actionBtn} text-accent`}><ClipboardPaste size={12} />Paste</button>}
          <button onClick={onRepeatBars} className={actionBtn}><Repeat2 size={12} />Repeat</button>
          <button onClick={onToggleNaming} className={actionBtn}><span className="text-[11px]">{namingStyle === "number" ? "#" : "A"}</span>{namingStyle === "number" ? "1/2" : "A/B"}</button>
          <button onClick={onDelete} className={`${actionBtn} active:text-destructive`}><Trash2 size={12} />Delete</button>
        </div>
      )}

      {/* Bars — tap to edit */}
      <div className="px-3 py-3 flex flex-col gap-2">
        {visualRows.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center gap-2">
            {row.map(({ bar, idx: barIdx }) =>
              bar === PHRASE_MARKER ? (
                <button key={barIdx} onClick={() => setBar(barIdx, "")} title="Phrase marker — tap to remove"
                  className="text-muted-foreground/40 active:text-muted-foreground px-1" style={{ fontFamily: MONO, fontSize: 16 }}>│</button>
              ) : (
                <button key={barIdx} onClick={() => setSel(barIdx)}
                  className={[
                    "min-w-[56px] h-11 px-2 rounded-md border flex items-center justify-center transition-colors",
                    sel === barIdx ? "border-foreground/50 bg-muted/50" : "border-border active:bg-muted/40",
                    detected && bar.trim() && !inKey(bar, detected.key, detected.mode) ? "text-amber-700" : "text-foreground",
                    warnFirst && barIdx === 0 && bar.trim() ? "underline decoration-red-400 decoration-wavy" : "",
                  ].join(" ")}
                  style={{ fontFamily: MONO, fontSize: 14 }}>
                  {bar.trim() || <Plus size={13} className="text-muted-foreground/50" />}
                </button>
              )
            )}
            {ri === visualRows.length - 1 && (
              <button onClick={addBar} title="Add bar"
                className="w-9 h-11 rounded-md border border-dashed border-border text-muted-foreground active:border-foreground active:text-foreground transition-colors flex items-center justify-center">
                <Plus size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <ChordPickerSheet
        open={sel !== null && isReal(sel)}
        title={`${section.shortLabel || section.label} · bar ${sel !== null ? bars.slice(0, sel + 1).filter(b => !isEditorialBar(b)).length : ""}`}
        value={sel !== null ? bars[sel] ?? "" : ""}
        suggestions={suggestions}
        onClose={() => setSel(null)}
        onSet={setSelected}
        onClear={() => { if (sel !== null) setBar(sel, ""); }}
        onDelete={() => {
          if (sel === null) return;
          const n = bars.filter((_, i) => i !== sel);
          onBarsChange(n.length ? n : [""]);
          setSel(null);
        }}
        onStep={step}
        canPrev={sel !== null && prevReal(sel) !== -1}
        canNext={sel !== null} />
    </div>
  );
}

// ─── Final Tab ────────────────────────────────────────────────────────────────

function FinalSectionView({ section, charWidth, onUpdate, isMobile }: {
  section: Section; charWidth: number; onUpdate: (p: Partial<Section>) => void; isMobile?: boolean;
}) {
  const [selId, setSelId]       = useState<string | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [addAt, setAddAt]       = useState<{ li: number; ci: number } | null>(null);
  const [addVal, setAddVal]     = useState("");
  const [editLine, setEditLine] = useState<number | null>(null);
  // Mobile: sheet open for placing a chord
  const [mobileSheet, setMobileSheet] = useState<{ li: number; ci: number } | null>(null);
  const [mobileSheetVal, setMobileSheetVal] = useState("");

  const lines      = (section.lyrics ?? "").split("\n");
  const cps        = section.chordPositions ?? [];
  const lineChords = (li: number) => sortCP(cps.filter(cp => cp.lineIdx === li));

  // Helper: compute destination charIdx when moving a chord to a different line.
  // Always appends after existing chords on the dest line; preserves charIdx when dest is empty.
  const destCharIdx = (sel: CP, newLineIdx: number) => {
    if (newLineIdx === sel.lineIdx) return sel.charIdx;
    const destChords = cps.filter(cp => cp.id !== sel.id && cp.lineIdx === newLineIdx);
    if (destChords.length === 0) return sel.charIdx;
    return Math.max(...destChords.map(c => c.charIdx + c.chord.length + 1));
  };

  // Desktop keyboard handler
  useEffect(() => {
    if (isMobile) return;
    if (selId === null || editId !== null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const step = e.shiftKey ? 4 : 1;
        const moved = cps.map(cp =>
          cp.id === selId ? { ...cp, charIdx: Math.max(0, cp.charIdx + dir * step) } : cp);
        const resolved = resolveOverlaps(moved);
        // ← only update positions; chordBars sequence is owned by the Chords tab
        onUpdate({ chordPositions: resolved });
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const sel = cps.find(cp => cp.id === selId);
        if (!sel) return;
        const newLineIdx = Math.max(0, Math.min(lines.length - 1, sel.lineIdx + dir));
        if (newLineIdx === sel.lineIdx) return; // already at boundary
        const moved = cps.map(cp =>
          cp.id === selId
            ? { ...cp, lineIdx: newLineIdx, charIdx: destCharIdx(sel, newLineIdx) }
            : cp);
        const resolved = resolveOverlaps(moved);
        onUpdate({ chordPositions: resolved });
      }
      if ((e.key === "Delete" || e.key === "Backspace") && editLine === null) {
        const np = cps.filter(cp => cp.id !== selId);
        onUpdate({ chordPositions: np });
        setSelId(null);
      }
      if (e.key === "Escape") setSelId(null);
      if ((e.key === "Enter" || e.key === "F2") && editLine === null) { e.preventDefault(); setEditId(selId); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selId, editId, editLine, cps, lines.length, onUpdate, isMobile]);

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>, li: number) => {
    if (editId !== null) return;
    if (isMobile) return; // mobile uses tap handler below
    const rect = e.currentTarget.getBoundingClientRect();
    const ci = Math.max(0, Math.round((e.clientX - rect.left) / charWidth));
    setAddAt({ li, ci }); setAddVal("");
  };

  // Mobile: tap chord row to open sheet at approximate char position
  const handleRowTap = (e: React.TouchEvent<HTMLDivElement>, li: number) => {
    if (selId !== null) { setSelId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const ci = Math.max(0, Math.round((touch.clientX - rect.left) / charWidth));
    setMobileSheet({ li, ci });
    setMobileSheetVal("");
  };

  const commitAdd = () => {
    if (!addAt || !addVal.trim()) { setAddAt(null); return; }
    const raw = sortCP([...cps, { id: uid(), lineIdx: addAt.li, charIdx: addAt.ci, chord: addVal.trim() }]);
    const resolved = resolveOverlaps(raw);
    onUpdate({ chordPositions: resolved, chordBars: resolved.map(p => p.chord) });
    setAddAt(null); setAddVal("");
  };

  const commitMobileAdd = () => {
    if (!mobileSheet || !mobileSheetVal.trim()) { setMobileSheet(null); return; }
    const raw = sortCP([...cps, { id: uid(), lineIdx: mobileSheet.li, charIdx: mobileSheet.ci, chord: mobileSheetVal.trim() }]);
    const resolved = resolveOverlaps(raw);
    onUpdate({ chordPositions: resolved, chordBars: resolved.map(p => p.chord) });
    setMobileSheet(null); setMobileSheetVal("");
  };

  const updateChordVal = (id: string, chord: string) => {
    const np = cps.map(cp => cp.id === id ? { ...cp, chord } : cp);
    onUpdate({ chordPositions: np });
  };

  const updateLine = (li: number, val: string) => {
    const ls = [...lines]; ls[li] = val;
    onUpdate({ lyrics: ls.join("\n") });
  };

  // Mobile chord move helpers
  const moveSelChord = (dir: "left" | "right" | "up" | "down") => {
    if (!selId) return;
    if (dir === "left" || dir === "right") {
      const d = dir === "left" ? -1 : 1;
      const moved = cps.map(cp => cp.id === selId ? { ...cp, charIdx: Math.max(0, cp.charIdx + d) } : cp);
      const resolved = resolveOverlaps(moved);
      onUpdate({ chordPositions: resolved });
    } else {
      const d = dir === "down" ? 1 : -1;
      const sel = cps.find(cp => cp.id === selId);
      if (!sel) return;
      const newLineIdx = Math.max(0, Math.min(lines.length - 1, sel.lineIdx + d));
      if (newLineIdx === sel.lineIdx) return; // already at boundary
      const moved = cps.map(cp => cp.id === selId ? { ...cp, lineIdx: newLineIdx, charIdx: destCharIdx(sel, newLineIdx) } : cp);
      const resolved = resolveOverlaps(moved);
      onUpdate({ chordPositions: resolved });
    }
  };

  const deleteSelChord = () => {
    if (!selId) return;
    const np = cps.filter(cp => cp.id !== selId);
    onUpdate({ chordPositions: np });
    setSelId(null);
  };

  const selChord = selId ? cps.find(cp => cp.id === selId) : null;

  return (
    <div className="mb-8">
      <div className={`${SCOL[section.type]} inline-block text-xs px-2 py-0.5 rounded-sm mb-3 border border-border`}
        style={{ fontFamily: MONO }}>{section.label}</div>

      {/* Mobile: selected chord mini-toolbar */}
      {isMobile && selChord && (
        <div className="flex items-center gap-1 mb-2 px-1 py-1.5 bg-muted/40 rounded-sm border border-border/60">
          <span className="text-xs text-accent font-medium px-2 py-0.5 bg-accent/10 rounded shrink-0" style={{ fontFamily: MONO }}>{selChord.chord}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => moveSelChord("left")}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>←</button>
            <button onClick={() => moveSelChord("right")}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>→</button>
            <button onClick={() => moveSelChord("up")}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>↑</button>
            <button onClick={() => moveSelChord("down")}
              className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>↓</button>
          </div>
          <button onClick={() => setEditId(selId)}
            className="text-[11px] px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground ml-1 transition-colors"
            style={{ fontFamily: MONO }}>edit</button>
          <button onClick={deleteSelChord}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors ml-auto">
            <X size={12} />
          </button>
          <button onClick={() => setSelId(null)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1">done</button>
        </div>
      )}

      <div style={{ fontFamily: MONO, fontSize: FS }}>
        {lines.map((line, li) => (
          <div key={li} className="mb-2">
            <div
              className={`relative select-none ${isMobile ? "cursor-default" : "cursor-crosshair"}`}
              style={{ height: 22 }}
              onClick={isMobile ? undefined : e => handleRowClick(e, li)}
              onTouchEnd={isMobile ? e => handleRowTap(e, li) : undefined}>
              {lineChords(li).map(cp => (
                <span key={cp.id}
                  style={{ position: "absolute", left: `${cp.charIdx}ch`, fontFamily: MONO, fontSize: FS, top: -2, whiteSpace: "nowrap" }}
                  className={`cursor-pointer transition-colors px-1 py-1 rounded ${selId === cp.id ? "text-foreground bg-accent/20" : "text-accent hover:bg-accent/10"}`}
                  onClick={e => { e.stopPropagation(); setSelId(cp.id); setEditId(null); }}
                  onDoubleClick={isMobile ? undefined : e => { e.stopPropagation(); setSelId(cp.id); setEditId(cp.id); }}>
                  {editId === cp.id ? (
                    <input value={cp.chord} onChange={e => updateChordVal(cp.id, e.target.value)}
                      onBlur={() => setEditId(null)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditId(null); }}
                      autoFocus
                      className="bg-transparent focus:outline-none border-b border-accent text-foreground"
                      style={{ width: `${Math.max(cp.chord.length + 1, 3)}ch`, fontFamily: MONO, fontSize: FS }} />
                  ) : cp.chord}
                </span>
              ))}
              {!isMobile && addAt?.li === li && (
                <input value={addVal} onChange={e => setAddVal(e.target.value)}
                  onBlur={commitAdd} onKeyDown={e => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") setAddAt(null); }}
                  autoFocus placeholder="chord"
                  className="absolute bg-background border border-accent/60 rounded px-1 focus:outline-none text-foreground placeholder:text-muted-foreground/40"
                  style={{ left: `${addAt.ci}ch`, top: 0, width: "5ch", fontFamily: MONO, fontSize: FS, height: 20 }} />
              )}
            </div>
            {editLine === li ? (
              <input value={line} onChange={e => updateLine(li, e.target.value)}
                onBlur={() => setEditLine(null)} onKeyDown={e => { if (e.key === "Escape") setEditLine(null); }}
                autoFocus className="bg-transparent focus:outline-none border-b border-border text-foreground w-full"
                style={{ fontFamily: MONO, fontSize: FS, lineHeight: 1.6 }} />
            ) : (
              <div onClick={() => setEditLine(li)} className="cursor-text text-foreground"
                style={{ fontFamily: MONO, fontSize: FS, lineHeight: 1.6, whiteSpace: "pre", minHeight: "1.6em" }}>
                {line || " "}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: chord placement drawer */}
      {isMobile && (
        <Drawer open={mobileSheet !== null} onOpenChange={open => { if (!open) setMobileSheet(null); }}>
          <DrawerContent>
            <DrawerTitle className="sr-only">Place chord</DrawerTitle>
            <DrawerDescription className="sr-only">Type a chord to place on this lyric line</DrawerDescription>
            <div className="px-5 pt-4 pb-8">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3" style={{ fontFamily: MONO }}>
                Place chord — line {mobileSheet ? mobileSheet.li + 1 : ""}
              </p>
              <div className="flex gap-2">
                <input
                  value={mobileSheetVal}
                  onChange={e => setMobileSheetVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitMobileAdd(); if (e.key === "Escape") setMobileSheet(null); }}
                  autoFocus
                  placeholder="e.g. Am7"
                  className="flex-1 bg-transparent border-b border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent pb-1 transition-colors"
                  style={{ fontFamily: MONO }}
                />
                <button
                  onClick={commitMobileAdd}
                  disabled={!mobileSheetVal.trim()}
                  className="text-[12px] px-3 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  style={{ fontFamily: MONO }}>
                  Place
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-2" style={{ fontFamily: MONO }}>
                tap a chord after placing to select · use toolbar to move or delete
              </p>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

// ─── Lyrics Tab ───────────────────────────────────────────────────────────────

function AutoTA({ value, onChange, placeholder, serif = false, rows = 3, onWordSelect, dimText = false, innerRef }: {
  value: string; onChange: (v: string) => void; placeholder?: string; serif?: boolean; rows?: number;
  onWordSelect?: (w: string) => void; dimText?: boolean; innerRef?: RefObject<HTMLTextAreaElement>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const r = (innerRef ?? localRef) as RefObject<HTMLTextAreaElement>;
  useEffect(() => {
    if (r.current) { r.current.style.height = "auto"; r.current.style.height = r.current.scrollHeight + "px"; }
  }, [value]);
  return (
    <textarea ref={r} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className={`w-full bg-transparent text-xs placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.85] transition-colors duration-300 ${dimText ? "text-foreground/40" : "text-foreground"}`}
      style={{ fontFamily: serif ? SERIF : MONO }}
      onSelect={onWordSelect ? e => {
        const ta = e.currentTarget;
        const sel = ta.value.substring(ta.selectionStart ?? 0, ta.selectionEnd ?? 0).trim();
        if (sel.length >= 2 && /^[a-zA-Z''\-]+$/.test(sel) && !sel.includes(" ")) {
          onWordSelect(sel.toLowerCase().replace(/[^a-z']/g, ""));
        }
      } : undefined} />
  );
}

// ─── Inspiration Panel ────────────────────────────────────────────────────────

type InspirationMode = "fragments" | "form";
const FRAGMENT_INTERVAL = 15000; // ms — auto-cycle interval

function InspirationPanel({ song, onAddVerse }: { song: Song; onAddVerse: (lyrics: string) => void }) {
  const [mode,      setMode]      = useState<InspirationMode>("fragments");
  const [collapsed, setCollapsed] = useState(false);

  // ── Fragments ──────────────────────────────────────────────────────────────
  // Source: Notebook + OW + Big Idea + Story — deliberately NOT Production Notes
  const fragmentSource = useMemo(() => [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" "), [song.generalNotes, song.bigIdea, song.story, song.objectWritings]);

  const hasFragmentContent = fragmentSource.replace(/\s/g, "").length > 20;

  const [fragmentGroup, setFragmentGroup] = useState<string[]>([]);
  const [paused,        setPaused]        = useState(false);
  const [fading,        setFading]        = useState(false);

  const cycleFragments = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setFragmentGroup(pickFragmentGroup(fragmentSource));
      setFading(false);
    }, 480);
  }, [fragmentSource]);

  // Seed on mount / when content first appears
  useEffect(() => {
    if (hasFragmentContent && fragmentGroup.length === 0)
      setFragmentGroup(pickFragmentGroup(fragmentSource));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFragmentContent]);

  // Auto-cycle
  useEffect(() => {
    if (paused || !hasFragmentContent) return;
    const id = setInterval(cycleFragments, FRAGMENT_INTERVAL);
    return () => clearInterval(id);
  }, [paused, hasFragmentContent, cycleFragments]);

  // ── Form ───────────────────────────────────────────────────────────────────
  // Same source pool as fragments (OW + Notebook + Big Idea/Story)
  const [formSectionId, setFormSectionId] = useState("");
  const [skeleton,      setSkeleton]      = useState("");

  const effectiveFormSection = useMemo(() => {
    const byId = song.sections.find(s => s.id === formSectionId);
    return byId ?? song.sections.find(s => (s.lyrics ?? "").trim()) ?? song.sections[0] ?? null;
  }, [formSectionId, song.sections]);

  const generateSkeleton = useCallback(() => {
    setSkeleton(buildSkeletonLyrics(effectiveFormSection, fragmentSource));
  }, [effectiveFormSection, fragmentSource]);

  const tabs: { id: InspirationMode; label: string }[] = [
    { id: "fragments", label: "Fragments" },
    { id: "form",      label: "Form"      },
  ];

  const empty = (msg: string) => (
    <p className="text-[12px] text-muted-foreground/50 italic text-center py-4 px-2 leading-relaxed"
      style={{ fontFamily: SERIF }}>{msg}</p>
  );

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Inspiration
        </span>
        {mode === "fragments" && !collapsed && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }}>{paused ? "▶" : "⏸"}</button>
            <button onClick={cycleFragments} title="Next fragment"
              className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }}>↻</button>
          </div>
        )}
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors ml-2"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Mode tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            className={`flex-1 py-1.5 text-[10px] transition-colors ${mode === t.id ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
            style={{ fontFamily: MONO, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 min-h-[180px]">

        {/* Fragments — auto-cycling ambient display */}
        {mode === "fragments" && (
          !hasFragmentContent
            ? empty("Write in Object Writing, Notebook, or your Big Idea to see fragments here.")
            : (
              <div className={`flex flex-col items-center justify-center min-h-[150px] gap-2.5 transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"}`}>
                {fragmentGroup.length === 0 ? (
                  <span className="text-[12px] text-muted-foreground/30 italic" style={{ fontFamily: SERIF }}>…</span>
                ) : fragmentGroup.map((f, i) => (
                  <span key={`${i}-${f}`}
                    className={
                      fragmentGroup.length === 1 ? "text-[20px] text-foreground/85 italic leading-snug" :
                      i === 0                    ? "text-[16px] text-foreground/80 italic leading-snug" :
                      i === 1                    ? "text-[13px] text-muted-foreground/65 italic leading-snug" :
                                                   "text-[11px] text-muted-foreground/45 italic leading-snug"
                    }
                    style={{ fontFamily: SERIF, textAlign: "center", maxWidth: "92%" }}>
                    {f}
                  </span>
                ))}
                {!paused && fragmentGroup.length > 0 && (
                  <span className="mt-2 text-[8px] text-muted-foreground/20 tracking-widest" style={{ fontFamily: MONO }}>
                    · · ·
                  </span>
                )}
              </div>
            )
        )}

        {/* Form — section-aware blank-verse skeleton generator */}
        {mode === "form" && (
          <div className="flex flex-col gap-3">
            {/* Section selector + re-roll */}
            <div className="flex items-center gap-2">
              <select
                value={effectiveFormSection?.id ?? ""}
                onChange={e => { setFormSectionId(e.target.value); setSkeleton(""); }}
                className="flex-1 min-w-0 text-[10px] bg-transparent border border-border/50 rounded-sm px-1.5 py-1 text-foreground/70 focus:outline-none cursor-pointer"
                style={{ fontFamily: MONO }}>
                {song.sections.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {skeleton && (
                <button onClick={generateSkeleton} title="Re-roll skeleton"
                  className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 leading-none"
                  style={{ fontFamily: MONO }}>↻</button>
              )}
            </div>

            {song.sections.length === 0 ? (
              empty("Add sections in Lyrics first.")
            ) : !skeleton ? (
              <div className="flex flex-col items-center gap-2.5 py-3">
                <p className="text-[12px] text-muted-foreground/50 italic text-center leading-relaxed" style={{ fontFamily: SERIF }}>
                  Mirror {effectiveFormSection?.label ?? "a section"}'s shape — mostly blank, a few of your own words dropped in.
                </p>
                <button onClick={generateSkeleton}
                  className="text-[11px] px-3 py-1.5 border border-border/60 rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  style={{ fontFamily: MONO }}>
                  Generate skeleton
                </button>
              </div>
            ) : (
              <>
                {/* Skeleton preview */}
                <div className="bg-muted/20 rounded-sm border border-border/40 px-3 py-3 space-y-0.5">
                  {skeleton.split("\n").map((line, i) => (
                    <div key={i} className="text-[11px] leading-[1.85] text-foreground/60" style={{ fontFamily: MONO }}>
                      {line}
                    </div>
                  ))}
                </div>
                {/* Insert button */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/35 italic" style={{ fontFamily: SERIF }}>
                    based on {effectiveFormSection?.label ?? "section"} shape
                  </span>
                  <button onClick={() => { onAddVerse(skeleton); setSkeleton(""); }}
                    className="text-[10px] px-3 py-1 border border-border/60 rounded-sm text-accent hover:text-foreground hover:border-foreground/30 transition-colors"
                    style={{ fontFamily: MONO }}>
                    Gaps ↓
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      </>}
    </div>
  );
}

// ─── Rhyme & Metre Panel ──────────────────────────────────────────────────────

interface RhymeResult { word: string; syl: number; ow: boolean; near: boolean }

function RhymePanel({ song, selectionWord }: { song: Song; selectionWord?: { word: string; seq: number } | null }) {
  const [word,      setWord]      = useState("");
  const [target,    setTarget]    = useState("");
  const [results,   setResults]   = useState<RhymeResult[]>([]);
  const [status,    setStatus]    = useState<"idle"|"loading"|"done"|"error">("idle");
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout>>();

  // When user highlights a word in a lyric box, adopt it — object reference always changes so effect always fires
  useEffect(() => {
    if (selectionWord?.word) setWord(selectionWord.word);
  }, [selectionWord]);

  // All words appearing in Object Writing entries
  const owWords = useMemo(() => {
    const s = new Set<string>();
    (song.objectWritings ?? []).forEach(o =>
      (o.text ?? "").toLowerCase().match(/\b[a-z]{3,}\b/g)?.forEach(w => s.add(w))
    );
    return s;
  }, [song.objectWritings]);

  const fetchRhymes = useCallback(async (q: string) => {
    const w = q.trim().toLowerCase();
    if (!w) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    try {
      const [pRes, nRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(w)}&max=40&md=s`),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(w)}&max=40&md=s`),
      ]);
      if (!pRes.ok || !nRes.ok) throw new Error("fetch failed");
      const perf: { word: string; numSyllables?: number }[] = await pRes.json();
      const near: { word: string; numSyllables?: number }[] = await nRes.json();
      const perfSet = new Set(perf.map(r => r.word));
      const combined: RhymeResult[] = [
        ...perf.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, ow: owWords.has(r.word), near: false })),
        ...near.filter(r => !perfSet.has(r.word))
              .map(r => ({ word: r.word, syl: r.numSyllables ?? 0, ow: owWords.has(r.word), near: true })),
      ];
      // Sort: OW first within perfect, then OW first within near
      combined.sort((a, b) => {
        if (a.near !== b.near) return a.near ? 1 : -1;
        return (b.ow ? 1 : 0) - (a.ow ? 1 : 0);
      });
      setResults(combined);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [owWords]);

  // Debounced auto-fetch on word change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!word.trim()) { setResults([]); setStatus("idle"); return; }
    debounceRef.current = setTimeout(() => fetchRhymes(word), 620);
    return () => clearTimeout(debounceRef.current);
  }, [word, fetchRhymes]);

  const targetSyl = parseInt(target, 10);
  const hasSylFilter = target.trim() !== "" && !isNaN(targetSyl) && targetSyl > 0;

  const visible = results.filter(r => !hasSylFilter || r.syl === targetSyl);
  const perfect = visible.filter(r => !r.near);
  const nearR   = visible.filter(r => r.near);
  const hasOW   = visible.some(r => r.ow);

  const Chip = ({ r }: { r: RhymeResult }) => (
    <span
      className={`inline-flex items-baseline gap-0.5 leading-snug ${
        r.ow   ? "text-accent"
        : r.near ? "text-muted-foreground/45 italic"
        : "text-foreground/70"
      }`}
      style={{ fontFamily: r.near && !r.ow ? SERIF : MONO }}
      title={`${r.syl || "?"} syl${r.syl !== 1 ? "s" : ""}${r.ow ? " · in your object writing" : ""}`}>
      {r.ow && <span className="text-accent text-[8px] leading-none mr-px">◆</span>}
      <span className="text-[12px]">{r.word}</span>
      {r.syl > 0 && (
        <span className="text-[9px] text-muted-foreground/30 ml-0.5" style={{ fontFamily: MONO }}>{r.syl}</span>
      )}
    </span>
  );

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Rhyme &amp; Metre
        </span>
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Inputs */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40 flex items-center gap-2">
        <input value={word} onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchRhymes(word)}
          placeholder="word…"
          className="flex-1 min-w-0 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 transition-colors"
          style={{ fontFamily: MONO }} />
        {word && selectionWord?.word && word === selectionWord.word && (
          <span className="text-[9px] text-muted-foreground/30 shrink-0" style={{ fontFamily: MONO }}>← lyrics</span>
        )}
        <span className="text-muted-foreground/25 text-[12px] shrink-0" style={{ fontFamily: MONO }}>·</span>
        <input value={target} onChange={e => setTarget(e.target.value)}
          placeholder="syl"
          className="w-8 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 text-center transition-colors"
          style={{ fontFamily: MONO }} />
      </div>

      {/* Results */}
      <div className="p-3 min-h-[110px]">
        {status === "loading" && (
          <p className="text-[10px] text-muted-foreground/30 text-center py-3" style={{ fontFamily: MONO }}>…</p>
        )}
        {status === "error" && (
          <p className="text-[10px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            Couldn't reach rhyme service
          </p>
        )}
        {status === "idle" && (
          <p className="text-[12px] text-muted-foreground/35 italic text-center py-3 leading-relaxed"
            style={{ fontFamily: SERIF }}>Type a word to find rhymes</p>
        )}
        {status === "done" && visible.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            No rhymes{hasSylFilter ? ` with ${targetSyl} syl${targetSyl !== 1 ? "s" : ""}` : ""}
          </p>
        )}

        {status === "done" && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Perfect rhymes */}
            {perfect.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 mb-1.5"
                  style={{ fontFamily: MONO }}>Perfect</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
                  {perfect.map(r => <Chip key={r.word} r={r} />)}
                </div>
              </div>
            )}
            {/* Near rhymes */}
            {nearR.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 mb-1.5"
                  style={{ fontFamily: MONO }}>Near</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
                  {nearR.map(r => <Chip key={r.word} r={r} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OW legend */}
      {hasOW && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5">
          <span className="text-accent text-[9px]">◆</span>
          <span className="text-[9px] text-muted-foreground/35" style={{ fontFamily: MONO }}>in your object writing</span>
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Thesaurus Panel ─────────────────────────────────────────────────────────

interface ThesaurusResult { word: string; syl: number; type: "syn" | "ant" | "rel" }

function ThesaurusPanel({ song, selectionWord, onObjectWrite }: {
  song: Song;
  selectionWord?: { word: string; seq: number } | null;
  onObjectWrite?: (word: string) => void;
}) {
  const [word,      setWord]      = useState("");
  const [results,   setResults]   = useState<ThesaurusResult[]>([]);
  const [status,    setStatus]    = useState<"idle"|"loading"|"done"|"error">("idle");
  const [copied,    setCopied]    = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout>>();

  // Words appearing in Object Writing (highlighted in results)
  const owWords = useMemo(() => {
    const s = new Set<string>();
    (song.objectWritings ?? []).forEach(o =>
      (o.text ?? "").toLowerCase().match(/\b[a-z]{3,}\b/g)?.forEach(w => s.add(w))
    );
    return s;
  }, [song.objectWritings]);

  // Adopt highlighted word from lyrics
  useEffect(() => {
    if (selectionWord?.word) setWord(selectionWord.word);
  }, [selectionWord]);

  const fetchThesaurus = useCallback(async (q: string) => {
    const w = q.trim().toLowerCase();
    if (!w) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    try {
      const [synRes, antRes, relRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20&md=s`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(w)}&max=12&md=s`),
        fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(w)}&max=14&md=s`),
      ]);
      if (!synRes.ok || !antRes.ok || !relRes.ok) throw new Error("fetch failed");
      const synData: { word: string; numSyllables?: number }[] = await synRes.json();
      const antData: { word: string; numSyllables?: number }[] = await antRes.json();
      const relData: { word: string; numSyllables?: number }[] = await relRes.json();
      const synSet = new Set(synData.map(r => r.word));
      const antSet = new Set(antData.map(r => r.word));
      setResults([
        ...synData.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "syn" as const })),
        ...antData.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "ant" as const })),
        ...relData
          .filter(r => !synSet.has(r.word) && !antSet.has(r.word))
          .map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "rel" as const })),
      ]);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, []);

  // Debounced auto-fetch
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!word.trim()) { setResults([]); setStatus("idle"); return; }
    debounceRef.current = setTimeout(() => fetchThesaurus(word), 620);
    return () => clearTimeout(debounceRef.current);
  }, [word, fetchThesaurus]);

  const copyWord = (w: string) => {
    navigator.clipboard.writeText(w).catch(() => {});
    setCopied(w);
    setTimeout(() => setCopied(null), 1200);
  };

  const synonyms = results.filter(r => r.type === "syn");
  const antonyms = results.filter(r => r.type === "ant");
  const related  = results.filter(r => r.type === "rel");

  const Chip = ({ r }: { r: ThesaurusResult }) => {
    const inOW = owWords.has(r.word);
    const isCopied = copied === r.word;
    const handleClick = () => onObjectWrite ? onObjectWrite(r.word) : copyWord(r.word);
    return (
      <button onClick={handleClick}
        className={`inline-flex items-baseline gap-0.5 leading-snug transition-colors ${onObjectWrite ? "cursor-pointer" : "cursor-copy"} ${
          isCopied    ? "text-accent" :
          r.type === "ant" ? "text-muted-foreground/50 italic hover:text-foreground/70" :
          r.type === "rel" ? "text-muted-foreground/40 italic hover:text-muted-foreground/70" :
          inOW               ? "text-accent/80 hover:text-accent" :
                               "text-foreground/70 hover:text-foreground"
        }`}
        style={{ fontFamily: r.type === "rel" ? SERIF : MONO }}
        title={`${onObjectWrite ? "Object Write" : "Copy"} · ${r.syl || "?"}syl${r.syl !== 1 ? "s" : ""}${inOW ? " · in your OW" : ""}`}>
        {inOW && !isCopied && <span className="text-accent text-[8px] leading-none mr-px">◆</span>}
        <span className="text-[12px]">{isCopied ? "✓" : r.word}</span>
        {r.syl > 0 && (
          <span className="text-[9px] text-muted-foreground/25 ml-0.5" style={{ fontFamily: MONO }}>{r.syl}</span>
        )}
      </button>
    );
  };

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Synonyms &amp; Antonyms
        </span>
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Input */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40 flex items-center gap-2">
        <input value={word} onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchThesaurus(word)}
          placeholder="word…"
          className="flex-1 min-w-0 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 transition-colors"
          style={{ fontFamily: MONO }} />
        {word && selectionWord?.word && word === selectionWord.word && (
          <span className="text-[9px] text-muted-foreground/30 shrink-0" style={{ fontFamily: MONO }}>← lyrics</span>
        )}
      </div>

      {/* Results */}
      <div className="p-3 min-h-[110px]">
        {status === "loading" && (
          <p className="text-[10px] text-muted-foreground/30 text-center py-3" style={{ fontFamily: MONO }}>…</p>
        )}
        {status === "error" && (
          <p className="text-[10px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            Couldn't reach thesaurus service
          </p>
        )}
        {status === "idle" && (
          <p className="text-[12px] text-muted-foreground/35 italic text-center py-3 leading-relaxed"
            style={{ fontFamily: SERIF }}>Highlight a word or type one</p>
        )}
        {status === "done" && results.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            No results
          </p>
        )}
        {status === "done" && results.length > 0 && (
          <div className="flex flex-col gap-3">
            {synonyms.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Synonyms</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{synonyms.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
            {antonyms.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Antonyms</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{antonyms.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
            {related.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Related</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{related.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OW legend */}
      {results.some(r => owWords.has(r.word)) && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5">
          <span className="text-accent text-[9px]">◆</span>
          <span className="text-[9px] text-muted-foreground/35" style={{ fontFamily: MONO }}>in your object writing</span>
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Section Header Detection ─────────────────────────────────────────────────

const SECTION_HEADER_RE: Array<{ re: RegExp; type: SectionType }> = [
  { re: /^intro\s*:?\s*$/i,                   type: "intro"      },
  { re: /^verse(\s+\w+)?\s*:?\s*$/i,          type: "verse"      },
  { re: /^pre[- ]?chorus(\s+\w+)?\s*:?\s*$/i, type: "pre-chorus" },
  { re: /^chorus(\s+\w+)?\s*:?\s*$/i,         type: "chorus"     },
  { re: /^bridge(\s+\w+)?\s*:?\s*$/i,         type: "bridge"     },
  { re: /^hook(\s+\w+)?\s*:?\s*$/i,           type: "hook"       },
  { re: /^outro\s*:?\s*$/i,                   type: "outro"      },
];

function matchSectionHeader(line: string): SectionType | null {
  const t = line.trim();
  if (!t || t.length > 30) return null;
  for (const { re, type } of SECTION_HEADER_RE) {
    if (re.test(t)) return type;
  }
  return null;
}

// Returns an array of split sections when the lyrics contain ≥2 detectable section headers,
// or null if no split is warranted.
function parseLyricsIntoSections(
  lyrics: string
): Array<{ type: SectionType; label: string; lyrics: string }> | null {
  if (!lyrics.trim()) return null;
  const lines  = lyrics.split("\n");
  const buckets: Array<{ type: SectionType; label: string; lines: string[] }> = [];
  let preamble: string[] = [];
  let current:  typeof buckets[0] | null = null;

  for (const line of lines) {
    const headerType = matchSectionHeader(line);
    if (headerType !== null) {
      if (current) {
        buckets.push(current);
      } else if (preamble.some(l => l.trim())) {
        buckets.push({ type: "verse", label: "Verse", lines: preamble });
      }
      preamble = [];
      current  = { type: headerType, label: line.trim(), lines: [] };
    } else {
      if (current) current.lines.push(line);
      else         preamble.push(line);
    }
  }
  if (current) buckets.push(current);

  if (buckets.length < 2) return null;
  if (!buckets.some(b => b.lines.some(l => l.trim()))) return null;

  return buckets.map(b => ({
    type:   b.type,
    label:  b.label,
    lyrics: b.lines.join("\n").replace(/^\n+|\n+$/g, ""),
  }));
}

// ─── Lyrics Tab ───────────────────────────────────────────────────────────────

function LyricBlock({ section, idx, total, onChange, onDelete, onMove, onDuplicate,
  onToggleNaming, namingStyle, onWordSelect, onSplitSections, collapsed, onToggleCollapse }: {
  section: Section; idx: number; total: number;
  onChange: (s: Section) => void; onDelete: () => void;
  onMove: (dir: -1|1) => void; onDuplicate: () => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  onWordSelect?: (w: string) => void;
  onSplitSections?: (parts: Array<{ type: SectionType; label: string; lyrics: string }>) => void;
  collapsed?: boolean; onToggleCollapse?: () => void;
}) {
  const [editLabel, setEditLabel] = useState(false);

  // Detect section headers in current lyrics content
  const splitParts = useMemo(() => parseLyricsIntoSections(section.lyrics), [section.lyrics]);
  const canSplit   = !!splitParts && !!onSplitSections;

  // First non-empty line for the collapsed preview
  const previewLine = section.lyrics.split("\n").find(l => l.trim()) ?? "";

  return (
    <div id={`section-${section.id}`} className="group border border-border rounded-sm overflow-hidden hover:shadow-sm transition-shadow">
      <div className={`${SCOL[section.type]} flex items-center gap-2 px-3 py-2 border-b border-border`}>
        {/* Label */}
        {editLabel ? (
          <input value={section.label} onChange={e => onChange({ ...section, label: e.target.value })}
            onBlur={() => setEditLabel(false)} onKeyDown={e => e.key === "Enter" && setEditLabel(false)}
            autoFocus className="bg-transparent text-[10px] uppercase tracking-[0.12em] text-muted-foreground focus:outline-none border-b border-foreground/20"
            style={{ fontFamily: MONO, width: `${Math.max(section.label.length + 1, 6)}ch` }} />
        ) : (
          <button onClick={() => setEditLabel(true)}
            className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>{section.label}</button>
        )}

        {/* Split suggestion — appears when section markers detected in lyrics */}
        {canSplit && (
          <button onClick={() => onSplitSections!(splitParts!)}
            className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 hover:text-foreground hover:border-foreground/20 transition-colors shrink-0 leading-none"
            style={{ fontFamily: MONO }} title="Split detected sections">
            ⇥ split
          </button>
        )}

        {/* Right side: hover controls + always-visible collapse toggle */}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onMove(-1)} disabled={idx === 0} title="Move up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronUp size={12} /></button>
            <button onClick={() => onMove(1)} disabled={idx === total - 1} title="Move down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronDown size={12} /></button>
            <button onClick={onDuplicate} title="Duplicate" className="text-muted-foreground hover:text-foreground transition-colors"><Copy size={12} /></button>
            <button onClick={onToggleNaming} title={namingStyle === "number" ? "Switch to A/B" : "Switch to 1/2"}
              className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
              style={{ fontFamily: MONO }}>{namingStyle === "number" ? "#" : "A"}</button>
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={12} /></button>
          </div>
          {/* Collapse toggle — always visible */}
          <button onClick={onToggleCollapse}
            className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors ml-0.5"
            title={collapsed ? "Expand" : "Collapse"}>
            <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
          </button>
        </div>
      </div>

      {/* Collapsed: show dim first-line preview, click to expand */}
      {collapsed ? (
        <div onClick={onToggleCollapse}
          className="px-3 py-2 cursor-pointer border-b border-transparent hover:bg-muted/10 transition-colors">
          <span className="text-[11px] text-muted-foreground/38 italic truncate block leading-snug"
            style={{ fontFamily: SERIF }}>
            {previewLine || "…"}
          </span>
        </div>
      ) : (
        <div className="px-3 pt-2.5 pb-3">
          <AutoTA value={section.lyrics} onChange={v => onChange({ ...section, lyrics: v })}
            placeholder="Write your lyrics here…" serif rows={4} onWordSelect={onWordSelect} />
        </div>
      )}
    </div>
  );
}

// ─── Voice Notes ──────────────────────────────────────────────────────────────

const MAX_AUDIO_NOTES = 5;
const MAX_RECORD_SECONDS = 90;

function fmtDur(s: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function pickCodec(): string {
  const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return prefs.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

function VoiceNotesSection({
  notes, userId, projectId, isMobile, onUpdate,
}: {
  notes: AudioNote[]; userId: string | null; projectId: string | null;
  isMobile?: boolean; onUpdate: (notes: AudioNote[]) => void;
}) {
  const [open, setOpen] = useState(!isMobile);
  const [recording, setRecording]     = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [uploading, setUploading]     = useState(false);
  const [playingId, setPlayingId]     = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editLabel, setEditLabel]     = useState("");
  const [progress, setProgress]       = useState<Record<string, number>>({});

  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const importRef = useRef<HTMLInputElement>(null);

  // Refresh signed URLs on mount when notes exist
  useEffect(() => {
    if (!notes.length || !userId) return;
    (async () => {
      const refreshed = await Promise.all(notes.map(async n => {
        const { data } = await supabase.storage.from("audio-notes").createSignedUrl(n.storagePath, 3600);
        return data?.signedUrl ? { ...n, url: data.signedUrl } : n;
      }));
      // Only update if any URL changed
      if (refreshed.some((r, i) => r.url !== notes[i].url)) onUpdate(refreshed);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const canRecord = !!userId && !!projectId;
  const recordCount = notes.filter(() => true).length; // kept separate for clarity
  const atLimit = recordCount >= MAX_AUDIO_NOTES;

  const startRecording = async () => {
    if (!canRecord || atLimit || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const codec = pickCodec();
      const mr = new MediaRecorder(stream, codec ? { mimeType: codec } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); handleRecordingDone(mr.mimeType); };
      mr.start(250);
      mrRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e + 1 >= MAX_RECORD_SECONDS) { stopRecording(); return e + 1; }
          return e + 1;
        });
      }, 1000);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mrRef.current?.stop();
    mrRef.current = null;
    setRecording(false);
  };

  const handleRecordingDone = async (mimeType: string) => {
    if (!chunksRef.current.length || !userId || !projectId) return;
    setUploading(true);
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const ext = extFromMime(mimeType);
    const id = uid();
    const path = `${userId}/${projectId}/${id}.${ext}`;
    const dur = elapsed;
    const { error } = await supabase.storage.from("audio-notes").upload(path, blob, { contentType: mimeType });
    if (error) { alert("Upload failed: " + error.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("audio-notes").createSignedUrl(path, 3600);
    const newNote: AudioNote = {
      id, label: `Note ${notes.length + 1}`, storagePath: path,
      url: signed?.signedUrl ?? "", duration: dur, createdAt: new Date().toISOString(),
    };
    onUpdate([...notes, newNote]);
    setUploading(false);
    setElapsed(0);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !projectId) return;
    e.target.value = "";
    setUploading(true);
    const id = uid();
    const ext = file.name.split(".").pop() ?? "m4a";
    const path = `${userId}/${projectId}/${id}.${ext}`;
    // Attempt to read duration
    const dur = await new Promise<number>(resolve => {
      const a = new Audio();
      a.src = URL.createObjectURL(file);
      a.onloadedmetadata = () => { URL.revokeObjectURL(a.src); resolve(Math.round(a.duration) || 0); };
      a.onerror = () => resolve(0);
    });
    const { error } = await supabase.storage.from("audio-notes").upload(path, file, { contentType: file.type });
    if (error) { alert("Upload failed: " + error.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("audio-notes").createSignedUrl(path, 3600);
    const newNote: AudioNote = {
      id, label: file.name.replace(/\.[^.]+$/, ""), storagePath: path,
      url: signed?.signedUrl ?? "", duration: dur, createdAt: new Date().toISOString(),
    };
    onUpdate([...notes, newNote]);
    setUploading(false);
  };

  const handleExport = async (note: AudioNote) => {
    try {
      const res = await fetch(note.url);
      const blob = await res.blob();
      const ext = note.storagePath.split(".").pop() ?? "webm";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${note.label}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { alert("Export failed — try again."); }
  };

  const handleDelete = async (note: AudioNote) => {
    if (!confirm(`Delete "${note.label}"?`)) return;
    // Stop playback if active
    if (playingId === note.id) { audioRefs.current[note.id]?.pause(); setPlayingId(null); }
    await supabase.storage.from("audio-notes").remove([note.storagePath]);
    onUpdate(notes.filter(n => n.id !== note.id));
  };

  const togglePlay = (note: AudioNote) => {
    const el = audioRefs.current[note.id];
    if (!el) return;
    if (playingId === note.id) {
      el.pause(); setPlayingId(null);
    } else {
      // Pause any currently playing
      if (playingId && audioRefs.current[playingId]) audioRefs.current[playingId].pause();
      el.play(); setPlayingId(note.id);
    }
  };

  const commitLabel = () => {
    if (!editingId) return;
    onUpdate(notes.map(n => n.id === editingId ? { ...n, label: editLabel.trim() || n.label } : n));
    setEditingId(null);
  };

  const btnBase = "text-[11px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Voice Notes</span>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform shrink-0 ml-4 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4">
          {/* Auth / no-project guard */}
          {!userId ? (
            <p className="text-xs text-muted-foreground/60 italic" style={{ fontFamily: SERIF }}>
              Sign in to record or import voice notes.
            </p>
          ) : !projectId ? (
            <p className="text-xs text-muted-foreground/60 italic" style={{ fontFamily: SERIF }}>
              Save your song first to add voice notes.
            </p>
          ) : (
            <>
              {/* Action row */}
              <div className="flex items-center gap-2 mb-4">
                {recording ? (
                  <>
                    <span className="text-[11px] tabular-nums text-red-500 animate-pulse" style={{ fontFamily: MONO }}>
                      ● {fmtDur(elapsed)} / {fmtDur(MAX_RECORD_SECONDS)}
                    </span>
                    <button onClick={stopRecording} className={btnBase} style={{ fontFamily: MONO }}>Stop</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={startRecording}
                      disabled={atLimit || uploading}
                      className={btnBase}
                      style={{ fontFamily: MONO }}
                      title={atLimit ? `Limit of ${MAX_AUDIO_NOTES} notes reached` : "Record a voice note"}>
                      {uploading ? "Saving…" : "● Record"}
                    </button>
                    <button
                      onClick={() => importRef.current?.click()}
                      disabled={uploading}
                      className={btnBase}
                      style={{ fontFamily: MONO }}>
                      ↑ Import
                    </button>
                    <input ref={importRef} type="file" accept="audio/*" className="hidden" onChange={handleImport} />
                  </>
                )}
                {notes.length > 0 && !recording && (
                  <span className="text-[10px] text-muted-foreground/40 ml-auto tabular-nums" style={{ fontFamily: MONO }}>
                    {notes.length} / {MAX_AUDIO_NOTES}
                  </span>
                )}
              </div>

              {/* Note list */}
              {notes.length === 0 && !recording && (
                <p className="text-xs text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                  No voice notes yet — record a melody, lyric idea, or anything you want to capture.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {notes.map(note => {
                  const isPlaying = playingId === note.id;
                  const prog = progress[note.id] ?? 0;
                  return (
                    <div key={note.id} className="flex flex-col gap-1">
                      {/* Controls row */}
                      <div className="flex items-center gap-2">
                        {/* Play/pause */}
                        <button
                          onClick={() => togglePlay(note)}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0 text-[10px]"
                          style={{ fontFamily: MONO }}>
                          {isPlaying ? "❙❙" : "▶"}
                        </button>
                        {/* Label */}
                        {editingId === note.id ? (
                          <input
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            onBlur={commitLabel}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitLabel(); }}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-border text-xs text-foreground focus:outline-none focus:border-accent pb-0.5"
                            style={{ fontFamily: SERIF }}
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingId(note.id); setEditLabel(note.label); }}
                            className="flex-1 min-w-0 text-left text-xs text-foreground hover:text-accent transition-colors truncate"
                            style={{ fontFamily: SERIF }}>
                            {note.label}
                          </button>
                        )}
                        {/* Duration */}
                        {note.duration > 0 && (
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0" style={{ fontFamily: MONO }}>
                            {fmtDur(note.duration)}
                          </span>
                        )}
                        {/* Export */}
                        <button onClick={() => handleExport(note)}
                          className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
                          title="Download" style={{ fontFamily: MONO }}>↓</button>
                        {/* Delete */}
                        <button onClick={() => handleDelete(note)}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                      {/* Progress bar */}
                      <div className="h-px bg-border/50 rounded-full overflow-hidden ml-8">
                        <div
                          className="h-full bg-accent/60 transition-all duration-100"
                          style={{ width: `${prog * 100}%` }}
                        />
                      </div>
                      {/* Hidden audio element */}
                      <audio
                        ref={el => { if (el) audioRefs.current[note.id] = el; }}
                        src={note.url}
                        preload="metadata"
                        onTimeUpdate={e => {
                          const a = e.currentTarget;
                          if (a.duration) setProgress(p => ({ ...p, [note.id]: a.currentTime / a.duration }));
                        }}
                        onEnded={() => { setPlayingId(null); setProgress(p => ({ ...p, [note.id]: 0 })); }}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────

function CollapsibleSection({ title, subtitle, defaultOpen = true, isMobile, headerExtra, open: controlledOpen, onOpenChange, children }: {
  title: string; subtitle?: string; defaultOpen?: boolean; isMobile?: boolean;
  headerExtra?: React.ReactNode;
  open?: boolean; onOpenChange?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(isMobile ? false : defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v); };
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>{title}</span>
          {subtitle && <p className="text-xs text-muted-foreground/60 mt-0.5" style={{ fontFamily: SANS }}>{subtitle}</p>}
          {headerExtra}
        </div>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform shrink-0 ml-4 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && children}
    </div>
  );
}

// ─── Story + Big Idea ─────────────────────────────────────────────────────────

// ─── Notebook Section ─────────────────────────────────────────────────────────

function NotebookSection({ value, onChange, nbSections, onDeleteNbSection, isMobile }: {
  value: string; onChange: (v: string) => void;
  nbSections?: NbEntry[]; onDeleteNbSection?: (id: string) => void;
  isMobile?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleOpen = (id: string) =>
    setOpenIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const scrollToSection = (id: string) => {
    setOpenIds(prev => { const s = new Set(prev); s.add(id); return s; });
    setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const sections = nbSections ?? [];

  // Header pills — one per saved OW subsection
  const headerExtra = sections.length > 0 ? (
    <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
      {sections.map(s => (
        <button key={s.id}
          onClick={() => scrollToSection(s.id)}
          className="text-[8px] uppercase tracking-wider border border-accent/40 text-accent/70 hover:text-accent rounded px-1.5 py-0.5 transition-colors"
          style={{ fontFamily: MONO }}
          title={s.title}>
          {s.title || "Object Writing"}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <CollapsibleSection title="Notebook" subtitle="creative thinking · free writing · ideas" isMobile={isMobile} headerExtra={headerExtra}>
      {/* Free textarea */}
      <div className="px-4 pt-3 pb-2">
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? "" : "max-h-32"}`}>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="Free writing, creative ideas, associations, things that feel true about this song…"
            rows={expanded ? 16 : 5}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.9]"
            style={{ fontFamily: SERIF }}
          />
        </div>
        {value.trim().length > 0 && (
          <button onClick={() => setExpanded(e => !e)}
            className="mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            {expanded ? "Collapse ↑" : "Expand ↓"}
          </button>
        )}
      </div>

      {/* Saved Object Writing subsections */}
      {sections.length > 0 && (
        <div className="border-t border-border/40">
          {sections.map(s => (
            <div key={s.id} ref={el => { sectionRefs.current[s.id] = el; }} className="border-b border-border/30 last:border-b-0">
              <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/10">
                <button onClick={() => toggleOpen(s.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
                  <ChevronDown size={10} className={`text-muted-foreground/40 shrink-0 transition-transform duration-150 ${openIds.has(s.id) ? "" : "-rotate-90"}`} />
                  <span className="text-[10px] text-accent/80 group-hover:text-accent transition-colors truncate"
                    style={{ fontFamily: SERIF, fontStyle: "italic" }}>
                    {s.title || "Object Writing"}
                  </span>
                  <span className="text-[8px] text-muted-foreground/40 shrink-0 ml-1" style={{ fontFamily: MONO }}>
                    {new Date(s.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
                {onDeleteNbSection && (
                  <button onClick={() => onDeleteNbSection(s.id)}
                    className="text-muted-foreground/25 hover:text-muted-foreground transition-colors shrink-0">
                    <X size={10} />
                  </button>
                )}
              </div>
              {openIds.has(s.id) && (
                <div className="px-4 py-3">
                  <p className="text-xs leading-[1.9] text-foreground/80 whitespace-pre-wrap" style={{ fontFamily: SERIF }}>
                    {s.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function ProductionSection({ value, onChange, isMobile }: { value: string; onChange: (v: string) => void; isMobile?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <CollapsibleSection title="Production" subtitle="references · arrangement · technical ideas" defaultOpen={false} isMobile={isMobile}>
      <div className="px-4 pt-3 pb-2">
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? "" : "max-h-32"}`}>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="References, sounds, instruments, arrangement notes, tempo/key ideas, plugins, production direction…"
            rows={expanded ? 14 : 5}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-[1.9]"
            style={{ fontFamily: MONO }}
          />
        </div>
        {value.trim().length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            {expanded ? "Collapse ↑" : "Expand ↓"}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
}

// ─── Story + Big Idea ─────────────────────────────────────────────────────────

function StoryAndBigIdea({ story, bigIdea, onStoryChange, onBigIdeaChange, isMobile }: {
  story: Song["story"]; bigIdea: string;
  onStoryChange: (s: Song["story"]) => void;
  onBigIdeaChange: (v: string) => void;
  isMobile?: boolean;
}) {
  const parts: { key: keyof Song["story"]; label: string; placeholder: string }[] = [
    { key: "beginning", label: "Beginning", placeholder: "Where does it start — emotionally, narratively?" },
    { key: "middle",    label: "Middle",    placeholder: "What shifts or deepens?" },
    { key: "end",       label: "End",       placeholder: "Where does it land — resolved or not?" },
  ];
  return (
    <CollapsibleSection title="Story · Big Idea" isMobile={isMobile}>
      <div className={isMobile ? "flex flex-col divide-y divide-border" : "flex divide-x divide-border"}>
        {/* Big Idea — first on both layouts */}
        <div className={`${isMobile ? "w-full" : "flex-[1] min-w-0"} px-4 py-3 flex flex-col`}>
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground block mb-2" style={{ fontFamily: MONO }}>
            The Big Idea
          </span>
          <textarea
            value={bigIdea}
            onChange={e => onBigIdeaChange(e.target.value)}
            placeholder={"The theme, spark, or one true thing this song is about.\n\nIf it doesn't fit here, it might be too big."}
            rows={isMobile ? 3 : 5}
            className="flex-1 w-full bg-transparent text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none leading-snug"
            style={{ fontFamily: SERIF, fontSize: 13}}
          />
        </div>
        {/* Story Arc */}
        <div className={isMobile ? "w-full" : "flex-[2] min-w-0"}>
          {parts.map((part, i) => (
            <div key={part.key} className={`px-4 py-2.5 ${!isMobile && i < parts.length - 1 ? "border-b border-border/50" : ""} ${isMobile && i < parts.length - 1 ? "border-b border-border/40" : ""}`}>
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground block mb-1" style={{ fontFamily: MONO }}>
                {part.label}
              </span>
              <input
                value={story[part.key]}
                onChange={e => onStoryChange({ ...story, [part.key]: e.target.value })}
                placeholder={part.placeholder}
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none"
                style={{ fontFamily: SERIF }}
              />
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─── Object Writing Box ───────────────────────────────────────────────────────

function ObjectWritingBox({ entry, onChange, onMinimize, onDrillDown, onSaveToNotebook, allSongText, isMobile }: {
  entry: OWEntry; onChange: (text: string, seedWord?: string) => void;
  onMinimize: () => void; onDrillDown: (word: string) => void;
  onSaveToNotebook?: (title: string, text: string) => void;
  allSongText: string; isMobile?: boolean;
}) {
  const [scanResult, setScanResult] = useState<ReturnType<typeof scanText> | null>(null);
  const [hoverSense, setHoverSense] = useState<{ label: string; examples: string[] } | null>(null);
  const [detailMsg, setDetailMsg]   = useState("");

  const handleChange = (v: string) => { onChange(v, entry.seedWord); setScanResult(null); };
  const handleObject = () => { onChange(entry.text, pickOWWord()); };
  const handleDetail = () => {
    const w = extractDetailWord(allSongText);
    if (w) { onChange(entry.text, w); setDetailMsg(""); }
    else setDetailMsg("Write more first.");
  };
  const triggerSave = () => {
    if (!entry.text.trim() || !onSaveToNotebook) return;
    onSaveToNotebook(entry.seedWord ?? "Object Writing", entry.text);
  };

  const counts = scanResult ? SENSES.map((_, i) => scanResult.filter(t => t.senseIdx === i).length) : null;
  const drillWords = scanResult ? getDrillWords(scanResult) : [];

  const handleSenseHover = (sense: typeof SENSES[0]) => {
    const pool = [...sense.words];
    const picks: string[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    setHoverSense({ label: sense.label, examples: picks });
  };

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button onClick={handleDetail} title="Word from your own writing"
          className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          style={{ fontFamily: MONO }}>Detail</button>
        <button onClick={handleObject} title="Random object"
          className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          style={{ fontFamily: MONO }}>Object</button>
        {entry.text.trim() && onSaveToNotebook && (
          <button onClick={triggerSave}
            className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            style={{ fontFamily: MONO }}>
            Save to Notebook
          </button>
        )}
        <input
          value={entry.seedWord ?? ""}
          onChange={e => onChange(entry.text, e.target.value || undefined)}
          placeholder="focus word…"
          className="flex-1 min-w-[80px] bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors"
          style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}
        />
        <button onClick={onMinimize} title="Minimise" className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0">
          <Minus size={12} />
        </button>
      </div>

      {detailMsg && <p className="text-[12px] text-muted-foreground mb-3" style={{ fontFamily: MONO }}>{detailMsg}</p>}

      {/* Sense badges */}
      <div className="flex flex-wrap gap-1.5 mb-4 relative">
        {SENSES.map(s => (
          <span key={s.label}
            className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full cursor-default relative select-none`}
            style={{ fontFamily: MONO }}
            onMouseEnter={isMobile ? undefined : () => handleSenseHover(s)}
            onMouseLeave={isMobile ? undefined : () => setHoverSense(null)}
            onClick={isMobile ? () => setHoverSense(h => h?.label === s.label ? null : { label: s.label, examples: (() => { const pool = [...s.words]; const picks: string[] = []; for (let i = 0; i < 3 && pool.length; i++) { const j = Math.floor(Math.random() * pool.length); picks.push(pool.splice(j,1)[0]); } return picks; })() }) : undefined}>
            {s.label}
            {hoverSense?.label === s.label && (
              <span className="absolute bottom-full left-0 mb-1.5 whitespace-nowrap bg-foreground text-background text-[10px] px-2 py-1 rounded-sm z-10 pointer-events-none"
                style={{ fontFamily: MONO }}>
                {hoverSense.examples.join(" · ")}
              </span>
            )}
          </span>
        ))}
      </div>

      <AutoTA value={entry.text} onChange={handleChange}
        placeholder="Write freely. No editing, no judgement. Anchor to the senses above…"
        serif rows={8} />

      {entry.text.trim() && !scanResult && (
        <button onClick={() => setScanResult(scanText(entry.text))}
          className="mt-3 text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          style={{ fontFamily: MONO }}>
          Scan for senses
        </button>
      )}

      {scanResult && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Sense scan</span>
            <button onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
          </div>
          <div className="text-xs leading-[1.9] mb-3 p-3 bg-muted/20 rounded-sm border border-border/60" style={{ fontFamily: SERIF }}>
            {scanResult.map((t, i) =>
              t.senseIdx !== null
                ? <mark key={i} className={`${SENSES[t.senseIdx].mark} rounded-sm px-0.5`} title={SENSES[t.senseIdx].label}>{t.token}</mark>
                : <span key={i}>{t.token}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SENSES.map((s, i) => counts![i] > 0 && (
              <span key={s.label} className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full`} style={{ fontFamily: MONO }}>
                {s.label} ×{counts![i]}
              </span>
            ))}
            {counts!.every(c => c === 0) && (
              <span className="text-[12px] text-muted-foreground" style={{ fontFamily: MONO }}>
                No sense words detected — write more concretely.
              </span>
            )}
          </div>
          {drillWords.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: MONO }}>Dig deeper →</span>
              {drillWords.map(w => (
                <button key={w} onClick={() => onDrillDown(w)}
                  className="text-[12px] px-2 py-0.5 border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  style={{ fontFamily: MONO }}>{w}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Object Writing Section ───────────────────────────────────────────────────

function ObjectWritingSection({ entries, allSongText, onUpdate, onSaveToNotebook, isMobile }: {
  entries: OWEntry[];
  allSongText: string;
  onUpdate: (entries: OWEntry[]) => void;
  onSaveToNotebook: (title: string, text: string) => void;
  isMobile?: boolean;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const entryRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleCollapsed = (id: string) =>
    setCollapsedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const rawEntries = entries.length > 0 ? entries : null;
  const [defaultEntry] = useState<OWEntry>(() => ({ id: "ow-default", text: "" }));
  const visibleEntries = rawEntries ?? [defaultEntry];

  const updateEntry = (id: string, text: string, seedWord?: string) => {
    const current = rawEntries ?? [defaultEntry];
    onUpdate(current.map(e => e.id === id ? { ...e, text, seedWord } : e));
  };

  const drillDown = (word: string) => {
    const current = rawEntries ?? [defaultEntry];
    const next = [...current, { id: uid(), text: "", seedWord: word }];
    onUpdate(next);
    const newId = next[next.length - 1].id;
    setTimeout(() => {
      setCollapsedIds(prev => { const s = new Set(prev); s.delete(newId); return s; });
      entryRefs.current[newId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const addNew = () => {
    const current = rawEntries ?? [defaultEntry];
    const next = [...current, { id: uid(), text: "" }];
    onUpdate(next);
    const newId = next[next.length - 1].id;
    setTimeout(() => {
      setCollapsedIds(prev => { const s = new Set(prev); s.delete(newId); return s; });
      entryRefs.current[newId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  // Header pills for entries with a seed word
  const pillEntries = visibleEntries.filter(e => e.seedWord?.trim());
  const headerExtra = pillEntries.length > 0 ? (
    <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
      {pillEntries.map(e => (
        <button key={e.id}
          onClick={() => {
            setCollapsedIds(prev => { const s = new Set(prev); s.delete(e.id); return s; });
            setTimeout(() => entryRefs.current[e.id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
          }}
          className="text-[8px] uppercase tracking-wider border border-border/40 text-muted-foreground/50 hover:text-foreground rounded px-1.5 py-0.5 transition-colors"
          style={{ fontFamily: MONO }}
          title={e.seedWord}>
          {e.seedWord}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <CollapsibleSection
      title="Object Writing"
      subtitle="Pick an object. Write freely through the senses. No editing, no judgement."
      isMobile={isMobile}
      headerExtra={headerExtra}>
      <div>
        {visibleEntries.map(entry => {
          const isCollapsed = collapsedIds.has(entry.id);
          return (
            <div key={entry.id} ref={el => { entryRefs.current[entry.id] = el; }}
              className="border-b border-border/40 last:border-b-0">
              {/* Per-entry title row — only shown when collapsed */}
              {isCollapsed && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/10 border-b border-border/30">
                  <button onClick={() => toggleCollapsed(entry.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
                    <ChevronDown size={10} className="text-muted-foreground/40 -rotate-90 shrink-0" />
                    <span className="text-[10px] text-foreground/60 group-hover:text-foreground transition-colors truncate"
                      style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}>
                      {entry.seedWord ?? "Object Writing"}
                    </span>
                  </button>
                </div>
              )}
              {!isCollapsed && (
                <ObjectWritingBox
                  entry={entry}
                  onChange={(text, seedWord) => updateEntry(entry.id, text, seedWord)}
                  onMinimize={() => toggleCollapsed(entry.id)}
                  onDrillDown={drillDown}
                  onSaveToNotebook={(title, text) => onSaveToNotebook(title, text)}
                  allSongText={allSongText}
                  isMobile={isMobile}
                />
              )}
            </div>
          );
        })}
        <div className="px-4 py-3">
          <button onClick={addNew}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }}>
            <Plus size={10} /> New Object Writing
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─── Completion ───────────────────────────────────────────────────────────────

function completionScore(song: Song) {
  let n = 0;
  if (song.title.trim()) n += 15;
  if (song.tempo.trim()) n += 5;
  if (song.sections.length >= 2) n += 10;
  const t = song.sections.length || 1;
  n += Math.round(song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim())).length / t * 35);
  n += Math.round(song.sections.filter(s => (s.lyrics ?? "").trim()).length / t * 25);
  if (song.generalNotes.trim()) n += 10;
  return Math.min(100, n);
}

function makeTestSections(): Section[] {
  const intro   = { ...makeSection("intro"),   chordBars: ["Am","","","","Em","","",""] };
  const verse   = { ...makeSection("verse"),   chordBars: ["Am","Em","F","C","Am","Em","F","F"],
    lyrics: "She stands at the edge of the morning light\nA coat too thin for the end of October\nThe river below her holds perfectly still\nLike it's been waiting for something to happen" };
  const chorus  = { ...makeSection("chorus"),  chordBars: ["F","C","G","Am","F","C","G","G"],
    lyrics: "Let it go, let it go\nDown to where the water knows your name\nLet it go, let it go\nEverything you carried to the flame" };
  const verse2  = { ...makeSection("verse", 2), chordBars: ["Am","Em","F","C","Am","Em","F","F"],
    lyrics: "She thinks of the letters she never sent\nWords that dissolved in the back of a drawer\nSomething about leaving, something about staying\nShe can't remember which one she chose" };
  return [intro, verse, chorus, verse2];
}

// Normalizes any raw section object (e.g. from Supabase) into a complete Section,
// filling every field that could be missing with a safe default.
function normalizeSection(raw: Partial<Section> & { type?: SectionType }): Section {
  const type = raw.type ?? "verse";
  const base = makeSection(type);
  return {
    ...base,
    ...raw,
    id:            raw.id            ?? base.id,
    type,
    label:         raw.label         ?? base.label,
    shortLabel:    raw.shortLabel    ?? base.shortLabel,
    lyrics:        raw.lyrics        ?? "",
    notes:         raw.notes         ?? "",
    chordBars:     Array.isArray(raw.chordBars)     ? raw.chordBars     : [...base.chordBars],
    chordPositions: Array.isArray(raw.chordPositions) ? raw.chordPositions : [],
  };
}

const makeEmptySong = (): Song => ({
  title: "",
  artist: "",
  key: "",
  tempo: "",
  timeSignature: "4/4",
  feel: "",
  sections: [makeSection("verse")],
  sectionNaming: {},
  generalNotes: "",
  productionNotes: "",
  bigIdea: "",
  story: { beginning: "", middle: "", end: "" },
  objectWritings: [],
  notebookSections: [],
  audioNotes: [],
});
const EMPTY_SONG = makeEmptySong();

// ─── Mobile Lyric Tools (bottom bar + sheet) ────────────────────────────────────

type MobileTool = "inspire" | "rhyme" | "synonyms";
const MOBILE_MODES: MobileTool[] = ["inspire", "rhyme", "synonyms"];
const MOBILE_GLYPHS: Record<MobileTool, string> = { inspire: "✦", rhyme: "◈", synonyms: "⇄" };

function MobileLyricTools({ song, onAddVerse, selectionWord, onObjectWrite }: {
  song: Song;
  onAddVerse: (lyrics: string) => void;
  selectionWord: { word: string; seq: number } | null;
  onObjectWrite: (word: string) => void;
}) {
  const [mode, setMode] = useState<MobileTool>("inspire");
  const [cycleIdx, setCycleIdx] = useState(0);

  // ── Inspire state ──────────────────────────────────────────────────────────
  const fragmentSource = useMemo(() => [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" "), [song.generalNotes, song.bigIdea, song.story, song.objectWritings]);

  const [fragments, setFragments] = useState<string[]>(() => pickFragmentGroup(fragmentSource));
  const [fading, setFading] = useState(false);

  const cycleFragments = useCallback(() => {
    setFading(true);
    setTimeout(() => { setFragments(pickFragmentGroup(fragmentSource)); setFading(false); }, 300);
  }, [fragmentSource]);

  // Auto-cycle inspire every 15 s
  useEffect(() => {
    if (mode !== "inspire") return;
    const id = setInterval(cycleFragments, FRAGMENT_INTERVAL);
    return () => clearInterval(id);
  }, [mode, cycleFragments]);

  // Manual cycle via cycleIdx
  useEffect(() => { if (mode === "inspire") cycleFragments(); }, [cycleIdx]);

  // ── Rhyme state ────────────────────────────────────────────────────────────
  const [rhymes, setRhymes] = useState<{ word: string; near: boolean }[]>([]);
  const [rhymeLoading, setRhymeLoading] = useState(false);

  useEffect(() => {
    const w = selectionWord?.word?.trim();
    if (mode !== "rhyme" || !w) { setRhymes([]); return; }
    setRhymeLoading(true);
    Promise.all([
      fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(w)}&max=24`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(w)}&max=24`).then(r => r.json()),
    ]).then(([perfect, near]) => {
      const p = (perfect as {word:string}[]).map(x => ({ word: x.word, near: false }));
      const n = (near    as {word:string}[]).map(x => ({ word: x.word, near: true  }));
      setRhymes([...p, ...n]);
      setCycleIdx(0);
    }).catch(() => {}).finally(() => setRhymeLoading(false));
  }, [mode, selectionWord?.word]);

  // ── Synonym state ──────────────────────────────────────────────────────────
  const [syns, setSyns] = useState<string[]>([]);
  const [synLoading, setSynLoading] = useState(false);

  useEffect(() => {
    const w = selectionWord?.word?.trim();
    if (mode !== "synonyms" || !w) { setSyns([]); return; }
    setSynLoading(true);
    Promise.all([
      fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(w)}&max=16`).then(r => r.json()),
    ]).then(([syn, rel]) => {
      const synWords  = (syn as {word:string}[]).map(x => x.word);
      const relWords  = (rel as {word:string}[]).map(x => x.word).filter(w => !synWords.includes(w));
      setSyns([...synWords, ...relWords]);
      setCycleIdx(0);
    }).catch(() => {}).finally(() => setSynLoading(false));
  }, [mode, selectionWord?.word]);

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const nextMode = () => {
    setMode(m => MOBILE_MODES[(MOBILE_MODES.indexOf(m) + 1) % 3]);
    setCycleIdx(0);
  };

  // ── Word display ───────────────────────────────────────────────────────────
  const word = selectionWord?.word;

  const displayWords: string[] = useMemo(() => {
    if (mode === "inspire") {
      // Up to 3 words / phrases, each ≤12 chars
      return fragments.slice(0, 3).map(f => f.length > 12 ? f.slice(0, 11) + "…" : f);
    }
    if (mode === "rhyme") {
      const slice = rhymes.slice(cycleIdx * 3, cycleIdx * 3 + 3);
      return slice.map(r => r.word);
    }
    // synonyms
    const slice = syns.slice(cycleIdx * 3, cycleIdx * 3 + 3);
    return slice.map(w => w.length > 12 ? w.slice(0, 11) + "…" : w);
  }, [mode, fragments, rhymes, syns, cycleIdx]);

  const canCycle = mode === "inspire"
    ? true
    : mode === "rhyme" ? rhymes.length > 3
    : syns.length > 3;

  const handleCycle = () => {
    if (mode === "inspire") { setCycleIdx(i => i + 1); return; }
    if (mode === "rhyme")   { setCycleIdx(i => (i + 1) % Math.max(1, Math.ceil(rhymes.length / 3))); return; }
    setCycleIdx(i => (i + 1) % Math.max(1, Math.ceil(syns.length / 3)));
  };

  const loading = (mode === "rhyme" && rhymeLoading) || (mode === "synonyms" && synLoading);
  const noWord  = (mode === "rhyme" || mode === "synonyms") && !word;

  const copyWord = (w: string) => navigator.clipboard.writeText(w).catch(() => {});

  return (
    <>
      {/* Top bar — fixed below the 49px nav header */}
      <div className="fixed inset-x-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2 px-3"
        style={{ top: 49, height: 40 }}>

        {/* Word pills — flex-1 */}
        <div className={`flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
          {loading && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>…</span>
          )}
          {!loading && noWord && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>select a word above</span>
          )}
          {!loading && !noWord && displayWords.length === 0 && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>no results</span>
          )}
          {!loading && displayWords.map((w, i) => (
            <button key={i} onClick={() => copyWord(w)}
              className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border border-border/40 text-foreground/75 hover:text-foreground hover:border-foreground/20 active:bg-muted transition-colors"
              style={{ fontFamily: MONO }}>
              {w}
            </button>
          ))}
        </div>

        {/* Cycle / refresh button */}
        <button onClick={handleCycle} disabled={!canCycle && !noWord}
          className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors p-1"
          title="Next suggestions">
          <RefreshCw size={12} />
        </button>

        {/* Mode toggle — shows current mode glyph, tap to advance */}
        <button onClick={nextMode}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-border/40 text-accent/80 hover:text-accent hover:border-accent/40 active:bg-muted transition-colors"
          title={`Mode: ${mode} — tap to switch`}>
          <span className="text-[13px] leading-none">{MOBILE_GLYPHS[mode]}</span>
        </button>
      </div>

      {/* Spacer so lyrics content clears the bar */}
      <div aria-hidden style={{ height: 40 }} />
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const isMobile = useIsMobile();
  const [song, setSong]               = useState<Song>(EMPTY_SONG);
  const [tab, setTab]                 = useState<Tab>("notes");
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [nashville, setNashville]     = useState(false);
  const [showChordSuggest, setShowChordSuggest] = useState(false);
  const [chordsClipboard, setChordsClipboard] = useState<string[] | null>(null);
  const [idea, setIdea]               = useState<IdeaResult | null>(null);
  const [ideaUndo, setIdeaUndo]       = useState<{ newSectionId: string } | null>(null);
  const [bridge, setBridge]           = useState<IdeaResult | null>(null);
  const [bridgeUndo, setBridgeUndo]   = useState<{ sectionId: string; bars: string[] } | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [authModal, setAuthModal]     = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [lyricSelection,   setLyricSelection]   = useState<{ word: string; seq: number } | null>(null);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [showGlobalOW, setShowGlobalOW]         = useState(false);
  const [owRefreshKey, setOwRefreshKey]         = useState(0);
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout>>();
  const forceSaveTimer = useRef<ReturnType<typeof setInterval>>();
  const pendingRef     = useRef(false);
  // Refs so doSave always reads current values without stale closures
  const songRef              = useRef(song);
  const userRef              = useRef(user);
  const currentProjectIdRef  = useRef(currentProjectId);
  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);

  const tapTimes = useRef<number[]>([]);
  const tapTempo = () => {
    const now = Date.now();
    if (tapTimes.current.length && now - tapTimes.current[tapTimes.current.length - 1] > 3000)
      tapTimes.current = [];
    tapTimes.current.push(now);
    if (tapTimes.current.length > 1) {
      const gaps = tapTimes.current.slice(1).map((t, i) => t - tapTimes.current[i]);
      const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b) / gaps.length));
      updateSong({ tempo: String(bpm) });
    }
  };

  const charRef = useRef<HTMLSpanElement>(null);
  const [charWidth, setCharWidth] = useState(8.4);
  useEffect(() => {
    if (charRef.current) setCharWidth(charRef.current.getBoundingClientRect().width);
  }, []);

  // Seed OW word pool from Datamuse on mount (fire-and-forget)
  useEffect(() => { loadOWPool(); }, []);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setCurrentProjectId(null); setShowSidebar(false); };

  // Unified save — handles both first-create (insert) and subsequent updates
  const doSave = useCallback(async () => {
    const u   = userRef.current;
    const s   = songRef.current;
    const pid = currentProjectIdRef.current;
    if (!u) return;
    pendingRef.current = false;
    if (pid) {
      setAutoSaveState("saving");
      const { error } = await supabase.from("projects")
        .update({ name: defaultProjectName(s.title), data: s })
        .eq("id", pid);
      if (error) {
        pendingRef.current = true;
        console.error("Auto-save failed:", error.message);
        setAutoSaveState("error");
        setTimeout(() => setAutoSaveState("idle"), 3000);
      } else {
        setAutoSaveState("saved");
        setTimeout(() => setAutoSaveState("idle"), 2000);
      }
    } else {
      // First save — silent, no indicator
      const { data, error } = await supabase.from("projects")
        .insert({ user_id: u.id, name: defaultProjectName(s.title), data: s })
        .select("id").single();
      if (error) {
        pendingRef.current = true;
        console.error("Auto-create project failed:", error.message);
      } else if (data) {
        setCurrentProjectId(data.id);
      }
    }
  }, []);

  // Debounce trigger (2s after last edit)
  useEffect(() => {
    if (!user) return;
    const hasMeaningful = song.title.trim() ||
      song.sections.some(s => (s.lyrics ?? "").trim() || (s.chordBars ?? []).some(b => b.trim()));
    if (!hasMeaningful) return;
    pendingRef.current = true;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doSave, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, user]);

  // Force-save every 30s if there are pending changes
  useEffect(() => {
    if (!user) return;
    forceSaveTimer.current = setInterval(() => {
      if (pendingRef.current) doSave();
    }, 30000);
    return () => clearInterval(forceSaveTimer.current);
  }, [user, doSave]);

  // Section management
  const updateSong = useCallback((patch: Partial<Song>) => setSong(p => ({ ...p, ...patch })), []);

  const updateSection = useCallback((id: string, patch: Partial<Section>) => {
    setSong(p => ({
      ...p,
      sections: p.sections.map(s => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        if (patch.chordBars) merged.chordPositions = syncBarsToPositions(patch.chordBars, s.chordBars ?? [], s.chordPositions ?? [], merged.lyrics ?? "");
        return merged;
      }),
    }));
  }, []);

  const addSection = (type: SectionType) => {
    setSong(p => {
      const raw = [...p.sections, makeSection(type, p.sections.filter(s => s.type === type).length + 1)];
      return { ...p, sections: renumberSections(raw, p.sectionNaming) };
    });
  };

  // Alt+key shortcuts to add sections (chords tab only, not when typing in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (tab !== "chords") return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const def = SDEFS.find(d => d.k === e.key.toLowerCase());
      if (def) { e.preventDefault(); addSection(def.v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, addSection]);

  const dupSection = (id: string) => {
    setSong(p => {
      const idx = p.sections.findIndex(s => s.id === id);
      if (idx === -1) return p;
      const orig = p.sections[idx];
      const copy: Section = {
        ...orig, id: uid(),
        label: orig.label, shortLabel: orig.shortLabel, // renumber will fix
        chordBars: [...orig.chordBars],
        chordPositions: (orig.chordPositions ?? []).map(cp => ({ ...cp, id: uid() })),
      };
      const next = [...p.sections]; next.splice(idx + 1, 0, copy);
      return { ...p, sections: renumberSections(next, p.sectionNaming) };
    });
  };

  const delSection = (id: string) => setSong(p => {
    const filtered = p.sections.filter(s => s.id !== id);
    return { ...p, sections: renumberSections(filtered, p.sectionNaming) };
  });

  const moveSection = (id: string, dir: -1 | 1) => {
    setSong(p => {
      const secs = [...p.sections];
      const i = secs.findIndex(s => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= secs.length) return p;
      [secs[i], secs[j]] = [secs[j], secs[i]];
      return { ...p, sections: renumberSections(secs, p.sectionNaming) };
    });
  };

  const toggleNaming = (type: SectionType) => {
    setSong(p => {
      const current = p.sectionNaming[type] ?? "number";
      const naming = { ...p.sectionNaming, [type]: current === "number" ? "letter" : "number" } as Partial<Record<SectionType, "number"|"letter">>;
      return { ...p, sectionNaming: naming, sections: renumberSections(p.sections, naming) };
    });
  };

  const handleObjectWrite = useCallback((word: string) => {
    setSong(s => ({
      ...s,
      objectWritings: [...(s.objectWritings ?? []), { id: uid(), text: "", seedWord: word }],
    }));
    setTab("notes");
  }, []);

  const addVerseFromFill = (lyrics: string) => {
    setSong(p => {
      const n = p.sections.filter(s => s.type === "verse").length + 1;
      const newSection: Section = { ...makeSection("verse", n), lyrics };
      const raw = [...p.sections, newSection];
      return { ...p, sections: renumberSections(raw, p.sectionNaming) };
    });
  };

  const splitSection = (id: string, parts: Array<{ type: SectionType; label: string; lyrics: string }>) => {
    setSong(p => {
      const idx = p.sections.findIndex(s => s.id === id);
      if (idx === -1) return p;
      const orig = p.sections[idx];
      const newSecs = parts.map((part, i) => ({
        ...makeSection(part.type),
        lyrics:         part.lyrics,
        // Inherit chord bars only for the first split section
        chordBars:      i === 0 ? orig.chordBars      : ["", "", "", ""],
        chordPositions: i === 0 ? orig.chordPositions : [],
      }));
      const next = [...p.sections];
      next.splice(idx, 1, ...newSecs);
      return { ...p, sections: renumberSections(next, p.sectionNaming) };
    });
  };

  const switchTab = (t: Tab) => {
    if (t === "final") {
      setSong(p => ({
        ...p,
        sections: p.sections.map(s => ({
          ...s,
          chordPositions: (s.chordPositions ?? []).length > 0
            ? s.chordPositions
            : distributeChords((s.chordBars ?? []).filter(b => b.trim()), s.lyrics ?? ""),
        })),
      }));
    }
    setTab(t);
  };

  const loadProject = (id: string, loadedSong: Song) => {
    const ls = loadedSong as Song & { objectWriting?: string; mode?: string };
    const rawKey = (loadedSong.key ?? "");
    const legacyMode = ls.mode ?? "major";
    const key = legacyMode === "minor" && rawKey && !rawKey.endsWith("m") ? rawKey + "m" : rawKey;
    const rawSections = (loadedSong.sections ?? []).map(s => normalizeSection(s as Partial<Section>));
    const merged: Song = {
      ...makeEmptySong(),
      ...loadedSong,
      key,
      sections: rawSections.length ? rawSections : makeEmptySong().sections,
      bigIdea: loadedSong.bigIdea ?? "",
      story: loadedSong.story ?? { beginning: "", middle: "", end: "" },
      objectWritings: loadedSong.objectWritings
        ?? (ls.objectWriting ? [{ id: uid(), text: ls.objectWriting }] : []),
      productionNotes: loadedSong.productionNotes ?? "",
      sectionNaming: loadedSong.sectionNaming ?? {},
      audioNotes: Array.isArray(loadedSong.audioNotes) ? loadedSong.audioNotes : [],
    };
    setSong(merged); setCurrentProjectId(id); setTab("lyrics");
    // On desktop keep the sidebar pinned open; on mobile close the overlay after picking.
    setShowSidebar(!isMobile);
  };

  const newSong = () => {
    setSong(makeEmptySong()); setCurrentProjectId(null);
  };

  const createSongFromOW = useCallback((seedWord: string, body: string) => {
    setSong({
      ...makeEmptySong(),
      title: seedWord,
      objectWritings: [{ id: uid(), text: body, seedWord }],
    });
    setCurrentProjectId(null);
    setShowSidebar(false);
    setTab("notes");
  }, []);

  const toggleSidebar = () => setShowSidebar(s => !s);

  // Analysis
  const allChords = song.sections.flatMap(s => s.chordBars).filter(b => b.trim() && !isEditorialBar(b));
  const detected  = detectKey(allChords);
  const pickerSuggestions = useMemo(() => buildChordSuggestions(detected, allChords),
    [detected?.key, detected?.mode, allChords.join("|")]);
  const verseFirst  = song.sections.find(s => s.type === "verse")?.chordBars.find(b => b.trim());
  const chorusFirst = song.sections.find(s => s.type === "chorus")?.chordBars.find(b => b.trim());
  const sameFirst = !!verseFirst && !!chorusFirst && (() => {
    const vp = parseChord(verseFirst); const cp = parseChord(chorusFirst);
    return vp && cp && vp.root === cp.root && vp.q === cp.q;
  })();

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: SANS }}>
      <span ref={charRef} aria-hidden
        style={{ visibility: "hidden", position: "fixed", top: 0, left: 0, fontFamily: MONO, fontSize: FS + "px", whiteSpace: "pre" }}>0</span>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
        <Music size={15} className="text-accent shrink-0" />
        <span className="text-[12px] tracking-widest uppercase text-muted-foreground" style={{ fontFamily: MONO }}>SongSheet</span>

        {/* Sidebar toggle + OW button + sign-in */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button onClick={toggleSidebar}
                className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 border rounded-sm transition-colors ${showSidebar ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }} title="Projects">
                <FolderOpen size={11} />
              </button>
              <button onClick={() => setShowGlobalOW(true)}
                className="flex items-center justify-center text-[14px] px-2.5 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors leading-none"
                title="New Object Writing session">
                ✦
              </button>
            </>
          ) : (
            <button onClick={() => setAuthModal(true)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>
              <LogIn size={11} /> Sign in to save
            </button>
          )}
        </div>

        {/* Auto-save indicator — right side */}
        <div className="ml-auto flex items-center gap-2">
          {autoSaveState === "saving" && (
            <span className="text-[10px] text-muted-foreground/60" style={{ fontFamily: MONO }}>Auto-saving…</span>
          )}
          {autoSaveState === "saved" && (
            <span className="text-[10px] text-accent/80" style={{ fontFamily: MONO }}>Saved ✓</span>
          )}
          {autoSaveState === "error" && (
            <span className="text-[10px] text-destructive" style={{ fontFamily: MONO }}>Save failed — check console</span>
          )}
        </div>
      </header>

      {/* Body: projects sidebar (left) + main workspace */}
      <div className="flex items-start">
      {/* Desktop: inline pushing sidebar */}
      {user && showSidebar && !isMobile && (
        <ProjectsSidebar
          onLoad={loadProject}
          onNew={newSong}
          currentProjectId={currentProjectId}
          onSignOut={signOut}
          onCreateSongFromOW={createSongFromOW}
          onAddOWToSong={(seedWord, body) => {
            setSong(p => ({ ...p, objectWritings: [...(p.objectWritings ?? []), { id: uid(), text: body, seedWord, savedAt: new Date().toISOString() }] }));
            setTab("notes");
          }}
          owRefreshKey={owRefreshKey} />
      )}
      {/* Mobile: overlay drawer with backdrop */}
      {user && showSidebar && isMobile && (
        <div className="fixed inset-0 z-40 flex" style={{ top: 49 }}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={toggleSidebar} />
          <div className="relative z-10 h-full">
            <ProjectsSidebar
              mobile
              onClose={toggleSidebar}
              onLoad={loadProject}
              onNew={newSong}
              currentProjectId={currentProjectId}
              onSignOut={signOut}
              onCreateSongFromOW={createSongFromOW}
              onAddOWToSong={(seedWord, body) => {
                setSong(p => ({ ...p, objectWritings: [...(p.objectWritings ?? []), { id: uid(), text: body, seedWord, savedAt: new Date().toISOString() }] }));
                setShowOWPanel(true);
                toggleSidebar();
              }}
              owRefreshKey={owRefreshKey} />
          </div>
        </div>
      )}
      <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Song meta */}
        {(() => { return (
        <section className="mb-4 md:mb-10">
          <div className="flex items-center gap-2">
            <input value={song.title} onChange={e => updateSong({ title: e.target.value })} placeholder="Untitled Song"
              className="flex-1 min-w-0 bg-transparent text-[1.5rem] md:text-[2.6rem] leading-tight text-foreground placeholder:text-muted-foreground/25 focus:outline-none border-b border-transparent focus:border-border pb-1 mb-1 transition-colors"
              style={{ fontFamily: SERIF, fontWeight: 500 }} />
            <button onClick={() => setMetaExpanded(v => !v)}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors p-1.5 -mr-1"
              title={metaExpanded ? "Hide song details" : "Show song details"}>
              <ChevronDown size={16} className={`transition-transform ${metaExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>
          {/* Collapsed summary line */}
          {!metaExpanded && (song.artist || song.key || song.tempo) && (
            <div className="text-[11px] text-muted-foreground/60 truncate" style={{ fontFamily: MONO }}>
              {[song.artist, song.key, song.tempo && `${song.tempo}bpm`, song.timeSignature].filter(Boolean).join(" · ")}
            </div>
          )}

          {metaExpanded && <>
          <input value={song.artist} onChange={e => updateSong({ artist: e.target.value })} placeholder="Artist / Writer"
            className="w-full bg-transparent text-base text-muted-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-transparent focus:border-border pb-0.5 mb-5 transition-colors"
            style={{ fontFamily: SERIF, fontStyle: "italic" }} />

          {/* Compact meta + structure index */}
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8 mt-5">
            {/* Left: meta fields */}
            <div className="flex flex-col gap-2">
              {/* Row 1: Key · Time · Tempo */}
              <div className="flex items-center gap-5">
                {/* Key */}
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Key</span>
                  <input value={song.key} onChange={e => updateSong({ key: e.target.value })} placeholder="Am"
                    className="w-10 bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px transition-colors"
                    style={{ fontFamily: MONO }} />
                </label>

                {/* Time signature — arrow cycle */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 mr-1" style={{ fontFamily: MONO }}>Time</span>
                  <button onClick={() => { const i = TSIGS.indexOf(song.timeSignature); updateSong({ timeSignature: TSIGS[(i - 1 + TSIGS.length) % TSIGS.length] }); }}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[10px] leading-none px-0.5">‹</button>
                  <span className="text-[12px] text-foreground/60 tabular-nums w-7 text-center" style={{ fontFamily: MONO }}>
                    {song.timeSignature}
                  </span>
                  <button onClick={() => { const i = TSIGS.indexOf(song.timeSignature); updateSong({ timeSignature: TSIGS[(i + 1) % TSIGS.length] }); }}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[10px] leading-none px-0.5">›</button>
                </div>

                {/* Tempo + tap */}
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Tempo</span>
                  <input value={song.tempo} onChange={e => updateSong({ tempo: e.target.value })} placeholder="120"
                    className="w-10 bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px transition-colors"
                    style={{ fontFamily: MONO }} />
                  <button onClick={tapTempo} title="Tap tempo"
                    className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors border border-border/40 rounded-sm px-1 py-px leading-none"
                    style={{ fontFamily: MONO }}>tap</button>
                </label>
              </div>

              {/* Row 2: Feel */}
              <label className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Feel</span>
                <input value={song.feel} onChange={e => updateSong({ feel: e.target.value })} placeholder="slow burn, anthemic, late night…"
                  className="bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px w-56 transition-colors"
                  style={{ fontFamily: MONO }} />
              </label>
            </div>

            {/* Right: structure index — vertical list, 2 cols if >7 */}
            {song.sections.length > 0 && (
              <div className={`md:ml-auto w-full md:w-auto ${song.sections.length > 7 ? "columns-2 gap-x-4" : ""}`}>
                {song.sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      switchTab("lyrics");
                      setTimeout(() => {
                        document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 60);
                    }}
                    className="block text-[9px] text-muted-foreground/60 hover:text-foreground/70 transition-colors text-left md:text-right w-full leading-[1.8] break-inside-avoid"
                    style={{ fontFamily: MONO }}>
                    {s.shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>}
        </section>
        ); })()}

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border mb-6 md:mb-8">
          {(["notes","lyrics","chords","final"] as Tab[]).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className={`pb-2 text-xs capitalize tracking-wide transition-colors ${tab === t ? "border-b-2 border-foreground text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              style={{ marginBottom: -1, fontFamily: SANS }}>
              {t === "notes" ? "create" : t}
            </button>
          ))}
        </div>

        {/* ── Lyrics ── */}
        {tab === "lyrics" && (
          <div className="flex items-start gap-6">
            {/* Section cards */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {song.sections.length > 1 && (() => {
                const anyCollapsed = song.sections.some(s => sectionCollapsed[s.id]);
                const allCollapsed = song.sections.every(s => sectionCollapsed[s.id]);
                return (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        song.sections.forEach(s => { next[s.id] = !allCollapsed; });
                        setSectionCollapsed(next);
                      }}
                      className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                      style={{ fontFamily: MONO }}>
                      {allCollapsed ? "expand all" : anyCollapsed ? "expand all" : "collapse all"}
                    </button>
                  </div>
                );
              })()}
              {/* Object Write button for highlighted lyric word */}
              {lyricSelection && (
                <div className="flex items-center -mt-1">
                  <button
                    onClick={() => handleObjectWrite(lyricSelection.word)}
                    className="text-[11px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5"
                    style={{ fontFamily: MONO }}>
                    <span className="text-accent/70">✦</span> Object Write &ldquo;{lyricSelection.word}&rdquo;
                  </button>
                </div>
              )}
              {song.sections.map((s, i) => (
                <LyricBlock key={s.id} section={s} idx={i} total={song.sections.length}
                  onChange={ns => updateSection(s.id, ns)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onDuplicate={() => dupSection(s.id)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  onWordSelect={w => setLyricSelection(prev => ({ word: w, seq: (prev?.seq ?? 0) + 1 }))}
                  onSplitSections={parts => splitSection(s.id, parts)}
                  collapsed={!!sectionCollapsed[s.id]}
                  onToggleCollapse={() => setSectionCollapsed(p => ({ ...p, [s.id]: !p[s.id] }))} />
              ))}
              <div className="flex flex-wrap gap-2 mt-2">
                {SDEFS.map(t => (
                  <button key={t.v} onClick={() => addSection(t.v)}
                    className={`${SCOL[t.v]} flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-sm border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors`}
                    style={{ fontFamily: MONO }}>
                    <Plus size={10} />{t.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Right column: Inspiration + Thesaurus + Rhyme & Metre — desktop only */}
            {!isMobile && (
              <div className="w-60 shrink-0 sticky top-24 flex flex-col gap-3">
                <InspirationPanel song={song} onAddVerse={addVerseFromFill} />
                <ThesaurusPanel song={song} selectionWord={lyricSelection} onObjectWrite={handleObjectWrite} />
                <RhymePanel song={song} selectionWord={lyricSelection} />
              </div>
            )}
          </div>
        )}
        {/* Mobile lyric tools: bottom bar + sheet */}
        {isMobile && tab === "lyrics" && (
          <MobileLyricTools
            song={song}
            onAddVerse={addVerseFromFill}
            selectionWord={lyricSelection}
            onObjectWrite={handleObjectWrite} />
        )}

        {/* ── Chords ── */}
        {tab === "chords" && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={() => setShowAnalysis(p => !p)}
                className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${showAnalysis ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }}>
                Analyse chords
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setShowChordSuggest(v => !v)} title="Toggle chord selector"
                  className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${showChordSuggest ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                  style={{ fontFamily: MONO }}>
                  <Music2 size={11} />Chord Selector
                </button>
                <button onClick={() => setNashville(n => !n)} title="Toggle Nashville Number System"
                  className={`text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${nashville ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                  style={{ fontFamily: MONO }}>
                  {nashville ? "Chords" : "# Nashville"}
                </button>
              </div>
              {sameFirst && <span className="flex items-center gap-1 text-[12px] text-red-500" style={{ fontFamily: MONO }}>
                <AlertCircle size={11} /> verse & chorus share first chord
              </span>}
            </div>

            {showAnalysis && (
              <AnalyseChordsPanel
                song={song}
                detected={detected}
                idea={idea}
                ideaUndo={ideaUndo}
                onReroll={(sectionId) => setIdea(generateIdea(song, detected, sectionId))}
                onApply={(sectionId, bars) => {
                  const newId = uid();
                  setIdeaUndo({ newSectionId: newId });
                  setSong(p => {
                    const idx = p.sections.findIndex(s => s.id === sectionId);
                    if (idx === -1) return p;
                    const orig = p.sections[idx];
                    const newSec: Section = { ...orig, id: newId, chordBars: bars, chordPositions: [] };
                    const next = [...p.sections];
                    next.splice(idx + 1, 0, newSec);
                    return { ...p, sections: renumberSections(next, p.sectionNaming) };
                  });
                }}
                onUndo={() => {
                  if (!ideaUndo) return;
                  setSong(p => {
                    const filtered = p.sections.filter(s => s.id !== ideaUndo.newSectionId);
                    return { ...p, sections: renumberSections(filtered, p.sectionNaming) };
                  });
                  setIdeaUndo(null);
                }}
                bridge={bridge}
                bridgeUndo={bridgeUndo}
                onBridgeGenerate={() => setBridge(generateBridgeIdea(song, detected))}
                onBridgeApply={(sectionId, bars) => {
                  const orig = song.sections.find(s => s.id === sectionId)?.chordBars;
                  if (orig) setBridgeUndo({ sectionId, bars: [...orig] });
                  updateSection(sectionId, { chordBars: bars });
                }}
                onBridgeUndo={() => {
                  if (bridgeUndo) { updateSection(bridgeUndo.sectionId, { chordBars: bridgeUndo.bars }); setBridgeUndo(null); }
                }}
                onSetKey={() => updateSong({ key: formatDetectedKey(detected?.key ?? "C", detected?.mode ?? "major") })}
                onClose={() => setShowAnalysis(false)} />
            )}

            <div className="border border-border rounded-sm overflow-hidden mb-6">
              {!isMobile && (
                <div className="flex border-b border-border bg-muted/40">
                  <div className="shrink-0 border-r border-border px-3 py-1.5" style={{ width: 136 }}>
                    <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Section</span>
                  </div>
                  <div className="flex-1 px-3 py-1.5">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
                      Bars · Tab adds · ← → navigate · Backspace on empty removes
                    </span>
                  </div>
                </div>
              )}
              {song.sections.length === 0 && (
                <div className="px-6 py-8 text-center text-xs text-muted-foreground" style={{ fontFamily: SERIF, fontStyle: "italic" }}>
                  Add a section below.
                </div>
              )}
              {isMobile && song.sections.map((s, i) => (
                <MobileChordSection key={s.id} section={s} idx={i} total={song.sections.length}
                  onBarsChange={bars => updateSection(s.id, { chordBars: bars })}
                  onShortLabelChange={v => updateSection(s.id, { shortLabel: v })}
                  onDuplicate={() => dupSection(s.id)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  detected={detected}
                  warnFirst={!!sameFirst && (s.type === "verse" || s.type === "chorus")}
                  suggestions={pickerSuggestions}
                  onCopyBars={() => setChordsClipboard([...s.chordBars])}
                  onPasteBars={chordsClipboard ? () => updateSection(s.id, { chordBars: [...chordsClipboard] }) : null}
                  onRepeatBars={() => {
                    const ne = s.chordBars.filter(b => !isEditorialBar(b) && b.trim());
                    if (ne.length) updateSection(s.id, { chordBars: [...s.chordBars, ...ne] });
                  }} />
              ))}
              {!isMobile && song.sections.map((s, i) => (
                <ChordRowGrid key={s.id} section={s} idx={i} total={song.sections.length}
                  onBarsChange={bars => updateSection(s.id, { chordBars: bars })}
                  onShortLabelChange={v => updateSection(s.id, { shortLabel: v })}
                  onDuplicate={() => dupSection(s.id)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  detected={detected}
                  warnFirst={!!sameFirst && (s.type === "verse" || s.type === "chorus")}
                  nashville={nashville} songKey={song.key}
                  suggestions={pickerSuggestions} showSuggest={showChordSuggest}
                  onCopyBars={() => setChordsClipboard([...s.chordBars])}
                  onPasteBars={chordsClipboard ? () => updateSection(s.id, { chordBars: [...chordsClipboard] }) : null}
                  onRepeatBars={() => {
                    const ne = s.chordBars.filter(b => !isEditorialBar(b) && b.trim());
                    if (ne.length) updateSection(s.id, { chordBars: [...s.chordBars, ...ne] });
                  }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {SDEFS.map(t => (
                <button key={t.v} onClick={() => addSection(t.v)} title={`Add ${t.l} (Alt+${t.k.toUpperCase()})`}
                  className={`${SCOL[t.v]} flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-sm border border-border text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors`}
                  style={{ fontFamily: MONO }}>
                  <Plus size={10} />{t.l}
                  <kbd className="ml-0.5 text-[8px] text-muted-foreground/50 border border-border/50 rounded px-0.5 leading-none" style={{ fontFamily: MONO }}>⌥{t.k}</kbd>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        {tab === "notes" && (() => {
          const s = song.story ?? { beginning: "", middle: "", end: "" };
          const allSongText = [
            song.generalNotes, song.bigIdea,
            s.beginning, s.middle, s.end,
            ...song.sections.map(sec => sec.lyrics),
          ].join(" ");
          return (
            <div className="flex flex-col gap-4">
              {/* 1. Story + Big Idea */}
              <StoryAndBigIdea
                story={s} bigIdea={song.bigIdea ?? ""}
                onStoryChange={ns => updateSong({ story: ns })}
                onBigIdeaChange={v => updateSong({ bigIdea: v })}
                isMobile={isMobile} />

              {/* 2. Voice Notes */}
              <VoiceNotesSection
                notes={song.audioNotes ?? []}
                userId={user?.id ?? null}
                projectId={currentProjectId}
                isMobile={isMobile}
                onUpdate={audioNotes => updateSong({ audioNotes })} />

              {/* 3. Production */}
              <ProductionSection
                value={song.productionNotes ?? ""}
                onChange={v => updateSong({ productionNotes: v })}
                isMobile={isMobile} />

              {/* 4. Notebook */}
              <NotebookSection
                value={song.generalNotes}
                onChange={v => updateSong({ generalNotes: v })}
                nbSections={song.notebookSections ?? []}
                onDeleteNbSection={id => updateSong({ notebookSections: (song.notebookSections ?? []).filter(s => s.id !== id) })}
                isMobile={isMobile} />

              {/* 5. Object Writing */}
              <ObjectWritingSection
                entries={song.objectWritings ?? []}
                allSongText={allSongText}
                onUpdate={entries => updateSong({ objectWritings: entries })}
                onSaveToNotebook={(title, text) => {
                  const nb: NbEntry = { id: uid(), title, text, savedAt: new Date().toISOString() };
                  updateSong({ notebookSections: [...(song.notebookSections ?? []), nb] });
                }}
                isMobile={isMobile} />
            </div>
          );
        })()}

        {/* ── Final ── */}
        {tab === "final" && (
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-6" style={{ fontFamily: MONO }}>
              {isMobile
                ? "tap chord row to place · tap chord to select · use toolbar to move or edit · tap lyric to edit"
                : "click chord row to place · select: ←→ move  ↑↓ change line  Shift+←→ jump  ↵ edit  Del remove · click lyric to edit"}
            </p>
            {song.sections.length === 0
              ? <p className="text-muted-foreground text-xs" style={{ fontFamily: SERIF, fontStyle: "italic" }}>Add sections in Lyrics or Chords first.</p>
              : song.sections.map(s => (
                <FinalSectionView key={s.id} section={s} charWidth={charWidth} isMobile={isMobile}
                  onUpdate={p => {
                    const patch = { ...p };
                    if (p.chordPositions && !p.chordBars)
                      patch.chordBars = sortCP(p.chordPositions).map(cp => cp.chord);
                    setSong(prev => ({ ...prev, sections: prev.sections.map(sec => sec.id === s.id ? { ...sec, ...patch } : sec) }));
                  }} />
              ))}
          </div>
        )}
      </main>

      </div>{/* end body flex */}

      {/* Modals */}
      {authModal && <AuthModal onClose={() => setAuthModal(false)} />}
      {showGlobalOW && (
        <StandaloneOWDialog
          onClose={() => setShowGlobalOW(false)}
          onSaved={() => setOwRefreshKey(k => k + 1)}
        />
      )}

    </div>
  );
}
