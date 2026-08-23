import type { BinaryOp, Mode, Scarcity, UnaryOp } from "../solver/index.js";

/**
 * GDD §8.7 tier table, as data.
 *
 * Transcribed verbatim from the table in the GDD, plus the value ranges the
 * table does not specify (operand/target magnitude), which are a construction
 * concern rather than an acceptance band. Kept here as a single swappable
 * object so a band amendment is a data edit and a re-run, not a code change.
 *
 *   | Tier     | T   | S   | Operators | Scarcity | Keystones      | Lookahead | Decision pts |
 *   | Tutorial | 3   | 0   | + -       | Free     | 1              | 1         | 0-1          |
 *   | Early    | 4-5 | 0   | + - *     | Free     | 1              | 1-2       | 1-2          |
 *   | Mid      | 5-6 | 1-2 | + - * /   | Exact    | 1-2            | 2-3       | 2-3          |
 *   | Late     | 6-7 | 1-2 | all + sqrt| Exact    | 1-2            | 3-4       | 3-4          |
 *   | Master ‡ | 6-7 | 2   | all       | Consumed | 2+ overlapping | 4+        | 3-4          |
 *
 * All decisionPoints figures are measured on `dPath`, never `dStart` (§8.4).
 *
 * ‡ Master is POST-LAUNCH and excluded from the launch ladder. Renamed from
 * "Expert" to kill a collision — Expert is a MODE (§6) applied to any level;
 * Master is a TIER. §7.2 maps World 4 to Late, so the 40-level ladder never
 * uses Master.
 *
 * Master cannot band above Late on decisionPoints: consumed operators prune
 * legal decompositions, so its dPath mean (3.13) sits BELOW Late's (3.79).
 * Its difficulty comes from operator scarcity and overlapping keystones, not
 * decision volume. The former 5+/5+ band was compound tightening — moved up in
 * the same amendment that moved dPath down by 1.70 — and collapsed yield 10-25x.
 */
export type TierName = "tutorial" | "early" | "mid" | "late" | "master" | "tutorial-forced";

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface TierSpec {
  readonly name: TierName;
  /** Provisional; real world assignment is curation, which is out of scope. */
  readonly world: number;
  readonly targetCount: Range;
  readonly surplus: Range;
  readonly ops: readonly BinaryOp[];
  readonly unaryOps: readonly UnaryOp[];
  /** Scarcity this tier is banded under. */
  readonly scarcity: Scarcity;
  /** The mode whose metrics decide acceptance for this tier. */
  readonly modeOfRecord: Mode;
  readonly keystones: Range;
  readonly requireOverlappingKeystones: boolean;
  readonly lookahead: Range;
  readonly decisionPoints: Range;
  /** GDD §8.5: "Expert enforces a unique solution (precise)." */
  readonly uniqueSolution: boolean;
  /** Construction bounds — not acceptance bands. */
  readonly operandMax: number;
  readonly targetMax: number;
  /** Slack above T for the Normal counted budget. */
  readonly normalSlack: Range;
  /**
   * Require a live, tempting trap (GDD §8.3 steps 2-3, §13).
   *
   * True everywhere except the near-forced tier. A live fatal move at target i
   * means at least two legal moves there, hence `dPath_i >= 2` and
   * `decisionPoints >= 1` — so a board carrying a trap can never be the
   * near-forced board §7.4 demands for 1-1. The two requirements are mutually
   * exclusive and 1-1 needs the trap gate off.
   */
  readonly requireLiveTrap: boolean;
  /** In scope for the 40-level launch ladder (§7.2). Master is not. */
  readonly launch: boolean;
  /** World this tier supplies in the launch ladder, if any (§7.2). */
  readonly ladderWorld: number | null;
}

const r = (min: number, max: number): Range => ({ min, max });
const INF = Number.POSITIVE_INFINITY;

export const TIERS: readonly TierSpec[] = [
  {
    name: "tutorial",
    world: 1,
    targetCount: r(3, 3),
    surplus: r(0, 0),
    ops: ["+", "-"],
    unaryOps: [],
    scarcity: "free",
    modeOfRecord: "casual",
    keystones: r(1, 1),
    requireOverlappingKeystones: false,
    lookahead: r(1, 1),
    decisionPoints: r(0, 1),
    uniqueSolution: false,
    operandMax: 9,
    targetMax: 18,
    normalSlack: r(1, 2),
    requireLiveTrap: true,
    launch: true,
    ladderWorld: 1,
  },
  {
    name: "early",
    world: 2,
    targetCount: r(4, 5),
    surplus: r(0, 0),
    ops: ["+", "-", "*"],
    unaryOps: [],
    scarcity: "free",
    modeOfRecord: "casual",
    keystones: r(1, 1),
    requireOverlappingKeystones: false,
    lookahead: r(1, 2),
    decisionPoints: r(1, 2),
    uniqueSolution: false,
    operandMax: 9,
    targetMax: 45,
    normalSlack: r(1, 2),
    requireLiveTrap: true,
    launch: true,
    ladderWorld: 2,
  },
  {
    name: "mid",
    world: 3,
    targetCount: r(5, 6),
    // GDD §8.7 amended: 1-2, not a point value. §3.1's own bands are S=0
    // (parity deduction), S=1-2 (parity broken) and S>=3 (do not ship) — it
    // draws no line between 1 and 2, so Mid sitting at exactly 1 while Late
    // allowed 1-2 made surplus the only thing separating them at the boundary.
    surplus: r(1, 2),
    ops: ["+", "-", "*", "/"],
    unaryOps: [],
    scarcity: "consumed",
    modeOfRecord: "normal",
    keystones: r(1, 2),
    requireOverlappingKeystones: false,
    lookahead: r(2, 3),
    decisionPoints: r(2, 3),
    uniqueSolution: false,
    operandMax: 12,
    targetMax: 60,
    normalSlack: r(1, 2),
    requireLiveTrap: true,
    launch: true,
    ladderWorld: 3,
  },
  {
    name: "late",
    world: 4,
    targetCount: r(6, 7),
    surplus: r(1, 2),
    ops: ["+", "-", "*", "/"],
    unaryOps: ["sqrt"],
    scarcity: "consumed",
    modeOfRecord: "normal",
    // GDD §8.7: widened from exactly 2. §7.2 calls World 4 "the FIRST
    // two-keystone levels", not all of them — 318 of 415 Late candidates have
    // exactly one keystone, and requiring two at every slot was the real yield
    // gate. Curation enforces two keystones on specific World 4 slots instead.
    keystones: r(1, 2),
    requireOverlappingKeystones: false,
    lookahead: r(3, 4),
    decisionPoints: r(3, 4),
    uniqueSolution: false,
    operandMax: 12,
    targetMax: 80,
    normalSlack: r(1, 2),
    requireLiveTrap: true,
    launch: true,
    ladderWorld: 4,
  },
  {
    name: "master",
    world: 4,
    targetCount: r(6, 7),
    surplus: r(2, 2),
    ops: ["+", "-", "*", "/"],
    unaryOps: ["sqrt"],
    scarcity: "consumed",
    modeOfRecord: "expert",
    keystones: r(2, INF),
    requireOverlappingKeystones: true,
    lookahead: r(4, INF),
    // NOT 5+. Consumed operators prune decompositions, so Master's dPath mean
    // sits below Late's; it cannot band above Late on decision volume.
    decisionPoints: r(3, 4),
    uniqueSolution: true,
    operandMax: 12,
    targetMax: 80,
    normalSlack: r(1, 2),
    requireLiveTrap: true,
    launch: false,
    ladderWorld: null,
  },
  {
    // Slot 1-01 only (GDD §7.4): "Level 1-1 is near-forced — every target has
    // d_i = 1. The player cannot go wrong."
    //
    // Not a ladder tier and never generated by default. It exists because the
    // near-forced requirement and the live-trap requirement are mutually
    // exclusive: a fatal move implies a branch, and a branch implies
    // decisionPoints >= 1. The main tutorial tier can therefore never produce
    // this board, which is why the corpus had zero of them.
    name: "tutorial-forced",
    world: 1,
    targetCount: r(3, 3),
    surplus: r(0, 0),
    ops: ["+", "-"],
    unaryOps: [],
    scarcity: "free",
    modeOfRecord: "casual",
    // Keystones are unobservable to a player who never faces a choice, so the
    // band does not ask for one. decisionPoints is pinned to exactly 0.
    keystones: r(0, 1),
    requireOverlappingKeystones: false,
    lookahead: r(0, 1),
    decisionPoints: r(0, 0),
    uniqueSolution: false,
    operandMax: 9,
    targetMax: 18,
    normalSlack: r(1, 2),
    requireLiveTrap: false,
    launch: false,
    ladderWorld: null,
  },
];

/** Tiers the 40-level launch ladder draws from (§7.2). Master is post-launch. */
export const LAUNCH_TIERS: readonly TierSpec[] = TIERS.filter((t) => t.launch);

export function tierByName(name: TierName): TierSpec {
  const tier = TIERS.find((t) => t.name === name);
  if (!tier) throw new Error(`unknown tier ${name}`);
  return tier;
}

export function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}
