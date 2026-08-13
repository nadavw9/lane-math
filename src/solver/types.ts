/**
 * Lane Math solver — shared types.
 *
 * This is shipped game code, not a build script: Casual mode's fatal-move
 * warning (GDD §6) and the hint system (GDD §5.4) both call into it at runtime.
 */

export type BinaryOp = "+" | "-" | "*" | "/";
export type UnaryOp = "sqrt" | "sq";
export type Operator = BinaryOp | UnaryOp;

export const BINARY_OPS: readonly BinaryOp[] = ["+", "-", "*", "/"];
export const UNARY_OPS: readonly UnaryOp[] = ["sqrt", "sq"];
export const ALL_OPS: readonly Operator[] = [...BINARY_OPS, ...UNARY_OPS];

/** `+` and `*` are commutative: `3+5` and `5+3` are ONE decomposition (GDD §13). */
export const COMMUTATIVE: ReadonlySet<BinaryOp> = new Set<BinaryOp>(["+", "*"]);

/**
 * Operator availability.
 *
 *   `null`    unlimited
 *   number    remaining count
 *   absent    operator is not in this level at all
 */
export type OperatorBudget = { readonly [K in Operator]?: number | null };
export type MutableOperatorBudget = { -readonly [K in Operator]?: number | null };

/** GDD §6 difficulty modes. */
export type Mode = "casual" | "normal" | "expert";

/**
 * GDD §6 operator scarcity. Derived from the budget rather than declared, so a
 * level cannot claim to be Expert while handing out unlimited operators.
 */
export type Scarcity = "free" | "counted" | "consumed";

export interface Rules {
  /** GDD §3.6. False in early worlds: `3 - 8` is rejected. */
  readonly allowNegative: boolean;
  /** GDD §3.4 hard rule. Must be true; fractions are not implemented by design. */
  readonly integerOnly: boolean;
}

export const DEFAULT_RULES: Rules = { allowNegative: false, integerOnly: true };

export interface Level {
  readonly id: string;
  readonly world?: number;
  readonly tier?: string;
  /** Positive integers. Duplicates are distinct tiles (GDD §3.5). */
  readonly pool: readonly number[];
  /** The queue, front first. Fully visible to the player (GDD §4.2). */
  readonly targets: readonly number[];
  readonly operators: Readonly<Record<Mode, OperatorBudget>>;
  readonly rules: Rules;
}

/**
 * A pool tile. `id` is the index into `level.pool` and never changes — tiles are
 * consumed by index, not by value, so the renderer knows which one shattered.
 * `transformed` is set by a unary op and blocks cascading (GDD §3.5).
 */
export interface Tile {
  readonly id: number;
  readonly value: number;
  readonly transformed: boolean;
}

/** One legal way to make a target. Canonical: `+`/`*` operands are ascending. */
export interface Decomposition {
  readonly left: number;
  readonly right: number;
  readonly op: BinaryOp;
  readonly result: number;
  /** Representative tiles. Interchangeable same-value tiles collapse to one
   *  decomposition, so these name one valid pairing, not the only one. */
  readonly leftId: number;
  readonly rightId: number;
}

/** One legal unary pool transform (GDD §3.3). */
export interface Transform {
  readonly op: UnaryOp;
  readonly from: number;
  readonly to: number;
  readonly tileId: number;
}

export interface BinaryMove extends Decomposition {
  readonly kind: "binary";
  readonly targetIndex: number;
}

export interface UnaryMove extends Transform {
  readonly kind: "unary";
  /** The target that was at the front when the transform happened. A transform
   *  does not advance the queue. */
  readonly targetIndex: number;
}

export type Move = BinaryMove | UnaryMove;

/**
 * A legal move that loses the level.
 *
 * `trapDepth` counts the fatal move itself plus every further move the branch
 * survives (GDD §8.4). In the canonical level `3+5=8` has trap depth 2: it
 * clears the 8, survives the 3, and dies at the 15.
 */
export interface FatalBranch {
  /** One prefix that reaches the state this move was offered from. A state can
   *  be reachable by several prefixes; the first one found is recorded. */
  readonly prefix: readonly Move[];
  readonly move: Move;
  readonly targetIndex: number;
  readonly trapDepth: number;
  /** Index of the target the lane finally stalls on. */
  readonly diesAtTargetIndex: number;
}

export interface SolveResult {
  readonly budget: OperatorBudget;
  readonly scarcity: Scarcity;
  readonly solvable: boolean;
  readonly winningPaths: readonly (readonly Move[])[];
  /** Every fatal move offered from a state that was still winnable. */
  readonly fatalMoves: readonly FatalBranch[];
  /** True if a collection cap was hit — metrics are then lower bounds. */
  readonly truncated: boolean;
  readonly states: number;
}

/** One keystone, with the detail the generator needs to reason about traps. */
export interface KeystoneInfo {
  readonly index: number;
  /** Operand values of its single decomposition — the contested numbers. */
  readonly operands: readonly number[];
  /** Earliest target that can steal an operand (GDD §8.2). */
  readonly earliestThief: number;
  readonly lookahead: number;
}

/** GDD §8.4. Generator/CI output; never read by gameplay code. */
export interface Metrics {
  readonly surplus: number;
  /**
   * `dStart_i` — decompositions of each target from the STARTING pool
   * (GDD §8.4). Path-independent: this is structure, and it is what keystone
   * detection is pinned to (GDD §13).
   */
  readonly dStart: readonly number[];
  /**
   * `dPath_i` — decompositions of each target from the pool AS REACHED along
   * the intended winning line (GDD §8.4). This is the search burden the player
   * actually faces.
   *
   * The two diverge, and `dStart` inflates with `T`: on a Late board a late
   * target is reached with 3–6 tiles in hand and is usually forced, while
   * measuring it against all 14 starting tiles makes it look like a branch.
   * Empty when the level is unsolvable.
   */
  readonly dPath: readonly number[];
  /** Count of targets where `dPath_i >= 2` (GDD §8.4). Never `dStart`. */
  readonly decisionPoints: number;
  readonly keystones: readonly number[];
  readonly keystoneDetail: readonly KeystoneInfo[];
  /**
   * Pairs of keystones whose operand sets intersect — two keystones contesting
   * the same number (GDD §5.4, §8.2). This is the "overlapping keystones"
   * structure Late and Expert are built around: revealing either one does not
   * collapse the puzzle, because the insight is the interaction.
   */
  readonly overlappingKeystonePairs: number;
  readonly lookaheadDistance: number;
  readonly solutionPaths: number;
  readonly maxTrapDepth: number;
  readonly solvable: boolean;
}

export interface SolveOptions {
  /** Cap on collected winning paths and fatal branches. Sets `truncated`. */
  readonly maxCollected?: number;
  /**
   * Skip dead-branch enumeration. Fatal-move collection walks every winnable
   * state and computes a survival depth for each dead end, which is most of the
   * cost of a solve. Callers that only need solvability and the winning lines —
   * the generator's budget search, for one — can turn it off. `maxTrapDepth`
   * is meaningless when this is false.
   */
  readonly collectFatalMoves?: boolean;
}

export const DEFAULT_MAX_COLLECTED = 20_000;
