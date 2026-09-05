import {
  analyse,
  applyBinary,
  applyMove,
  enumerate,
  enumerateTransforms,
  exactSqrt,
  hasBudget,
  spend,
  type BinaryOp,
  type Level,
  type Mode,
  type OperatorBudget,
  type State,
  type Tile,
  type UnaryOp,
} from "../solver/index.js";
import { livesActiveFor } from "../economy/config.js";
import type { Economy } from "../economy/economy.js";
import { ALL_UNLOCKED, unlocksFor } from "../economy/unlocks.js";
import type { Telemetry } from "../telemetry/telemetry.js";
import { HINT_COST, HINT_LABEL, generateHint, hintContext, type HintType } from "./hints.js";
import { WinnabilityService } from "./winnability-service.js";
import { ftueCue } from "./ftue.js";
import type {
  Affordance,
  FailureExit,
  Command,
  EconomyView,
  HintView,
  HintAdView,
  InputEvent,
  LadderLevel,
  Phase,
  ShopEntry,
  SlotsView,
  TileView,
  ViewState,
  WarningView,
} from "./types.js";

/** A warned move, held for the override (GDD §6, Normal). */
type PendingFatal =
  | { readonly kind: "binary"; readonly leftId: number; readonly rightId: number; readonly op: BinaryOp }
  | { readonly kind: "unary"; readonly tileId: number; readonly op: UnaryOp };

/** GDD §7.5. The one level whose warning is on regardless of mode. */
export const SCRIPTED_TRAP_LEVEL = "1-04";

/**
 * The one level where the board teaches by CONSTRAINT (GDD §7.7, amended).
 *
 * Tiles that cannot form the front target are dim and do not respond. Only here:
 * §7.4 guarantees d_i = 1 on 1-01, so "only legal" and "only correct" are the
 * same set and nothing is taken away. Anywhere else this would delete §9.5's
 * shudder — refusal is a real signal — and do the player's arithmetic for them.
 */
export const CONSTRAINT_LEVEL = "1-01";

/**
 * GDD §7.4. The TEST half of the teaching beat: 1-6 repeats 1-4's trap shape
 * with the warning OFF, "player must see it themselves".
 *
 * This is a per-level rule and it outranks the mode default, exactly as §7.5
 * does in the other direction. It only became load-bearing when §6 was amended
 * to warn in Normal: the mode selector does not unlock until 3-10 (§7.6), so
 * every player reaches 1-6 in Normal, and without this the warning would fire
 * on the one level whose entire purpose is that it does not.
 */
export const TRAP_TEST_LEVEL = "1-06";

/**
 * The Director owns game state and is the only thing that decides anything.
 *
 * It calls the solver for every rule that the solver already knows — which
 * decompositions are legal, which transforms are available, whether the front
 * target is still reachable. Game rules are NOT reimplemented here and must
 * never be reimplemented in the renderer.
 *
 * Input goes in, commands come out. The renderer draws commands and emits
 * input; the two never touch directly (GDD §11).
 */
/** A committed state, kept so §9.4's Continue can hand one back. */
interface Snapshot {
  readonly consumed: ReadonlySet<number>;
  readonly targetIndex: number;
  readonly budget: OperatorBudget;
}

/** GDD §9.4: a level cannot be brute-forced entirely through ads. */
const MAX_CONTINUES = 2;

export class Director {
  private level: LadderLevel;
  private readonly mode: Mode;
  /**
   * Optional economy. Phase 3's fail/restart behaviour is untouched — the
   * economy is attached to those events, not woven through them.
   */
  private readonly economy: Economy | null;
  private lastFailureExempt = false;

  private tiles: Tile[] = [];
  private consumed = new Set<number>();
  private targetIndex = 0;
  /** Increments on every rewind, so a restart is distinguishable from a move. */
  private run = 0;
  private budget: OperatorBudget = {};
  private slots: SlotsView = { leftTileId: null, op: null, rightTileId: null };
  /**
   * GDD §3.5 swap gesture arm. When both operands are filled, tapping one
   * operand slot arms it; tapping the other exchanges left/right without
   * emptying the row or touching the operator. Tapping the armed slot again
   * falls through to the normal rewind.
   */
  private swapArmed: 0 | 2 | null = null;
  private phase: Phase = "playing";
  private transformOp: UnaryOp | null = null;
  private message: string | null = null;
  /** GDD §5.1: persists across restarts within a level. */
  private failures = 0;
  private warning: WarningView | null = null;
  private shopOpen = false;
  /** GDD §7.5: 1-4's free rewind is granted once, and is not a failure. */
  private scriptedRewindUsed = false;
  /**
   * The warned move, held so the override can replay it. Only ever set on an
   * overridable warning — a blocking one rewinds immediately and there is
   * nothing to hold.
   */
  private pendingFatal: PendingFatal | null = null;
  /** Set only while replaying an overridden move, to skip the check. */
  private overriding = false;
  /** Answers winnability, off the render thread where a worker exists. */
  private readonly winnability: WinnabilityService;
  /**
   * One entry per committed move, taken BEFORE the move is applied (§9.4).
   *
   * This is what makes Continue possible: the branch point is the last state a
   * win was still reachable from, and finding it means being able to look at
   * the states the player passed through. Restart (§4.3) does not need this —
   * it rewinds to the start, which is reconstructible — which is why no
   * history existed until Continue asked for one.
   */
  private history: Snapshot[] = [];
  /** GDD §9.4: at most two per attempt, so a level cannot be bought outright. */
  private continuesUsed = 0;

  constructor(
    level: LadderLevel,
    mode: Mode,
    economy: Economy | null = null,
    private readonly telemetry: Telemetry | null = null,
    winnability: WinnabilityService = new WinnabilityService(),
  ) {
    this.level = level;
    this.mode = mode;
    this.economy = economy;
    this.winnability = winnability;
    this.winnability.reset(level.id);
    // GDD §5.1: the counter belongs to the level, not to the session. Seeded
    // from the save here so a relaunch starts with the failures already banked
    // — an in-memory zero is exactly the force-quit exploit §13 warns about.
    this.failures = economy?.progressFor(level.id).failCount ?? 0;
    this.reset();
    this.warmWarning();
    this.startTelemetry();
  }

  private startTelemetry(): void {
    this.telemetry?.levelStart(this.level.id, this.failures + 1, this.mode);
    // The board is on screen as soon as the first render lands, which is the
    // same turn as construction — so the first_tap stopwatch starts here.
    this.telemetry?.boardRendered();
  }

  /**
   * Pre-evaluate every move available at the CURRENT target, so the warning is
   * a memo lookup when the player commits.
   *
   * Warming the start state alone is not enough: proving a move fatal means
   * walking its whole subtree to show no win exists, and those subtrees are
   * exactly the ones a winning-line warm-up never touches. Measured cold at up
   * to 28ms on a T=7 N=16 board, and still 14ms with only the start warmed —
   * both above a 60fps frame, and worse on the low-end Android §13 names.
   *
   * Called at load and after each commit, so the cost lands in the pause that
   * already exists between moves rather than inside one. A worker thread is the
   * proper answer and belongs with the Phase 5 animation work; this keeps the
   * cost off the commit path in the meantime.
   */
  private warmWarning(): void {
    if (!this.warningActive) return;
    const target = this.frontTarget;
    if (target === undefined) return;

    const budget = this.level.modes[this.mode]?.budget ?? {};
    const level = this.asSolverLevel();
    const state: State = {
      tiles: this.live,
      targetIndex: this.targetIndex,
      budget: this.budget,
    };

    const states = enumerate(this.live, target, this.budget, this.level.rules).map((option) =>
      applyMove(state, { ...option, kind: "binary", targetIndex: this.targetIndex }),
    );
    this.winnability.warm(level, budget, states);
  }

  /** Restart to level start (GDD §4.3). Rewind is to the start, never to the fatal move. */
  private reset(): void {
    /*
     * A restart is not always visible in the board state.
     *
     * Restarting mid-level, before anything has been consumed, produces a state
     * that differs from the previous one only by the equation row emptying —
     * which is exactly what returning a tile looks like. The Renderer diffs
     * states to decide what to animate and what to sound, so it would treat a
     * rewind as a return: tiles flying home, and a knock the player never
     * earned. This counter is the one unambiguous tell.
     */
    this.run++;
    this.tiles = this.level.pool.map((value, id) => ({ id, value, transformed: false }));
    this.consumed = new Set();
    this.targetIndex = 0;
    this.budget = { ...(this.level.modes[this.mode]?.budget ?? {}) };
    this.history = [];
    this.slots = { leftTileId: null, op: null, rightTileId: null };
    this.swapArmed = null;
    this.phase = "playing";
    this.transformOp = null;
    this.message = null;
    this.warning = null;
  }

  /**
   * Is the fatal-move warning active right now?
   *
   * GDD §6 (amended): Casual and Normal warn, Expert does not. The mode axis is
   * ASSISTANCE, not budget — Normal and Expert now solve for the same exact
   * budget (§8.5) and the warning is the whole difference between them, so
   * gating it on Casual alone would leave the two modes identical.
   *
   * Two per-level rules outrank the mode, in opposite directions:
   *
   *   §7.5  1-4 is the scripted trap and warns REGARDLESS of mode.
   *   §7.4  1-6 repeats the shape with the warning OFF, in EVERY mode.
   *
   * And one schedule rule outranks both the mode and Casual: §7.6 introduces
   * the warning AT 1-4. Before then the device does not exist, so it cannot
   * appear. That gate lived in `unlocksFor` and this getter never consulted it
   * — invisible while only Casual warned and a new player is in Normal, and an
   * FTUE break the moment Normal does.
   */
  private get warningActive(): boolean {
    if (this.level.id === TRAP_TEST_LEVEL) return false;
    if (this.level.id === SCRIPTED_TRAP_LEVEL) return true;
    const unlocked = this.economy ? unlocksFor(this.economy.state).fatalWarning : ALL_UNLOCKED.fatalWarning;
    /*
     * CASUAL ONLY (§6, amended). Normal lost the warning when §8.5 made budgets
     * exact: solution paths fell to 1 per level, so "fatal move" quietly became
     * "any move that is not the answer" and a free warning became an answer
     * key — 106 fatal first moves across the ladder, tripping on 28 of 40
     * levels before the player had acted. §5.4 forbids free assistance that
     * exceeds paid, and branch elimination sells at 3 stars.
     *
     * Casual keeps it because unlimited operators admit multiple winning lines,
     * so there it names a genuine dead end rather than the answer.
     */
    return unlocked && this.mode === "casual";
  }

  /**
   * Does the warning BLOCK the move, or merely warn about it? (GDD §6.)
   *
   * Casual blocks — the move cannot be committed, and the equation rewinds
   * free. Normal warns and offers the override, and taking it loses the level
   * normally. 1-4 blocks in every mode: §7.5 is a teaching beat, not an assist,
   * and its whole shape is that the move is taken back for free.
   *
   * Getting this wrong in the other direction is what the amendment fixed:
   * blocking in Normal left the mode with no reachable failure at all, so no
   * life could be lost, no star penalty applied and §9.4's continue path never
   * opened — in the mode every player is in until the selector unlocks at 3-10.
   */
  private get warningBlocks(): boolean {
    return this.level.id === SCRIPTED_TRAP_LEVEL || this.mode === "casual";
  }

  private get scriptedTrapLevel(): boolean {
    return this.level.id === SCRIPTED_TRAP_LEVEL;
  }

  private asSolverLevel(): Level {
    const budget = this.level.modes[this.mode]?.budget ?? {};
    return {
      id: this.level.id,
      pool: this.level.pool,
      targets: this.level.targets,
      operators: { casual: budget, normal: budget, expert: budget },
      rules: this.level.rules,
    };
  }

  /**
   * The first render for a freshly constructed Director.
   *
   * Separate from `loadLevel` because the constructor already opened the level
   * and emitted `level_start`; calling loadLevel again to get a render emitted
   * it twice and would have double-counted every attempt in the funnel.
   */
  firstRender(): Command[] {
    return this.render();
  }

  loadLevel(level: LadderLevel): Command[] {
    this.level = level;
    // GDD §5.1: the counter belongs to the level and persists across restarts
    // AND app kills, so it is read from the save rather than zeroed here.
    this.failures = this.economy?.progressFor(level.id).failCount ?? 0;
    this.lastFailureExempt = false;
    this.winnability.reset(level.id);
    this.scriptedRewindUsed = false;
    this.reset();
    this.warmWarning();
    return this.render();
  }

  /** GDD §5.1: a replay of a CLEARED level may re-earn a better rating. */
  replay(): Command[] {
    this.economy?.beginReplay(this.level.id);
    this.failures = this.economy?.progressFor(this.level.id).failCount ?? 0;
    this.lastFailureExempt = false;
    this.reset();
    return this.render();
  }

  /**
   * Buy a hint, or re-reveal one already owned.
   *
   * GDD §13: a hint bought and then failed must still be revealed after the
   * restart — never charge twice for the same information on the same level.
   * The economy owns that rule; this just asks.
   */
  private buyHint(type: HintType): Command[] {
    if (!this.economy) return this.reject("no shop here");
    const cost = HINT_COST[type];

    // Generate BEFORE charging. Branch elimination has nothing to say when no
    // move available right now is fatal, and taking stars for a hint that
    // renders nothing is indefensible.
    const budget = this.level.modes[this.mode]?.budget ?? {};
    const ctx = hintContext(this.asSolverLevel(), this.live, this.targetIndex, budget);
    const owned = this.economy.hintsPurchased(this.level.id).includes(type);
    if (!owned && generateHint(type, ctx) === null) {
      return this.reject(`${HINT_LABEL[type]} has nothing to reveal on this board`);
    }

    if (!this.economy.purchaseHint(this.level.id, type, cost)) {
      return this.reject(`${HINT_LABEL[type]} costs ${cost}★ — you have ${this.economy.starsAvailable}★`);
    }
    this.message = `${HINT_LABEL[type]} revealed`;
    if (!owned) {
      this.telemetry?.record({
        name: "hint_purchased",
        level_id: this.level.id,
        hint_type: type,
        stars_spent: cost,
      });
    }
    return this.render();
  }

  /** Hints owned on this level, re-derived from the current board. */
  private hintViews(): HintView[] {
    if (!this.economy) return [];
    const owned = this.economy.hintsPurchased(this.level.id);
    if (owned.length === 0) return [];

    const budget = this.level.modes[this.mode]?.budget ?? {};
    const ctx = hintContext(this.asSolverLevel(), this.live, this.targetIndex, budget);

    const views: HintView[] = [];
    for (const type of owned) {
      const hint = generateHint(type as HintType, ctx);
      if (!hint) continue;
      views.push({
        type: hint.type,
        text: hint.text,
        tileIds: hint.tileIds,
        targetIndex: hint.targetIndex,
        forbidden: hint.forbiddenMove
          ? { leftId: hint.forbiddenMove.leftId, rightId: hint.forbiddenMove.rightId }
          : null,
      });
    }
    return views;
  }

  private shopEntries(): ShopEntry[] {
    if (!this.economy) return [];
    const owned = this.economy.hintsPurchased(this.level.id);
    const available = this.economy.starsAvailable;
    return (["narrow", "contested", "branch"] as HintType[]).map((type) => ({
      type,
      label: HINT_LABEL[type],
      cost: HINT_COST[type],
      owned: owned.includes(type),
      affordable: available >= HINT_COST[type],
    }));
  }

  private economyView(): EconomyView | null {
    if (!this.economy) return null;
    const progress = this.economy.progressFor(this.level.id);
    return {
      lives: this.economy.lives,
      maxLives: this.economy.config.maxLives,
      livesActive: livesActiveFor(this.level.id, this.economy.config),
      bestStars: progress.bestStars,
      cleared: progress.cleared,
      starsIfCleared: this.economy.starsForAttempt(this.level.id),
      totalStars: this.economy.state.totalStars,
      firstFailureExempt: this.lastFailureExempt,
      lockedOut: !this.economy.canPlay(this.level.id),
      starsAvailable: this.economy.starsAvailable,
      msUntilNextLife: this.economy.msUntilNextLife(),
    };
  }

  /**
   * The state a Continue can hand back (§9.4).
   *
   * Deliberately a plain copy rather than a structural-sharing trick: a level
   * has at most a handful of committed moves, so the cost is nothing and the
   * restore cannot alias anything the live board still holds.
   */
  /**
   * What §9.4 offers once the rejection has read.
   *
   * `canContinue` is computed by actually LOOKING for a branch point rather
   * than assuming one exists. A level lost on its first move has no state to
   * hand back, and offering a paid rewind that lands where the player already
   * is would be the worst possible use of an ad.
   */
  private failureExit(): FailureExit {
    const continuesLeft = Math.max(0, MAX_CONTINUES - this.continuesUsed);
    /*
     * A life is only at stake where lives EXIST.
     *
     * `!lastFailureExempt` alone was wrong: §5.2's exemption is
     * `livesActive && !cleared && !firstFailureUsed`, so on a level where the
     * lives system is not active at all — World 1, and anything before 2-8
     * (§7.2, §7.6) — nothing is exempt because there is nothing to exempt, and
     * the panel would have told a World 1 player that starting over costs them
     * a life they do not have. The exemption being false has two very different
     * causes and only one of them means "this will cost you".
     */
    const livesActive =
      this.economy !== null && livesActiveFor(this.level.id, this.economy.config);
    return {
      canContinue: continuesLeft > 0 && this.branchPoint() !== null,
      continuesLeft,
      restartCostsLife: livesActive && !this.lastFailureExempt,
      canCleanRetry: this.economy !== null && this.level.id >= this.economy.config.cleanRetryUnlockLevelId && this.economy.canStartCleanRetry(this.level.id),
    };
  }

  /**
   * GDD §9.4: rewind to the branch point, paid for by a rewarded view.
   *
   * The shell has already confirmed the reward landed. This does not touch the
   * failure count — §5.1 says failures still cost stars, so a continue buys a
   * position, never a clean sheet, and a level cannot be bought to three stars.
   */
  private cleanRetryFromAd(): Command[] {
    if (this.phase !== "failed" || !this.economy?.beginCleanRetry(this.level.id)) {
      return this.reject("no clean retry available");
    }
    this.lastFailureExempt = false;
    this.reset();
    this.telemetry?.record({ name: "clean_retry_started", level_id: this.level.id, attempt_number: this.failures + 1 });
    this.startTelemetry();
    return this.render();
  }

  private continueFromBranch(): Command[] {
    if (this.phase !== "failed") return this.reject("nothing to continue from");
    if (this.continuesUsed >= MAX_CONTINUES) return this.reject("no continues left");
    const at = this.branchPoint();
    if (at === null) return this.reject("no winnable state to return to");

    this.continuesUsed++;
    // Drop the history after the branch point: those moves did not happen any
    // more, and leaving them would let a second continue rewind into a future
    // the player is no longer in.
    const index = this.history.indexOf(at);
    if (index >= 0) this.history = this.history.slice(0, index);
    this.restore(at);
    this.run++;
    this.message = "rewound to where the level was still winnable";
    this.telemetry?.record({
      name: "continue_used",
      level_id: this.level.id,
      target_index: this.targetIndex,
      attempt_number: this.failures,
    });
    return this.render();
  }

  private snapshot(): Snapshot {
    return {
      consumed: new Set(this.consumed),
      targetIndex: this.targetIndex,
      budget: { ...this.budget },
    };
  }

  private restore(snapshot: Snapshot): void {
    this.consumed = new Set(snapshot.consumed);
    this.targetIndex = snapshot.targetIndex;
    this.budget = { ...snapshot.budget };
    this.slots = { leftTileId: null, op: null, rightTileId: null };
    this.swapArmed = null;
    this.transformOp = null;
    this.phase = "playing";
  }

  /**
   * The BRANCH POINT: the latest recorded state a win was still reachable from.
   *
   * Walks backwards, because the doomed move is usually the last one and
   * walking forwards would pay for every winnable state before reaching it.
   * Returns null when no recorded state was winnable, which happens on a level
   * that was lost on its very first move — there Continue has nothing better to
   * offer than Restart, and says so rather than pretending.
   */
  private branchPoint(): Snapshot | null {
    const level = this.asSolverLevel();
    for (let i = this.history.length - 1; i >= 0; i--) {
      const at = this.history[i]!;
      const tiles = this.tiles.filter((t) => !at.consumed.has(t.id));
      if (this.level.targets[at.targetIndex] === undefined) continue;
      const state = { tiles, targetIndex: at.targetIndex, budget: at.budget };
      if (this.winnability.isWinnable(level, at.budget, state)) return at;
    }
    return null;
  }

  private get live(): Tile[] {
    return this.tiles.filter((t) => !this.consumed.has(t.id));
  }

  /** Tiles not consumed and not currently sitting in a slot. */
  private get available(): Tile[] {
    return this.live.filter(
      (t) => t.id !== this.slots.leftTileId && t.id !== this.slots.rightTileId,
    );
  }

  private tile(id: number): Tile | undefined {
    return this.tiles.find((t) => t.id === id);
  }

  private get frontTarget(): number | undefined {
    return this.level.targets[this.targetIndex];
  }

  private affordance(): Affordance {
    if (this.transformOp !== null) return "transform";
    if (this.slots.leftTileId === null) return "numbers";
    if (this.slots.op === null) return "operators";
    if (this.slots.rightTileId === null) return "numbers";
    return "commit";
  }

  /** GDD §3.3: only offer a unary op on tiles it can legally act on. */
  /**
   * Which tiles may be tapped right now, or null where the rule does not apply.
   *
   * NULL IS NOT AN EMPTY LIST. Every level except 1-01 returns null, meaning
   * "no constraint" — an empty array would read as "nothing is tappable" and
   * freeze the board. The renderer branches on null for exactly that reason.
   *
   * It follows the move through: before a left tile is chosen, any tile that
   * appears in some legal decomposition of the front target; once a left tile
   * and an operator are down, only the tiles that complete it. Guiding only the
   * first tap would leave the player stuck on the second with no signal.
   */
  private constrainedTileIds(): number[] | null {
    if (this.level.id !== CONSTRAINT_LEVEL) return null;
    if (this.phase !== "playing" || this.transformOp !== null) return null;
    const target = this.frontTarget;
    if (target === undefined) return null;

    const left = this.slots.leftTileId === null ? null : this.tile(this.slots.leftTileId);
    const op = this.slots.op;

    // Second tap: the left operand and the operator are fixed, so a tile is
    // legal exactly when it completes the arithmetic.
    if (left && op) {
      return this.available
        .filter((t) => applyBinary(op, left.value, t.value, this.level.rules) === target)
        .map((t) => t.id);
    }

    /*
     * First tap: every tile that appears as either operand of some legal
     * decomposition. Matched by VALUE rather than by the representative ids the
     * solver returns — interchangeable same-value tiles collapse to one
     * decomposition, and dimming the duplicate would be arbitrary.
     */
    const legal = enumerate(this.available, target, this.budget, this.level.rules);
    const values = new Set<number>();
    for (const option of legal) {
      values.add(option.left);
      values.add(option.right);
    }
    return this.available.filter((t) => values.has(t.value)).map((t) => t.id);
  }

  private transformableIds(): number[] {
    if (this.transformOp === null) return [];
    return enumerateTransforms(this.available, this.budget, this.level.rules)
      .filter((t) => t.op === this.transformOp)
      .map((t) => t.tileId);
  }

  private state(): ViewState {
    return {
      levelId: this.level.id,
      run: this.run,
      mode: this.mode,
      targets: this.level.targets,
      targetIndex: this.targetIndex,
      tiles: this.tiles.map<TileView>((t) => ({
        id: t.id,
        value: t.value,
        transformed: t.transformed,
        consumed: this.consumed.has(t.id),
      })),
      slots: this.slots,
      swapArmedSlot: this.swapArmed,
      budget: this.budget,
      phase: this.phase,
      exit: this.phase === "failed" ? this.failureExit() : null,
      transformOp: this.transformOp,
      transformableTileIds: this.transformableIds(),
      constrainedTileIds: this.constrainedTileIds(),
      affordance: this.affordance(),
      message: this.message,
      failures: this.failures,
      economy: this.economyView(),
      unlocks: this.economy ? unlocksFor(this.economy.state) : ALL_UNLOCKED,
      warning: this.warning,
      hints: this.hintViews(),
      shop: this.shopEntries(),
      shopOpen: this.shopOpen,
      teachingLine: this.teachingLine(),
      teachingPulse: ftueCue(this.level.id, this.targetIndex, this.slots.leftTileId, this.slots.op)?.pulse ?? null,
      hintAd: this.hintAd(),
    };
  }

  private hintAd(): HintAdView | null {
    if (!this.economy || this.phase !== "playing" || this.level.id < this.economy.config.hintAdUnlockLevelId) return null;
    const target = this.frontTarget;
    if (target === undefined) return null;
    const tiles = this.live;
    const option = enumerate(tiles, target, this.budget, this.level.rules)[0];
    if (!option) return null;
    return { piece: option.left, text: "Use " + option.left + " at this stage.", reward: "bounded-piece" };
  }

  preLevelHint(): string | null {
    return this.hintAd()?.text ?? null;
  }

  private teachingLine(): string | null {
    if (this.phase !== "playing" || this.economy?.progressFor(this.level.id).cleared === true) return null;
    return ftueCue(this.level.id, this.targetIndex, this.slots.leftTileId, this.slots.op)?.line ?? null;
  }

  private render(): Command[] {
    return [{ type: "render", state: this.state() }];
  }

  private reject(reason: string): Command[] {
    return [{ type: "reject", reason }, ...this.render()];
  }

  handle(input: InputEvent): Command[] {
    if (input.type === "tick") {
      // Regeneration is time-based, so poll for the hard-lock exit too — being
      // out of lives must never be a state with no way forward (GDD §13).
      if (this.economy && !this.economy.canPlay(this.level.id)) {
        this.economy.grantHardLockLife();
      }
      return this.render();
    }
    if (input.type === "continueFromBranch") return this.continueFromBranch();
    if (input.type === "cleanRetryFromAd") return this.cleanRetryFromAd();
    if (input.type === "dismissWarning") {
      // §7.5 step 5: the move is rewound for free — no star, no life, no
      // failure recorded. Nothing was ever consumed, so there is nothing to
      // undo beyond clearing the notice.
      //
      // On an overridable warning the equation was left standing so the
      // override could replay it, so "go back" has to take it down here.
      if (this.warning?.overridable || this.warning?.scripted) {
        this.slots = { leftTileId: null, op: null, rightTileId: null };
        this.swapArmed = null;
      }
      this.warning = null;
      this.pendingFatal = null;
      return this.render();
    }
    if (input.type === "commitAnyway") {
      /*
       * GDD §6: Normal warns and ALLOWS THE OVERRIDE. Committing anyway fails
       * normally — life, stars, the §9.4 modal, all of it — so this deliberately
       * re-enters the ordinary move path rather than forcing a phase. The only
       * difference is that `overriding` suppresses the check that would
       * otherwise warn about the same move again, immediately.
       */
      const pending = this.pendingFatal;
      if (!this.warning?.overridable || pending === null) {
        return this.reject("nothing to commit anyway");
      }
      this.warning = null;
      this.pendingFatal = null;
      this.overriding = true;
      try {
        if (pending.kind === "unary") {
          const tile = this.tile(pending.tileId);
          if (!tile) return this.reject("nothing to commit anyway");
          return this.applyTransform(tile, pending.op);
        }
        return this.commit();
      } finally {
        this.overriding = false;
      }
    }
    if (input.type === "selectMode") {
      this.economy?.selectMode(input.mode);
      return this.render();
    }
    if (input.type === "toggleShop") {
      this.shopOpen = !this.shopOpen;
      return this.render();
    }
    if (input.type === "buyHint") {
      return this.buyHint(input.hint as HintType);
    }
    if (input.type === "tapRestart") {
      // A cleared level replays fresh (§5.1); anything else keeps its counter.
      if (this.phase === "won" && this.economy?.progressFor(this.level.id).cleared) {
        return this.replay();
      }
      this.reset();
      this.startTelemetry();
      return this.render();
    }
    if (this.phase !== "playing") return this.render();

    // §7.8: ms from board render to first tap, the planning-vs-guessing proxy.
    // Only board interactions count; opening the shop is not a move.
    if (
      input.type === "tapTile" ||
      input.type === "tapOperator" ||
      input.type === "tapUnary" ||
      input.type === "tapSlot"
    ) {
      this.telemetry?.firstTap();
    }

    switch (input.type) {
      case "tapTile":
        return this.tapTile(input.id);
      case "tapOperator":
        return this.tapOperator(input.op);
      case "tapUnary":
        return this.tapUnary(input.op);
      case "tapSlot":
        return this.tapSlot(input.index);
      case "tapCommit":
        return this.commit();
      case "loadLevel":
        return this.render();
      // Which screen is showing is not a rule about the game (§11): the shell
      // owns it, and the Director has nothing to say.
      case "tapMap":
      case "exportTelemetry":
      case "tapWatchAd":
      case "tapCleanRetryAd":
      case "tapLevelIntroStart":
      case "tapLevelIntroHintAd":
      // The shell shows the ad; it sends continueFromBranch only once the
      // reward has actually landed, so this side has nothing to do here.
      case "tapContinue":
      case "tapNextLevel":
        return [];
    }
  }

  private tapTile(id: number): Command[] {
    this.swapArmed = null;
    const tile = this.tile(id);
    if (!tile || this.consumed.has(id)) return this.reject("that tile is gone");

    // Transform mode consumes the tap instead of filling a slot (GDD §3.5).
    if (this.transformOp !== null) {
      if (!this.transformableIds().includes(id)) {
        return this.reject(`${this.transformOp} cannot act on ${tile.value}`);
      }
      return this.applyTransform(tile, this.transformOp);
    }

    /*
     * §7.7's constraint, enforced HERE and not only in the renderer.
     *
     * The Director owns the rules; a view that draws a tile dim while the
     * Director would still accept it is two answers to one question. Returning
     * a tile already in a slot stays legal below — that is a rewind, not a new
     * operand.
     */
    const constrained = this.constrainedTileIds();
    const inSlot = this.slots.leftTileId === id || this.slots.rightTileId === id;
    if (constrained !== null && !inSlot && !constrained.includes(id)) {
      return this.reject(`${tile.value} cannot make ${this.frontTarget ?? 0}`);
    }

    if (this.slots.leftTileId === id || this.slots.rightTileId === id) {
      return this.reject("that tile is already in the equation");
    }

    if (this.slots.leftTileId === null) {
      this.slots = { ...this.slots, leftTileId: id };
      this.message = null;
      return this.render();
    }
    if (this.slots.op === null) return this.reject("pick an operator next");
    if (this.slots.rightTileId === null) {
      this.slots = { ...this.slots, rightTileId: id };
      this.message = null;
      return this.render();
    }
    return this.reject("the equation is full — press = or tap a slot to clear it");
  }

  private tapOperator(op: BinaryOp): Command[] {
    this.swapArmed = null;
    if (this.transformOp !== null) return this.reject("finish or cancel the transform first");
    if (this.slots.leftTileId === null) return this.reject("pick a number first");
    if (this.slots.op !== null) return this.reject("operator already chosen");
    if (!hasBudget(this.budget, op)) return this.reject(`no ${op} left`);
    this.slots = { ...this.slots, op };
    this.message = null;
    return this.render();
  }

  /** §3.5: tapping the unary op toggles TRANSFORM MODE; tapping again cancels. */
  private tapUnary(op: UnaryOp): Command[] {
    this.swapArmed = null;
    if (this.transformOp === op) {
      this.transformOp = null;
      this.message = null;
      return this.render();
    }
    if (!hasBudget(this.budget, op)) return this.reject(`no ${op} left`);
    if (this.slots.leftTileId !== null) return this.reject("clear the equation first");
    this.transformOp = op;
    this.message = null;
    const ids = this.transformableIds();
    if (ids.length === 0) {
      this.transformOp = null;
      return this.reject(`nothing in the pool can take ${op}`);
    }
    return this.render();
  }

  /**
   * GDD §3.3/§3.5: the tile is rewritten in place, keeps its id, and can never
   * be transformed again. The transform counts as a move for failure detection.
   */
  private applyTransform(tile: Tile, op: UnaryOp): Command[] {
    const to = op === "sqrt" ? exactSqrt(tile.value) : tile.value * tile.value;
    if (to === null) return this.reject(`${op} cannot act on ${tile.value}`);

    // A transform is a move (§3.5) and can strip the pool of what a later
    // target needed, so Casual must warn on it too — otherwise the mode
    // promises to catch level-killing moves and misses a whole class of them.
    const blockedTransform = this.checkFatalTransform(tile, op, to);
    if (blockedTransform) return blockedTransform;

    this.tiles = this.tiles.map((t) =>
      t.id === tile.id ? { id: t.id, value: to, transformed: true } : t,
    );
    this.budget = spend(this.budget, op);
    this.transformOp = null;
    this.message = `${op} ${tile.value} → ${to}`;
    this.telemetry?.record({
      name: "unary_transform",
      level_id: this.level.id,
      from: tile.value,
      to,
    });
    return this.checkStuck();
  }

  private tapSlot(index: 0 | 1 | 2): Command[] {
    /*
     * GDD §3.5: tapping a filled slot returns the piece and rewinds — plus the
     * swap gesture when both operands are filled. Tap left then right (or the
     * reverse) exchanges the tile ids; the operator stays. Correcting order
     * must not cost emptying the row and re-entering both operands.
     *
     * Arming is one tap; completing the swap is the second. Tapping the armed
     * slot again keeps the Wordle rewind. Emptying a slot still does not
     * reshuffle the others.
     */
    const bothFilled =
      this.slots.leftTileId !== null && this.slots.rightTileId !== null;

    if (bothFilled && (index === 0 || index === 2)) {
      if (this.swapArmed !== null && this.swapArmed !== index) {
        this.slots = {
          leftTileId: this.slots.rightTileId,
          op: this.slots.op,
          rightTileId: this.slots.leftTileId,
        };
        this.swapArmed = null;
        this.message = null;
        return this.render();
      }
      if (this.swapArmed === null) {
        this.swapArmed = index;
        this.message = null;
        return this.render();
      }
      // Armed slot tapped again → fall through to rewind.
    }

    this.swapArmed = null;
    if (index === 0) {
      this.slots = { leftTileId: null, op: null, rightTileId: null };
    } else if (index === 1) {
      this.slots = { ...this.slots, op: null, rightTileId: null };
    } else {
      this.slots = { ...this.slots, rightTileId: null };
    }
    this.message = null;
    return this.render();
  }

  private commit(): Command[] {
    const { leftTileId, op, rightTileId } = this.slots;
    if (leftTileId === null || op === null || rightTileId === null) {
      return this.reject("fill all three slots first");
    }
    const left = this.tile(leftTileId);
    const right = this.tile(rightTileId);
    const target = this.frontTarget;
    if (!left || !right || target === undefined) return this.reject("nothing to commit");

    /*
     * A refused commit LEAVES THE EQUATION STANDING (GDD §9.5).
     *
     * It used to empty all three slots, which meant a wrong guess cost three
     * taps to re-enter and punished the exploration this game is supposed to
     * reward — wrong arithmetic is explicitly not a failure state (§2 step 4),
     * so it should not carry a failure's price. Leaving it up also lets the
     * player fix only the part that was wrong, usually the operator.
     *
     * The feel follows from it: §9.5 asks the row to RESIST — a shudder with
     * the tiles staying put — and there is nothing to leave standing if the
     * Director has already swept it away.
     */
    const result = applyBinary(op, left.value, right.value, this.level.rules);
    if (result === null) {
      // Wrong arithmetic is not a failure state (GDD §2 step 4).
      return this.reject(`${left.value} ${op} ${right.value} is not allowed here`);
    }
    if (result !== target) {
      this.telemetry?.record({
        name: "move_commit",
        level_id: this.level.id,
        expression: `${left.value} ${op} ${right.value}`,
        correct: false,
        target_index: this.targetIndex,
      });
      return this.reject(`${left.value} ${op} ${right.value} = ${result}, not ${target}`);
    }

    // The move is legal and correct. Before it becomes irreversible, Casual
    // (and 1-4 in any mode) checks whether it dooms the level.
    const blocked = this.checkFatalMove(left, right, op);
    if (blocked) return blocked;

    this.telemetry?.record({
      name: "move_commit",
      level_id: this.level.id,
      expression: `${left.value} ${op} ${right.value}`,
      correct: true,
      target_index: this.targetIndex,
    });

    // The state as it was BEFORE this move, for §9.4's branch point. Pushed
    // here rather than after, because the branch point is the state a player
    // would want to be handed back — the one where the choice was still open.
    this.history.push(this.snapshot());

    // Consumed BY ID, never by value (GDD §3.5).
    this.consumed.add(left.id);
    this.consumed.add(right.id);
    this.budget = spend(this.budget, op);
    this.targetIndex++;
    this.slots = { leftTileId: null, op: null, rightTileId: null };
    this.swapArmed = null;
    this.message = `${left.value} ${op} ${right.value} = ${result}`;

    if (this.targetIndex >= this.level.targets.length) {
      this.phase = "won";
      const award = this.economy?.recordClear(this.level.id);
      this.telemetry?.levelComplete(this.level.id, award?.stars ?? 0, this.failures + 1);
      this.message = award ? `cleared — ${award.stars} star${award.stars === 1 ? "" : "s"}` : "cleared";
      return this.render();
    }
    const commands = this.checkStuck();
    // Warm the new front target while the player reads the board.
    if (this.phase === "playing") this.warmWarning();
    return commands;
  }

  /**
   * The fatal-move warning (GDD §6 Casual, §7.5 the scripted trap).
   *
   * Uses `isWinnable` — the cheap memoised boolean the solver already exposes.
   * No path collection, no dead-branch enumeration: this runs on every commit
   * and must stay off the critical path (§13 Severity 3).
   *
   * Returns commands when the move is refused, or null to let it through.
   */
  private checkFatalMove(left: Tile, right: Tile, op: BinaryOp): Command[] | null {
    if (this.overriding || !this.warningActive || this.alreadyLost) return null;

    const state: State = {
      tiles: this.live,
      targetIndex: this.targetIndex,
      budget: this.budget,
    };
    const next = applyMove(state, {
      kind: "binary",
      left: left.value,
      right: right.value,
      op,
      result: this.frontTarget!,
      leftId: left.id,
      rightId: right.id,
      targetIndex: this.targetIndex,
    });

    const budget = this.level.modes[this.mode]?.budget ?? {};
    if (this.winnability.isWinnable(this.asSolverLevel(), budget, next)) return null;

    /*
     * Blocking: nothing is consumed and nothing is recorded — the equation
     * rewinds, free (§7.5 step 5).
     *
     * Warning: the scripted teaching frame stays in the renderer's hold, but
     * the settled warning state itself is already rewound so its underlay is clean.
     */
    const blocks = this.warningBlocks;
    if (blocks) {
      // A blocked move is rewound before the warning is shown. The scripted
      // teaching beat keeps the PRE-REWIND state in the renderer's hold, but
      // the settled Go Back panel must sit over a clean equation row.
      this.slots = { leftTileId: null, op: null, rightTileId: null };
      this.swapArmed = null;
      this.pendingFatal = null;
    } else {
      this.pendingFatal = { kind: "binary", leftId: left.id, rightId: right.id, op };
    }
    this.warning = this.warningView(`${left.value} ${op} ${right.value}`, !blocks);
    if (this.scriptedTrapLevel) this.scriptedRewindUsed = true;
    this.message = null;
    return this.render();
  }

  /**
   * Build the warning, and decide WHAT IT IS ALLOWED TO SAY (GDD §5.4).
   *
   * Free assistance must never exceed paid. The routine warning used to name
   * the starved target — "Wait, what makes the 15?" — and ship the tile ids
   * that make it, which the renderer pulsed. That is strictly more than the
   * ★1 Narrow hint sells: Narrow says only that one of the last two or three
   * targets has a single solution, and names no tiles at all. Nobody buys a
   * hint the interruption already gave away.
   *
   * So the routine warning says a move is fatal and nothing else. §7.5's
   * scripted trap at 1-04 is the exception — it names and pulses because it is
   * a teaching beat rather than an assist, and it fires once per level.
   *
   * The gate is HERE rather than in the renderer on purpose: what a mode is
   * allowed to disclose is a rule, and the Director owns the rules. Withholding
   * the ids at the source also means no future renderer can leak them back.
   */
  private warningView(move: string, overridable: boolean): WarningView {
    const scripted = this.scriptedTrapLevel && !this.scriptedRewindUsed;
    if (!scripted) {
      return {
        move,
        keystoneTarget: null,
        keystoneTargetIndex: null,
        keystoneTileIds: [],
        scripted: false,
        overridable,
        line: "Something later needs those.",
      };
    }
    const keystone = this.keystoneAhead();
    return {
      move,
      keystoneTarget: keystone?.target ?? null,
      keystoneTargetIndex: keystone?.index ?? null,
      keystoneTileIds: keystone?.tileIds ?? [],
      scripted: true,
      overridable,
      line: keystone ? `Wait — what makes the ${keystone.target}?` : "Something later needs those.",
    };
  }

  /**
   * IS THE LEVEL ALREADY LOST? (§6, amended: "a warning must never fire once
   * the level is already lost".)
   *
   * The warning asks `isWinnable` of the whole level AFTER the prospective
   * move. Once a fatal move has been taken the level is unwinnable, so that
   * question answers false for every subsequent move — including the only
   * legal one left. The player who overrode once was then warned again on a
   * forced, correct move, and again, until they reached the wall: the panel
   * that opened at the mistake kept reopening, which is what made a warning
   * read as a failure.
   *
   * Asking the same question of the CURRENT position separates the two. If the
   * board is already dead, no move can be blamed for killing it.
   */
  private get alreadyLost(): boolean {
    const budget = this.level.modes[this.mode]?.budget ?? {};
    return !this.winnability.isWinnable(this.asSolverLevel(), budget, {
      tiles: this.live,
      targetIndex: this.targetIndex,
      budget: this.budget,
    });
  }

  /** The transform equivalent of checkFatalMove. */
  private checkFatalTransform(tile: Tile, op: UnaryOp, to: number): Command[] | null {
    if (this.overriding || !this.warningActive || this.alreadyLost) return null;

    const state: State = {
      tiles: this.live,
      targetIndex: this.targetIndex,
      budget: this.budget,
    };
    const next = applyMove(state, {
      kind: "unary",
      op,
      from: tile.value,
      to,
      tileId: tile.id,
      targetIndex: this.targetIndex,
    });

    const budget = this.level.modes[this.mode]?.budget ?? {};
    if (this.winnability.isWinnable(this.asSolverLevel(), budget, next)) return null;

    const blocks = this.warningBlocks;
    this.transformOp = null;
    this.pendingFatal = blocks ? null : { kind: "unary", tileId: tile.id, op };
    this.warning = this.warningView(`${op} ${tile.value} → ${to}`, !blocks);
    if (this.scriptedTrapLevel) this.scriptedRewindUsed = true;
    return this.render();
  }

  /**
   * The keystone the player is about to starve, with the pool tiles that make
   * it — §7.5 steps 3 and 4, "the only two numbers that can make it pulse".
   */
  private keystoneAhead(): { target: number; index: number; tileIds: number[] } | null {
    const budget = this.level.modes[this.mode]?.budget ?? {};
    const metrics = analyse(this.asSolverLevel(), budget);
    const detail = metrics.keystoneDetail.find((k) => k.index > this.targetIndex);
    if (!detail) return null;

    const target = this.level.targets[detail.index];
    if (target === undefined) return null;

    // Mark one live tile per operand value, by id.
    const tileIds: number[] = [];
    const taken = new Set<number>();
    for (const value of detail.operands) {
      const tile = this.live.find((t) => t.value === value && !taken.has(t.id));
      if (tile) {
        tileIds.push(tile.id);
        taken.add(tile.id);
      }
    }
    return { target, index: detail.index, tileIds };
  }

  /**
   * GDD §4.1: failure fires when the FRONT target cannot be produced from the
   * numbers remaining — a concrete board condition the player can verify, not a
   * solver verdict about the whole level.
   *
   * A available transform keeps the board alive (§3.5): no legal equation but a
   * usable sqrt is not yet dead.
   */
  private checkStuck(): Command[] {
    const target = this.frontTarget;
    if (target === undefined) return this.render();

    const decompositions = enumerate(this.live, target, this.budget, this.level.rules);
    const transforms = enumerateTransforms(this.live, this.budget, this.level.rules);

    if (decompositions.length === 0 && transforms.length === 0) {
      this.phase = "failed";
      const outcome = this.economy?.recordFailure(this.level.id);
      // The economy owns the counter once attached, so it stays authoritative
      // across an app kill rather than being re-derived in memory.
      this.failures = outcome?.failCount ?? this.failures + 1;
      this.lastFailureExempt = outcome?.firstFailureExempt ?? false;
      this.message = `${target} cannot be made from what is left`;
      this.telemetry?.record({
        name: "level_fail",
        level_id: this.level.id,
        target_index_of_failure: this.targetIndex,
        attempt_number: this.failures,
      });
      if (outcome?.lifeSpent && outcome.livesRemaining === 0) {
        this.telemetry?.record({ name: "life_depleted", level_id: this.level.id });
      }
    }
    return this.render();
  }
}
