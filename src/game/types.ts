import type { BinaryOp, Mode, OperatorBudget, Rules, UnaryOp } from "../solver/index.js";

/** A level as stored in levels/ (GDD §10). */
export interface LadderLevel {
  readonly id: string;
  readonly world: number;
  readonly pool: readonly number[];
  readonly targets: readonly number[];
  readonly rules: Rules;
  readonly modes: Partial<
    Record<Mode, { readonly budget: OperatorBudget; readonly tier: string | null }>
  >;
  readonly surplus: number;
}

/** A pool tile as the renderer sees it. Ids are stable for the level's life. */
export interface TileView {
  readonly id: number;
  readonly value: number;
  readonly transformed: boolean;
  readonly consumed: boolean;
}

/**
 * GDD §3.5 tap state machine. Three slots, filled left to right; tapping a
 * filled slot returns that piece and rewinds to that step.
 */
export interface SlotsView {
  readonly leftTileId: number | null;
  readonly op: BinaryOp | null;
  readonly rightTileId: number | null;
}

export type Phase = "playing" | "won" | "failed";

/** What the player may tap next — the affordance rule in §3.5. */
export type Affordance = "numbers" | "operators" | "commit" | "transform";

export interface ViewState {
  readonly levelId: string;
  readonly mode: Mode;
  readonly targets: readonly number[];
  readonly targetIndex: number;
  readonly tiles: readonly TileView[];
  readonly slots: SlotsView;
  readonly budget: OperatorBudget;
  readonly phase: Phase;
  /**
   * Active unary operator. §3.5: unary is a MODE, not a slot step — perfect
   * squares highlight, everything else dims, tapping the operator again cancels.
   */
  readonly transformOp: UnaryOp | null;
  readonly transformableTileIds: readonly number[];
  readonly affordance: Affordance;
  readonly message: string | null;
  readonly failures: number;
  /** Economy view. Null until the economy is attached. */
  readonly economy: EconomyView | null;
}

export interface EconomyView {
  readonly lives: number;
  readonly maxLives: number;
  /** False in World 1 and before the 2-08 unlock (GDD §7.2, §7.6). */
  readonly livesActive: boolean;
  readonly bestStars: number;
  /** Stars this attempt would earn if cleared now. */
  readonly starsIfCleared: number;
  readonly totalStars: number;
  /** Set on the failure that was absorbed by the free first failure (§5.2). */
  readonly firstFailureExempt: boolean;
  readonly lockedOut: boolean;
}

/** Input the renderer emits. It never decides anything. */
export type InputEvent =
  | { readonly type: "tapTile"; readonly id: number }
  | { readonly type: "tapOperator"; readonly op: BinaryOp }
  | { readonly type: "tapUnary"; readonly op: UnaryOp }
  | { readonly type: "tapSlot"; readonly index: 0 | 1 | 2 }
  | { readonly type: "tapCommit" }
  | { readonly type: "tapRestart" }
  | { readonly type: "loadLevel"; readonly id: string }
  /** Wall-clock tick. Lives regenerate on a timer, with no input to trigger it. */
  | { readonly type: "tick" };

/**
 * Commands the Director emits. The Renderer applies them to its own view model
 * and draws; it never reads Director state directly.
 */
export type Command =
  | { readonly type: "render"; readonly state: ViewState }
  | { readonly type: "reject"; readonly reason: string };
