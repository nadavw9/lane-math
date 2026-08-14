import {
  applyBinary,
  enumerate,
  enumerateTransforms,
  exactSqrt,
  hasBudget,
  spend,
  type BinaryOp,
  type Mode,
  type OperatorBudget,
  type Tile,
  type UnaryOp,
} from "../solver/index.js";
import { livesActiveFor, starsFor } from "../economy/config.js";
import type { Economy } from "../economy/economy.js";
import type {
  Affordance,
  Command,
  EconomyView,
  InputEvent,
  LadderLevel,
  Phase,
  SlotsView,
  TileView,
  ViewState,
} from "./types.js";

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

  constructor(level: LadderLevel, mode: Mode, economy: Economy | null = null) {
    this.level = level;
    this.mode = mode;
    this.economy = economy;
    // GDD §5.1: the counter belongs to the level, not to the session. Seeded
    // from the save here so a relaunch starts with the failures already banked
    // — an in-memory zero is exactly the force-quit exploit §13 warns about.
    this.failures = economy?.progressFor(level.id).failCount ?? 0;
    this.reset();
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
  }

  loadLevel(level: LadderLevel): Command[] {
    this.level = level;
    // GDD §5.1: the counter belongs to the level and persists across restarts
    // AND app kills, so it is read from the save rather than zeroed here.
    this.failures = this.economy?.progressFor(level.id).failCount ?? 0;
    this.lastFailureExempt = false;
    this.reset();
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
    if (input.type === "tapRestart") {
      // A cleared level replays fresh (§5.1); anything else keeps its counter.
      if (this.phase === "won" && this.economy?.progressFor(this.level.id).cleared) {
        return this.replay();
      }
      this.reset();
      return this.render();
    }
    if (this.phase !== "playing") return this.render();

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

    this.tiles = this.tiles.map((t) =>
      t.id === tile.id ? { id: t.id, value: to, transformed: true } : t,
    );
    this.budget = spend(this.budget, op);
    this.transformOp = null;
    this.message = `${op} ${tile.value} → ${to}`;
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

    const result = applyBinary(op, left.value, right.value, this.level.rules);
    if (result === null) {
      // Wrong arithmetic is not a failure state (GDD §2 step 4).
      this.slots = { leftTileId: null, op: null, rightTileId: null };
      return this.reject(`${left.value} ${op} ${right.value} is not allowed here`);
    }
    if (result !== target) {
      this.slots = { leftTileId: null, op: null, rightTileId: null };
      return this.reject(`${left.value} ${op} ${right.value} = ${result}, not ${target}`);
    }

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
      this.message = award ? `cleared — ${award.stars} star${award.stars === 1 ? "" : "s"}` : "cleared";
      return this.render();
    }
    return this.checkStuck();
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
    }
    return this.render();
  }
}
