import type { CP } from "../../types";
import { isEditorialBar } from "../../data/constants";
import { uid } from "../../format";

export const sortCP = (cps: CP[]) => [...cps].sort((a, b) => a.lineIdx !== b.lineIdx ? a.lineIdx - b.lineIdx : a.charIdx - b.charIdx);
export function resolveOverlaps(positions: CP[]): CP[] {
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
export function distributeChords(bars: string[], lyrics: string): CP[] {
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
export function lcsAlign(oldSeq: string[], newSeq: string[]): (number | null)[] {
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
export function syncBarsToPositions(newBars: string[], oldBars: string[], current: CP[], lyrics: string): CP[] {
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
