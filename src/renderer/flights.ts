import { Tween } from "./tween.js";

/**
 * A token in transit between the pool and the equation row (§9.5).
 *
 * Placement and return are the two moves the player makes most, so they are the
 * two that most need weight. Both are drawn as one token travelling — the seat
 * it left and the seat it is heading for both stay empty until it lands.
 */
export interface Flight {
  readonly kind: "toSlot" | "toPool";
  readonly slotIndex: 0 | 1 | 2;
  /** null for the operator, which has no pool slot to return to. */
  readonly tileId: number | null;
  readonly label: string;
  readonly from: { x: number; y: number; w: number; h: number };
  readonly to: { x: number; y: number; w: number; h: number };
  readonly tween: Tween;
}

/**
 * The flights currently in the air, BOUNDED BY CONSTRUCTION.
 *
 * This was a plain array that grew by one per placement and was pruned only
 * when the ticker ran. That is fine while frames are being delivered and
 * catastrophic when they are not: measured with input arriving faster than
 * frames, it reached 1200 entries after 600 taps, each one drawing an extra
 * token every redraw, taking tap cost from 3ms to 36ms and the heap from 184MB
 * to 3.7GB. Frame delivery is not something this class should have to trust —
 * a background tab, a long GC or a slow device all break that assumption.
 *
 * Keying on the SLOT removes the assumption entirely. A slot holds one thing at
 * a time, so it can have at most one token travelling to or from it, and there
 * are three slots. The collection cannot exceed three however input arrives,
 * and a new flight for a seat replaces the stale one rather than stacking an
 * identical token on top of it.
 */
export class FlightTable {
  private readonly bySlot = new Map<number, Flight>();

  get size(): number {
    return this.bySlot.size;
  }

  /** Start a flight, superseding any still running for the same seat. */
  launch(flight: Flight): void {
    this.bySlot.set(flight.slotIndex, flight);
  }

  clear(): void {
    this.bySlot.clear();
  }

  active(): Flight[] {
    return [...this.bySlot.values()];
  }

  /** Is a token currently travelling INTO this slot? Its seat stays empty. */
  arrivingAt(slotIndex: number): boolean {
    return this.bySlot.get(slotIndex)?.kind === "toSlot";
  }

  /** Is this tile currently travelling home? It is drawn by the flight, not the pool. */
  returningTile(tileId: number): boolean {
    for (const flight of this.bySlot.values()) {
      if (flight.kind === "toPool" && flight.tileId === tileId) return true;
    }
    return false;
  }

  /**
   * Step every flight, dropping those that have landed.
   * @returns the flights that landed on THIS step, so they can be sounded.
   */
  advance(deltaMs: number): Flight[] {
    const landed: Flight[] = [];
    for (const [slot, flight] of this.bySlot) {
      if (!flight.tween.advance(deltaMs)) {
        landed.push(flight);
        this.bySlot.delete(slot);
      }
    }
    return landed;
  }
}
