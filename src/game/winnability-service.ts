import {
  createWinnabilityCache,
  isWinnable,
  type Level,
  type OperatorBudget,
  type State,
  type WinnabilityCache,
} from "../solver/index.js";
import type { SerializedState, WorkerRequest, WorkerResponse } from "../solver/winnability.worker.js";

/**
 * Winnability, answered off the render thread where a worker is available.
 *
 * The warning must still be able to answer SYNCHRONOUSLY at the moment of a
 * commit — the player taps "=" and the move is either refused or it happens;
 * there is no frame in which a half-committed move is a sensible thing to draw.
 *
 * So the design is: the worker warms answers ahead of time and the main thread
 * reads them from a local cache. The synchronous path is a fallback for the
 * first commit on a board the worker has not reached yet, and for environments
 * with no worker at all (tests, older webviews).
 */
export class WinnabilityService {
  private worker: Worker | null = null;
  private nextId = 1;
  /** Answers the worker has returned, keyed by state. */
  private readonly answers = new Map<string, boolean>();
  /** Local cache backing the synchronous fallback. */
  private local: WinnabilityCache = createWinnabilityCache();
  private levelId: string | null = null;

  constructor(private readonly makeWorker: (() => Worker) | null = null) {}

  /** Discard per-level state. Called whenever a level is opened. */
  reset(levelId: string): void {
    if (this.levelId !== levelId) {
      this.answers.clear();
      this.local = createWinnabilityCache();
      this.levelId = levelId;
    }
    this.ensureWorker();
  }

  private ensureWorker(): void {
    if (this.worker || !this.makeWorker) return;
    try {
      this.worker = this.makeWorker();
      this.worker.onmessage = (event: MessageEvent<WorkerResponse & { key?: string }>) => {
        const { key, winnable } = event.data as WorkerResponse & { key?: string };
        if (key) this.answers.set(key, winnable);
      };
    } catch {
      // No worker available. The synchronous fallback is correct, just slower.
      this.worker = null;
    }
  }

  private static key(state: SerializedState): string {
    const tiles = state.tiles
      .map((t) => `${t.id}:${t.value}${t.transformed ? "'" : ""}`)
      .sort()
      .join(".");
    return `${tiles}#${state.targetIndex}#${JSON.stringify(state.budget)}`;
  }

  /**
   * Ask the worker to evaluate these states in the background. Fire and forget:
   * the answers land in `answers` and are read on the next commit.
   */
  warm(level: Level, budget: OperatorBudget, states: readonly SerializedState[]): void {
    if (!this.worker) return;
    for (const state of states) {
      const key = WinnabilityService.key(state);
      if (this.answers.has(key)) continue;
      const request: WorkerRequest & { key: string } = {
        kind: "ask",
        id: this.nextId++,
        level,
        budget,
        state,
        key,
      };
      this.worker.postMessage(request);
    }
  }

  /**
   * Answer now. Uses a warmed answer when the worker has one, and falls back to
   * computing it on this thread when it does not — a commit cannot wait.
   */
  isWinnable(level: Level, budget: OperatorBudget, state: State): boolean {
    const key = WinnabilityService.key(state);
    const warmed = this.answers.get(key);
    if (warmed !== undefined) return warmed;

    const answer = isWinnable(level, budget, state, this.local);
    this.answers.set(key, answer);
    return answer;
  }

  /** True when answers are actually coming from the worker. */
  get offThread(): boolean {
    return this.worker !== null;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
