/**
 * Shared spring engine — a React-friendly port of designbookmark's motion.js.
 * Same integrator and same stiffness/damping values from shared/tokens.css.
 * One global rAF loop drives every spring; components write to DOM refs
 * imperatively so spring frames don't trigger React re-renders.
 *
 * Reduced motion: springs are critically damped and targets snap instantly.
 */

/** Stiffness/damping presets, copied from the references' tokens.css. */
export const SPRINGS = {
  follow: [900, 50],
  settle: [280, 22],
  soft: [260, 24],
  lead: [620, 36],
  trail: [190, 19],
  pop: [520, 16],
  fade: [420, 32],
  tabLead: [620, 40],
  tabTrail: [170, 19],
  dropdownTrail: [200, 20],
  dropdownHeight: [300, 23],
  goo: [300, 22],
  word: [420, 26],
  submit: [300, 22],
  stack: [520, 0], // damping auto-set to critical (2*sqrt(k)) in reduced motion
} as const;

export type SpringPreset = keyof typeof SPRINGS;
export type SpringTuple = readonly [number, number];

export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createSpring(initial = 0, preset: SpringPreset | SpringTuple = "soft"): Spring {
  const [k, c] = typeof preset === "string" ? SPRINGS[preset] : preset;
  return { x: initial, v: 0, t: initial, k, c: prefersReducedMotion() ? 2 * Math.sqrt(k) : c };
}

export function tuneSpring(s: Spring, preset: SpringPreset | SpringTuple): void {
  const [k, c] = typeof preset === "string" ? SPRINGS[preset] : preset;
  s.k = k;
  s.c = prefersReducedMotion() ? 2 * Math.sqrt(k) : c;
}

/** One semi-implicit Euler step; matches motion.js exactly. */
export function stepSpring(s: Spring, dt: number): void {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Set a spring's target; `snap` places it there without motion. */
export function targetSpring(s: Spring, target: number, snap = false): void {
  s.t = target;
  if (snap || prefersReducedMotion()) {
    s.x = target;
    s.v = 0;
  }
}

// ── single global animation loop ───────────────────────────────
type Frame = (dt: number) => void;
const subscribers = new Set<Frame>();
let raf = 0;
let last = 0;

function tick(now: number) {
  // Reference engine clamps to 1/30 and integrates in 4 substeps.
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  const sub = dt / 4;
  for (const fn of subscribers) {
    for (let i = 0; i < 4; i++) fn(sub);
  }
  raf = subscribers.size ? requestAnimationFrame(tick) : 0;
}

export function subscribe(fn: Frame): () => void {
  subscribers.add(fn);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

/** Sim-time timer, matching motion.js `after(seconds, fn)`. */
export function after(seconds: number, fn: () => void): () => void {
  if (prefersReducedMotion()) {
    // Reduced motion: skip decorative delays, run the state change immediately.
    const id = window.setTimeout(fn, 0);
    return () => window.clearTimeout(id);
  }
  const id = window.setTimeout(fn, seconds * 1000);
  return () => window.clearTimeout(id);
}
