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
    handX: target.x + target.width * 0.78,
    handY: target.y + target.height * 0.78 - 5 - breath * 5,
    plaque: { x: plaqueX, y: plaqueY, width: plaqueWidth, height: 54 },
  };
}
