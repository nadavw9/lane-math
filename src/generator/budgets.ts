import {
  solve,
  type BinaryOp,
  type Level,
  type Move,
  type MutableOperatorBudget,
  type OperatorBudget,
  type UnaryOp,
} from "../solver/index.js";
import type { Rng } from "./rng.js";
import type { TierSpec } from "./tiers.js";

/**
 * Budgets are SOLVED FOR, never authored.
 *
 * The starting point is the operator multiset of an actual winning line. Any
 * budget that covers a real line is executable by construction, which removes
 * the whole class of bug where a hand-written budget quietly makes a level
 * unsolvable — the failure mode confirmed on the GDD §10 sample level last
 * session, where the published `normal` and `expert` blocks both grant one `*`
 * to a line that needs two.
 */

export interface OpUsage {
  readonly binary: ReadonlyMap<BinaryOp, number>;
  readonly unary: ReadonlyMap<UnaryOp, number>;
  readonly key: string;
}

export function usageOf(path: readonly Move[]): OpUsage {
  const binary = new Map<BinaryOp, number>();
  const unary = new Map<UnaryOp, number>();
  for (const move of path) {
    if (move.kind === "binary") binary.set(move.op, (binary.get(move.op) ?? 0) + 1);
    else unary.set(move.op, (unary.get(move.op) ?? 0) + 1);
  }
  const key = [...binary.entries(), ...unary.entries()]
    .map(([op, n]) => `${op}${n}`)
    .sort()
    .join(",");
  return { binary, unary, key };
}

function toBudget(usage: OpUsage): MutableOperatorBudget {
  const budget: MutableOperatorBudget = {};
  for (const [op, n] of usage.binary) budget[op] = n;
  for (const [op, n] of usage.unary) budget[op] = n;
  return budget;
}

/** Casual: unlimited over the tier's operator set (GDD §6). */
export function casualBudget(tier: TierSpec): OperatorBudget {
  const budget: MutableOperatorBudget = {};
  for (const op of tier.ops) budget[op] = null;
  for (const op of tier.unaryOps) budget[op] = null;
  return budget;
}

/** Distinct operator multisets across the enumerated winning lines. */
export function distinctUsages(paths: readonly (readonly Move[])[]): OpUsage[] {
  const seen = new Map<string, OpUsage>();
  for (const path of paths) {
    const usage = usageOf(path);
    if (!seen.has(usage.key)) seen.set(usage.key, usage);
  }
  return [...seen.values()];
}

export interface SolvedBudget {
  readonly budget: OperatorBudget;
  readonly solutionPaths: number;
}

/**
 * Normal: EXACT, the same contract as Expert (GDD §8.5 as amended).
 *
 * It used to add `tier.normalSlack` random operators on top of a real line's
 * usage — "counted, with slack". §6 moved the mode axis from budget to
 * assistance, so Normal and Expert now solve for the same budget and differ
 * only by the fatal-move warning and §8.7's uniqueness rule.
 *
 * This matters beyond the budget field. Mid and Late take Normal as their mode
 * of record, so a slack budget here meant their metrics — decision points,
 * trap depth, path count — were banded against a budget the game does not
 * ship. `tier.normalSlack` is now unused by this function and left in the tier
 * data only until the field itself is removed.
 */
export function solveNormalBudget(
  level: Level,
  _tier: TierSpec,
  usages: readonly OpUsage[],
  _rng: Rng,
): SolvedBudget | null {
  if (usages.length === 0) return null;

  for (const usage of usages) {
    const budget = toBudget(usage);
    // Only solvability matters here, so stop at the first winning line and skip
    // dead-branch enumeration entirely. Exact path counts come from the
    // per-mode analyse() that runs on survivors.
    const result = solve(level, budget, { collectFatalMoves: false, maxCollected: 1 });
    if (result.solvable) return { budget, solutionPaths: result.winningPaths.length };
  }
  return null;
}

export interface ExpertOutcome {
  /** Budgets that admit at least one winning line. */
  readonly solvableCount: number;
  /** Of those, how many admit exactly one. */
  readonly uniqueCount: number;
  readonly chosen: SolvedBudget | null;
}

/**
 * Expert: consumed — exactly one operator per move, binary counts summing to
 * exactly T (GDD §6). A line's own usage always sums to T, so the candidate set
 * is precisely the distinct line usages; no search over compositions is needed.
 *
 * GDD §8.5 makes uniqueness a property of the mode, not the tier: "Casual
 * permits multiple winning lines (forgiving); Expert enforces a unique solution
 * (precise)." So a board only has a valid Expert budget if some consumed budget
 * leaves exactly one winning line. Boards that cannot are excluded rather than
 * forced.
 *
 * Note a spec gap: §6 says `#ops = T`, but a unary transform is a move
 * (GDD §3.5), so a line using a transform makes more moves than T. This treats
 * consumed as "binary counts sum to T, unary budgeted at exactly the transforms
 * the line uses" — the only reading under which unary tiers can be Expert at all.
 */
export function solveExpertBudget(
  level: Level,
  usages: readonly OpUsage[],
  requireUnique: boolean,
  preferUnary = false,
): ExpertOutcome {
  let solvableCount = 0;
  let uniqueCount = 0;
  let firstSolvable: SolvedBudget | null = null;
  let firstUnique: SolvedBudget | null = null;

  /*
   * ORDER MATTERS, because this takes the FIRST usage that qualifies.
   *
   * It used to take whatever enumeration happened to produce first, with no
   * preference at all. On the Late corpus that meant: 10 of 197 boards had a
   * unique root-using budget available, and the search chose one 0 times — so
   * `√` never reached a shipped Expert budget even where it could have. When
   * the tier declares a unary operator, a budget that uses it is the one worth
   * having, and this is the whole of the fix.
   */
  const ordered = preferUnary
    ? [...usages].sort((a, b) => Number(b.unary.size > 0) - Number(a.unary.size > 0))
    : usages;

  for (const usage of ordered) {
    const budget = toBudget(usage);
    // Uniqueness is a yes/no question, so stop as soon as a second winning line
    // turns up. Enumerating the rest answers nothing and, on a T=7 board with a
    // free-ish budget, costs more than everything else in the pipeline combined.
    const result = solve(level, budget, { collectFatalMoves: false, maxCollected: 2 });
    if (!result.solvable) continue;

    solvableCount++;
    const candidate = { budget, solutionPaths: result.winningPaths.length };
    firstSolvable ??= candidate;

    if (result.winningPaths.length === 1) {
      uniqueCount++;
      firstUnique ??= candidate;
    }
  }

  return {
    solvableCount,
    uniqueCount,
    chosen: requireUnique ? firstUnique : (firstUnique ?? firstSolvable),
  };
}
