import { describeMove, type BinaryOp, type Move, type SolveResult } from "../solver/index.js";

/**
 * GDD §13, Severity 2: "Trap liveness != trap temptation. Generator verifies a
 * false decomposition *exists*, not that anyone would take it."
 *
 * A trap nobody falls into is not a trap. This scores how *natural* the fatal
 * move looks next to the correct one at the same moment, and the score is
 * emitted per trap rather than collapsed into a boolean, so a band change is a
 * threshold edit rather than a regeneration.
 */

/**
 * How readily a player reaches for each operator. Addition is what everyone
 * tries first; division is what nobody tries until the others have failed.
 */
export const OPERATOR_NATURALNESS: Readonly<Record<BinaryOp, number>> = {
  "+": 1.0,
  "*": 0.9,
  "-": 0.6,
  "/": 0.35,
};

/** A unary transform is a deliberate, visible act — never the reflexive move. */
export const UNARY_NATURALNESS = 0.3;

/**
 * Bigger operands are harder to spot. Scale is deliberately gentle: operator
 * choice should dominate magnitude, because "try adding" beats "try the small
 * numbers" as a description of how players actually scan a board.
 */
export const MAGNITUDE_SCALE = 20;

export function naturalness(move: Move): number {
  if (move.kind === "unary") return UNARY_NATURALNESS;
  const magnitude = 1 / (1 + (move.left + move.right) / MAGNITUDE_SCALE);
  return OPERATOR_NATURALNESS[move.op] * magnitude;
}

export interface TrapScore {
  readonly targetIndex: number;
  readonly fatal: string;
  readonly correct: string;
  readonly fatalNaturalness: number;
  readonly correctNaturalness: number;
  /**
   * Share of naturalness held by the fatal move: 0.5 means the trap is exactly
   * as tempting as the correct line, above 0.5 means it is more tempting.
   */
  readonly temptation: number;
  readonly trapDepth: number;
  /** True if this trap consumes a number a keystone needs. */
  readonly stealsKeystoneOperand: boolean;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Score every fatal move against the most natural correct move available at
 * the same instant.
 *
 * Pure post-processing of one solve() — the correct alternatives at a state are
 * read out of the winning paths that share the fatal move's prefix, so this
 * costs no extra search.
 */
export function scoreTraps(
  result: SolveResult,
  keystoneOperands: ReadonlySet<number>,
): TrapScore[] {
  const scores: TrapScore[] = [];

  for (const branch of result.fatalMoves) {
    const depth = branch.prefix.length;
    const prefixLabel = branch.prefix.map(describeMove).join("|");

    let bestCorrect: Move | null = null;
    for (const path of result.winningPaths) {
      if (path.length <= depth) continue;
      if (path.slice(0, depth).map(describeMove).join("|") !== prefixLabel) continue;
      const continuation = path[depth]!;
      if (bestCorrect === null || naturalness(continuation) > naturalness(bestCorrect)) {
        bestCorrect = continuation;
      }
    }

    // No matching winning path means the collection cap truncated the search.
    // Scoring against nothing would invent a number; skip instead.
    if (bestCorrect === null) continue;

    const fatalScore = naturalness(branch.move);
    const correctScore = naturalness(bestCorrect);
    const operands =
      branch.move.kind === "binary" ? [branch.move.left, branch.move.right] : [branch.move.from];

    scores.push({
      targetIndex: branch.targetIndex,
      fatal: describeMove(branch.move),
      correct: describeMove(bestCorrect),
      fatalNaturalness: round(fatalScore),
      correctNaturalness: round(correctScore),
      temptation: round(fatalScore / (fatalScore + correctScore)),
      trapDepth: branch.trapDepth,
      stealsKeystoneOperand: operands.some((v) => keystoneOperands.has(v)),
    });
  }

  return scores.sort((a, b) => b.temptation - a.temptation);
}

/**
 * The level's temptation is its most tempting trap. A trap that steals a
 * keystone operand is the one that matters — it is the move that actually
 * loses the level two targets later — so those are preferred when present.
 */
export function peakTemptation(scores: readonly TrapScore[]): number {
  const stealing = scores.filter((s) => s.stealsKeystoneOperand);
  const pool = stealing.length > 0 ? stealing : scores;
  return pool.reduce((max, s) => Math.max(max, s.temptation), 0);
}

/** GDD §13: the fatal path must be at least as natural as the correct one. */
export const TEMPTATION_THRESHOLD = 0.5;
