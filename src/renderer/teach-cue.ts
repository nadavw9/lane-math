import type { Rect } from "./layout.js";

const PERIOD_MS = 1_600;
const QUEUE_LOOK_MS = 1_400;

export interface TeachCueSample {
  readonly lift: number;
  readonly scale: number;
  readonly ringAlpha: number;
  readonly shadowAlpha: number;
  readonly handX: number;
  readonly handY: number;
  readonly plaque: Rect;
}

export interface QueueSweepSample {
  readonly progress: number;
  readonly handX: number;
  readonly handY: number;
  readonly targetAlpha: number;
}

/** Shared phone-scale geometry for every exact live FTUE action marker. */
export function teachCueSample(target: Rect, elapsedMs: number, surfaceWidth = 420): TeachCueSample {
  const phase = ((elapsedMs % PERIOD_MS) + PERIOD_MS) % PERIOD_MS / PERIOD_MS;
  const breath = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  const plaqueWidth = Math.min(292, surfaceWidth - 24);
  const plaqueX = Math.max(12, Math.min(surfaceWidth - plaqueWidth - 12, target.x + target.width / 2 - plaqueWidth / 2));
  const preferredY = target.y - 82;
  const plaqueY = preferredY >= 68 ? preferredY : target.y + target.height + 24;
  return {
    lift: 5 + breath * 2,
    scale: 1.055 + breath * 0.015,
    ringAlpha: 0.72 + breath * 0.28,
    shadowAlpha: 0.24 + breath * 0.08,
    handX: target.x + target.width * 0.82,
    handY: target.y + target.height * 0.98 - breath * 5,
    plaque: { x: plaqueX, y: plaqueY, width: plaqueWidth, height: 54 },
  };
}

/** Sweep the visible queue first; only then introduce the front-target pulse. */
export function queueSweepSample(start: Rect, target: Rect, elapsedMs: number): QueueSweepSample {
  const progress = Math.min(1, Math.max(0, elapsedMs) / 900);
  const eased = progress * progress * (3 - 2 * progress);
  const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const from = center(start);
  const to = center(target);
  return {
    progress,
    handX: from.x + (to.x - from.x) * eased + target.width * 0.32,
    handY: from.y + (to.y - from.y) * eased + target.height * 0.5,
    targetAlpha: progress === 1 ? 1 : 0,
  };
}

export interface QueueLookSample {
  readonly progress: number;
  readonly handX: number;
  readonly handY: number;
  /** Look-only: fade the hand out so it never parks as a tap cue. */
  readonly handAlpha: number;
  /** Soft brass attention on each plate as the sweep passes (not a tap pulse). */
  readonly plateAlphas: readonly number[];
}

/**
 * Look-at-the-whole-queue beat: polyline sweep back→front (e.g. 2→17→4).
 * Never settles a tap-style pulse on the front plate.
 */
export function queueLookSample(waypoints: readonly Rect[], elapsedMs: number): QueueLookSample {
  if (waypoints.length === 0) {
    return { progress: 1, handX: 0, handY: 0, handAlpha: 0, plateAlphas: [] };
  }
  const centers = waypoints.map((rect) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    w: rect.width,
    h: rect.height,
  }));
  const progress = Math.min(1, Math.max(0, elapsedMs) / QUEUE_LOOK_MS);
  const segments = Math.max(1, centers.length - 1);
  const scaled = progress * segments;
  const index = Math.min(segments - 1, Math.floor(scaled));
  const local = Math.min(1, scaled - index);
  const eased = local * local * (3 - 2 * local);
  const from = centers[index]!;
  const to = centers[Math.min(centers.length - 1, index + 1)]!;
  const handX = from.x + (to.x - from.x) * eased + to.w * 0.28;
  const handY = from.y + (to.y - from.y) * eased + to.h * 0.42;
  // Fade during the last 18% so the beat ends on "look", not "tap here".
  const handAlpha = progress >= 1 ? 0 : progress > 0.82 ? (1 - progress) / 0.18 : 1;
  // After the sweep, keep an even soft outline on every plate — never a single
  // front ring that reads as "tap this".
  const plateAlphas = centers.map((_, i) => {
    if (progress >= 1) return 0.28;
    const peak = i / segments;
    const dist = Math.abs(progress - peak);
    return Math.max(0, 1 - dist * 2.4) * 0.55;
  });
  return { progress, handX, handY, handAlpha, plateAlphas };
}
