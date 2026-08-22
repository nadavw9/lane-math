import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import type { BinaryOp, Mode, UnaryOp } from "../solver/index.js";
import type { Command, InputEvent, ViewState } from "../game/types.js";
import {
  BACKDROP,
  DESIGN,
  DIM,
  HINT_LINE_H,
  PALETTE,
  TRAY_ALPHA,
  type Bands,
  type Rect,
  bands,
  equationSlot,
  operatorSlot,
  poolSlot,
  targetSlot,
} from "./layout.js";
import { button, type ButtonState } from "./button.js";
import { BOARD_BANDS, CLEARED_BANDS, Entrance } from "./entry.js";
import { RejectPulse, Shatter } from "./effects.js";
import { emblemMeter, hintDiamond, meterWidth, star } from "./emblems.js";
import { cuesFor } from "../audio/cues.js";
import type { Sound } from "../audio/sound.js";
import { FlightTable } from "./flights.js";
import {
  failedAtlases,
  loadAtlas,
  loadedSprites,
  missingSprites,
  setSpritesEnabled,
  spriteFor,
  spriteNameFor,
  spritesEnabled,
  type TokenState,
} from "./sprites.js";
import { advancesTarget, isRewind } from "./transitions.js";
import { EASE, TIMING, Tween, effectSpeed, lerp, shudder } from "./tween.js";
import {
  emptySlot,
  ghostSlot,
  numberTile,
  operatorToken,
  UI_FONT,
  setGrainTexture,
  squaredPaper,
  targetPlate,
  feltLinedTray,
} from "./tokens.js";


const BINARY: readonly BinaryOp[] = ["+", "-", "*", "/"];
const UNARY: readonly UnaryOp[] = ["sqrt", "sq"];
/** Tile ids are non-negative, so a negative key can never collide with one. */
const OPERATOR_LIFT_KEY = -1;

/**
 * Display forms for the operator codes.
 *
 * `sqrt` maps to ITSELF, not to a radical character: U+221A is not in Outfit at
 * any subset, so typing it would fall back to a system font while the other
 * four dials render in the game's own. operatorToken() recognises the ASCII
 * identity and draws the radical (emblems.ts). The character does not appear in
 * this codebase at all, which is what keeps it from being typed by accident.
 */
const LABEL: Record<string, string> = { sqrt: "sqrt", sq: "x²", "*": "×", "/": "÷", "-": "−" };

/**
 * The Renderer draws commands and emits input. It holds a view model built from
 * commands and never reads Director state directly, and it decides no rules —
 * every legality question was already answered by the Director via the solver.
 */
export class Renderer {
  private readonly app = new Application();
  /** Wallpaper, below everything and untouched by a board redraw. */
  private readonly background = new Container();
  private readonly root = new Container();
  /** Effects live above the board and are not cleared by a redraw. */
  private readonly fx = new Container();
  private world = 0;
  private state: ViewState | null = null;
  private rejection: string | null = null;
  private emit: (input: InputEvent) => void = () => {};

  /** Where each live tile is drawn, so a shatter can start from the right place. */
  private readonly tileBounds = new Map<number, { x: number; y: number; w: number; h: number }>();
  private readonly shatters: Shatter[] = [];
  private reject: RejectPulse | null = null;
  private rejectOffset = { dx: 0, dy: 0, glow: 0 };
  private lastPhase: string = "playing";
  /** Build id shown in the status band; long-pressing it exports the funnel. */
  private buildLabel = "";

  /*
   * THE FEEL LAYER (§9.5). All time-sampled, all read during draw().
   *
   * The board is rebuilt from scratch every frame, so none of these can hold
   * display objects — they hold PROGRESS, and draw() asks them where things
   * are. That is what lets the animation survive a redraw triggered by
   * anything else, and it is why the effects compose instead of fighting.
   */
  /** Press feedback per tile: a tile coming up under the finger. */
  private readonly lifts = new Map<number, Tween>();
  private readonly flights = new FlightTable();
  /** The queue shifting down after a target is cleared. */
  private laneAdvance: Tween | null = null;
  /** The equation row refusing an illegal commit. */
  private resist: Tween | null = null;
  /** Tiles rewriting themselves under a unary operator: id -> value before. */
  private readonly rewrites = new Map<number, { from: number; tween: Tween }>();
  /** Stars arriving one at a time on a clear. */
  private starArrivals: Tween[] = [];
  /**
   * Hit-stop (§9.5): the board holds the PRE-commit frame for a beat so the
   * payoff lands. The new state is parked here rather than drawn, which is the
   * only way the hold reads as a hold — swapping the state and delaying only
   * the shatter would show the tiles already gone.
   */
  private hold: { next: ViewState; remainingMs: number } | null = null;

  /**
   * The sound layer (§9.5 register, applied to audio).
   *
   * Owned by the Renderer because sound is FEEL, and feel is decided by
   * watching state change — exactly what this class already does. The Director
   * stays free of it, so nothing about the rules knows the game makes a noise.
   */
  private sound: Sound | null = null;
  /** Which star tweens have already sounded, so each one speaks once. */
  private starsSounded = 0;
  /** Screens ARRIVE (§9.0). Restarted whenever a board or panel opens. */
  private entrance: Entrance | null = null;
  /** Outcome of the last rewarded-ad attempt, shown on the out-of-lives screen. */
  private adMessage: string | null = null;
  private clearedEntrance: Entrance | null = null;

  private get rejecting(): boolean {
    return this.reject !== null;
  }

  /**
   * Band geometry for a board (§9.1: bands size to content).
   *
   * Driven by the level's STARTING counts, not by what is left: `tiles` and
   * `targets` both include spent entries, so the grid holds still while the
   * level is played and only differs between levels.
   */
  private bandsFor(state: ViewState): Bands {
    return bands({
      targets: state.targets.length,
      tiles: state.tiles.length,
      operators: Object.keys(state.budget).length,
      hints: state.hints.length,
    });
  }

  /**
   * Temporary world surface until desk-in-room backgrounds replace the retired
   * paper art. The canvas's #704A32 background is intentional, not a load error.
   */
  async setWorld(world: number): Promise<void> {
    if (this.world === world) return;
    this.world = world;
    this.background.removeChildren();
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      width: DESIGN.width,
      height: DESIGN.height,
      background: PALETTE.background,
      antialias: false,
    });
    host.appendChild(this.app.canvas);

    /*
     * The one shared grain (§9.6), loaded before the first draw.
     *
     * Set to repeat: it is a 64px tile stretched over nothing — every surface
     * that uses it wraps it, so one small texture dresses tokens of every size
     * and the tray as well.
     */
    try {
      const texture = await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/grain.png`);
      texture.source.addressMode = "repeat";
      setGrainTexture(texture);
    } catch {
      // Material is a finish, not a requirement: without it the tokens are flat
      // colour and the game is completely playable.
      setGrainTexture(null);
    }

    /*
     * The sprite path (ART_DIRECTION §5), off unless asked for.
     *
     * Loading the atlas is not the same as enabling it: a family that fails to
     * load leaves every token on the procedural path, which is the state the
     * game already ships in, so there is nothing to fall back FROM.
     */
    if (spritesEnabled()) {
      const loaded = await Promise.all(
        ["tiles", "operators"].map((family) => loadAtlas(family, import.meta.env.BASE_URL)),
      );
      if (!loaded.every(Boolean)) setSpritesEnabled(false);
    }

    this.app.stage.addChild(this.background);
    this.app.stage.addChild(this.root);
    this.app.stage.addChild(this.fx);

    // Effects tick independently of state changes: a shatter has to keep
    // playing while the board sits still underneath it.
    this.app.ticker.add(({ deltaMS }) => this.tick(deltaMS));

    // Scale to fit the viewport. The design surface is a fixed 420x900; without
    // this the status band at the bottom — which is where FAILED and CLEARED
    // are reported — falls off the bottom of a short window and the player
    // cannot see why the level stopped.
    const fit = (): void => {
      // Fit the phone frame this canvas sits in, not the browser window.
      const box = host.getBoundingClientRect();
      const scale = Math.min(box.height / DESIGN.height, box.width / DESIGN.width);
      this.app.canvas.style.width = `${Math.round(DESIGN.width * scale)}px`;
      this.app.canvas.style.height = `${Math.round(DESIGN.height * scale)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
  }

  onInput(handler: (input: InputEvent) => void): void {
    this.emit = handler;
  }

  /**
   * Begin a board arrival (§9.0).
   *
   * Called by the shell when a level OPENS, rather than inferred from the state
   * diff: reopening the same level changes neither the id nor the run counter,
   * so the renderer cannot tell it apart from a redraw — and a replay would
   * have appeared instantly while every other open animated.
   */
  /** Report an ad outcome to the player. Cleared when they leave the screen. */
  setAdMessage(message: string | null): void {
    this.adMessage = message;
    this.draw();
  }

  beginEntrance(): void {
    this.entrance = new Entrance(Object.keys(BOARD_BANDS).length);
  }

  attachSound(sound: Sound): void {
    this.sound = sound;
  }

  setBuildLabel(label: string): void {
    this.buildLabel = label;
  }

  /**
   * The stage, so a second screen can live on the same Application.
   *
   * The map is not a separate canvas: it is the same desk seen from further
   * back, drawn with the same tokens and the same material, so it shares the
   * renderer rather than standing up a second one.
   */
  get stage(): Container {
    return this.app.stage;
  }

  /** Hide the board while another screen has the surface. */
  setBoardVisible(visible: boolean): void {
    this.root.visible = visible;
    this.fx.visible = visible;
  }

  /**
   * Everything the renderer holds that could grow without bound.
   *
   * Exists to answer "what accumulates per tap" with counts rather than
   * hypotheses. A flat counter is evidence too, which is why this reports all
   * of them rather than the ones currently under suspicion.
   */
  diagnostics(): Record<string, number> {
    const ticker = this.app.ticker as unknown as { _head?: { next?: unknown } };
    let tickerListeners = 0;
    let node = ticker._head?.next as { next?: unknown } | undefined;
    while (node) {
      tickerListeners++;
      node = node.next as { next?: unknown } | undefined;
    }

    return {
      tickerListeners,
      rootChildren: this.root.children.length,
      fxChildren: this.fx.children.length,
      backgroundChildren: this.background.children.length,
      stageChildren: this.app.stage.children.length,
      flights: this.flights.size,
      lifts: this.lifts.size,
      rewrites: this.rewrites.size,
      starArrivals: this.starArrivals.length,
      shatters: this.shatters.length,
      tileBounds: this.tileBounds.size,
      spritesEnabled: spritesEnabled() ? 1 : 0,
      spritesLoaded: loadedSprites().length,
      // Non-zero means the game asked for art it did not get. Surfaced rather
      // than swallowed: a silent fallback is how a missing asset survives three
      // weeks of review.
      spritesMissing: missingSprites().length,
      // Atlas families that did not load. A failed load disables the sprite
      // path, and a disabled path records no misses — so spritesMissing alone
      // cannot see the failure that matters most.
      spriteAtlasFailures: failedAtlases().length,
      entranceBand0: this.entrance ? Number(this.entrance.sample(0).alpha.toFixed(2)) : -1,
      entranceBand5: this.entrance ? Number(this.entrance.sample(5).alpha.toFixed(2)) : -1,
    };
  }

  /**
   * What the feel layer is doing right now (§9.5).
   *
   * Exposed for the review harness: the effects are the deliverable this
   * session, and a screenshot cannot prove one was mid-flight rather than
   * finished before the shutter opened. This reports what was actually running
   * at the moment the frame was captured, so the picture can be trusted.
   */
  feelState(): Record<string, unknown> {
    return {
      speed: effectSpeed(),
      holding: this.hold !== null,
      holdRemainingMs: this.hold?.remainingMs ?? 0,
      lifts: [...this.lifts.entries()].map(([id, t]) => ({ id, at: Number(t.raw.toFixed(3)) })),
      flights: this.flights.active().map((f) => ({
        kind: f.kind,
        slot: f.slotIndex,
        label: f.label,
        at: Number(f.tween.raw.toFixed(3)),
      })),
      rewrites: [...this.rewrites.entries()].map(([id, r]) => ({
        id,
        from: r.from,
        at: Number(r.tween.raw.toFixed(3)),
      })),
      laneAdvance: this.laneAdvance ? Number(this.laneAdvance.raw.toFixed(3)) : null,
      resist: this.resist ? Number(this.resist.raw.toFixed(3)) : null,
      stars: this.starArrivals.map((s) => Number(s.raw.toFixed(3))),
      shatters: this.shatters.length,
    };
  }

  apply(commands: readonly Command[]): void {
    const rejected = commands.some((c) => c.type === "reject");

    for (const command of commands) {
      if (command.type === "reject") {
        this.rejection = command.reason;
        // §9.5: the row RESISTS. Not an impact — a short lateral shudder that
        // dies away, with every tile staying exactly where it was.
        this.resist = new Tween(TIMING.resist, (t) => t);
      }
      if (command.type === "render") {
        if (!rejected) this.rejection = null;

        // A cleared target is the one moment worth holding (§9.5). Park the new
        // state; tick() swaps it in once the beat has passed.
        if (this.state !== null && advancesTarget(this.state, command.state)) {
          this.hold = { next: command.state, remainingMs: TIMING.hitStop };
          continue;
        }
        this.commitState(command.state, rejected);
      }
    }
    this.draw();
  }

  /** Adopt a new view state and start whatever it implies. */
  private commitState(next: ViewState, rejected = false): void {
    const previous = this.state;
    this.state = next;
    this.reactTo(previous, next);

    /*
     * Sound is driven from the ADOPTED state, never from the input.
     *
     * That is what keeps the hit-stop silent without a special case: the hold
     * defers this call, so the commit thunk cannot physically be produced until
     * the beat has passed and the shatter is landing.
     */
    this.sound?.playAll(cuesFor(previous, next, rejected));
  }

  /**
   * Input is refused during the hit-stop.
   *
   * The Director has already moved on, so a tap landing in the held frame would
   * be aimed at a board that no longer exists. It is 80ms — below the point
   * anyone can act on what they are seeing — so nothing playable is lost.
   */
  private get inputLocked(): boolean {
    return this.hold !== null;
  }

  /**
   * Turn state transitions into effects.
   *
   * The Renderer notices what changed rather than being told — the Director
   * emits game state and stays free of animation concerns.
   */
  private reactTo(previous: ViewState | null, next: ViewState): void {
    if (!previous || previous.levelId !== next.levelId) {
      this.shatters.length = 0;
      this.fx.removeChildren();
      this.reject = null;
      this.entrance = new Entrance(Object.keys(BOARD_BANDS).length);
      // §9.5: retry is instantaneous. A fresh level inherits NO animation —
      // leaving a shudder or a half-finished flight running would make the new
      // board look like it was still recovering from the old one.
      this.clearFeel();
      this.lastPhase = next.phase;
      return;
    }

    /*
     * A restart of the SAME level (§9.5: retry is instantaneous).
     *
     * The levelId is unchanged, so the fresh-level branch above does not catch
     * it — the tell is the queue going backwards, which nothing else does. It
     * has to be caught, or a board rewound mid-shudder would open still
     * shuddering and the retry would look like it was recovering from the
     * failure rather than starting clean.
     */
    if (isRewind(previous, next)) {
      this.shatters.length = 0;
      this.fx.removeChildren();
      this.clearFeel();
      this.reject = null;
      this.lastPhase = next.phase;
      return;
    }

    this.reactToSlots(previous, next);
    this.reactToTransforms(previous, next);

    // A target was cleared: the tiles that paid for it shatter into it (§9.3).
    if (next.targetIndex > previous.targetIndex) {
      const consumed = previous.tiles.filter(
        (t) => !t.consumed && next.tiles.find((n) => n.id === t.id)?.consumed === true,
      );
      // The cleared target was the front one, and the front is always at
      // offset 0 — the tiles shatter into where it still is, before the queue
      // slides down over it.
      const board = this.bandsFor(next);
      const slot = targetSlot(0, board.lane, board.grid);
      const targetX = slot.x + slot.width / 2;
      const targetY = slot.y + slot.height / 2;

      for (const tile of consumed) {
        const bounds = this.tileBounds.get(tile.id);
        if (!bounds) continue;
        this.spawnShatter(bounds, PALETTE.tile, targetX, targetY, spriteNameFor("cube", "idle"));
      }
      // The operator is destroyed with them — it was spent too.
      const opSlot = equationSlot(1, board.equation);
      this.spawnShatter(
        { x: opSlot.x, y: opSlot.y, w: opSlot.width, h: opSlot.height },
        PALETTE.operator,
        targetX,
        targetY,
      );

      // §9.5: the lane advances WITH MASS. The queue starts one slot high and
      // falls into place on a gravity curve, so clearing a target reads as the
      // whole column shifting rather than as numbers being reassigned.
      this.laneAdvance = new Tween(TIMING.laneAdvance, EASE.fall);
    }

    // The lane refuses the front target (§9.4). No banner — the board says it.
    if (next.phase === "failed" && this.lastPhase !== "failed") {
      this.reject = new RejectPulse();
    }
    if (next.phase !== "failed") this.reject = null;

    // §9.5: stars arrive ONE AT A TIME, weighted. Staggered delays rather than
    // a burst — three stars landing together is a spray, which is the register
    // this game does not use.
    if (next.phase === "won" && this.lastPhase !== "won") {
      const earned = next.economy?.starsIfCleared ?? 0;
      this.clearedEntrance = new Entrance(Object.keys(CLEARED_BANDS).length);
      this.starArrivals = Array.from(
        { length: earned },
        (_, i) => new Tween(TIMING.starArrive, EASE.settle, i * TIMING.starGap),
      );
    }

    this.lastPhase = next.phase;
  }

  /**
   * Tiles moving into and out of the equation row (§9.5).
   *
   * Read from the slots rather than from the tap, so a refused tap animates
   * nothing — the Director decides what happened and the feel follows it.
   */
  private reactToSlots(previous: ViewState, next: ViewState): void {
    const board = this.bandsFor(next);

    /*
     * An operator being chosen gets press feedback too.
     *
     * Only tile placement populated `lifts`, so tapping a dial was the one
     * interaction on the board with no visible response at all — found by
     * checking every control for the mechanism rather than assuming the button
     * work had covered it. Operators are tokens, not buttons, so they take the
     * same §9.5 lift a tile does. Keyed off the operator slot's own id space so
     * it cannot collide with a tile id.
     */
    if (previous.slots.op === null && next.slots.op !== null) {
      this.lifts.set(OPERATOR_LIFT_KEY, new Tween(TIMING.lift, EASE.lift));
    }
    const poolIndex = (id: number): number => next.tiles.findIndex((t) => t.id === id);

    const pairs: [0 | 1 | 2, number | null, number | null][] = [
      [0, previous.slots.leftTileId, next.slots.leftTileId],
      [2, previous.slots.rightTileId, next.slots.rightTileId],
    ];

    for (const [slotIndex, before, after] of pairs) {
      if (before === after) continue;
      const slot = equationSlot(slotIndex, board.equation);
      const seat = { x: slot.x, y: slot.y, w: slot.width, h: slot.height };

      if (after !== null) {
        // Placed. It lifts off the pool first, then settles into the row.
        const home = poolSlot(poolIndex(after), board.pool, board.grid);
        const tile = next.tiles.find((t) => t.id === after);
        this.lifts.set(after, new Tween(TIMING.lift, EASE.lift));
        this.flights.launch({
          kind: "toSlot",
          slotIndex,
          tileId: after,
          label: String(tile?.value ?? ""),
          from: { x: home.x, y: home.y, w: home.width, h: home.height },
          to: seat,
          tween: new Tween(TIMING.place, EASE.settle),
        });
      } else if (before !== null) {
        const tile = next.tiles.find((t) => t.id === before);

        /*
         * A SPENT tile has nowhere to return to.
         *
         * A successful commit also empties the slots, which looks identical to
         * a return from here — so without this the two tiles that just paid for
         * a target would shatter toward the lane and simultaneously fly home to
         * a pool seat that is now a ghost. Consumption is the tell.
         */
        if (!tile || tile.consumed) continue;

        // Returned. Back to ITS OWN slot — the pool never re-packs (§9.3), so
        // there is always exactly one seat it belongs in.
        const home = poolSlot(poolIndex(before), board.pool, board.grid);
        this.flights.launch({
          kind: "toPool",
          slotIndex,
          tileId: before,
          label: String(tile?.value ?? ""),
          from: seat,
          to: { x: home.x, y: home.y, w: home.width, h: home.height },
          tween: new Tween(TIMING.returnHome, EASE.slide),
        });
      }
    }
  }

  /**
   * §9.5: a transformed tile visibly REWRITES ITSELF in place.
   *
   * The change is the event, so the tile turns edge-on and comes back carrying
   * a different number — it never moves, never leaves, and is never replaced by
   * a new token sliding in. Detected by value change on a surviving id, which
   * is exactly what a transform is.
   */
  private reactToTransforms(previous: ViewState, next: ViewState): void {
    for (const tile of next.tiles) {
      if (tile.consumed) continue;
      const was = previous.tiles.find((t) => t.id === tile.id);
      if (!was || was.consumed || was.value === tile.value) continue;
      this.rewrites.set(tile.id, { from: was.value, tween: new Tween(TIMING.rewrite, (t) => t) });
    }
  }

  /** Drop every running effect. Used when a level opens or restarts (§9.5). */
  private clearFeel(): void {
    this.starsSounded = 0;
    this.clearedEntrance = null;
    this.lifts.clear();
    this.flights.clear();
    this.rewrites.clear();
    this.laneAdvance = null;
    this.resist = null;
    this.starArrivals = [];
    this.hold = null;
  }

  /**
   * Tokens in transit (§9.5), drawn above the board.
   *
   * The travelling token carries a shadow that grows at the midpoint and closes
   * as it lands, which is what sells it as a piece being LIFTED and set down
   * rather than an icon sliding across a surface.
   */
  /**
   * OUT OF LIVES (GDD §5.2, §13, §9.0).
   *
   * This was one line of red text, at the exact moment the game asks for
   * money — the least designed screen in the build and the most commercially
   * important. It now answers the three questions a player actually has: what
   * happened, when do I get back in for free, and is there a faster way.
   *
   * THE TIMER IS ALWAYS VISIBLE AND ALWAYS RUNNING, whether or not an ad is
   * available. An ad skips the wait; it is never the only way out. A screen
   * whose sole exit is a video has taken the player hostage, and §13 is
   * explicit that being out of lives must never be a dead end.
   */
  private drawOutOfLives(lane: Rect, eco: NonNullable<ViewState["economy"]>): void {
    const width = lane.width - 24;
    const height = 214;
    const x = lane.x + 12;
    const y = lane.y + lane.height / 2 - height / 2;

    const panel = new Graphics()
      .roundRect(x, y, width, height, 12)
      .fill({ color: PALETTE.targetPlate, alpha: 0.97 });
    panel
      .moveTo(x + 12, y + 2)
      .lineTo(x + width - 12, y + 2)
      .stroke({ width: 3, color: 0x000000, alpha: 0.3 });
    panel
      .moveTo(x + 12, y + height - 2)
      .lineTo(x + width - 12, y + height - 2)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.14 });
    panel
      .roundRect(x, y, width, height, 12)
      .stroke({ width: 2, color: PALETTE.highlight, alpha: 0.5 });
    this.root.addChild(this.entry(panel, BOARD_BANDS.furniture));

    /*
     * THE AUTOMATON'S SEAT (ART_DIRECTION §2, concerned state).
     *
     * Laid out now and filled with art later, rather than retrofitted: this
     * screen is one of the four roles §2 names for the character, and the
     * difference between a layout designed around a face and one with a face
     * dropped into it afterwards is visible.
     */
    const seat = 58;
    const seatX = x + 18;
    const seatY = y + 22;
    const placeholder = spriteFor("automaton-concerned");
    if (placeholder) {
      const art = new Sprite(placeholder.texture);
      art.width = seat;
      art.height = seat;
      art.position.set(seatX, seatY);
      this.root.addChild(this.entry(art, BOARD_BANDS.pool));
    } else {
      // Reserved, and visibly reserved — a dim brass disc holding the space so
      // the layout is designed around the character rather than beside it.
      const stand = new Graphics()
        .circle(seatX + seat / 2, seatY + seat / 2, seat / 2)
        .fill({ color: PALETTE.tray, alpha: 0.35 })
        .circle(seatX + seat / 2, seatY + seat / 2, seat / 2)
        .stroke({ width: 2, color: PALETTE.highlight, alpha: 0.3 });
      this.root.addChild(this.entry(stand, BOARD_BANDS.pool));
    }

    const headline = this.text("Out of lives", 20, PALETTE.highlight);
    headline.position.set(seatX + seat + 14, y + 26);
    this.root.addChild(this.entry(headline, BOARD_BANDS.operators));

    const minutes = Math.floor(eco.msUntilNextLife / 60000);
    const seconds = Math.floor((eco.msUntilNextLife % 60000) / 1000);
    const clock = eco.msUntilNextLife > 0
      ? `next life in ${minutes}:${String(seconds).padStart(2, "0")}`
      : "a life is on its way";
    const timer = this.text(clock, 14, PALETTE.tokenInk);
    timer.position.set(seatX + seat + 14, y + 54);
    this.root.addChild(this.entry(timer, BOARD_BANDS.operators));

    // §5.2's refill, and the first player-facing route to it. Until now
    // offerLifeForAd had no caller outside the debug harness.
    this.root.addChild(
      this.entry(
        this.box(
          x + 20,
          y + 104,
          width - 40,
          44,
          PALETTE.armed,
          "watch to continue",
          PALETTE.highlight,
          () => this.emit({ type: "tapWatchAd" }),
          PALETTE.highlight,
        ),
        BOARD_BANDS.equation,
      ),
    );

    /*
     * The outcome of the last attempt, stated plainly. All three AdMob results
     * are visible to the player: a completed view grants a life, a dismissal
     * grants nothing AND costs nothing, and a no-fill says so and leaves the
     * timer as the way back. Silence after a dismissed ad reads as a bug.
     */
    if (this.adMessage) {
      const note = this.text(this.adMessage, 12, PALETTE.tokenInk);
      note.anchor.set(0.5, 0);
      note.position.set(DESIGN.width / 2, y + 156);
      note.alpha = 0.85;
      this.root.addChild(this.entry(note, BOARD_BANDS.equation));
    }

    const wait = this.text("or wait — the timer is always running", 11, PALETTE.tokenInk);
    wait.anchor.set(0.5, 0);
    wait.position.set(DESIGN.width / 2, y + height - 26);
    wait.alpha = 0.6;
    this.root.addChild(this.entry(wait, BOARD_BANDS.status));
  }

  private drawFlights(): void {
    for (const flight of this.flights.active()) {
      const t = flight.tween.value;
      const x = lerp(flight.from.x, flight.to.x, t);
      const y = lerp(flight.from.y, flight.to.y, t);
      const w = lerp(flight.from.w, flight.to.w, t);
      const h = lerp(flight.from.h, flight.to.h, t);

      // Highest in the middle of the journey, flat at both ends.
      const carried = Math.sin(Math.PI * Math.min(1, flight.tween.raw));

      const token = numberTile(w, h, flight.label, {
        fill: PALETTE.tile,
        text: PALETTE.tokenInk,
        bevel: 1,
        elevation: 1 + carried * 2.2,
      });
      token.position.set(x, y - carried * 6);
      this.root.addChild(token);
    }
  }

  private spawnShatter(
    bounds: { x: number; y: number; w: number; h: number },
    colour: number,
    targetX: number,
    targetY: number,
    sprite?: string,
  ): void {
    // Shards carry the token's own art where there is any, and fall back to
    // flat quads of its colour where there is not (ART_DIRECTION §5).
    const texture = sprite ? (spriteFor(sprite)?.texture ?? undefined) : undefined;
    const shatter = new Shatter({ ...bounds, colour, targetX, targetY, texture });
    this.shatters.push(shatter);
    this.fx.addChild(shatter.container);
  }

  private tick(deltaMs: number): void {
    let dirty = false;

    for (let i = this.shatters.length - 1; i >= 0; i--) {
      if (!this.shatters[i]!.update(deltaMs)) this.shatters.splice(i, 1);
    }

    if (this.reject) {
      const sample = this.reject.sample(deltaMs);
      this.rejectOffset = { dx: sample.dx, dy: sample.dy, glow: sample.glow };
      dirty = true;
      if (!sample.alive) {
        // Settle in place. The target stays refused; it simply stops shaking.
        this.rejectOffset = { dx: 0, dy: 0, glow: 0.35 };
      }
    }

    // The hit-stop runs on the same scaled clock as everything else, so the
    // review harness can slow it down and photograph the held frame (§9.5).
    if (this.hold) {
      this.hold.remainingMs -= deltaMs * effectSpeed();
      if (this.hold.remainingMs <= 0) {
        const { next } = this.hold;
        this.hold = null;
        this.commitState(next);
      }
      dirty = true;
    }

    if (this.advanceAll(deltaMs)) dirty = true;

    if (dirty) this.draw();
  }

  /** Step every feel tween. @returns true if anything is still running. */
  private advanceAll(deltaMs: number): boolean {
    let running = false;

    if (this.entrance) {
      if (this.entrance.advance(deltaMs)) running = true;
      else this.entrance = null;
    }
    if (this.clearedEntrance) {
      if (this.clearedEntrance.advance(deltaMs)) running = true;
      else this.clearedEntrance = null;
    }

    for (const [id, tween] of this.lifts) {
      if (tween.advance(deltaMs)) running = true;
      else this.lifts.delete(id);
    }
    for (const [id, rewrite] of this.rewrites) {
      if (rewrite.tween.advance(deltaMs)) running = true;
      else this.rewrites.delete(id);
    }
    /*
     * A landing knock, fired when the token actually arrives (§9.5).
     *
     * Not at the tap: the click is the finger, the knock is the piece meeting
     * the table, and they are ~260ms apart. Firing both at once would collapse
     * the placement into a single blip and lose the weight the flight exists to
     * create.
     */
    for (const flight of this.flights.advance(deltaMs)) {
      // Only a PLACEMENT gets a landing sound. A return already spoke when the
      // player tapped it — sounding it again here double-knocked every undo,
      // which the cue log caught immediately.
      if (flight.kind === "toSlot") this.sound?.play({ name: "knock" });
    }
    if (this.flights.size > 0) running = true;

    if (this.laneAdvance) {
      if (this.laneAdvance.advance(deltaMs)) running = true;
      else this.laneAdvance = null;
    }
    if (this.resist) {
      if (this.resist.advance(deltaMs)) running = true;
      else this.resist = null;
    }
    for (const star of this.starArrivals) {
      if (star.advance(deltaMs)) running = true;
    }

    // One note per star as it SEATS, never three together (§9.5). Counted
    // rather than flagged per tween, so the notes stay in the order the stars
    // arrive in.
    const seated = this.starArrivals.filter((star) => star.started).length;
    for (let i = this.starsSounded; i < seated; i++) {
      this.sound?.play({ name: "star", tone: i / Math.max(1, this.starArrivals.length - 1) });
    }
    this.starsSounded = Math.max(this.starsSounded, seated);

    return running;
  }

  private text(value: string, size: number, colour: number): Text {
    return new Text({
      text: value,
      style: new TextStyle({
        fontFamily: UI_FONT,
        fontSize: size,
        fontWeight: "bold",
        fill: colour,
      }),
    });
  }

  /**
   * Every control in the game routes through the one button component.
   *
   * This used to draw a flat rounded rect with a two-line bevel inline, and had
   * no pressed state — which was true of every control on every screen.
   */
  private box(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    text: string,
    labelColour: number,
    onTap?: () => void,
    outline?: number,
    state: ButtonState = "idle",
    emblem?: () => Container,
  ): Container {
    const control = button({
      width: w,
      height: h,
      label: text,
      fill,
      labelColour,
      outline,
      emblem,
      state: this.inputLocked ? "disabled" : state,
      onTap: this.inputLocked ? undefined : onTap,
    });
    control.position.set(x, y);
    return control;
  }

  /**
   * Offset a node for its arrival band (§9.0 motion).
   *
   * Applied at placement rather than by animating containers, because the board
   * is rebuilt every frame — there is nothing persistent to tween, so the
   * arrival is sampled and drawn like every other effect in this renderer.
   */
  private entry(node: Container, band: number, cleared = false): Container {
    const entrance = cleared ? this.clearedEntrance : this.entrance;
    if (!entrance) return node;
    const sample = entrance.sample(band);
    node.position.y += sample.dy;
    node.alpha *= sample.alpha;
    return node;
  }

  /** Place a procedural token and make it tappable. */
  private place(
    token: Container,
    x: number,
    y: number,
    onTap?: () => void,
  ): Container {
    token.position.set(x, y);
    if (onTap && !this.inputLocked) {
      token.eventMode = "static";
      token.cursor = "pointer";
      token.on("pointertap", onTap);
    }
    this.root.addChild(token);
    return token;
  }

  private draw(): void {
    this.root.removeChildren();
    const s = this.state;
    if (!s) return;

    const board = this.bandsFor(s);
    const { lane, equation, operators, pool, status } = board;

    // --- lane: the target queue, visible from level open (GDD §4.2) ---
    // Translucent so the world background reads through. The brightness gate
    // measures tokens against that background, so covering it with an opaque
    // panel would make the gate judge something the player never sees.
    // §9.6: the lane is a strip of squared paper, not a neutral panel. The veil
    // still does the separation job; the ruling sits on top of it.
    this.entry(this.place(squaredPaper(lane.width, lane.height, BACKDROP), lane.x, lane.y),
      BOARD_BANDS.furniture);

    /*
     * Cleared targets are REMOVED and the queue slides down (§2).
     *
     * They used to sit there greyed out, which quietly broke §9.4: the failure
     * signal is the lane REFUSING TO ADVANCE, and a refusal to advance is only
     * legible if advancing is what the player has watched happen all level. A
     * queue that never moves has no state left to withhold.
     *
     * Drawn back-to-front so the front plate, the one that shudders, ends up on
     * top of its neighbour.
     */
    // §9.5: the queue advances with mass. Mid-advance every plate is drawn one
    // slot higher and falls in, so the column moves as a body.
    const advancing = this.laneAdvance ? 1 - this.laneAdvance.value : 0;

    for (let i = s.targets.length - 1; i >= s.targetIndex; i--) {
      const offset = i - s.targetIndex;
      const slot = targetSlot(offset + advancing, lane, board.grid);
      const front = offset === 0;

      // §9.4: the front target shudders and refuses to advance when the lane
      // rejects it. It never leaves its slot — not advancing IS the message.
      const shove = front && this.rejecting ? this.rejectOffset : { dx: 0, dy: 0, glow: 0 };

      this.entry(
        this.place(
        targetPlate(slot.width, slot.height, String(s.targets[i]), {
          fill: front
            ? this.rejecting
              ? PALETTE.failed
              : PALETTE.targetFront
            : PALETTE.targetPlate,
          text: PALETTE.tokenInk,
          bevel: 0, // recessed: targets are spent ON, not picked up
          outline: front
            ? this.rejecting
              ? PALETTE.failed
              : PALETTE.highlight
            : undefined,
        }),
        slot.x + shove.dx,
        slot.y + shove.dy,
        ),
        // The FRONT target lands last: it is the focal point (§9.0).
        front ? BOARD_BANDS.front : BOARD_BANDS.queue,
      );
    }

    // --- equation row: three slots + commit ---
    const tileOf = (id: number | null) =>
      id === null ? null : (s.tiles.find((t) => t.id === id) ?? null);
    const left = tileOf(s.slots.leftTileId);
    const right = tileOf(s.slots.rightTileId);

    const slotSpecs: [string, boolean, 0 | 1 | 2][] = [
      [left ? String(left.value) : "_", left !== null, 0],
      [s.slots.op ? (LABEL[s.slots.op] ?? s.slots.op) : "_", s.slots.op !== null, 1],
      [right ? String(right.value) : "_", right !== null, 2],
    ];

    /*
     * §9.5: an illegal commit makes the row RESIST.
     *
     * A lateral shudder that decays, applied to the equation row only — the
     * pool and the lane do not move, so nothing reads as an impact on the whole
     * board. This is the closest this game gets to screen shake, and it is
     * deliberately confined to the thing that refused.
     */
    const resistDx = this.resist ? shudder(this.resist.raw, 7, 7) : 0;

    slotSpecs.forEach(([text, filled, index]) => {
      const r = equationSlot(index, equation);
      const tap = () => this.emit({ type: "tapSlot", index });
      // The empty row is shape-coded too: square, circle, square. Slot 2 takes
      // an operator and says so before anything is dropped into it.
      const shape = index === 1 ? "circle" : "square";
      // A token still in flight has not arrived: its seat stays empty until it
      // lands, or the same token would be drawn twice.
      const arriving = this.flights.arrivingAt(index);
      if (!filled || arriving) {
        this.entry(
          this.place(emptySlot(r.width, r.height, shape), r.x + resistDx, r.y, tap),
          BOARD_BANDS.equation,
        );
        return;
      }
      // A filled slot keeps the SHAPE of what is in it: circle for the
      // operator, rounded square for a number. The row reads as a sentence.
      const token =
        index === 1
          ? operatorToken(Math.min(r.width, r.height), text, {
              fill: PALETTE.operator,
              text: PALETTE.tokenInk,
              bevel: 1,
            })
          : numberTile(r.width, r.height, text, {
              fill: PALETTE.tile,
              text: PALETTE.tokenInk,
              bevel: 1,
            });
      this.entry(
        this.place(
          token,
          r.x + resistDx + (index === 1 ? (r.width - Math.min(r.width, r.height)) / 2 : 0),
          r.y,
          tap,
        ),
        BOARD_BANDS.equation,
      );
    });

    /*
     * §9.6: the armed `=` is GOLD ON DARK. It was green, and green was the one
     * colour in the design that meant nothing anywhere else.
     *
     * Disarmed it is the same dark button under the dim treatment — same
     * substance, less presence — rather than a second, lighter button.
     */
    const canCommit = s.affordance === "commit";
    const commitRect = equationSlot(3, equation);
    const commit = this.box(
      commitRect.x + resistDx,
      commitRect.y,
      commitRect.width,
      commitRect.height,
      PALETTE.armed,
      "=",
      canCommit ? PALETTE.highlight : PALETTE.tokenInk,
      canCommit ? () => this.emit({ type: "tapCommit" }) : undefined,
      canCommit ? PALETTE.highlight : undefined,
    );
    if (!canCommit) commit.alpha = DIM.alpha;
    this.root.addChild(this.entry(commit, BOARD_BANDS.equation));

    // --- operators. Affordance rule (§3.5): bold-active paired with dim-inactive.
    const available = [
      ...BINARY.filter((op) => s.budget[op] !== undefined),
      ...UNARY.filter((op) => s.budget[op] !== undefined),
    ];
    available.forEach((op, i) => {
      const r = operatorSlot(i, available.length, operators, board.operatorGrid);
      const remaining = s.budget[op];
      const isUnary = (UNARY as readonly string[]).includes(op);
      const spent = remaining === 0;
      const active = isUnary
        ? s.affordance !== "transform" || s.transformOp === op
        : s.affordance === "operators";
      const enabled = !spent && (isUnary ? true : s.affordance === "operators");

      // §3.5: bold-active is ALWAYS paired with dim-inactive. Weight change
      // alone is easy to miss and poor for low-vision players.
      const size = Math.min(r.width, r.height);
      const lit = enabled && active;
      const opLift = this.lifts.get(OPERATOR_LIFT_KEY);
      const opRise = opLift && s.slots.op === op ? Math.sin(Math.PI * opLift.value) : 0;
      /*
       * SPENT is not the same as inactive (§9.6, ART_DIRECTION §5).
       *
       * A `-` with no budget left is gone for this level; a `-` waiting for a
       * number comes back the moment one is staged. They looked identical, and
       * on a board about spending finite operators that is the single most
       * important distinction the screen can draw. Spent loses its light.
       */
      const tokenState: TokenState = spent ? "unavailable" : lit ? "idle" : "disabled";
      const disc = operatorToken(size, LABEL[op] ?? op, {
        // §9.6: teal-slate whether it is available or not. Only its presence
        // changes — the disc goes flat and loses its shadow.
        fill: PALETTE.operator,
        text: PALETTE.tokenInk,
        bevel: lit ? 1 : DIM.bevel,
        elevation: lit ? 1 : DIM.elevation,
        outline: s.transformOp === op ? PALETTE.highlight : undefined,
      }, tokenState);
      // Spent keeps full opacity and loses its light; disabled keeps its light
      // and loses presence. Two different signals, never the same treatment.
      if (tokenState === "disabled") disc.alpha = DIM.alpha;
      if (tokenState === "unavailable") {
        disc.alpha = 0.85;
        disc.addChild(
          new Graphics()
            .roundRect(size * 0.16, size * 0.46, size * 0.68, 3, 1.5)
            .fill({ color: PALETTE.failed, alpha: 0.85 }),
        );
      }

      disc.pivot.set(size / 2, size / 2);
      disc.scale.set(1 + opRise * 0.07);
      this.entry(this.place(
        disc,
        r.x + r.width / 2,
        r.y + size / 2 - opRise * 4,
        spent
          ? undefined
          : isUnary
            ? () => this.emit({ type: "tapUnary", op: op as UnaryOp })
            : () => this.emit({ type: "tapOperator", op: op as BinaryOp }),
      ), BOARD_BANDS.operators);
    });

    // --- number pool ---
    const inSlot = new Set([s.slots.leftTileId, s.slots.rightTileId].filter((v) => v !== null));
    // Branch elimination strikes out the tiles of the fatal option; the
    // keystone warning pulses the tiles that make the starved target.
    const hinted = new Set(s.hints.flatMap((h) => h.tileIds));
    const pulsed = new Set(s.warning?.keystoneTileIds ?? []);

    /*
     * Indexed by the tile's FIXED position in the level's pool (§9.3).
     *
     * This loop used to walk only the live tiles with its own counter, which
     * re-packed the grid on every commit — the board rearranged itself under
     * the player between moves, in a game whose skill is holding a multi-move
     * plan. Now every tile owns its slot for the level and a spent one leaves
     * a hole.
     */
    for (const [index, tile] of s.tiles.entries()) {
      const r = poolSlot(index, pool, board.grid);

      if (tile.consumed) {
        this.entry(this.place(ghostSlot(r.width, r.height), r.x, r.y), BOARD_BANDS.pool);
        continue;
      }
      // On its way home from the row: drawn as the flight, not here.
      if (this.flights.returningTile(tile.id)) {
        this.tileBounds.set(tile.id, { x: r.x, y: r.y, w: r.width, h: r.height });
        continue;
      }

      const transformable = s.transformableTileIds.includes(tile.id);
      const dimmed =
        s.affordance === "transform"
          ? !transformable
          : s.affordance === "operators" || inSlot.has(tile.id);

      /*
       * §9.5: the tile REWRITES ITSELF under a unary operator.
       *
       * It turns edge-on and comes back a different number, showing the old
       * value on the way out and the new one on the way back. The tile never
       * moves and is never swapped for another token, so the change itself is
       * the event rather than something arriving to replace it.
       */
      const rewrite = this.rewrites.get(tile.id);
      const turned = rewrite ? Math.abs(Math.cos(Math.PI * rewrite.tween.raw)) : 1;
      const halfway = rewrite ? rewrite.tween.raw >= 0.5 : true;
      const shown = rewrite && !halfway ? rewrite.from : tile.value;

      // Press feedback: it comes up toward the viewer and settles back.
      const lift = this.lifts.get(tile.id);
      const rise = lift ? Math.sin(Math.PI * lift.value) : 0;

      /*
       * §9.6: dim is LESS PRESENCE, not a different substance.
       *
       * Same fill, same ink. What a dimmed tile gives up is opacity, its
       * shadow and its rim light — so it lies flat on the tray instead of
       * sitting on it, which reads as "not pickable" without introducing a
       * grey that is nowhere else in the palette.
       */
      const token = numberTile(r.width, r.height, String(shown), {
        fill: (rewrite ? halfway : tile.transformed)
          ? PALETTE.tileTransformed
          : PALETTE.tile,
        text: PALETTE.tokenInk,
        bevel: dimmed ? DIM.bevel : 1,
        // A lifted tile sits above the surface, so its shadow grows with it.
        elevation: dimmed ? DIM.elevation : 1 + rise * 1.6,
        outline:
          transformable || pulsed.has(tile.id) || hinted.has(tile.id)
            ? PALETTE.highlight
            : undefined,
      }, "idle", tile.id);
      if (dimmed) token.alpha = DIM.alpha;

      // Scale about the tile's own centre so it grows in place rather than
      // drifting toward its bottom-right corner.
      const grow = 1 + rise * 0.07;
      token.pivot.set(r.width / 2, r.height / 2);
      token.scale.set(grow * turned, grow);

      this.entry(
        this.place(
          token,
          r.x + r.width / 2,
          r.y + r.height / 2 - rise * 5,
          () => this.emit({ type: "tapTile", id: tile.id }),
        ),
        BOARD_BANDS.pool,
      );
      this.tileBounds.set(tile.id, { x: r.x, y: r.y, w: r.width, h: r.height });
    }

    this.drawFlights();

    // Ghosts are drawn in the pool loop above, straight from `tile.consumed`.
    // They used to be a list of bounds recorded when a shatter fired, which was
    // both redundant — the state already says which tiles are spent — and
    // unable to survive a reload, since a level resumed mid-play had no shatter
    // history to replay.

    // --- economy HUD. GDD §7.6: gated systems are ABSENT before their
    // unlock, never greyed out — a greyed shop still teaches "not for me".
    const eco = s.economy;
    const u = s.unlocks;
    if (eco) {
      // Lives: absent entirely until 2-8 (§7.6), and off in World 1 (§7.2).
      if (u.lives && eco.livesActive) {
        // §8: brass pocket-watches, not hearts. Lives refill on a timer.
        const size = 14;
        const watches = emblemMeter("life", eco.lives, eco.maxLives, size);
        watches.position.set(lane.x + 8, lane.y + 6);
        this.root.addChild(watches);

        const hud = this.text(
          `${eco.lives}/${eco.maxLives}`,
          14,
          eco.lives === 0 ? PALETTE.failed : PALETTE.text,
        );
        hud.position.set(lane.x + 8 + meterWidth(eco.maxLives, size) + 8, lane.y + 6);
        this.root.addChild(hud);
      }

      /*
       * ONE star reading, not three.
       *
       * The header carried three at once: filled glyphs for this level's best,
       * a running total, and a separate "this run" line. Three ways to say
       * three stars, in two type sizes and two colours, none of which told the
       * player anything the others did not.
       *
       * What survives is the only one that is LIVE and actionable — what this
       * attempt is currently worth, which falls as failures and hints are
       * spent. The best-ever and the banked total are meta-progression and
       * belong on a map screen, not on the board. Drawn in gold, because §9.6
       * gives gold to "earned" and this is the earning in progress.
       */
      if (u.starCounter) {
        const earned = s.phase === "won" ? eco.bestStars : eco.starsIfCleared;
        const size = 15;
        const stars = emblemMeter("star", earned, 3, size);
        stars.position.set(lane.x + lane.width - 8 - meterWidth(3, size), lane.y + 6);
        this.root.addChild(stars);
      }

      if (eco.firstFailureExempt) {
        const exempt = this.text("free first failure — no life lost", 12, PALETTE.highlightInk);
        exempt.anchor.set(1, 0);
        exempt.position.set(lane.x + lane.width - 8, lane.y + 26);
        this.root.addChild(exempt);
      }

      // Out of lives (GDD §5.2, §13). A designed screen, not a line of text.
      if (eco.lockedOut) this.drawOutOfLives(lane, eco);
    }

    // --- status line + restart ---
    // §9.4: no "no solution exists" text. During play this line carries
    // rejections and confirmations; on failure the board has already said it.
    const banner = s.phase === "failed" ? "" : (this.rejection ?? s.message ?? "");
    // Gold is the only accent, so "earned" is gold ink even in the status line.
    const colour = s.phase === "won" ? PALETTE.highlightInk : PALETTE.textDim;

    const statusText = this.text(banner, 15, colour);
    statusText.position.set(status.x, status.y);
    this.root.addChild(statusText);

    const meta = this.text(
      `${s.levelId}  ${s.mode}  target ${Math.min(s.targetIndex + 1, s.targets.length)}/${s.targets.length}  fails ${s.failures}`,
      12,
      PALETTE.textDim,
    );
    meta.position.set(status.x, status.y + 22);
    this.root.addChild(meta);

    /*
     * The build string, and the way telemetry gets off a phone (§7.8).
     *
     * LONG-PRESS, not a visible button: the funnel is a development concern and
     * a player should never find an "export data" control on the board. A build
     * string is something a playtester needs to see anyway, so it costs no
     * extra pixels and the gesture is discoverable only if you were told.
     */
    const build = this.text(this.buildLabel, 10, PALETTE.textDim);
    build.anchor.set(1, 0);
    build.position.set(status.x + status.width, status.y + 22);
    build.alpha = 0.7;
    build.eventMode = "static";
    build.cursor = "pointer";

    let held: ReturnType<typeof setTimeout> | null = null;
    const cancel = (): void => {
      if (held !== null) clearTimeout(held);
      held = null;
    };
    build.on("pointerdown", () => {
      cancel();
      held = setTimeout(() => this.emit({ type: "exportTelemetry" }), 600);
    });
    build.on("pointerup", cancel);
    build.on("pointerupoutside", cancel);
    build.on("pointercancel", cancel);
    this.root.addChild(build);

    this.root.addChild(
      this.box(
        status.x + status.width - 90,
        status.y + 8,
        90,
        32,
        PALETTE.slotFilled,
        "restart",
        // §9.4 forbids a banner, not a designed way out. On failure the one
        // control that matters takes the gold the game uses for "ready", so
        // the recovery affordance is findable without the board narrating a
        // loss the player can already see.
        s.phase === "failed" ? PALETTE.highlight : PALETTE.tokenInk,
        () => this.emit({ type: "tapRestart" }),
        s.phase === "failed" ? PALETTE.highlight : undefined,
      ),
    );

    // The way back to the map, ABSENT until 1-10 is cleared (§7.6). A door to a
    // room that does not exist yet is exactly the "not for me" the schedule
    // exists to prevent.
    if (u.worldMap) {
      // The mode selector claims the left of this row when it is unlocked
      // (3 chips of 62 + 6). Sit after it rather than on top of it.
      const modesWidth = u.modeSelector ? 3 * 68 : 0;
      this.root.addChild(
        this.box(
          status.x + modesWidth,
          status.y + 44,
          72,
          26,
          PALETTE.slotFilled,
          "map",
          PALETTE.tokenInk,
          () => this.emit({ type: "tapMap" }),
        ),
      );
    }

    // --- hints already owned, re-shown free after a restart (GDD §13) ---
    // Their own band, sized to how many are owned, so they neither overlap the
    // pool on a small board nor reserve a strip nobody is using.
    s.hints.forEach((hint, i) => {
      const gem = 18;
      const mark = hintDiamond(gem);
      mark.position.set(board.hints.x + 4 + gem / 2, board.hints.y + i * HINT_LINE_H + 9);
      this.root.addChild(mark);

      const label = this.text(hint.text, 12, PALETTE.highlightInk);
      label.position.set(board.hints.x + 4 + gem + 6, board.hints.y + i * HINT_LINE_H + 2);
      this.root.addChild(label);
    });

    // --- hint shop: absent before 3-6 (§7.6) ---
    if (u.hintShop && eco) {
      this.root.addChild(
        this.box(
          status.x + status.width - 190,
          status.y + 8,
          92,
          32,
          PALETTE.slotFilled,
          `hints ${eco.starsAvailable}`,
          // Open is an "armed" state, so it is gold — the only accent (§9.6).
          s.shopOpen ? PALETTE.highlight : PALETTE.tokenInk,
          () => this.emit({ type: "toggleShop" }),
          undefined,
          "idle",
          () => star(11),
        ),
      );

      if (s.shopOpen) {
        // A card laid on the desk, anchored above the status band rather than
        // inside the pool: the pool is only one row tall on a small board and
        // the panel would have hung off the top of it.
        // Full band width, not the pool's — the pool now hugs its grid and can
        // be as narrow as three tiles, which is no width for a shop.
        const panelH = 30 + s.shop.length * 40;
        const panelY = status.y - panelH - 8;
        this.root.addChild(
          this.entry(
            new Graphics()
              .roundRect(status.x, panelY, status.width, panelH, 8)
              .fill({ color: PALETTE.card, alpha: 0.98 })
              .roundRect(status.x, panelY, status.width, panelH, 8)
              .stroke({ width: 2, color: PALETTE.highlightInk }),
            BOARD_BANDS.furniture,
          ),
        );
        const title = this.text("hints — none reveals a keystone", 12, PALETTE.textDim);
        title.position.set(status.x + 8, panelY + 7);
        this.root.addChild(this.entry(title, BOARD_BANDS.pool));

        /*
         * DESIGNED EMPTY STATE (§9.0). With nothing affordable the shop used to
         * be three greyed rows, which §7.6 names as the exact thing to avoid —
         * a greyed shop teaches "this is not for me". It now says how to earn
         * the stars instead, which is a route rather than a wall.
         */
        if (s.shop.every((e) => !e.owned && !e.affordable)) {
          const how = this.text("clear levels with fewer failures to earn stars", 11, PALETTE.textDim);
          how.anchor.set(0.5, 0);
          how.position.set(DESIGN.width / 2, panelY + panelH - 16);
          how.alpha = 0.8;
          this.root.addChild(this.entry(how, BOARD_BANDS.status));
        }

        s.shop.forEach((entry, i) => {
          const y = panelY + 26 + i * 40;
          const enabled = entry.owned || entry.affordable;
          // Owned is "earned", so it is gold on the dark chip. Unaffordable is
          // the same chip under the dim treatment, not a greyer chip.
          // Cannot afford it: UNAVAILABLE, not disabled. It will not become
          // buyable by waiting — only by earning stars elsewhere.
          const row = this.box(
            status.x + 8,
            y,
            status.width - 16,
            34,
            PALETTE.slotFilled,
            `${entry.label}   ${entry.owned ? "owned" : `${entry.cost}`}`,
            entry.owned ? PALETTE.highlight : PALETTE.tokenInk,
            () => this.emit({ type: "buyHint", hint: entry.type }),
            undefined,
            enabled ? "idle" : "unavailable",
            entry.owned ? undefined : () => star(11),
          );
          this.root.addChild(this.entry(row, BOARD_BANDS.equation));
        });
      }
    }

    // --- mode selector: absent before 3-10 (§7.6) ---
    if (u.modeSelector) {
      const modes: Mode[] = ["casual", "normal", "expert"];
      modes.forEach((mode, i) => {
        const w = 62;
        const x = status.x + i * (w + 6);
        const active = s.mode === mode;
        this.root.addChild(
          this.box(
            x,
            status.y + 44,
            w,
            26,
            active ? PALETTE.slotFilled : PALETTE.slot,
            mode,
            // The selected mode is an "armed" state: gold on the dark chip.
            active ? PALETTE.highlight : PALETTE.textDim,
            () => this.emit({ type: "selectMode", mode }),
          ),
        );
      });
    }

    // --- blocked fatal move (GDD §6 Casual, §7.5 the scripted trap) ---
    if (s.warning) {
      const w = s.warning;
      const panelY = lane.y + 40;
      this.root.addChild(
        new Graphics()
          .roundRect(lane.x + 6, panelY, lane.width - 12, 150, 8)
          .fill({ color: PALETTE.card, alpha: 0.97 })
          .roundRect(lane.x + 6, panelY, lane.width - 12, 150, 8)
          .stroke({ width: 3, color: PALETTE.highlightInk }),
      );

      // §7.5 step 3: one line of text. Not a modal, not a chain of Next.
      const line = this.text(w.line, 19, PALETTE.text);
      line.anchor.set(0.5);
      line.position.set(DESIGN.width / 2, panelY + 34);
      this.root.addChild(line);

      const refused = this.text(
        w.scripted ? `${w.move} looks right. It is not.` : `${w.move} loses the level.`,
        13,
        PALETTE.textDim,
      );
      refused.anchor.set(0.5);
      refused.position.set(DESIGN.width / 2, panelY + 62);
      this.root.addChild(refused);

      if (w.scripted) {
        const free = this.text(
          "rewound free — no star, no life, no failure",
          12,
          PALETTE.highlightInk,
        );
        free.anchor.set(0.5);
        free.position.set(DESIGN.width / 2, panelY + 84);
        this.root.addChild(free);
      }

      this.root.addChild(
        this.box(
          DESIGN.width / 2 - 60,
          panelY + 104,
          120,
          32,
          PALETTE.slotFilled,
          w.scripted ? "let me look" : "got it",
          PALETTE.tokenInk,
          () => this.emit({ type: "dismissWarning" }),
        ),
      );
    }

    // GDD §9.4: NO failure banner. The lane rejecting the number is the
    // message, and it is legible on the board — the front target shudders,
    // refuses to advance, and the pool visibly cannot feed it. Text is a
    // fallback for when the visual fails, not the primary channel.
    //
    // A win still needs an exit, so the cleared state offers one quietly.
    if (s.phase === "won") {
      // Tall enough to seat the headline AND the stars: at 60 the stars
      // straddled the bottom edge, which read as an overflow rather than as a
      // tally.
      const bannerH = 92;
      const bannerY = lane.y + lane.height / 2 - bannerH / 2;
      const bannerX = lane.x + 20;
      const bannerW = lane.width - 40;

      /*
       * §9.6: navy and gold, and made of the same material as everything else.
       *
       * It was a flat green rectangle — a placeholder wearing the one colour in
       * the game that meant nothing. As a navy plate with the token lighting
       * and the shared grain, the reward panel reads as the same kind of object
       * as the plates the player just spent their tiles on, and gold does the
       * work it does everywhere else.
       */
      const panel = new Graphics()
        .roundRect(bannerX, bannerY, bannerW, bannerH, 10)
        .fill({ color: PALETTE.targetPlate, alpha: 0.96 });
      // Same lighting as the tokens: shadow along the top, rim light beneath.
      panel
        .moveTo(bannerX + 10, bannerY + 2)
        .lineTo(bannerX + bannerW - 10, bannerY + 2)
        .stroke({ width: 3, color: 0x000000, alpha: 0.3 });
      panel
        .moveTo(bannerX + 10, bannerY + bannerH - 2)
        .lineTo(bannerX + bannerW - 10, bannerY + bannerH - 2)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.14 });
      panel
        .roundRect(bannerX, bannerY, bannerW, bannerH, 10)
        .stroke({ width: 2, color: PALETTE.highlight, alpha: 0.55 });
      // THE PANEL ARRIVES FIRST. It used to pop in instantly beneath its own
      // staggered stars, so the best motion in the game was landing inside a
      // container that had not itself arrived.
      this.root.addChild(this.entry(panel, CLEARED_BANDS.panel, true));

      const headline = this.text("CLEARED", 24, PALETTE.highlight);
      headline.anchor.set(0.5);
      headline.position.set(DESIGN.width / 2, bannerY + 28);
      this.root.addChild(this.entry(headline, CLEARED_BANDS.headline, true));

      // A hairline under the headline, so the stars sit in a tray of their own
      // rather than floating in the middle of the panel.
      this.root.addChild(
        new Graphics()
          .moveTo(bannerX + 40, bannerY + 46)
          .lineTo(bannerX + bannerW - 40, bannerY + 46)
          .stroke({ width: 1, color: PALETTE.highlight, alpha: 0.3 }),
      );
      // The rule is drawn straight to root above; band it with the headline's
      // successor so the sequence reads panel -> headline -> rule -> stars.
      this.entry(this.root.children[this.root.children.length - 1]!, CLEARED_BANDS.rule, true);

      /*
       * §9.5: stars arrive ONE AT A TIME, weighted.
       *
       * Each is staggered behind the last and settles in from slightly oversize
       * rather than popping or spraying. Three landing at once would be a
       * celebration; three landing in sequence is a tally being counted out,
       * which is the register this game earns its reward in.
       */
      this.starArrivals.forEach((arrival, i) => {
        if (!arrival.started) return;
        const glyph = star(26);
        const spread = 34;
        const x = DESIGN.width / 2 + (i - (this.starArrivals.length - 1) / 2) * spread;
        // Comes in oversize and settles down onto the banner.
        glyph.scale.set(lerp(1.9, 1, arrival.value));
        glyph.alpha = Math.min(1, arrival.raw * 3);
        glyph.position.set(x, bannerY + 66);
        this.root.addChild(this.entry(glyph, CLEARED_BANDS.stars, true));
      });

      this.root.addChild(
        this.box(
          DESIGN.width / 2 - 60,
          bannerY + bannerH + 12,
          120,
          34,
          PALETTE.slotFilled,
          "replay",
          PALETTE.tokenInk,
          () => this.emit({ type: "tapRestart" }),
        ),
      );
    }

    // Failure adds no button of its own: `restart` already sits in the status
    // band, and a second control over the equation row both collides with it
    // and re-narrates a loss the board has already communicated (§9.4).

    // Equation band backdrop drawn last would cover the row, so draw beneath.
    // Same white veil as the lane: one derived value, not three tuned ones.
    this.root.addChildAt(
      new Graphics()
        .roundRect(equation.x, equation.y, equation.width, equation.height, 8)
        .fill({ color: BACKDROP.colour, alpha: BACKDROP.alpha }),
      1,
    );
    const operatorTray = feltLinedTray(
      operators.width + 12,
      operators.height + 12,
      PALETTE.tray,
      TRAY_ALPHA,
      PALETTE.felt,
    );
    operatorTray.position.set(operators.x - 6, operators.y - 6);
    this.root.addChildAt(this.entry(operatorTray, BOARD_BANDS.furniture), 2);

    // The felt is the physical surface behind every number tile, and the same
    // opaque lining measured by the real-art brightness gate.
    const tray = feltLinedTray(pool.width, pool.height + 12, PALETTE.tray, TRAY_ALPHA, PALETTE.felt);
    tray.position.set(pool.x, pool.y - 6);
    this.root.addChildAt(this.entry(tray, BOARD_BANDS.furniture), 2);
  }
}
