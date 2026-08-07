import { pcName } from "./tuning";

/**
 * Naming a hand shape.
 *
 * The rest of `lib/theory/` reads chord *names* — `parseChord` turns "Am7" into
 * a root and a quality. This module runs the other way: given the notes a hand
 * is actually holding down, what is that chord called. Alternate tunings are
 * the whole reason it exists; in standard tuning you already know what you are
 * playing, and in C G C E A C you do not.
 *
 * The method is a vocabulary, not a generator. A fixed table of formulas is
 * tried against every root present in the shape, and a formula only matches if
 * it explains **every** note — there is no "and also a stray F". That is what
 * caps the complexity of the name: the table contains at most one addition per
 * entry, so a name with two of them cannot be produced at all.
 *
 * Readings are then scored, and the best one is the name. The others are
 * honest but messier ways of saying the same thing, and go on a second line.
 */

export interface ChordReading {
  /** The whole name, slash and all — `Am9(no5)/G`. */
  name: string;
  /** Pitch class of the root, for callers that want it. */
  root: number;
  score: number;
}

export interface Identification {
  /** The name a person would actually say, or null when nothing in the vocabulary fits. */
  primary: ChordReading | null;
  /** Honest alternatives, best first. Empty when the shape reads only one way. */
  alternates: ChordReading[];
  /** Sounding notes, low to high, deduplicated — what to show when nothing names. */
  notes: string[];
}

interface Formula {
  suffix: string;
  /** Semitones above the root. Order is irrelevant; membership is the test. */
  ivs: number[];
  /** How exotic the name is. Ties break toward the plainer word. */
  cost: number;
}

// The vocabulary. Every entry carries at most one addition or alteration on top
// of a recognisable base chord, which is the cap on complexity expressed as
// data rather than as a rule applied afterwards.
const FORMULAS: Formula[] = [
  // Dyads and triads
  { suffix: "5",        ivs: [0, 7],              cost: 3 },
  { suffix: "",         ivs: [0, 4, 7],           cost: 0 },
  { suffix: "m",        ivs: [0, 3, 7],           cost: 0 },
  { suffix: "dim",      ivs: [0, 3, 6],           cost: 2 },
  { suffix: "aug",      ivs: [0, 4, 8],           cost: 2 },
  { suffix: "sus2",     ivs: [0, 2, 7],           cost: 1 },
  { suffix: "sus4",     ivs: [0, 5, 7],           cost: 1 },
  // Sixths and sevenths
  { suffix: "6",        ivs: [0, 4, 7, 9],        cost: 1 },
  { suffix: "m6",       ivs: [0, 3, 7, 9],        cost: 1 },
  { suffix: "7",        ivs: [0, 4, 7, 10],       cost: 1 },
  { suffix: "maj7",     ivs: [0, 4, 7, 11],       cost: 1 },
  { suffix: "m7",       ivs: [0, 3, 7, 10],       cost: 1 },
  { suffix: "m(maj7)",  ivs: [0, 3, 7, 11],       cost: 3 },
  { suffix: "m7b5",     ivs: [0, 3, 6, 10],       cost: 2 },
  { suffix: "dim7",     ivs: [0, 3, 6, 9],        cost: 3 },
  { suffix: "7sus4",    ivs: [0, 5, 7, 10],       cost: 2 },
  { suffix: "7sus2",    ivs: [0, 2, 7, 10],       cost: 3 },
  { suffix: "7#5",      ivs: [0, 4, 8, 10],       cost: 3 },
  { suffix: "maj7#5",   ivs: [0, 4, 8, 11],       cost: 4 },
  // Added notes over a triad — no seventh, so the added tone is the addition
  { suffix: "add9",     ivs: [0, 4, 7, 2],        cost: 2 },
  { suffix: "madd9",    ivs: [0, 3, 7, 2],        cost: 2 },
  { suffix: "add11",    ivs: [0, 4, 7, 5],        cost: 3 },
  { suffix: "madd11",   ivs: [0, 3, 7, 5],        cost: 3 },
  // Ninths — the seventh is present, so the ninth is not an "add"
  { suffix: "9",        ivs: [0, 4, 7, 10, 2],    cost: 2 },
  { suffix: "maj9",     ivs: [0, 4, 7, 11, 2],    cost: 2 },
  { suffix: "m9",       ivs: [0, 3, 7, 10, 2],    cost: 2 },
  { suffix: "m(maj9)",  ivs: [0, 3, 7, 11, 2],    cost: 4 },
  { suffix: "9sus4",    ivs: [0, 5, 7, 10, 2],    cost: 3 },
  { suffix: "6/9",      ivs: [0, 4, 7, 9, 2],     cost: 2 },
  { suffix: "m6/9",     ivs: [0, 3, 7, 9, 2],     cost: 3 },
  // Altered dominants — one alteration each
  { suffix: "7b9",      ivs: [0, 4, 7, 10, 1],    cost: 4 },
  { suffix: "7#9",      ivs: [0, 4, 7, 10, 3],    cost: 4 },
  { suffix: "7#11",     ivs: [0, 4, 7, 10, 6],    cost: 4 },
  { suffix: "7b13",     ivs: [0, 4, 7, 10, 8],    cost: 4 },
  { suffix: "maj7#11",  ivs: [0, 4, 7, 11, 6],    cost: 4 },
  // Elevenths and thirteenths
  { suffix: "11",       ivs: [0, 7, 10, 2, 5],    cost: 3 },
  { suffix: "m11",      ivs: [0, 3, 7, 10, 2, 5], cost: 3 },
  { suffix: "13",       ivs: [0, 4, 7, 10, 2, 9], cost: 3 },
  { suffix: "maj13",    ivs: [0, 4, 7, 11, 2, 9], cost: 4 },
  { suffix: "m13",      ivs: [0, 3, 7, 10, 2, 9], cost: 4 },
];

const FIFTH = 7;
const THIRDS = [3, 4];

const NOTE_WEIGHT   = 12;  // every formula tone the shape actually sounds
const BASS_BONUS    = 6;   // the root in the bass is the plainest reading there is
const NO_FIFTH_COST = 3;   // a dropped fifth is ordinary on a guitar
const NO_THIRD_COST = 6;   // a dropped third is not — it costs the name its colour

/**
 * Readings within this much of the best one are worth showing as alternatives.
 * Tuned by hand against real shapes: wide enough that `F6` still admits
 * `Dm7/F`, narrow enough that `Am7` stops volunteering `A7#9(no3)`, which is
 * arithmetically true and not a thing anyone would say.
 */
const ALTERNATE_BAND = 8;
const MAX_ALTERNATES = 2;

/**
 * One root, one formula, one verdict.
 *
 * Two rules do most of the work. **Every note must be explained** — a formula
 * that leaves a note over is not a reading of this shape, it is a reading of a
 * different one. And **the root must be sounding**: a name whose root is not in
 * the hand is a theory exercise, not something to call the chord.
 */
function readAs(pcs: Set<number>, root: number, f: Formula, bass: number): ChordReading | null {
  const rel = new Set<number>();
  for (const pc of pcs) rel.add(((pc - root) % 12 + 12) % 12);

  const ivs = new Set(f.ivs);
  for (const iv of rel) if (!ivs.has(iv)) return null;   // an unexplained note
  if (!rel.has(0)) return null;                          // rootless: not a name

  const missing = f.ivs.filter(iv => !rel.has(iv));
  const isAdd = f.suffix.includes("add");

  let omissionCost = 0;
  const omissions: string[] = [];
  for (const iv of missing) {
    if (iv === FIFTH) { omissionCost += NO_FIFTH_COST; omissions.push("no5"); continue; }
    // A third is only droppable once the name has enough else in it to survive
    // the loss — a triad without its third is a different chord, not this one
    // missing a note.
    if (THIRDS.includes(iv) && f.ivs.length >= 5) { omissionCost += NO_THIRD_COST; omissions.push("no3"); continue; }
    return null;
  }
  // Never an omission and an addition in the same breath: "Cadd9(no5)" is two
  // corrections to a chord that was never really there.
  if (isAdd && omissions.length) return null;

  const present = f.ivs.length - missing.length;
  // Two tones is the floor for a chord at all, and a shape only gets to *omit*
  // something once three of the formula's tones are actually sounding. Without
  // this a lone note reads as `G5(no5)` — a name for one string.
  if (present < 2) return null;
  if (omissions.length && present < 3) return null;

  const score = NOTE_WEIGHT * present
    + (root === bass ? BASS_BONUS : 0)
    - omissionCost
    - f.cost;

  const omitted = omissions.length ? `(${omissions.join(",")})` : "";
  const slash = root === bass ? "" : `/${pcName(bass)}`;
  return { name: `${pcName(root)}${f.suffix}${omitted}${slash}`, root, score };
}

/**
 * Name the shape. `midi` is every sounding note, in any order — the lowest one
 * is taken as the bass, which is what puts the slash in `Fmaj9/C`.
 */
export function identifyChord(midi: number[]): Identification {
  const sounding = [...midi].sort((a, b) => a - b);
  const notes: string[] = [];
  const seen = new Set<number>();
  for (const m of sounding) {
    const pc = ((m % 12) + 12) % 12;
    if (!seen.has(pc)) { seen.add(pc); notes.push(pcName(pc)); }
  }
  if (sounding.length === 0) return { primary: null, alternates: [], notes };

  const bass = ((sounding[0] % 12) + 12) % 12;
  const readings: ChordReading[] = [];
  for (const root of seen)
    for (const f of FORMULAS) {
      const r = readAs(seen, root, f, bass);
      if (r) readings.push(r);
    }

  if (!readings.length) return { primary: null, alternates: [], notes };
  readings.sort((a, b) => b.score - a.score || a.name.length - b.name.length);

  const primary = readings[0];
  const alternates = readings
    .slice(1)
    .filter(r => r.name !== primary.name && r.score >= primary.score - ALTERNATE_BAND)
    .slice(0, MAX_ALTERNATES);
  return { primary, alternates, notes };
}
