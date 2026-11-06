import type { Section, Song } from "../../types";
import { NOTES } from "../../data/music";
import { isEditorialBar } from "../../data/constants";
import { getDiatonic, inKey, isFlatKey, parseChord, spellNote } from "./chords";
import { getChordFunction, type IdeaResult } from "./ideas";

/**
 * Joins — ideas for the seams between sections. Where one section ends and
 * the next begins is where a song most often gets stuck (a chorus that ends
 * somewhere strange, a verse that has to be found again), so each idea
 * rewrites the *end* of the section before the seam to lead into the first
 * chord of the one after it. The next section itself is never touched.
 *
 * Every join is read first: what the last chord is in the key, how far it is
 * from where the next section starts. That reading is shown above the idea.
 */

export interface JoinIdea extends IdeaResult {
  /** The seam as a key: `fromId>toId`. */
  join: string;
  toSectionId: string;
  toLabel: string;
  /** The reading of the seam, before any idea. */
  context: string;
  /** The next section's opening bars, for hearing the arrival. */
  arrival: string[];
}

export interface Seam { key: string; from: Section; to: Section; loop: boolean }

const real = (s: Section) => (s.chordBars ?? []).map((b, i) => ({ bar: b.trim(), i })).filter(x => x.bar && !isEditorialBar(x.bar));
const labelOf = (s: Section) => (s.shortLabel || s.label || s.type).toLowerCase();

/** Every seam in song order, plus the way back to the top (unless the song ends on an outro). */
export function songSeams(song: Song): Seam[] {
  const secs = song.sections.filter(s => real(s).length);
  const out: Seam[] = [];
  const seen = new Set<string>();
  const add = (from: Section, to: Section, loop: boolean) => {
    const key = `${from.id}>${to.id}`;
    if (from.id === to.id && secs.length > 1) return;
    if (!seen.has(key)) { seen.add(key); out.push({ key, from, to, loop }); }
  };
  for (let i = 0; i < secs.length - 1; i++) add(secs[i], secs[i + 1], false);
  const last = secs.at(-1);
  if (last && secs.length && last.type !== "outro") {
    // Back round: to the first section of the same type as the opener's
    // successor would be odd; the top is the honest "again".
    add(last, secs[0], true);
  }
  return out;
}

export const seamLabel = (s: Seam) => `${labelOf(s.from)} → ${labelOf(s.to)}${s.loop ? " (again)" : ""}`;

let flat = false;
const note = (i: number) => spellNote(NOTES[((i % 12) + 12) % 12], flat);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const triad = (root: string, q: string) => {
  const r = NOTES.indexOf(root);
  const third = q === "min" || q === "dim" ? 3 : 4;
  const fifth = q === "dim" ? 6 : q === "aug" ? 8 : 7;
  return [r, (r + third) % 12, (r + fifth) % 12];
};
const tok = (root: string, q: string) => `${spellNote(root, flat)}${q === "min" ? "m" : q === "dim" ? "dim" : q === "aug" ? "+" : ""}`;

/** Where a chord sits in the key, in words: "the V", "the vi", "outside the key". */
function placeOf(chord: string, key: string, mode: "major" | "minor"): string {
  const p = parseChord(chord);
  if (!p) return "";
  const diat = getDiatonic(key, mode);
  const d = diat.findIndex(x => x.root === p.root && x.q === p.q);
  if (d >= 0) {
    const r = ROMAN[d];
    const num = p.q === "min" || p.q === "dim" ? r.toLowerCase() + (p.q === "dim" ? "°" : "") : r;
    return d === 0 ? "home" : `the ${num}`;
  }
  return inKey(chord, key, mode) ? "" : "outside the key";
}

export function generateJoinIdea(
  song: Song, activeKey: { key: string; mode: "major" | "minor" } | null,
  seamKey?: string, avoid?: string,
): JoinIdea | null {
  const seams = songSeams(song);
  if (!seams.length) return null;
  const seam = seams.find(s => s.key === seamKey) ?? seams[0];
  const { from, to } = seam;
  const fromBars = real(from), toBars = real(to);
  if (!fromBars.length || !toBars.length) return null;

  const key = activeKey?.key ?? "C";
  const mode = activeKey?.mode ?? "major";
  flat = isFlatKey(activeKey ? (mode === "minor" ? `${key}m` : key) : song.key);
  const X = fromBars.at(-1)!.bar;
  const T = toBars[0].bar;
  const tp = parseChord(T), xp = parseChord(X);
  if (!tp) return null;
  const tr = NOTES.indexOf(tp.root);
  const tMinor = tp.q === "min";
  const last = fromBars.at(-1)!.i;
  const prev = fromBars.length >= 2 ? fromBars.at(-2)!.i : null;
  const fromL = labelOf(from), toL = labelOf(to);

  // ── The reading ────────────────────────────────────────────────────────
  const xPlace = activeKey ? placeOf(X, key, mode) : "";
  const tPlace = activeKey ? placeOf(T, key, mode) : "";
  const xFunc = activeKey ? getChordFunction(X, key, mode) : "X";
  let context = `The ${fromL} ends on ${X}${xPlace ? ` (${xPlace})` : ""}; the ${toL} opens on ${T}${tPlace ? ` (${tPlace})` : ""}.`;
  if (xp && xp.root === tp.root && xp.q === tp.q) context += " They're the same chord — the seam doesn't move, so the arrival has no lift.";
  else if (xFunc === "D" && tPlace === "home") context += " That's already a cadence: it resolves, so the join can afford to be stranger.";
  else if (xPlace === "outside the key") context += " You're somewhere else at the seam — the join's job is to find the way back.";
  else if (xFunc === "T") context += " Both are at rest, so nothing pulls you across — a lead-in gives it momentum.";

  const bars = from.chordBars;
  const apply = (patch: Record<number, string>) => bars.map((b, i) => (i in patch ? patch[i] : b));
  type Tech = { technique: string; description: string; patch: Record<number, string> };
  const pool: (() => Tech | null)[] = [];

  const V = note(tr + 7);
  // 1. Its own dominant
  pool.push(() => ({
    technique: "Dominant lead-in",
    description: `${V}7 is the V of ${T}: the last bar leans straight into the ${toL}, whatever key you're in at the time.`,
    patch: { [last]: `${V}7` },
  }));

  // 2. ii–V into the arrival
  if (prev !== null) pool.push(() => {
    const ii = tMinor ? `${note(tr + 2)}m7b5` : `${note(tr + 2)}m7`;
    return {
      technique: "ii–V into it",
      description: `${ii} → ${V}7 is a two-bar runway: the ${toL} arrives as the answer to a question, not just the next thing.`,
      patch: { [prev]: ii, [last]: `${V}7` },
    };
  });

  // 3. Semitone above (the tritone sub of its dominant)
  pool.push(() => ({
    technique: "Slide down a semitone",
    description: `${note(tr + 1)}7 sits a half step above ${T} and drops onto it — the same pull as ${V}7, but sideways and smoky.`,
    patch: { [last]: `${note(tr + 1)}7` },
  }));

  // 4. Diminished from below
  pool.push(() => ({
    technique: "Diminished step up",
    description: `${note(tr - 1)}dim7 is a half step under ${T}'s root and every note in it wants to move — it climbs into the ${toL}.`,
    patch: { [last]: `${note(tr - 1)}dim7` },
  }));

  // 5. Backdoor (major arrivals)
  if (!tMinor && prev !== null) pool.push(() => ({
    technique: "Backdoor",
    description: `${note(tr + 5)}m → ${note(tr + 10)}7 comes at ${T} from the parallel minor — it gets home through the back door, warm rather than triumphant.`,
    patch: { [prev]: `${note(tr + 5)}m`, [last]: `${note(tr + 10)}7` },
  }));

  // 6. ♭VI–♭VII climb (major arrivals)
  if (!tMinor && prev !== null) pool.push(() => ({
    technique: "♭VI–♭VII climb",
    description: `${note(tr + 8)} → ${note(tr + 10)} → ${T}: two borrowed major chords stepping up — a lift that sounds like the lights coming up.`,
    patch: { [prev]: note(tr + 8), [last]: note(tr + 10) },
  }));

  // 7. Common-tone pivot — keep a foot where the section left you
  if (activeKey && xp && prev !== null) pool.push(() => {
    const xs = triad(xp.root, xp.q);
    const ts = triad(tp.root, tp.q);
    const cands = getDiatonic(key, mode)
      .filter(d => !(d.root === xp.root && d.q === xp.q) && !(d.root === tp.root && d.q === tp.q))
      .map(d => {
        const ds = triad(d.root, d.q);
        return { d, withX: ds.filter(n => xs.includes(n)).length, withT: ds.filter(n => ts.includes(n)).length };
      })
      .filter(c => c.withX >= 2 && c.withT >= 1);
    if (!cands.length) return null;
    const c = cands[Math.floor(Math.random() * cands.length)];
    const pivot = tok(c.d.root, c.d.q);
    return {
      technique: "Common-tone pivot",
      description: `${pivot} shares two notes with ${X}, so it keeps one foot where the ${fromL} left you while turning toward ${T} — then ${V}7 brings it in.`,
      patch: { [prev]: pivot, [last]: `${V}7` },
    };
  });

  // 8. Stepwise walk — diatonic chords on the scale steps between
  if (activeKey && xp) pool.push(() => {
    const scale = getDiatonic(key, mode);
    const xi = scale.findIndex(d => d.root === xp.root), ti = scale.findIndex(d => d.root === tp.root);
    if (xi < 0 || ti < 0 || xi === ti) return null;
    const up = (ti - xi + 7) % 7, down = (xi - ti + 7) % 7;
    const dir = up <= down ? 1 : -1, dist = Math.min(up, down);
    if (dist < 2 || dist > 3) return null;
    const steps: string[] = [];
    for (let k = 1; k < dist; k++) { const d = scale[(xi + dir * k + 7) % 7]; steps.push(tok(d.root, d.q)); }
    const slots = [prev, last].filter((v): v is number => v !== null).slice(-steps.length);
    if (slots.length < steps.length) return null;
    const patch: Record<number, string> = {};
    slots.forEach((i, k) => { patch[i] = steps[k]; });
    return {
      technique: dir > 0 ? "Walk up" : "Walk down",
      description: `The roots step ${dir > 0 ? "up" : "down"} the scale from ${X} — ${steps.join(", ")} — and the ${toL} is simply the next step.`,
      patch,
    };
  });

  // 9. Suspend the dominant
  if (prev !== null) pool.push(() => ({
    technique: "Hold the suspense",
    description: `${V}sus4 → ${V}7: the bar before the ${toL} hangs, then gives. The longer you hold the sus, the bigger the arrival.`,
    patch: { [prev]: `${V}sus4`, [last]: `${V}7` },
  }));

  // 10. Fake-out — land on the relative first, then the real thing
  if (prev !== null) pool.push(() => {
    const rel = tMinor ? note(tr + 3) : `${note(tr + 9)}m`;
    return {
      technique: "Fake arrival",
      description: `${V}7 promises ${T}, ${rel} dodges it for a bar, and the ${toL} arrives a beat late — the dodge makes the landing feel earned.`,
      patch: { [prev]: `${V}7`, [last]: rel },
    };
  });

  const choices = pool.map(f => f()).filter((t): t is Tech => !!t);
  if (!choices.length) return null;
  const fresh = choices.filter(c => c.technique !== avoid);
  const pick = (fresh.length ? fresh : choices)[Math.floor(Math.random() * (fresh.length || choices.length))];
  return {
    technique: pick.technique, description: pick.description,
    sectionId: from.id, sectionLabel: from.shortLabel || from.label,
    bars: apply(pick.patch),
    join: seam.key, toSectionId: to.id, toLabel: to.shortLabel || to.label,
    context, arrival: toBars.slice(0, 2).map(b => b.bar),
  };
}
