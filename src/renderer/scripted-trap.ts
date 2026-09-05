import type { ViewState } from "../game/types.js";

export const SCRIPTED_TRAP_BEAT_MS = 1_100;
export const SCRIPTED_TRAP_HOLD_MS = 300;

export type ScriptedTrapPhase = "commit-hold" | "lookahead";

export interface ScriptedTrapSample {
  readonly phase: ScriptedTrapPhase;
  readonly progress: number;
  readonly commitProgress: number;
  readonly focus: number;
}

export function startsScriptedTrapBeat(previous: ViewState, next: ViewState): boolean {
  return previous.levelId === "1-04" && next.levelId === "1-04" && previous.phase === "playing" && previous.warning === null && next.warning?.scripted === true;
}

export function sampleScriptedTrapBeat(elapsedMs: number): ScriptedTrapSample {
  const elapsed = Math.max(0, Math.min(SCRIPTED_TRAP_BEAT_MS, elapsedMs));
  const progress = elapsed / SCRIPTED_TRAP_BEAT_MS;
  if (elapsed < SCRIPTED_TRAP_HOLD_MS) return { phase: "commit-hold", progress, commitProgress: 0.5, focus: 0.15 };
  return { phase: "lookahead", progress, commitProgress: 0.5, focus: Math.min(1, (elapsed - SCRIPTED_TRAP_HOLD_MS) / (SCRIPTED_TRAP_BEAT_MS - SCRIPTED_TRAP_HOLD_MS)) };
}
