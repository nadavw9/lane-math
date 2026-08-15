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
import { livesActiveFor, starsFor } from "../economy/config.js";
import type { Economy } from "../economy/economy.js";
import { ALL_UNLOCKED, unlocksFor } from "../economy/unlocks.js";
import type { Telemetry } from "../telemetry/telemetry.js";
import { HINT_COST, HINT_LABEL, generateHint, hintContext, type HintType } from "./hints.js";
import { WinnabilityService } from "./winnability-service.js";
import type {
  Affordance,
  Command,
  EconomyView,
  HintView,
  InputEvent,
  LadderLevel,
  Phase,
  ShopEntry,
  SlotsView,
  TileView,
  ViewState,
  WarningView,
} from "./types.js";

/** GDD §7.5. The one level whose warning is on regardless of mode. */
export const SCRIPTED_TRAP_LEVEL = "1-04";

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
  private budget: OperatorBudget = {};
  private slots: SlotsView = { leftTileId: null, op: null, rightTileId: null };
  private phase: Phase = "playing";
  private transformOp: UnaryOp | null = null;
  private message: string | null = null;
  /** GDD §5.1: persists across restarts within a level. */
  private failures = 0;
  private warning: WarningView | null = null;
  private shopOpen = false;
  /** GDD §7.5: 1-4's free rewind is granted once, and is not a failure. */
  private scriptedRewindUsed = false;
  /** Answers winnability, off the render thread where a worker exists. */
  private readonly winnability: WinnabilityService;

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
    this.tiles = this.level.pool.map((value, id) => ({ id, value, transformed: false }));
    this.consumed = new Set();
    this.targetIndex = 0;
    this.budget = { ...(this.level.modes[this.mode]?.budget ?? {}) };
    this.slots = { leftTileId: null, op: null, rightTileId: null };
    this.phase = "playing";
    this.transformOp = null;
    this.message = null;
    this.warning = null;
  }

  /**
   * Is the fatal-move warning active right now?
   *
   * GDD §6: Casual warns, Normal and Expert do not. GDD §7.5: level 1-4 is the
   * scripted trap and warns REGARDLESS of mode — it is the teaching device that
   * converts the central mechanic from a punishment into an insight. §7.4 is
   * equally explicit that 1-6 repeats the shape with the warning OFF, which is
   * where the lesson is tested, so 1-6 must never opt in.
   */
  private get warningActive(): boolean {
    if (this.level.id === SCRIPTED_TRAP_LEVEL) return true;
    return this.mode === "casual";
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
      starsIfCleared: starsFor(this.failures, this.economy.config),
      totalStars: this.economy.state.totalStars,
      firstFailureExempt: this.lastFailureExempt,
      lockedOut: !this.economy.canPlay(this.level.id),
      starsAvailable: this.economy.starsAvailable,
    };
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
  private transformableIds(): number[] {
    if (this.transformOp === null) return [];
    return enumerateTransforms(this.available, this.budget, this.level.rules)
      .filter((t) => t.op === this.transformOp)
      .map((t) => t.tileId);
  }

  private state(): ViewState {
    return {
      levelId: this.level.id,
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
      budget: this.budget,
      phase: this.phase,
      transformOp: this.transformOp,
      transformableTileIds: this.transformableIds(),
      affordance: this.affordance(),
      message: this.message,
      failures: this.failures,
      economy: this.economyView(),
      unlocks: this.economy ? unlocksFor(this.economy.state) : ALL_UNLOCKED,
      warning: this.warning,
      hints: this.hintViews(),
      shop: this.shopEntries(),
      shopOpen: this.shopOpen,
    };
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
    if (input.type === "dismissWarning") {
      // §7.5 step 5: the move is rewound for free — no star, no life, no
      // failure recorded. Nothing was ever consumed, so there is nothing to
      // undo beyond clearing the notice.
      this.warning = null;
      return this.render();
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
    }
  }

  private tapTile(id: number): Command[] {
    const tile = this.tile(id);
    if (!tile || this.consumed.has(id)) return this.reject("that tile is gone");

    // Transform mode consumes the tap instead of filling a slot (GDD §3.5).
    if (this.transformOp !== null) {
      if (!this.transformableIds().includes(id)) {
        return this.reject(`${this.transformOp} cannot act on ${tile.value}`);
      }
      return this.applyTransform(tile, this.transformOp);
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
    // Tapping a filled slot returns the piece and rewinds to that step.
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

    // Consumed BY ID, never by value (GDD §3.5).
    this.consumed.add(left.id);
    this.consumed.add(right.id);
    this.budget = spend(this.budget, op);
    this.targetIndex++;
    this.slots = { leftTileId: null, op: null, rightTileId: null };
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
    if (!this.warningActive) return null;

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

    // Refused. Nothing is consumed and nothing is recorded — the equation
    // simply rewinds, free (§7.5 step 5).
    const keystone = this.keystoneAhead();
    this.slots = { leftTileId: null, op: null, rightTileId: null };
    this.warning = {
      move: `${left.value} ${op} ${right.value}`,
      keystoneTarget: keystone?.target ?? null,
      keystoneTargetIndex: keystone?.index ?? null,
      keystoneTileIds: keystone?.tileIds ?? [],
      scripted: this.scriptedTrapLevel && !this.scriptedRewindUsed,
      line: keystone
        ? `Wait — what makes the ${keystone.target}?`
        : "That move loses the level.",
    };
    if (this.scriptedTrapLevel) this.scriptedRewindUsed = true;
    this.message = null;
    return this.render();
  }

  /** The transform equivalent of checkFatalMove. */
  private checkFatalTransform(tile: Tile, op: UnaryOp, to: number): Command[] | null {
    if (!this.warningActive) return null;

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

    const keystone = this.keystoneAhead();
    this.transformOp = null;
    this.warning = {
      move: `${op} ${tile.value} → ${to}`,
      keystoneTarget: keystone?.target ?? null,
      keystoneTargetIndex: keystone?.index ?? null,
      keystoneTileIds: keystone?.tileIds ?? [],
      scripted: this.scriptedTrapLevel && !this.scriptedRewindUsed,
      line: keystone ? `Wait — what makes the ${keystone.target}?` : "That move loses the level.",
    };
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
