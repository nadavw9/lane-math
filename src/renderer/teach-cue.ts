import type { Rect } from "./layout.js";

const PERIOD_MS = 1_600;

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
