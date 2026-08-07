import type { Song } from "../../types";
import { NOTES, MAJ_ST, MIN_ST } from "../../data/music";
import { isEditorialBar } from "../../data/constants";
import { parseChord, getDiatonic, inKey } from "./chords";

export interface IdeaResult {
  technique: string;
  description: string;
  sectionId: string;
  sectionLabel: string;
  bars: string[];          // same length as section.chordBars
}
export function csStr(d: { root: string; q: string }): string {
  return `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : d.q === "dim" ? "dim" : "+"}`;
}

// Tonic / Predominant / Dominant function per diatonic degree (indices 0–6)
export type ChordFunc = "T" | "P" | "D" | "X";
export const DEGREE_FUNC: ChordFunc[] = ["T", "P", "T", "P", "D", "T", "D"];
export function getChordFunction(chord: string, key: string, mode: "major" | "minor"): ChordFunc {
  const p = parseChord(chord);
  if (!p) return "X";
  const diat = getDiatonic(key, mode);
  const deg = diat.findIndex(d => d.root === p.root && d.q === p.q);
  return deg >= 0 ? DEGREE_FUNC[deg] : "X";
}
export function generateIdea(song: Song, activeKey: { key: string; mode: "major"|"minor" } | null, targetSectionId?: string): IdeaResult | null {
  const candidates = song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
  if (!candidates.length) return null;

  const section = targetSectionId
    ? (candidates.find(s => s.id === targetSectionId) ?? candidates[Math.floor(Math.random() * candidates.length)])
    : candidates[Math.floor(Math.random() * candidates.length)];
  const bars    = section.chordBars;
  const key     = activeKey?.key  ?? "C";
  const mode    = activeKey?.mode ?? "major";
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
    activeKey ? getChordFunction(bar, key, mode) : "X"
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
  if (hasF("T") && activeKey) pool.push(() => {
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
  if (hasF("P") && activeKey) pool.push(() => {
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
  if (hasF("D") && activeKey) pool.push(() => {
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
  if (activeKey && realBars.length >= 2) pool.push(() => {
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
  if (hasF("D") && activeKey) pool.push(() => {
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
  if (activeKey) pool.push(() => {
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
  if (activeKey) pool.push(() => {
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
  if (activeKey && realBars.length >= 2) pool.push(() => {
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
  if (hasF("D") && hasF("T") && activeKey) pool.push(() => {
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
  if (activeKey) pool.push(() => {
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
  if (activeKey) pool.push(() => {
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
export function generateBridgeIdea(song: Song, activeKey: { key: string; mode: "major"|"minor" } | null): IdeaResult | null {
  if (!activeKey) return null;
  const { key, mode } = activeKey;
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
