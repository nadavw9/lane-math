import { PALETTE } from "./layout.js";

/** A restrained material cue for the operand armed by the swap gesture. */
export interface ArmCue {
  readonly lift: number;
  readonly scale: number;
  readonly elevation: number;
  readonly outline: number;
}

const PERIOD_MS = 1_200;

function mixColour(from: number, to: number, amount: number): number {
  const channel = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * amount);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Selection is MORE presence, never DIM (§9.6).
 *
 * The armed operand stays raised while a slow brass rim moves gently through
 * the room light. The range is deliberately narrow: it should feel held ready
 * for the second tap, not bounce or call for attention.
 */
export function armCueFor(
  slot: 0 | 2,
  armedSlot: 0 | 2 | null,
  elapsedMs: number,
): ArmCue | null {
  if (slot !== armedSlot) return null;
  const phase = ((elapsedMs % PERIOD_MS) + PERIOD_MS) % PERIOD_MS / PERIOD_MS;
  const light = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  return {
    lift: 3 + light,
    scale: 1.035 + light * 0.01,
    elevation: 1.75 + light * 0.25,
    outline: mixColour(PALETTE.brass, PALETTE.brassLit, light * 0.48),
  };
}
