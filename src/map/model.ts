import type { Economy } from "../economy/economy.js";
import { furthestReached, unlocksFor } from "../economy/unlocks.js";

/**
 * What the world map shows (GDD §7.6).
 *
 * Pure, so the progression rules can be tested without a renderer. The map is
 * where best-ever stars, the banked total and the hint shop finally have a
 * home — until it existed those numbers were crowding the board, which is what
 * put three different star readings in the lane header.
 */
export type LevelState = "locked" | "open" | "cleared";
export type LockReason = "not-reached" | "not-enough-stars";

export interface MapLevel {
  readonly id: string;
  readonly world: number;
  readonly slot: number;
  readonly state: LevelState;
  /** 0-3. Best ever, not this attempt — the board shows the live one. */
  readonly stars: number;
  readonly lockReason: LockReason | null;
}

export interface MapView {
  readonly levels: readonly MapLevel[];
  readonly worlds: readonly number[];
  /** Spendable, not lifetime: the shop is the only thing that reads it. */
  readonly starsAvailable: number;
  readonly totalStars: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly muted: boolean;
  /** §7.6 — absent before unlock, never greyed out. */
  readonly showLives: boolean;
  readonly showShop: boolean;
  readonly showModes: boolean;
  readonly mode: string;
  /** Where the player is up to; the map opens looking at this. */
  readonly furthest: string;
  /**
   * Objects restored per world, 0-4 (ART_DIRECTION §6).
   *
   * Not yet purchasable — the veil is being proved before any object exists,
   * because if a quarter of the darkness retreating is not a visible change at
   * vignette size then the objects cannot rescue it.
   */
  readonly restored: Readonly<Record<number, 0 | 1 | 2 | 3 | 4>>;
  /** Cost of each room's next object, or null when finished or locked (§6). */
  readonly restoreCost: Readonly<Record<number, number | null>>;
  readonly worldGates: Readonly<Record<number, number>>;
}

export const WORLDS = [1, 2, 3, 4] as const;
export const SLOTS_PER_WORLD = 10;

export function levelId(world: number, slot: number): string {
  return `${world}-${String(slot).padStart(2, "0")}`;
}

/**
 * Which levels can be entered.
 *
 * Strictly linear: the next uncleared level after the furthest cleared one, and
 * everything before it. There is no star gate on progression — §8.1's fairness
 * contract means the ladder is the difficulty curve, and a star toll on top of
 * it would be a second, hidden one.
 */
export function mapView(economy: Economy, ids: readonly string[]): MapView {
  const save = economy.state;
  const unlocks = unlocksFor(save);

  const gates = economy.config.worldStarGates;
  const worldComplete = (world: number): boolean =>
    ids.filter((id) => Number(id.split("-")[0]) === world).every((id) => save.levels[id]?.cleared === true);
  let frontier = ids.length;
  for (let i = 0; i < ids.length; i++) {
    if (save.levels[ids[i]!]?.cleared !== true) { frontier = i; break; }
  }

  const levels = ids.map((id, index) => {
    const progress = save.levels[id];
    const [world, slot] = id.split("-").map(Number) as [number, number];
    const priorWorldComplete = world <= 1 || worldComplete(world - 1);
    const gate = gates[world] ?? 0;
    const enoughStars = save.totalStars >= gate;
    const clearedLevel = progress?.cleared === true;
    const lockReason: LockReason | null = clearedLevel || (priorWorldComplete && enoughStars && index <= frontier)
      ? null
      : !priorWorldComplete
        ? "not-reached"
        : !enoughStars
          ? "not-enough-stars"
          : "not-reached";
    return {
      id, world, slot,
      state: (clearedLevel ? "cleared" : lockReason === null ? "open" : "locked") as LevelState,
      stars: progress?.bestStars ?? 0,
      lockReason,
    };
  });

  return {
    levels,
    worlds: [...WORLDS],
    starsAvailable: economy.starsAvailable,
    totalStars: save.totalStars,
    restored: {
      1: economy.restoredIn(1) as 0 | 1 | 2 | 3 | 4,
      2: economy.restoredIn(2) as 0 | 1 | 2 | 3 | 4,
      3: economy.restoredIn(3) as 0 | 1 | 2 | 3 | 4,
      4: economy.restoredIn(4) as 0 | 1 | 2 | 3 | 4,
    },
    restoreCost: {
      1: economy.canRestore(1) ? economy.nextRestoreCost(1) : null,
      2: economy.canRestore(2) ? economy.nextRestoreCost(2) : null,
      3: economy.canRestore(3) ? economy.nextRestoreCost(3) : null,
      4: economy.canRestore(4) ? economy.nextRestoreCost(4) : null,
    },
    worldGates: gates,
    lives: economy.lives,
    maxLives: economy.maxLivesAllowed,
    muted: economy.muted,
    showLives: unlocks.lives,
    showShop: unlocks.hintShop,
    showModes: unlocks.modeSelector,
    mode: save.selectedMode,
    furthest: furthestReached(save) || ids[0]!,
  };
}
