#!/usr/bin/env node
//
// build-senses.mjs — regenerates src/data/senses.ts from WordNet, once.
//
//   node scripts/build-senses.mjs            write src/data/senses.ts + report
//   node scripts/build-senses.mjs --dry      report only, write nothing
//   node scripts/build-senses.mjs --sample   also print 40 random words/sense
//   node scripts/build-senses.mjs --full     print every list in full, to read
//
// Why a script and not a runtime dependency: the app must stay instant and
// work offline, so nothing here ships. What ships is the plain-data file this
// prints. Re-run it if the anchors in scripts/lib/senseAnchors.mjs change.
//
// Corpora (downloaded once into scripts/.cache/, which is gitignored):
//   · WordNet 3.1 database — Princeton. Hyponyms, adjective clusters,
//     derivational forms, and the irregular-inflection exception lists.
//   · en_50k.txt — OpenSubtitles-2018 English frequency list (hermitdave/
//     FrequencyWords). The frequency gate. Subtitles rather than a web crawl
//     on purpose: it is a record of what people actually say, which is a
//     better filter for "would this word ever turn up in someone's object
//     writing" than raw web counts, where technical vocabulary is inflated.
//
// Thresholds are declared in scripts/lib/senseAnchors.mjs (DEFAULT_DEPTH,
// DEFAULT_RANK) and per anchor where a tree needed tightening.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { loadWordNet, resolveRef, senseRank, follow, tagCount, tagCountAnywhere, partsOfSpeech } from "./lib/wordnet.mjs";
import { SENSE_DEFS, ABSTRACT_VERB_SEEDS, REJECT, DEFAULT_DEPTH, DEFAULT_RANK } from "./lib/senseAnchors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "scripts", ".cache");
const OUT = join(ROOT, "src", "data", "senses.ts");

const DRY = process.argv.includes("--dry");
const SAMPLE = process.argv.includes("--sample");
const FULL   = process.argv.includes("--full");

/** Deterministic PRNG so `--sample` shows the same 40 words on a re-run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------------------------------------------------------------- corpora

const WORDNET_URL = "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz";
const FREQ_URL =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";

function ensureCorpora() {
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(join(CACHE, "dict", "data.noun"))) {
    console.error("· fetching WordNet 3.1 (one-off, into scripts/.cache/)…");
    const tgz = join(CACHE, "wn31dict.tar.gz");
    execFileSync("curl", ["-sL", "--fail", "--max-time", "300", "-o", tgz, WORDNET_URL]);
    execFileSync("tar", ["xzf", tgz, "-C", CACHE]);
  }
  if (!existsSync(join(CACHE, "en_50k.txt"))) {
    console.error("· fetching frequency list (one-off, into scripts/.cache/)…");
    execFileSync("curl", ["-sL", "--fail", "--max-time", "300", "-o", join(CACHE, "en_50k.txt"), FREQ_URL]);
  }
}

/** word → 1-based rank, most common first. */
function loadFrequency() {
  const rank = new Map();
  const lines = readFileSync(join(CACHE, "en_50k.txt"), "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i].split(" ")[0];
    if (w && !rank.has(w)) rank.set(w, i + 1);
  }
  return rank;
}

/** The app's own stop words, read straight from the module that ships them so
 *  the two can never drift apart. */
function loadStopWords() {
  const src = readFileSync(join(ROOT, "src", "data", "words.ts"), "utf8");
  const out = new Set();
  for (const name of ["STOP_WORDS", "FN_WORDS"]) {
    const m = src.match(new RegExp(`export const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`));
    if (!m) throw new Error(`could not read ${name} from src/data/words.ts`);
    for (const w of m[1].matchAll(/"([^"]+)"/g)) out.add(w[1]);
  }
  return out;
}

// ------------------------------------------------------------- expansion

const wn = (() => { ensureCorpora(); return loadWordNet(join(CACHE, "dict")); })();
const FREQ = loadFrequency();
const STOP = loadStopWords();

const rankOf = w => FREQ.get(w) ?? Infinity;

/** A lemma is usable at all if it is a single ordinary word people say, and
 *  not one the eyeball pass threw out (see REJECT). Seeds bypass this: a word
 *  someone chose by hand is not up for review by a filter. */
function usableLemma(w) {
  return /^[a-z]{3,}$/.test(w) && !STOP.has(w) && !REJECT.has(w);
}

/**
 * A word is only taken from a synset that is one of its `SENSE_RANK_CAP`
 * commonest meanings. This is the filter that keeps `bat`, `bean`, `butt`,
 * `plate` and `crow` out — every one of them is a genuine WordNet member of a
 * body-part or sound synset, in a sense nobody writing about an object is
 * using. WordNet orders an index entry most-common-first, so the rank is
 * already there to be read.
 */
const SENSE_RANK_CAP = 3;

/**
 * …and it must be a reading anyone has been recorded using. WordNet lists
 * `spud`, `croquet`, `picket` and `sabre` as verbs of contact, and `mug`,
 * `trunk` and `stern` as body parts; every one passes a rank test, because in
 * *that* part of speech they have only the one sense. What none of them has is
 * a single tagged occurrence in the corpus.
 *
 * So: the reading must be attested. Where the word is attested in some other
 * reading instead, that settles it — reject. Where the corpus knows the word
 * not at all, nothing is settled, and the fallback is that it must be a word
 * WordNet only has one part of speech for, which is what `spud`-the-verb and
 * `croquet`-the-verb fail on.
 */
function attested(lemma, pos, offset) {
  if (tagCount(wn, lemma, offset) > 0) return true;
  if (tagCountAnywhere(wn, lemma) > 0) return false;
  return partsOfSpeech(wn, lemma).length === 1;
}

/**
 * Walk one anchor and return `Map<lemma, {depth, pos, offset}>`.
 *
 * Three guards keep this from becoming the whole dictionary: `allow` rejects
 * any synset outside the anchor's own lexicographer files (this is what stops
 * the sound tree arriving at noun.communication), the frequency gate rejects
 * the technical tail, and the sense-rank cap above rejects rare readings of
 * common words. The first is applied to the *synset*, so an abstract branch is
 * cut rather than walked through.
 */
function walk(anchor) {
  const depthCap = anchor.depth ?? DEFAULT_DEPTH;
  const rankCap = anchor.rank ?? DEFAULT_RANK;
  const via = anchor.via ?? ["~"];
  const allow = anchor.allow ? new Set(anchor.allow) : null;

  const found = new Map();
  const seenSynsets = new Set();
  let frontier = [{ ss: resolveRef(wn, anchor.ref), depth: 0 }];

  while (frontier.length) {
    const next = [];
    for (const { ss, depth } of frontier) {
      const key = `${ss.pos}:${ss.offset}`;
      if (seenSynsets.has(key)) continue;
      seenSynsets.add(key);

      // The anchor itself is taken on trust; everything below it must pass.
      if (depth > 0 && allow && !allow.has(ss.lexFile)) continue;

      for (const lemma of ss.words) {
        const w = lemma.toLowerCase();
        if (!usableLemma(w) || rankOf(w) > rankCap) continue;
        if (senseRank(wn, w, ss.pos, ss.offset) > SENSE_RANK_CAP) continue;
        if (!attested(w, ss.pos, ss.offset)) continue;
        const prev = found.get(w);
        if (prev === undefined || depth < prev.depth) {
          found.set(w, { depth, pos: ss.pos, offset: ss.offset });
        }
      }

      if (depth >= depthCap) continue;
      for (const sym of via) {
        // An antonym is a sibling, not a child: `bright`→`dim` is worth having,
        // but walking on from `dim` leaves the sense behind entirely.
        if (sym === "!" && depth > 0) continue;
        for (const child of follow(wn, ss, sym)) next.push({ ss: child, depth: depth + 1 });
      }
    }
    frontier = next;
  }
  return found;
}

/**
 * Derivationally related forms, one step out: rough → roughness, roughly;
 * shine → shiny; flat → flatness.
 *
 * Two restrictions, both learned from what the unrestricted version produced.
 * WordNet's `+` pointer is lexical, so the target synset can hold unrelated
 * lemmas — keep only those sharing a stem with the word we came from. And the
 * target must be a quality (adjective, adverb, attribute or state) rather than
 * a thing or a doer, because the rest of what `+` reaches from a verb is agent
 * nouns and machinery: `saw`→`sawyer`, `wander`→`wanderer`, `bind`→`binder`.
 */
const DERIV_TARGETS = new Set(["adj.all", "adj.pert", "adj.ppl", "adv.all", "noun.attribute", "noun.state"]);

function derivations(lemma, pos, offset) {
  const ss = wn.synsets[pos]?.get(offset);
  if (!ss) return [];
  const stem = lemma.slice(0, Math.min(5, Math.max(4, lemma.length - 2)));
  const out = [];
  for (const p of ss.ptrs) {
    if (p.sym !== "+") continue;
    const target = wn.synsets[p.pos]?.get(p.target);
    if (!target || !DERIV_TARGETS.has(target.lexFile)) continue;
    for (const raw of target.words) {
      const w = raw.toLowerCase();
      if (!usableLemma(w) || rankOf(w) > DEFAULT_RANK) continue;
      if (!w.startsWith(stem)) continue;
      if (senseRank(wn, w, p.pos, p.target) > SENSE_RANK_CAP) continue;
      if (!attested(w, p.pos, p.target)) continue;
      out.push(w);
    }
  }
  return out;
}

// --------------------------------------------------------- sense assignment

/**
 * claims: lemma → senseIdx → score. Lower wins.
 *
 * A hand-written seed scores 0 — the eight lists that shipped before are the
 * editorial opinion this file exists to encode, and no WordNet walk overrules
 * them. Everything else scores by how central the word is to the sense it was
 * found under: `senseRank` is WordNet's own most-common-first ordering, so a
 * word found in its *first* sense is a stronger claim than one found in its
 * seventh, and `depth` breaks the remaining ties.
 */
const claims = new Map();
const claim = (lemma, senseIdx, score) => {
  let m = claims.get(lemma);
  if (!m) claims.set(lemma, (m = new Map()));
  const prev = m.get(senseIdx);
  if (prev === undefined || score < prev) m.set(senseIdx, score);
};

/** The committed file's own counts, for the before/after column. Read from git
 *  rather than from disk so the comparison still works after a first run. */
function committedCounts() {
  let src;
  try {
    src = execFileSync("git", ["show", "HEAD:src/data/senses.ts"], { cwd: ROOT, encoding: "utf8" });
  } catch {
    return null;
  }
  const labels = [...src.matchAll(/label: "(\w+)"/g)].map(m => m[1]);
  const sizes = [...src.matchAll(/words: \[([^\]]*)\]/g)]
    .map(m => new Set([...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1])).size);
  return new Map(labels.map((l, i) => [l, sizes[i]]));
}
const BEFORE = committedCounts();

SENSE_DEFS.forEach((def, si) => {
  for (const w of [...def.seeds, ...(def.extraSeeds ?? [])]) {
    if (/^[a-z]{2,}$/.test(w)) claim(w, si, 0);
  }
  for (const anchor of def.anchors) {
    let found;
    try {
      found = walk(anchor);
    } catch (e) {
      throw new Error(`anchor ${anchor.ref} (${def.label}): ${e.message}`);
    }
    for (const [w, { depth, pos, offset }] of found) {
      const score = 10 + senseRank(wn, w, pos, offset) * 10 + depth;
      claim(w, si, score);
      for (const d of derivations(w, pos, offset)) claim(d, si, score + 5);
    }
  }
});

/** Sense wins over the abstract flag: a word the senses claim is never counted
 *  as abstract, so `move`, `look`, `burn` and `strike` stay where they land. */
const abstractVerbs = new Set(
  ABSTRACT_VERB_SEEDS.filter(w => /^[a-z]{2,}$/.test(w) && !claims.has(w)),
);

/** primary + up to two secondaries, in score order. */
const MAX_SECONDARY = 2;
const assigned = new Map();
for (const [lemma, m] of claims) {
  const ordered = [...m.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  assigned.set(lemma, {
    primary: ordered[0][0],
    secondary: ordered.slice(1, 1 + MAX_SECONDARY).map(e => e[0]),
  });
}

// --------------------------------------------------------------- inflection

const IRREGULAR = new Map(); // base → Set(inflected)
for (const pos of ["n", "v", "a", "r"]) {
  for (const [inflected, bases] of wn.exceptions[pos]) {
    for (const base of bases) {
      if (!IRREGULAR.has(base)) IRREGULAR.set(base, new Set());
      IRREGULAR.get(base).add(inflected);
    }
  }
}

const VOWEL = "aeiou";
const isVowel = c => VOWEL.includes(c);

/** Adjectives that do not take -er/-est, however short they look. */
const NO_COMPARATIVE = /(ed|ing|ous|ful|less|ic|al|ive|ent|ant|ary|ish)$/;

/**
 * Every form of a word we might meet in a piece of writing, generated here so
 * that nothing has to be guessed at read time. This replaces `stemWord`, which
 * chopped suffixes and produced `wat`, `fing` and `gent`.
 *
 * Which endings apply depends on what part of speech the word is, and WordNet
 * already knows: a noun gets a plural, a verb gets -s/-ed/-ing, an adjective
 * gets -er/-est and its -ly adverb. Doing it blind produced `amberly`, `aqualy`
 * and `blacknessest`, and worse, real words under wrong senses — `blot` gave
 * `blotter`, `blaze` gave `blazer`, `win` gave `winner`.
 *
 * Within a part of speech, over-generation is harmless and under-generation is
 * not: `visitted` will never be typed, whereas a missing form is a word that
 * silently fails to score. So both spellings are emitted where the doubling
 * rule is ambiguous (it depends on stress, which WordNet does not record), and
 * the exception lists supply the irregulars on top.
 */
function inflect(base, posSet) {
  const out = new Set([base]);
  const last = base.at(-1);
  const prev = base.at(-2);
  const yConsonant = last === "y" && !isVowel(prev);

  const add = w => { if (w.length >= 3) out.add(w); };

  // -s: a noun's plural and a verb's third person are the same rule.
  if (posSet.has("n") || posSet.has("v")) {
    if (/(s|x|z|ch|sh)$/.test(base)) add(base + "es");
    else if (yConsonant) add(base.slice(0, -1) + "ies");
    else add(base + "s");
  }

  if (posSet.has("v")) {
    if (last === "e") {
      add(base + "d");
      add(base.slice(0, -1) + "ing");
    } else if (yConsonant) {
      add(base.slice(0, -1) + "ied");
      add(base + "ing");
    } else {
      add(base + "ed");
      add(base + "ing");
      // Consonant doubling: stress-dependent, so emit both readings.
      if (base.length >= 3 && !isVowel(last) && isVowel(prev) &&
          !isVowel(base.at(-3) ?? "a") && !"wxy".includes(last)) {
        add(base + last + "ed");
        add(base + last + "ing");
      }
    }
  }

  if (posSet.has("a")) {
    if (!NO_COMPARATIVE.test(base) && base.length <= 8) {
      if (last === "e") { add(base + "r"); add(base + "st"); }
      else if (yConsonant) { add(base.slice(0, -1) + "ier"); add(base.slice(0, -1) + "iest"); }
      else {
        add(base + "er"); add(base + "est");
        if (base.length >= 3 && !isVowel(last) && isVowel(prev) && !isVowel(base.at(-3) ?? "a")) {
          add(base + last + "er"); add(base + last + "est");
        }
      }
    }
    // …and its adverb: gently, roughly, warmly.
    if (yConsonant) add(base.slice(0, -1) + "ily");
    else if (base.endsWith("le") && !isVowel(base.at(-3) ?? "a")) add(base.slice(0, -1) + "y");
    else if (!base.endsWith("ly")) add(base + "ly");
  }

  for (const irr of IRREGULAR.get(base) ?? []) if (/^[a-z]{3,}$/.test(irr)) out.add(irr);

  return [...out];
}

/** What WordNet knows the word as. Seeds it has never heard of (`blanc`,
 *  `petrichor`, `judder`) fall back to being treated as all three. */
function posesOf(lemma) {
  const known = partsOfSpeech(wn, lemma).filter(p => p !== "r");
  return new Set(known.length ? known : ["n", "v", "a"]);
}

// ------------------------------------------------------------------- emit

/** Longest lemma wins a contested inflected form ("bearing" from "bear" vs
 *  "bearing"), and an exact base form always beats another word's inflection. */
const forms = new Map(); // form → { primary, secondary, exact, len }
function place(form, entry, exact, len) {
  // REJECT applies to generated forms too, not only to lemmas. Inflection
  // manufactures collisions of its own: `grind` is a physical verb and its
  // irregular past is `ground`, which in writing is almost always the earth.
  if (REJECT.has(form) || STOP.has(form)) return;
  const prev = forms.get(form);
  if (prev && (prev.exact > exact || (prev.exact === exact && prev.len >= len))) return;
  forms.set(form, { ...entry, exact, len });
}
for (const [lemma, entry] of assigned) {
  for (const form of inflect(lemma, posesOf(lemma))) place(form, entry, form === lemma ? 1 : 0, lemma.length);
}

const abstractForms = new Set();
for (const v of abstractVerbs) {
  for (const form of inflect(v, new Set(["v"]))) {
    if (!forms.has(form) && !REJECT.has(form) && !STOP.has(form)) abstractForms.add(form);
  }
}

/** Wrap a space-separated token list to `width`, for a file a human can read. */
function wrap(tokens, width = 74, indent = "    ") {
  const lines = [];
  let line = "";
  for (const t of tokens) {
    if (line && line.length + 1 + t.length > width) { lines.push(indent + line); line = t; }
    else line = line ? line + " " + t : t;
  }
  if (line) lines.push(indent + line);
  return lines.join("\n");
}

const groups = SENSE_DEFS.map(() => []);
for (const [form, e] of [...forms].sort(([a], [b]) => (a < b ? -1 : 1))) {
  groups[e.primary].push(e.secondary.length ? `${form}>${e.secondary.join("")}` : form);
}

/**
 * Hand-written seeds first, in the order they were written, then everything the
 * walk found, alphabetically. The order matters to one caller: `OWWindow`'s
 * hover tooltip draws its three examples from the head of this list, and
 * "topaz · undetectable · pearly" explains the Sight category to nobody.
 */
const senseBlocks = SENSE_DEFS.map((def, i) => {
  const mine = new Set([...assigned].filter(([, e]) => e.primary === i).map(([w]) => w));
  const seeded = [...new Set([...def.seeds, ...(def.extraSeeds ?? [])])].filter(w => mine.has(w));
  const rest = [...mine].filter(w => !seeded.includes(w)).sort();
  return { def, i, lemmas: [...seeded, ...rest], forms: groups[i] };
});

const file = `// GENERATED by scripts/build-senses.mjs — do not edit by hand.
// Source: WordNet 3.1 (Princeton) filtered by the OpenSubtitles-2018 English
// frequency list. Re-run the script to change it; see the header there for the
// depth and frequency thresholds and the anchors each list was grown from.
//
// Plain data, no dependency, nothing fetched: the scan stays instant and
// offline, exactly as it was when the lists were hand-written.

export interface Sense {
  label: string;
  /** Tailwind classes for the sense pill. */
  tw: string;
  /** Tailwind class for the highlight mark in the scanned text. */
  mark: string;
  /** Base forms belonging primarily to this sense. Hand-written entries come
   *  first — the hover tooltip shows the head of this list. Inflections live
   *  in the index below. */
  words: string[];
}

export const SENSES: Sense[] = [
${senseBlocks.map(({ def, lemmas }) => `  {
    label: ${JSON.stringify(def.label)},
    tw: ${JSON.stringify(def.tw)},
    mark: ${JSON.stringify(def.mark)},
    words: ${JSON.stringify(lemmas)},
  },`).join("\n")}
];

/**
 * Every inflected form the scan knows, grouped by primary sense — the groups
 * are in \`SENSES\` order, so a form's position *is* its primary sense and
 * nothing has to be repeated per entry.
 *
 * A word that belongs to more than one sense carries its secondaries after a
 * \`>\`: \`light>6\` is primarily Sight, secondarily Kinesthetic. The scanner
 * promotes a secondary only when the surrounding words support it — see
 * \`lookupSense\`/\`scanText\` in src/lib/text/senses.ts.
 */
const PACKED: string[] = [
${senseBlocks.map(({ def, forms }) => `  // ${def.label}\n  \`\n${wrap(forms)}\`,`).join("\n")}
];

/**
 * Abstract verbs — become, seem, consider, exist. Deliberately *not* a sense:
 * they are the opposite of what object writing is for, so they are counted and
 * reported as a flag rather than scored as sensory writing. Any word a sense
 * claims is absent here; the senses win.
 */
const PACKED_ABSTRACT = \`
${wrap([...abstractForms].sort(), 74, "  ")}\`;

export interface SenseEntry {
  primary: number;
  secondary: number[];
}

function unpack(): Map<string, SenseEntry> {
  const map = new Map<string, SenseEntry>();
  PACKED.forEach((group, primary) => {
    for (const token of group.split(/\\s+/)) {
      if (!token) continue;
      const cut = token.indexOf(">");
      if (cut === -1) map.set(token, { primary, secondary: [] });
      else map.set(token.slice(0, cut), {
        primary,
        secondary: [...token.slice(cut + 1)].map(Number),
      });
    }
  });
  return map;
}

/** Inflected form → its primary sense and any secondaries. */
export const SENSE_INDEX: Map<string, SenseEntry> = unpack();

export const ABSTRACT_VERBS: Set<string> = new Set(
  PACKED_ABSTRACT.split(/\\s+/).filter(Boolean),
);

export const ALL_SENSE_WORDS: Set<string> = new Set(SENSE_INDEX.keys());
`;

if (!DRY) writeFileSync(OUT, file);

// ----------------------------------------------------------------- report

const bytes = Buffer.byteLength(file);
const before = label => (BEFORE?.get(label) ?? (label === "Physical" ? BEFORE?.get("Verbs") : undefined));
console.log("\nsense                before   lemmas    forms   multi-sense");
console.log("─".repeat(62));
let beforeTotal = 0;
senseBlocks.forEach(({ def, lemmas, forms: f }) => {
  const b = before(def.label);
  beforeTotal += b ?? 0;
  const multi = f.filter(t => t.includes(">")).length;
  console.log(
    `${def.label.padEnd(20)}${String(b ?? "—").padStart(6)}` +
    `${String(lemmas.length).padStart(9)}${String(f.length).padStart(9)}${String(multi).padStart(14)}`,
  );
});
console.log("─".repeat(62));
console.log(
  `${"total".padEnd(20)}${String(beforeTotal || "—").padStart(6)}` +
  `${String(assigned.size).padStart(9)}${String(forms.size).padStart(9)}`,
);
console.log(`\nabstract verbs: ${abstractVerbs.size} lemmas / ${abstractForms.size} forms`);
console.log(`src/data/senses.ts: ${(bytes / 1024).toFixed(1)} KB${DRY ? " (not written — --dry)" : ""}`);

// Quality control is the point of these two flags, not a debug afterthought:
// an automatic expansion is only as good as the last time somebody read it.
// `--sample` is the quick look, `--full` the pass that fills in REJECT.
if (SAMPLE || FULL) {
  const lists = [
    ...senseBlocks.map(({ def, i, lemmas }) => [def.label, lemmas, i]),
    ["Abstract verbs", [...abstractVerbs].sort(), 99],
  ];
  for (const [label, lemmas, i] of lists) {
    let show = lemmas;
    if (!FULL) {
      const rand = rng(0x5eed + i);
      const pool = lemmas.slice();
      show = [];
      while (show.length < 40 && pool.length) show.push(...pool.splice(Math.floor(rand() * pool.length), 1));
      show.sort();
    }
    console.log(`\n── ${label} (${lemmas.length}${FULL ? "" : ", sampled 40"}) ──\n${show.join(", ")}`);
  }
}
