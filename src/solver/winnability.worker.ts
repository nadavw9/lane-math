import { createWinnabilityCache, isWinnable, type State, type WinnabilityCache } from "./solve.js";
import type { Level, OperatorBudget, Tile } from "./types.js";

/**
 * Winnability evaluation, off the render thread.
 *
 * The warm-up costs 3–9ms on the largest World 4 boards. That was acceptable
 * while it sat in the dead pause between moves, but the Phase 5 commit
 * animation occupies exactly that pause — so the work has to leave the main
 * thread before the animation lands, not after.
 *
 * The cache lives here, keyed by level id, so it survives across requests the
 * same way it did in the Director.
 */
export interface WarmRequest {
  readonly kind: "warm";
  readonly id: number;
  readonly level: Level;
  readonly budget: OperatorBudget;
  readonly states: readonly SerializedState[];
}

export interface AskRequest {
  readonly kind: "ask";
  readonly id: number;
  readonly level: Level;
  readonly budget: OperatorBudget;
  readonly state: SerializedState;
}

export type WorkerRequest = WarmRequest | AskRequest;

export interface WorkerResponse {
  readonly id: number;
  readonly winnable: boolean;
  readonly ms: number;
}

/** State crosses the thread boundary as plain data. */
export interface SerializedState {
  readonly tiles: readonly Tile[];
  readonly targetIndex: number;
  readonly budget: OperatorBudget;
}

const caches = new Map<string, WinnabilityCache>();

function cacheFor(levelId: string): WinnabilityCache {
  let cache = caches.get(levelId);
  if (!cache) {
    cache = createWinnabilityCache();
    caches.set(levelId, cache);
  }
  return cache;
}

export function handleRequest(request: WorkerRequest): WorkerResponse {
  const started = performance.now();
  const cache = cacheFor(request.level.id);

  if (request.kind === "warm") {
    for (const state of request.states) {
      isWinnable(request.level, request.budget, state as State, cache);
    }
    return { id: request.id, winnable: true, ms: performance.now() - started };
  }

  const winnable = isWinnable(request.level, request.budget, request.state as State, cache);
  return { id: request.id, winnable, ms: performance.now() - started };
}

// Worker entry. Guarded so the module can also be imported directly by tests
// and by the synchronous fallback.
declare const self: {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage: (message: WorkerResponse) => void;
} | undefined;

if (typeof self !== "undefined" && typeof (self as { postMessage?: unknown }).postMessage === "function") {
  self.onmessage = (event) => {
    self!.postMessage(handleRequest(event.data));
  };
}
