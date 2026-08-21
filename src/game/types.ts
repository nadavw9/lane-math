import type { RuntimeLevelField } from "./level-fields.js";
import type { BinaryOp, Mode, OperatorBudget, Rules, UnaryOp } from "../solver/index.js";
import type { Unlocks } from "../economy/unlocks.js";

/** A level as stored in levels/ (GDD §10). */
/**
 * A level as the GAME sees it — the shipped shape, not the authored one.
 *
 * The repo's level files carry generator and curation metrics too (§8.6); those
 * are stripped by the build (§10) because no runtime code reads them. The
 * compile-time check below fails if a field is added here without being added
 * to RUNTIME_LEVEL_FIELDS, which is what keeps the shipped payload honest.
 */
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

/*
 * Every LadderLevel field must appear in RUNTIME_LEVEL_FIELDS, or the build
 * would strip something the game reads. Resolves to `true` when they agree and
 * to a type error naming the missing field when they do not.
 */
type MissingFromRuntime = Exclude<keyof LadderLevel, RuntimeLevelField>;
type EveryLoaderFieldShips = MissingFromRuntime extends never ? true : MissingFromRuntime;
const _fieldCheck: EveryLoaderFieldShips = true;
void _fieldCheck;

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
  /**
   * How many times this level has been rewound. Bumped by every reset, so the
   * Renderer can tell a restart from a move that happens to look like one.
   */
  readonly run: number;
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
  /** GDD §7.6: systems absent before their unlock, not greyed out. */
  readonly unlocks: Unlocks;
  /** A blocked fatal move awaiting acknowledgement. */
  readonly warning: WarningView | null;
  readonly hints: readonly HintView[];
  readonly shop: readonly ShopEntry[];
  readonly shopOpen: boolean;
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
  /** Milliseconds to the next free life. Always shown while locked out (§5.2). */
  readonly msUntilNextLife: number;
  readonly starsAvailable: number;
}

/**
 * A blocked fatal move (GDD §6 Casual, §7.5 the scripted trap).
 *
 * The move was legal and correct arithmetic; committing it would have made the
 * level unwinnable. Casual blocks it and says so. At 1-4 the block is the
 * teaching device and the rewind is free regardless of mode.
 */
export interface WarningView {
  /** The move that was refused, e.g. "3 + 1 = 4". */
  readonly move: string;
  /** The keystone target the move would have starved, if one is known. */
  readonly keystoneTarget: number | null;
  readonly keystoneTargetIndex: number | null;
  /** Pool tiles that make the keystone — pulsed, per §7.5 step 4. */
  readonly keystoneTileIds: readonly number[];
  /** §7.5: the scripted trap at 1-4 is taught, not merely refused. */
  readonly scripted: boolean;
  readonly line: string;
}

export interface HintView {
  readonly type: string;
  readonly text: string;
  readonly tileIds: readonly number[];
  readonly targetIndex: number | null;
  readonly forbidden: { readonly leftId: number; readonly rightId: number } | null;
}

export interface ShopEntry {
  readonly type: string;
  readonly label: string;
  readonly cost: number;
  readonly owned: boolean;
  readonly affordable: boolean;
}

/** Input the renderer emits. It never decides anything. */
export type InputEvent =
  | { readonly type: "tapTile"; readonly id: number }
  | { readonly type: "tapOperator"; readonly op: BinaryOp }
  | { readonly type: "tapUnary"; readonly op: UnaryOp }
  | { readonly type: "tapSlot"; readonly index: 0 | 1 | 2 }
  | { readonly type: "tapCommit" }
  | { readonly type: "tapRestart" }
  /**
   * Leave the board for the world map (§7.6).
   *
   * Handled by the shell, not the Director: the map is a screen, and which
   * screen is showing is not a rule about the game. The Director ignores it.
   */
  | { readonly type: "tapMap" }
  /** Long-press on the build string: dump the §7.8 funnel off the device. */
  | { readonly type: "exportTelemetry" }
  /** Offer the §5.2 rewarded refill. Handled by the shell, not the Director. */
  | { readonly type: "tapWatchAd" }
  | { readonly type: "loadLevel"; readonly id: string }
  /** Wall-clock tick. Lives regenerate on a timer, with no input to trigger it. */
  | { readonly type: "tick" }
  /** Acknowledge a blocked fatal move; the equation rewinds free. */
  | { readonly type: "dismissWarning" }
  | { readonly type: "selectMode"; readonly mode: Mode }
  | { readonly type: "toggleShop" }
  | { readonly type: "buyHint"; readonly hint: string };

/**
 * Commands the Director emits. The Renderer applies them to its own view model
 * and draws; it never reads Director state directly.
 */
export type Command =
  | { readonly type: "render"; readonly state: ViewState }
  | { readonly type: "reject"; readonly reason: string };
