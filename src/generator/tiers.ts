import type { BinaryOp, Mode, Scarcity, UnaryOp } from "../solver/index.js";

/**
 * GDD §8.5 tier table, as data.
 *
 * Transcribed verbatim from the table in the GDD, plus the value ranges the
 * table does not specify (operand/target magnitude), which are a construction
 * concern rather than an acceptance band. Kept here as a single swappable
 * object so a band amendment is a data edit and a re-run, not a code change.
 *
 *   | Tier     | T   | S   | Operators | Scarcity | Keystones      | Lookahead | Decision pts |
 *   | Tutorial | 3   | 0   | + -       | Free     | 1              | 1         | 0-1          |
 *   | Early    | 4-5 | 0   | + - *     | Free     | 1              | 1-2       | 1-2          |
 *   | Mid      | 5-6 | 1   | + - * /   | Counted  | 1-2            | 2-3       | 2-3          |
 *   | Late     | 6-7 | 1-2 | all + sqrt| Counted  | 2              | 3-4       | 3-4          |
 *   | Expert   | 6-7 | 2   | all       | Consumed | 2+ overlapping | 4+        | 4+           |
 */
export type TierName = "tutorial" | "early" | "mid" | "late" | "expert";

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
  },
  {
    name: "mid",
    world: 3,
    targetCount: r(5, 6),
    surplus: r(1, 1),
    ops: ["+", "-", "*", "/"],
    unaryOps: [],
    scarcity: "counted",
    modeOfRecord: "normal",
    keystones: r(1, 2),
    requireOverlappingKeystones: false,
    lookahead: r(2, 3),
    decisionPoints: r(2, 3),
    uniqueSolution: false,
    operandMax: 12,
    targetMax: 60,
    normalSlack: r(1, 2),
  },
  {
    name: "late",
    world: 4,
    targetCount: r(6, 7),
    surplus: r(1, 2),
    ops: ["+", "-", "*", "/"],
    unaryOps: ["sqrt"],
    scarcity: "counted",
    modeOfRecord: "normal",
    keystones: r(2, 2),
    requireOverlappingKeystones: false,
    lookahead: r(3, 4),
    decisionPoints: r(3, 4),
    uniqueSolution: false,
    operandMax: 12,
    targetMax: 80,
    normalSlack: r(1, 2),
  },
  {
    name: "expert",
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
    decisionPoints: r(4, INF),
    uniqueSolution: true,
    operandMax: 12,
    targetMax: 80,
    normalSlack: r(1, 2),
  },
];

export function tierByName(name: TierName): TierSpec {
  const tier = TIERS.find((t) => t.name === name);
  if (!tier) throw new Error(`unknown tier ${name}`);
  return tier;
}

export function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}
