// Minimal WordNet 3.1 reader for scripts/build-senses.mjs.
//
// Reads the Princeton `dict/` files directly rather than pulling in a query
// library: we only need four things (synsets by offset, senses by lemma,
// pointer edges, and the morphological exception lists), and all four are a
// few lines of parsing each. Build-time only — nothing here ships.
//
// File formats (see WNDB(5)):
//   index.<pos>  lemma pos synset_cnt p_cnt [ptr_symbol...] sense_cnt
//                tagsense_cnt synset_offset...
//   data.<pos>   offset lex_filenum ss_type w_cnt(hex) (word lex_id)...
//                p_cnt(3) (ptr_symbol offset pos src/tgt)... [frames] | gloss
//   <pos>.exc    inflected_form base_form [base_form...]

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const POS = ["n", "v", "a", "r"];

const DATA_FILE = { n: "data.noun", v: "data.verb", a: "data.adj", r: "data.adv" };
const INDEX_FILE = { n: "index.noun", v: "index.verb", a: "index.adj", r: "index.adv" };
const EXC_FILE = { n: "noun.exc", v: "verb.exc", a: "adj.exc", r: "adv.exc" };

/** Lexicographer file names by `lex_filenum` — the sharpest quality signal in
 *  WordNet. `noun.cognition` and `verb.stative` are exactly the branches an
 *  unguarded hyponym walk drifts into. */
export const LEXFILES = [
  "adj.all", "adj.pert", "adv.all", "noun.Tops", "noun.act", "noun.animal",
  "noun.artifact", "noun.attribute", "noun.body", "noun.cognition",
  "noun.communication", "noun.event", "noun.feeling", "noun.food",
  "noun.group", "noun.location", "noun.motive", "noun.object", "noun.person",
  "noun.phenomenon", "noun.plant", "noun.possession", "noun.process",
  "noun.quantity", "noun.relation", "noun.shape", "noun.state",
  "noun.substance", "noun.time", "verb.body", "verb.change", "verb.cognition",
  "verb.communication", "verb.competition", "verb.consumption", "verb.contact",
  "verb.creation", "verb.emotion", "verb.motion", "verb.perception",
  "verb.possession", "verb.social", "verb.stative", "verb.weather", "adj.ppl",
];

function parseDataLine(line) {
  const bar = line.indexOf(" | ");
  const head = bar === -1 ? line : line.slice(0, bar);
  const gloss = bar === -1 ? "" : line.slice(bar + 3).trim();
  const f = head.trim().split(/\s+/);

  let i = 0;
  const offset = f[i++];
  const lexNum = parseInt(f[i++], 10);
  const ssType = f[i++];
  const wCnt = parseInt(f[i++], 16);

  const words = [];
  for (let w = 0; w < wCnt; w++) {
    // Adjective heads carry a syntactic marker: "dry(p)" → "dry".
    words.push(f[i++].replace(/\(\w+\)$/, ""));
    i++; // lex_id
  }

  const pCnt = parseInt(f[i++], 10);
  const ptrs = [];
  for (let p = 0; p < pCnt; p++) {
    const sym = f[i++], target = f[i++], pos = f[i++], st = f[i++];
    // `st` is source/target as 4 hex digits: 0000 means the pointer is
    // semantic (synset→synset); anything else is lexical (word→word).
    ptrs.push({ sym, target, pos, src: parseInt(st.slice(0, 2), 16) });
  }

  return { offset, lexNum, lexFile: LEXFILES[lexNum], ssType, words, ptrs, gloss };
}

const SS_POS = { 1: "n", 2: "v", 3: "a", 4: "r", 5: "a" };

/**
 * index.sense — `sense_key synset_offset sense_number tag_cnt`, where tag_cnt
 * is how often that exact reading was tagged in the SemCor corpus. It is the
 * only usage evidence WordNet ships, and it is what separates `spud` the
 * potato from `spud` the verb, or `bat` the animal from `bat` the body part.
 */
function loadSenseCounts(dictDir) {
  const bySense = new Map();  // "lemma|offset" → tag_cnt
  const byPos = new Map();    // "lemma|pos" → summed tag_cnt
  for (const line of readFileSync(join(dictDir, "index.sense"), "latin1").split("\n")) {
    if (!line) continue;
    const [key, offset, , cnt] = line.split(" ");
    const pct = key.indexOf("%");
    if (pct === -1) continue;
    const lemma = key.slice(0, pct);
    const pos = SS_POS[Number(key[pct + 1])];
    if (!pos) continue;
    const n = parseInt(cnt, 10) || 0;
    const sk = `${lemma}|${offset}`;
    bySense.set(sk, (bySense.get(sk) ?? 0) + n);
    const pk = `${lemma}|${pos}`;
    byPos.set(pk, (byPos.get(pk) ?? 0) + n);
  }
  return { bySense, byPos };
}

export function loadWordNet(dictDir) {
  /** pos → offset → synset */
  const synsets = {};
  /** pos → lemma → [offset...] in WordNet sense order (most common first) */
  const senses = {};
  /** pos → inflected → base */
  const exceptions = {};

  for (const pos of POS) {
    const byOffset = new Map();
    for (const line of readFileSync(join(dictDir, DATA_FILE[pos]), "latin1").split("\n")) {
      if (!line || line.startsWith("  ")) continue;
      const ss = parseDataLine(line);
      byOffset.set(ss.offset, ss);
    }
    synsets[pos] = byOffset;

    const byLemma = new Map();
    for (const line of readFileSync(join(dictDir, INDEX_FILE[pos]), "latin1").split("\n")) {
      if (!line || line.startsWith("  ")) continue;
      const f = line.trim().split(/\s+/);
      const lemma = f[0];
      const pCnt = parseInt(f[3], 10);
      const offsets = f.slice(4 + pCnt + 2);
      byLemma.set(lemma, offsets);
    }
    senses[pos] = byLemma;

    const exc = new Map();
    for (const line of readFileSync(join(dictDir, EXC_FILE[pos]), "latin1").split("\n")) {
      if (!line.trim()) continue;
      const [inflected, ...bases] = line.trim().split(/\s+/);
      exc.set(inflected, bases);
    }
    exceptions[pos] = exc;
  }

  return { synsets, senses, exceptions, counts: loadSenseCounts(dictDir) };
}

/** How often `lemma` was tagged in SemCor with the reading in `offset`. */
export function tagCount(wn, lemma, offset) {
  return wn.counts.bySense.get(`${lemma}|${offset}`) ?? 0;
}

/** Total SemCor tags for `lemma` across every reading, any part of speech. */
export function tagCountAnywhere(wn, lemma) {
  let total = 0;
  for (const pos of POS) total += wn.counts.byPos.get(`${lemma}|${pos}`) ?? 0;
  return total;
}

/** The parts of speech WordNet knows `lemma` in at all. */
export function partsOfSpeech(wn, lemma) {
  return POS.filter(pos => wn.senses[pos].has(lemma));
}

/** Resolve `"colour#n#1"` (1-based WordNet sense number) to a synset. */
export function resolveRef(wn, ref) {
  const [lemma, pos, senseNo] = ref.split("#");
  const offsets = wn.senses[pos]?.get(lemma);
  if (!offsets) throw new Error(`no ${pos} entry for "${lemma}"`);
  const offset = offsets[(parseInt(senseNo, 10) || 1) - 1];
  if (!offset) throw new Error(`${lemma}#${pos} has only ${offsets.length} sense(s)`);
  const ss = wn.synsets[pos].get(offset);
  if (!ss) throw new Error(`dangling offset ${offset} for ${ref}`);
  return { ...ss, pos, ref };
}

/** WordNet sense number (1 = most common) of `lemma` within `offset`, or 99. */
export function senseRank(wn, lemma, pos, offset) {
  const offsets = wn.senses[pos]?.get(lemma);
  if (!offsets) return 99;
  const i = offsets.indexOf(offset);
  return i === -1 ? 99 : i + 1;
}

export function follow(wn, synset, sym, pos) {
  const out = [];
  for (const p of synset.ptrs) {
    if (p.sym !== sym) continue;
    const target = wn.synsets[p.pos]?.get(p.target);
    if (!target) continue;
    if (pos && p.pos !== pos) continue;
    out.push({ ...target, pos: p.pos });
  }
  return out;
}
