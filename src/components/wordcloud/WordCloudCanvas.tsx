import { useEffect, useRef } from "react";
import type { CloudPhrase } from "../../lib/wordcloud/extract";
import { FONT_STACKS, senseColour, type WordCloudPalette } from "../../lib/wordcloud/palettes";
import { CONSTELLATION_CUTOFF, PARTICLE_BUDGET, densityForPoolSize } from "../../lib/wordcloud/sizing";

// Ported from reference/word-cloud/dithered-cloud-particles.html: the
// layered-sine flow field, S/Z wind patterns with a gust envelope, the
// constellation web's alpha-banded links, and the tap-to-fly-forward reveal.
// Its FIXED settings block is dialled in and kept verbatim below. One bug
// fixed on the way through: the reference file defines `pickAt` twice (a
// sticky version, then a second plain one right after it that silently wins
// — function declarations replace earlier ones with the same name) which
// drops sticky hover, so only the sticky version is ported.
//
// Copy-to-clipboard + toast come from word-cloud-wireframe.html instead,
// which has the real interaction this file doesn't model.

interface Particle {
  entry: CloudPhrase;
  baseX: number; baseY: number; baseZ: number;
  x: number; y: number; z: number;
  seed: number; sizeSeed: number;
  vx: number; vy: number; vz: number;
  tumble: number; tumbleRate: number; drag: number;
  edge: number; ease: number;
  state: "IDLE" | "ZOOMING" | "HELD" | "RETURNING";
  focus: number; holdTimer: number; fast: boolean;
  sx: number; sy: number; scale: number;
}

const FIXED = {
  cloudDispersion: 0.8,
  driftSpeed: 0.8,
  textScale: 44,
  windFrequency: 18,
  windStrength: 3.1,
  sensoryWeight: 0.85,
  revealDuration: 3,
  ambienceDim: 0.2,
  hoverSensitivity: 27,
};

const FOCAL = 900, NEAR_Z = 320, LAND_R = 5.5;
const WIND_OPTIONS = ["calm", "calm", "S", "S90", "Z", "Z90"];

function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function WordCloudCanvas({
  phrases, palette, typography, senseScanOn, onCopy,
}: {
  phrases: CloudPhrase[];
  palette: WordCloudPalette;
  typography: string;
  senseScanOn: boolean;
  onCopy: (phrase: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Read live without forcing the particle field to rebuild on every change —
  // only `phrases` should do that.
  const paletteRef = useRef(palette); paletteRef.current = palette;
  const typographyRef = useRef(typography); typographyRef.current = typography;
  const senseScanRef = useRef(senseScanOn); senseScanRef.current = senseScanOn;
  const onCopyRef = useRef(onCopy); onCopyRef.current = onCopy;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const ctx2d = canvasEl?.getContext("2d");
    if (!canvasEl || !ctx2d) return;
    // Re-bound with non-null types: the nested function declarations below
    // close over these, and TS won't carry the narrowing above into them.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    let W = 0, H = 0, DPR = 1, VIEW_FIT = 1, SIZE_FIT = 1;

    function spanW() {
      return (760 + phrases.length * 26) * FIXED.cloudDispersion;
    }

    const density = densityForPoolSize(phrases.length);
    const particles: Particle[] = [];

    for (const entry of phrases) {
      const span = spanW();
      const pull = Math.pow(Math.random(), 1.7);
      const ang = Math.random() * Math.PI * 2;
      const cX = Math.cos(ang) * pull * span * 0.5;
      const cY = Math.sin(ang) * pull * span * 0.3;
      const cZ = 520 + Math.random() * 1500;
      const spread = span * 0.06 + Math.random() * span * 0.05;

      for (let i = 0; i < density; i++) {
        const baseX = cX + (Math.random() - 0.5) * spread * 2;
        const baseY = cY + (Math.random() - 0.5) * spread * 1.6;
        const baseZ = Math.max(360, cZ + (Math.random() - 0.5) * 420);
        particles.push({
          entry, baseX, baseY, baseZ, x: baseX, y: baseY, z: baseZ,
          seed: Math.random() * 1000,
          sizeSeed: 0.55 + Math.random() * Math.random() * 1.9,
          vx: 0, vy: 0, vz: 0,
          tumble: Math.random() * Math.PI * 2,
          tumbleRate: 0.6 + Math.random() * 1.4,
          drag: 1.4 + Math.random() * 1.2,
          edge: 1, ease: 0,
          state: "IDLE", focus: 0, holdTimer: 0, fast: false,
          sx: 0, sy: 0, scale: 1,
        });
      }
    }

    const showConstellation = particles.length <= CONSTELLATION_CUTOFF;
    if (particles.length > PARTICLE_BUDGET * 1.2) {
      // Density scaling keeps this rare — only very large pools with the
      // floor density still overshoot — but it's worth knowing about if it
      // ever does, rather than degrading silently.
      console.warn(`Word Cloud: ${particles.length} particles for ${phrases.length} phrases, over budget.`);
    }

    const wind = { pattern: "S", nextPattern: "Z", blend: 1, blendSpeed: 0.12, timer: 0, nextSwitchAt: 4, phase: Math.random() * 1000 };

    function pickNextPattern(current: string): string {
      let choice = WIND_OPTIONS[Math.floor(Math.random() * WIND_OPTIONS.length)];
      if (choice === current) choice = WIND_OPTIONS[(WIND_OPTIONS.indexOf(choice) + 1) % WIND_OPTIONS.length];
      return choice;
    }
    function curveOffset(pattern: string, u: number, phase: number): number {
      if (pattern === "S") return Math.sin(u * Math.PI + phase * 0.15) * 0.9;
      if (pattern === "Z") return -Math.sin(u * Math.PI * 0.8 + phase * 0.12 + 1.4) * 0.9 + u * 0.4;
      return 0;
    }
    function forceFor(pattern: string, baseX: number, baseY: number, span: number): { x: number; y: number } {
      if (pattern === "calm") return { x: 0, y: 0 };
      const strength = FIXED.windStrength;
      const rotated = pattern.indexOf("90") !== -1;
      const shape = rotated ? pattern.charAt(0) : pattern;
      const axisSpan = rotated ? span * 0.34 : span * 0.5;
      const along = rotated ? baseY : baseX;
      const u = Math.max(-1, Math.min(1, along / (axisSpan || 1)));
      const mixed = curveOffset(shape, u, wind.phase);
      const cross = mixed * strength * 7 * Math.sin(u * 1.7 + wind.phase * 0.08);
      return rotated ? { x: cross, y: mixed * strength * 14 } : { x: mixed * strength * 14, y: cross };
    }
    function updateWind(dt: number) {
      wind.timer += dt; wind.phase += dt;
      if (wind.timer > wind.nextSwitchAt && wind.blend >= 1) {
        wind.pattern = wind.nextPattern;
        wind.nextPattern = pickNextPattern(wind.pattern);
        wind.blend = 0; wind.timer = 0;
        wind.nextSwitchAt = FIXED.windFrequency + Math.random() * FIXED.windFrequency;
      }
      if (wind.blend < 1) wind.blend = Math.min(1, wind.blend + dt * wind.blendSpeed);
    }
    function windForce(baseX: number, baseY: number, span: number) {
      const a = forceFor(wind.pattern, baseX, baseY, span);
      const b = forceFor(wind.nextPattern, baseX, baseY, span);
      const k = wind.blend;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }

    function project(p: Particle, cx: number, cy: number) {
      const scale = FOCAL / Math.max(120, p.z);
      return { x: cx + p.x * scale * VIEW_FIT, y: cy + p.y * scale * VIEW_FIT, scale };
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || window.innerWidth;
      H = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      VIEW_FIT = Math.max(0.34, Math.min(1, Math.min(W, H * 1.5) / 1200));
      SIZE_FIT = 0.58 + 0.42 * VIEW_FIT;
    }
    resize();
    window.addEventListener("resize", resize);

    const pointer = { x: -9999, y: -9999, active: false };
    let hovered: Particle | null = null;
    let active: Particle | null = null;
    let textParticle: Particle | null = null;
    let coarse = false;

    /** The sticky pick — see the file-level note on the duplicate-definition bug this fixes. */
    function pickAt(px: number, py: number, sticky: boolean): Particle | null {
      const threshold = FIXED.hoverSensitivity * (coarse ? 1.8 : 1);
      const t2 = threshold * threshold;
      let best: Particle | null = null, bestScore = Infinity;
      for (const p of particles) {
        if (p.scale <= 0 || p.edge < 0.35) continue;
        const dx = p.sx - px, dy = p.sy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > t2) continue;
        const score = d2 + p.z * 0.02;
        if (score < bestScore) { bestScore = score; best = p; }
      }
      if (sticky && hovered && hovered !== best) {
        const hx = hovered.sx - px, hy = hovered.sy - py;
        if (hx * hx + hy * hy < t2 * 1.4) return hovered;
      }
      return best;
    }

    function localPoint(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onPointerMove(e: PointerEvent) {
      coarse = e.pointerType === "touch" || e.pointerType === "pen";
      const pt = localPoint(e);
      pointer.x = pt.x; pointer.y = pt.y; pointer.active = true;
    }
    function onPointerLeave() { pointer.active = false; pointer.x = pointer.y = -9999; }
    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        pointer.active = false; pointer.x = pointer.y = -9999; hovered = null;
      }
    }
    function onPointerCancel() { pointer.active = false; pointer.x = pointer.y = -9999; hovered = null; }

    function standDown(except: Particle | null, fast: boolean) {
      for (const p of particles) if (p !== except && p.focus > 0) { p.state = "RETURNING"; p.fast = fast; }
    }

    function onPointerDown(e: PointerEvent) {
      coarse = e.pointerType === "touch" || e.pointerType === "pen";
      const pt = localPoint(e);
      pointer.x = pt.x; pointer.y = pt.y;
      const hit = pickAt(pt.x, pt.y, !coarse);

      if (!hit) { standDown(null, false); active = null; return; }
      if (hit === active) { hit.state = "RETURNING"; hit.fast = false; active = null; return; }

      standDown(hit, true);
      hit.state = "ZOOMING"; hit.fast = false; hit.holdTimer = 0;
      active = hit;

      // Handle the rejected-promise case — clipboard access fails in some
      // contexts (no user-activation edge case, permissions policy) and must
      // not throw.
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(hit.entry.phrase).then(
          () => onCopyRef.current(hit.entry.phrase),
          () => { /* copy blocked — the reveal still happened, just no toast */ },
        );
      }
    }

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerdown", onPointerDown);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MOTION = reduceMotion ? 0.35 : 1;
    let t = 0, last = performance.now(), raf = 0;

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt * MOTION;

      const pal = paletteRef.current;
      const span = spanW();
      const cx = W / 2, cy = H / 2;
      const tScale = FIXED.textScale;
      const anchorY0 = Math.min(H - tScale * 1.4, cy + tScale * 1.5);
      const anchorX = cx;
      const anchorY = anchorY0 - tScale * 1.55;

      updateWind(dt * MOTION);
      const gustEnv = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI / Math.max(4, FIXED.windFrequency)));

      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);

      let maxFocus = 0;
      const half = span * 0.5, halfY = span * 0.34;

      for (const p of particles) {
        if (p.state === "ZOOMING") {
          p.focus = Math.min(1, p.focus + dt / Math.max(0.9, FIXED.revealDuration * 0.5));
          if (p.focus >= 1) { p.state = "HELD"; p.holdTimer = 0; }
        } else if (p.state === "HELD") {
          p.holdTimer += dt;
          if (p.holdTimer > FIXED.revealDuration) p.state = "RETURNING";
        } else if (p.state === "RETURNING") {
          const rel = p.fast ? 0.26 : Math.max(1.0, FIXED.revealDuration * 0.55);
          p.focus = Math.max(0, p.focus - dt / rel);
          if (p.focus <= 0) { p.state = "IDLE"; p.fast = false; }
        }
        if (p.focus > maxFocus) maxFocus = p.focus;

        const fx = Math.sin(p.baseY * 0.0042 + t * 0.61) + 0.55 * Math.sin(p.baseZ * 0.0031 - t * 0.43 + p.seed * 0.01);
        const fy = Math.cos(p.baseX * 0.0037 - t * 0.52) + 0.55 * Math.cos(p.baseZ * 0.0026 + t * 0.58 + p.seed * 0.013);
        const fz = Math.sin(p.baseX * 0.0024 + t * 0.36) + 0.50 * Math.cos(p.baseY * 0.0029 - t * 0.47);
        const flow = FIXED.driftSpeed * 210 * MOTION;
        const gust = windForce(p.baseX, p.baseY, span);

        p.vx += ((fx * flow + gust.x * gustEnv * 2.4) - p.vx * p.drag) * dt;
        p.vy += ((fy * flow * 0.62 + gust.y * gustEnv * 2.0) - p.vy * p.drag) * dt;
        p.vz += ((fz * flow * 0.85) - p.vz * p.drag) * dt;

        p.baseX += p.vx * dt; p.baseY += p.vy * dt; p.baseZ += p.vz * dt;
        p.tumble += dt * MOTION * p.tumbleRate * (0.8 + Math.abs(p.vx) * 0.004);

        if (p.baseX > half) p.baseX -= span;
        if (p.baseX < -half) p.baseX += span;
        if (p.baseY > halfY) p.baseY -= halfY * 2;
        if (p.baseY < -halfY) p.baseY += halfY * 2;
        if (p.baseZ > 2100) p.baseZ = 380;
        if (p.baseZ < 380) p.baseZ = 2100;

        const edgeU = Math.max(Math.abs(p.baseX) / half, Math.abs(p.baseY) / halfY);
        p.edge = edgeU > 0.82 ? Math.max(0, (1 - edgeU) / 0.18) : 1;

        const e = p.focus > 0 ? easeInOut(p.focus) : 0;
        p.ease = e;
        p.x = p.baseX; p.y = p.baseY;
        p.z = p.baseZ + (NEAR_Z - p.baseZ) * e;

        const pr = project(p, cx, cy);
        p.sx = pr.x + (anchorX - pr.x) * e;
        p.sy = pr.y + (anchorY - pr.y) * e;
        p.scale = pr.scale;
      }

      particles.sort((a, b) => b.z - a.z);

      hovered = pointer.active ? pickAt(pointer.x, pointer.y, true) : null;
      canvas.classList.toggle("is-over", !!hovered);

      const dim = 1 - FIXED.ambienceDim * maxFocus;

      if (showConstellation) {
        const reach = 96 * VIEW_FIT;
        const BANDS = 8;
        const bands: number[][] = Array.from({ length: BANDS }, () => []);

        for (let a = 0; a < particles.length; a++) {
          const pa = particles[a];
          if (pa.scale < 0.5 || pa.focus > 0 || pa.edge < 0.4) continue;
          for (let b = a + 1; b < particles.length; b++) {
            const pb = particles[b];
            if (pb.scale < 0.5 || pb.focus > 0 || pb.edge < 0.4) continue;
            const lx = pa.sx - pb.sx, ly = pa.sy - pb.sy;
            if (Math.abs(lx) > reach || Math.abs(ly) > reach) continue;
            const dist2 = lx * lx + ly * ly;
            if (dist2 > reach * reach) continue;
            const n = 1 - Math.sqrt(dist2) / reach;
            let soft = n * n * (3 - 2 * n);
            soft = Math.pow(soft, 1.7);
            soft *= pa.edge * pb.edge * Math.min(1, (pa.scale + pb.scale) * 0.45);
            let idx = Math.floor(soft * BANDS);
            if (idx < 1) continue;
            if (idx > BANDS - 1) idx = BANDS - 1;
            bands[idx].push(pa.sx, pa.sy, pb.sx, pb.sy);
          }
        }

        ctx.strokeStyle = pal.line;
        ctx.lineWidth = 0.3;
        for (let bd = 1; bd < BANDS; bd++) {
          const seg = bands[bd];
          if (!seg.length) continue;
          ctx.globalAlpha = (bd / (BANDS - 1)) * 0.85 * dim;
          ctx.beginPath();
          for (let s = 0; s < seg.length; s += 4) {
            ctx.moveTo(seg[s], seg[s + 1]);
            ctx.lineTo(seg[s + 2], seg[s + 3]);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      const scanning = senseScanRef.current;
      for (const q of particles) {
        if (q.sx < -400 || q.sx > W + 400 || q.sy < -400 || q.sy > H + 400) continue;

        const isSensory = q.entry.senseIdx !== null;
        const lean = isSensory ? 1 : -1;
        let alpha = 0.42 + lean * FIXED.sensoryWeight * 0.36;
        alpha = Math.max(0.06, Math.min(0.95, alpha));

        const isHot = q === hovered || q.focus > 0;

        const tum0 = 0.5 + 0.5 * Math.abs(Math.sin(q.tumble));
        const tum = tum0 + (1 - tum0) * q.ease;
        let r = q.sizeSeed * q.scale * 1.7 * tum * SIZE_FIT;
        r += (LAND_R - r) * q.ease;
        if (r < 0.25) continue;

        alpha *= Math.min(1, 0.35 + q.scale * 0.9) * q.edge;
        alpha += (1 - alpha) * q.ease;
        if (alpha < 0.01) continue;
        if (isHot) alpha = Math.min(1, alpha + 0.35);

        ctx.globalAlpha = alpha * (isHot ? 1 : dim);
        ctx.fillStyle = isSensory
          ? (scanning && q.entry.senseIdx !== null ? senseColour(q.entry.senseIdx, pal) : pal.ink)
          : pal.mist;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (active && active.state === "IDLE" && active.focus <= 0) active = null;
      if (!textParticle || textParticle === active || textParticle.focus <= 0.02) {
        textParticle = active;
      }

      if (textParticle && textParticle.focus > 0.004) {
        const fade = easeInOut(textParticle.focus);
        const entry = textParticle.entry;
        let size = FIXED.textScale * (0.94 + fade * 0.06);
        const weight = entry.senseIdx !== null ? 600 : 300;
        const family = FONT_STACKS[typographyRef.current];
        const maxTextW = W - 48;

        ctx.font = `${weight} ${size.toFixed(1)}px ${family}`;
        const natural = ctx.measureText(entry.phrase).width;
        if (natural > maxTextW) size *= maxTextW / natural;

        ctx.font = `${weight} ${size.toFixed(1)}px ${family}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pal.ink;
        ctx.globalAlpha = fade * (entry.senseIdx !== null ? 1 : 0.62);
        const ty = anchorY0 + (1 - fade) * 9;
        ctx.fillText(entry.phrase, cx, ty);

        const tw = ctx.measureText(entry.phrase).width * fade;
        ctx.globalAlpha = fade * 0.34;
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - tw / 2, ty + size * 0.78);
        ctx.lineTo(cx + tw / 2, ty + size * 0.78);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    let running = true;
    function handleVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
    // Only the pool itself should rebuild the particle field. Palette,
    // typography and sense-scan are read live via refs above, and re-running
    // this effect for them would restart every particle's drift from scratch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />;
}
