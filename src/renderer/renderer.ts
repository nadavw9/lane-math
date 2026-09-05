import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture, Rectangle } from "pixi.js";

import type { BinaryOp, UnaryOp } from "../solver/index.js";
import type { Command, InputEvent, ViewState } from "../game/types.js";
import {
  automaton,
  automatonMotionOnEnter,
  automatonState,
  sampleAutomatonMotion,
  THINKING_AFTER_MS,
  type AutomatonMotionKind,
} from "./automaton.js";
import {
  DESIGN,
  DIM,
  debugChrome,
  LANE_FELT_ALPHA,
  HINT_LINE_H,
  PALETTE,
  SAFE_TOP,
  TRAY_ALPHA,
  type Bands,
  type Rect,
  bands,
  equationSlot,
  operatorSlot,
  poolSlot,
  statusRows,
  targetSlot,
} from "./layout.js";
import { button, type ButtonState, type ButtonVariant } from "./button.js";
import { armCueFor } from "./arm-cue.js";
import { queueLookSample, queueSweepSample, teachCueSample } from "./teach-cue.js";
import { armHaptic } from "./haptics.js";
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
import { SCRIPTED_TRAP_BEAT_MS, sampleScriptedTrapBeat, startsScriptedTrapBeat } from "./scripted-trap.js";
import { EASE, TIMING, Tween, effectSpeed, lerp, shudder } from "./tween.js";
import { starsForClear } from "./star-sync.js";
import {
  emptySlot,
  framedPanel,
  ghostPlaque,
  ghostSlot,
  numberTile,
  operatorToken,
  UI_FONT,
  setGrainTexture,
  targetPlate,
  commitKey,
  feltLinedTray,
} from "./tokens.js";


const BINARY: readonly BinaryOp[] = ["+", "-", "*", "/"];
const UNARY: readonly UnaryOp[] = ["sqrt", "sq"];
/** Tile ids are non-negative, so a negative key can never collide with one. */
const OPERATOR_LIFT_KEY = -1;
/** Keep the first board focused on the lane until its first clear. */
export function isFirstClearTeach(levelId: string, cleared: boolean): boolean {
  return levelId === "1-01" && !cleared;
}


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
 * Put a Director-built expression into the glyphs the BOARD uses.
 *
 * The Director composes "8 - 4" from the operator's own ASCII key, which is
 * correct — that string is data, and the mapping from `-` to U+2212 is a
 * display decision that belongs here with the rest of them. Without this the
 * warning panel quoted the player's move back at them with a hyphen while the
 * dial they had just pressed showed a minus, which reads as a different move.
 */
const asBoardGlyphs = (expression: string): string =>
  expression
    .split(" ")
    .map((token) => LABEL[token] ?? token)
    .join(" ");

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
  /**
   * Milliseconds since the player last did anything, for the automaton's
   * thinking state (ART_DIRECTION §2). Reset by every INPUT rather than by
   * every state change: a re-render the player did not cause — an effect
   * settling, a tick — is not evidence that they are still with it.
   */
  private idleMs = 0;

  /** Where each live tile is drawn, so a shatter can start from the right place. */
  private readonly tileBounds = new Map<number, { x: number; y: number; w: number; h: number }>();
  private readonly shatters: Shatter[] = [];
  private reject: RejectPulse | null = null;
  private rejectOffset = { dx: 0, dy: 0, glow: 0 };
  private lastPhase: string = "playing";
  /** Build id shown in the status band; long-pressing it exports the funnel. */
  private buildLabel = "";
  private nextLevelId: string | null = null;
  /** The single real PNG used for every FTUE hand cue. */
  private ftueHandTexture!: Texture;

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
  /** One physical beat connecting the clear tally to meta progress. */
  private clearProgressBeat: Tween | null = null;
  /**
   * Brass automaton one-shot win/fail motion. Progress only — draw() samples
   * it onto a fresh sprite each frame (same pattern as lifts / laneAdvance).
   */
  private automatonFeel: { kind: AutomatonMotionKind; tween: Tween } | null = null;
  /** One renderer-clock phase for the currently armed swap operand. */
  private armCueMs = 0;
  private teachCueMs = 0;
  /**
   * Hit-stop (§9.5): the board holds the PRE-commit frame for a beat so the
   * payoff lands. The new state is parked here rather than drawn, which is the
   * only way the hold reads as a hold — swapping the state and delaying only
   * the shatter would show the tiles already gone.
   */
  private hold: { next: ViewState; remainingMs: number } | null = null;
  /** 1-04 keeps the tempting commit on screen while the later target speaks. */
  private scriptedTrap: { next: ViewState; elapsedMs: number } | null = null;

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
  private levelIntro: { hint: string | null; message: string | null } | null = null;
  private clearedEntrance: Entrance | null = null;

  private get rejecting(): boolean {
    return this.reject !== null;
  }

  /**
   * Has §9.4's refusal finished PLAYING?
   *
   * Not the same question as `rejecting`, and the difference is load-bearing.
   * `this.reject` is cleared only on a level change or a rewind, never when the
   * pulse ends — deliberately, because §9.6 says the refused state must keep
   * reading after the board settles, which is why the front target stays red.
   * So `rejecting` means "this level is in its refused state", which is true
   * forever, and gating the options on it would have hidden them permanently.
   */
  private get rejectSettled(): boolean {
    return this.reject === null || this.reject.finished;
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
  /**
   * Put the world's room behind the board (§9.1, ART_DIRECTION §5).
   *
   * THIS WAS A STUB. It set a field, cleared the layer and returned, so the
   * game painted flat `PALETTE.placeholderDesk` and every background the
   * pipeline produced went unshipped. `coverfit.test.ts` describes this
   * method's arithmetic and passed the whole time, because it reimplements the
   * cover-fit locally rather than calling it — a test of a function that did
   * not exist.
   *
   * COVER, not contain: the source is 900x2100 and the design surface 420x900,
   * so the fit crops 40px from the top and bottom rather than letterboxing the
   * desk. §9.1 puts the visual interest at the EDGES of the composition and
   * pushes the centre low-detail, which is what makes a symmetric crop safe.
   */
  async setWorld(world: number): Promise<void> {
    if (this.world === world) return;
    this.world = world;
    this.background.removeChildren();

    try {
      const url = `${import.meta.env.BASE_URL}assets/bg/world-${world}.webp`;
      const texture = await Assets.load<Texture>(url);
      // A later call may have won while this was loading.
      if (this.world !== world) return;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const scale = Math.max(
        DESIGN.width / texture.width,
        DESIGN.height / texture.height,
      );
      sprite.scale.set(scale);
      sprite.position.set(DESIGN.width / 2, DESIGN.height / 2);
      this.background.addChild(sprite);
    } catch {
      /*
       * The flat desk stays visible underneath, which is the state the game
       * already shipped in — so a failed background is a missing room, not a
       * blank screen. Silent by design here and NOT silent in CI: the asset
       * gate is what catches a 404, because a fallback that looks deliberate is
       * exactly how the sprite atlas shipped broken once already.
       */
    }
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

    // The FTUE hand is authored art, not a collection of Pixi primitives.
    // Keep this load independent of the optional token atlas path: the teach
    // cue must never regress to the old ellipse/roundRect silhouette.
    this.ftueHandTexture = await Assets.load<Texture>(
      `${import.meta.env.BASE_URL}assets/ui/ftue-pointing-hand@2x.png`,
    );

    /*
     * The sprite path (ART_DIRECTION §5), off unless asked for.
     *
     * Loading the atlas is not the same as enabling it: a family that fails to
     * load leaves every token on the procedural path, which is the state the
     * game already ships in, so there is nothing to fall back FROM.
     */
    if (spritesEnabled()) {
      const loaded = await Promise.all(
        ["tiles", "operators", "operators-unlit", "plaques", "automaton", "academy-warm", "academy-cool", "drape"].map((family) =>
          loadAtlas(family, import.meta.env.BASE_URL),
        ),
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
      /*
       * visualViewport, NOT innerHeight.
       *
       * innerHeight includes the strip hidden behind mobile browser chrome, so
       * it reports a taller window than the player can actually see and the
       * board scales to a height that is partly off-screen. visualViewport
       * reports what is visible right now, and it CHANGES as the address bar
       * slides away — which is why both of its events are handled below and not
       * just window resize.
       */
      const vv = window.visualViewport;
      const availableW = vv ? vv.width : window.innerWidth;
      const availableH = vv ? vv.height : window.innerHeight;

      /*
       * The safe-area insets are applied to the body as padding, so the host's
       * own box is already inset-corrected — but only along axes where the body
       * actually got the space. Taking the smaller of the two keeps the board
       * clear of a notch and a gesture bar without trusting either measurement
       * alone.
       */
      const box = host.getBoundingClientRect();
      const width = Math.min(availableW, box.width || availableW);
      const height = Math.min(availableH, box.height || availableH);

      // The design surface scales UNIFORMLY. §9.1 spans 16:9 to 21:9 and the
      // board is laid out for one aspect, so the spare axis is letterboxed
      // rather than stretched — a stretched board would put the tap targets
      // somewhere other than where they are drawn.
      const scale = Math.min(height / DESIGN.height, width / DESIGN.width);
      this.app.canvas.style.width = `${Math.floor(DESIGN.width * scale)}px`;
      this.app.canvas.style.height = `${Math.floor(DESIGN.height * scale)}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    /*
     * Chrome hiding and revealing does not always fire a window resize, and on
     * iOS it fires `scroll` on the visual viewport instead. Both, or the board
     * stays sized for the layout the page had when it loaded.
     */
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
  }

  onInput(handler: (input: InputEvent) => void): void {
    this.emit = (input: InputEvent) => {
      this.idleMs = 0;
      handler(input);
    };
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

  beginLevelIntro(): void {
    this.levelIntro = { hint: null, message: null };
    this.draw();
  }

  setLevelIntroHint(hint: string | null, message: string | null = null): void {
    if (!this.levelIntro) return;
    this.levelIntro = { hint, message };
    this.draw();
  }

  endLevelIntro(): void {
    this.levelIntro = null;
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
   * Which level follows this one, or null at the end of the ladder.
   *
   * Set by the shell because the Director does not know the ladder — it knows
   * ONE level and its rules. The cleared panel needs the answer to decide
   * whether "next level" is a button or a sentence.
   */
  setNextLevel(id: string | null): void {
    this.nextLevelId = id;
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
      scriptedTrap: this.scriptedTrap
        ? { phase: sampleScriptedTrapBeat(this.scriptedTrap.elapsedMs).phase, progress: Number((this.scriptedTrap.elapsedMs / SCRIPTED_TRAP_BEAT_MS).toFixed(3)) }
        : null,
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
      clearProgressBeat: this.clearProgressBeat ? Number(this.clearProgressBeat.raw.toFixed(3)) : null,
      automaton: this.automatonFeel
        ? { kind: this.automatonFeel.kind, at: Number(this.automatonFeel.tween.raw.toFixed(3)) }
        : null,
      shatters: this.shatters.length,
    };
  }

  /**
   * Review / proof harness only: drop live shatter debris so the brass
   * companion stays readable mid-hop / mid-slump. Does not touch automatonFeel
   * or motion timing — production play is unchanged.
   */
  clearShatters(): void {
    for (const shatter of this.shatters) {
      shatter.container.destroy({ children: true });
    }
    this.shatters.length = 0;
    this.fx.removeChildren();
  }

  // Review harness: force the scripted teaching state to its settled warning.
  settleScriptedTrap(): void {
    if (this.scriptedTrap) {
      const { next } = this.scriptedTrap;
      this.scriptedTrap = null;
      this.commitState(next);
    }
    this.draw();
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

        // 1-04 is a teaching pause, not a modal that appears after the fact.
        // Keep the filled equation on screen while the lane focus treatment
        // explains the reservation; the Director state is adopted afterwards.
        if (this.state !== null && startsScriptedTrapBeat(this.state, command.state)) {
          this.scriptedTrap = { next: command.state, elapsedMs: 0 };
          continue;
        }

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
    return this.hold !== null || this.scriptedTrap !== null;
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

    if (previous.swapArmedSlot !== next.swapArmedSlot) {
      this.armCueMs = 0;
      void armHaptic(previous.swapArmedSlot, next.swapArmedSlot);
    }

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
    // Closing Go Back must also clear the underlay reaction, not only the modal.
    if (previous.warning !== null && next.warning === null) {
      this.reject = null;
      this.rejection = null;
      this.resist = null;
    }

    // §9.5: stars arrive ONE AT A TIME, weighted. Staggered delays rather than
    // a burst — three stars landing together is a spray, which is the register
    // this game does not use.
    if (next.phase === "won" && this.lastPhase !== "won") {
      const earned = starsForClear(next.economy);
      this.clearedEntrance = new Entrance(Object.keys(CLEARED_BANDS).length);
      this.clearProgressBeat = new Tween(TIMING.clearProgressBeat, (t) => t);
      this.starArrivals = Array.from(
        { length: earned },
        (_, i) => new Tween(TIMING.starArrive, EASE.settle, i * TIMING.starGap),
      );
    }

    // Brass companion: one restrained hop on win, one soft droop on fail.
    // Pose still comes from automatonState; this is the physical beat only.
    const companionMotion = automatonMotionOnEnter(this.lastPhase, next.phase);
    if (companionMotion === "jump") {
      this.automatonFeel = { kind: "jump", tween: new Tween(TIMING.automatonJump, (t) => t) };
    } else if (companionMotion === "droop") {
      this.automatonFeel = { kind: "droop", tween: new Tween(TIMING.automatonDroop, (t) => t) };
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
        // The scripted trap's teaching beat already showed the staged equation;
        // its settled warning is the rewind destination, not a second tile
        // flight underneath the Go Back panel.
        if (next.warning?.scripted) continue;

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
    this.clearProgressBeat = null;
    this.automatonFeel = null;
    this.armCueMs = 0;
    this.hold = null;
    this.scriptedTrap = null;
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
    // PE-04: brand-scale concerned hero (#6) on master SAFE_TOP/cartouche seating
    // (#8). Taller panel so wait line stays inside the felt well above the frame.
    const height = 284;
    const x = lane.x + 12;
    /*
     * The framedPanel cartouche protrudes ABOVE the outer edge. Preferred seat
     * is lane-centred, but never so high that the cartouche (star gem) sits
     * under phone status chrome — Nadav phone-eye: top star/count half-hidden.
     */
    const border = Math.max(12, Math.min(width, height) * 0.075);
    // Cartouche protrudes border*0.38 above the panel; keep honest air above that.
    const cartoucheClear = border * 0.38 + 16;
    const minY = SAFE_TOP + cartoucheClear;
    const preferredY = lane.y + lane.height / 2 - height / 2;
    const maxY = Math.max(minY, lane.y + lane.height - height - 4);
    const y = Math.min(Math.max(preferredY, minY), maxY);

    /*
     * BRASS OVER FELT, like every other panel (§9.0).
     *
     * This was a flat navy card with a gold stroke — the third instance of the
     * same defect, after the warning panel and the hint shop. Each time the fix
     * was applied where the bug was pointed at rather than everywhere the rule
     * held, which is the pattern CLAUDE.md now names.
     */
    const framed = framedPanel(width, height);
    framed.panel.position.set(x, y);
    this.root.addChild(this.entry(framed.panel, BOARD_BANDS.furniture));

    // Content against the OPENING, not the outer brass — keeps copy off the frame.
    const inner = framed.interior;
    const contentLeft = x + inner.x;
    const contentTop = y + inner.y;
    const contentW = inner.width;
    const contentBottom = y + inner.y + inner.height;

    /*
     * THE AUTOMATON'S SEAT (ART_DIRECTION §2, concerned state).
     *
     * Laid out now and filled with art later, rather than retrofitted: this
     * screen is one of the four roles §2 names for the character, and the
     * difference between a layout designed around a face and one with a face
     * dropped into it afterwards is visible.
     */
    // PE-04: brand-scale concerned pose beside the copy — not a postage stamp.
    // PE-04 size from #6; seat coords from #8 (interior, not outer brass).
    const seat = 128;
    const seatX = contentLeft + 8;
    const seatY = contentTop + 10;
    // §2's table calls this state "Concerned"; the sheet ships it as `worried`.
    const placeholder = spriteFor("automaton-worried");
    if (placeholder) {
      const art = new Sprite(placeholder.texture);
      // Keep aspect — square stretch made the hero look wrong at larger seat.
      const natW = Math.max(1, placeholder.frame.w);
      const natH = Math.max(1, placeholder.frame.h);
      const scale = seat / Math.max(natW, natH);
      art.width = natW * scale;
      art.height = natH * scale;
      art.position.set(seatX + (seat - art.width) / 2, seatY + (seat - art.height) / 2);
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

    const copyX = seatX + seat + 14;
    const headline = this.text("Out of lives", 20, PALETTE.highlight);
    headline.position.set(copyX, seatY + 18);
    this.root.addChild(this.entry(headline, BOARD_BANDS.operators));

    const minutes = Math.floor(eco.msUntilNextLife / 60000);
    const seconds = Math.floor((eco.msUntilNextLife % 60000) / 1000);
    const clock = eco.msUntilNextLife > 0
      ? `next life in ${minutes}:${String(seconds).padStart(2, "0")}`
      : "a life is on its way";
    const timer = this.text(clock, 14, PALETTE.tokenInk);
    timer.position.set(copyX, seatY + 48);
    this.root.addChild(this.entry(timer, BOARD_BANDS.operators));

    // §5.2's refill, and the first player-facing route to it. Until now
    // offerLifeForAd had no caller outside the debug harness.
    const actionY = seatY + seat + 16;
    this.root.addChild(
      this.entry(
        this.box(
          contentLeft + 10,
          actionY,
          contentW - 20,
          44,
          "Watch to Continue",
          () => this.emit({ type: "tapWatchAd" }),
          { variant: "primary" },
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
      note.position.set(DESIGN.width / 2, actionY + 52);
      note.alpha = 0.85;
      this.root.addChild(this.entry(note, BOARD_BANDS.equation));
    }

    /*
     * Wait copy stays FULLY inside the felt opening (phone-eye: it used to sit
     * on y+height-26 and straddle the brass border). Bottom-anchored into the
     * interior with a clear margin above the frame.
     */
    const wait = this.text("or wait — the timer is always running", 11, PALETTE.tokenInk);
    wait.anchor.set(0.5, 1);
    wait.position.set(x + inner.x + inner.width / 2, contentBottom - 18);
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
      // entry-exempt: a tile mid-flight to its slot, not part of the screen's arrival (§9.5)
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

    /*
     * The automaton starts thinking on a long pause. Only the CROSSING is a
     * redraw — accumulating every frame and redrawing on each would repaint the
     * whole board sixty times a second to change one sprite.
     */
    const wasThinking = this.idleMs >= THINKING_AFTER_MS;
    this.idleMs += deltaMs;
    if (!wasThinking && this.idleMs >= THINKING_AFTER_MS) dirty = true;

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

    // The scripted trap owns the longer teaching hold.
    if (this.scriptedTrap) {
      this.scriptedTrap.elapsedMs += deltaMs * effectSpeed();
      if (this.scriptedTrap.elapsedMs >= SCRIPTED_TRAP_BEAT_MS) {
        const { next } = this.scriptedTrap;
        this.scriptedTrap = null;
        this.commitState(next);
      }
      dirty = true;
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

    // The swap cue shares the renderer's clock and review-speed control. It is
    // intentionally the only continuously redrawn selection state.
    if (this.state?.swapArmedSlot !== null && this.state?.phase === "playing") {
      this.armCueMs += deltaMs * effectSpeed();
      dirty = true;
    }
    if (this.state?.teachingTarget && this.state.phase === "playing") {
      this.teachCueMs += deltaMs * effectSpeed();
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
    if (this.automatonFeel) {
      if (this.automatonFeel.tween.advance(deltaMs)) running = true;
      else this.automatonFeel = null;
    }
    if (this.clearProgressBeat && !this.clearProgressBeat.advance(deltaMs)) this.clearProgressBeat = null;
    if (this.clearProgressBeat) running = true;

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

  private drawScriptedTrapCommitHonesty(s: ViewState, board: Bands): void {
    const beat = this.scriptedTrap;
    if (!beat?.next.warning?.scripted) return;
    const stagedIds = [s.slots.leftTileId, s.slots.rightTileId].filter((id): id is number => id !== null);
    for (const id of stagedIds) {
      const index = s.tiles.findIndex((tile) => tile.id === id);
      if (index < 0) continue;
      const r = poolSlot(index, board.pool, board.grid);
      const cover = new Graphics().roundRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2, Math.min(r.width, r.height) * 0.22).fill({ color: PALETTE.felt, alpha: 1 });
      cover.eventMode = "none";
      this.root.addChild(this.entry(cover, BOARD_BANDS.pool));
      const hole = ghostSlot(r.width, r.height);
      hole.position.set(r.x, r.y);
      hole.eventMode = "none";
      this.root.addChild(this.entry(hole, BOARD_BANDS.pool));
    }
    const op = s.slots.op;
    if (op === null) return;
    const available = [...BINARY.filter((candidate) => s.budget[candidate] !== undefined), ...UNARY.filter((candidate) => s.budget[candidate] !== undefined)];
    const opIndex = available.indexOf(op);
    if (opIndex < 0) return;
    const r = operatorSlot(opIndex, available.length, board.operators, board.operatorGrid);
    const size = Math.min(r.width, r.height);
    const disc = operatorToken(size, LABEL[op] ?? op, { fill: PALETTE.operator, text: PALETTE.tokenInk, bevel: 0, elevation: 0 }, "unavailable", 0);
    disc.alpha = 0.85;
    disc.addChild(new Graphics().roundRect(size * 0.16, size * 0.46, size * 0.68, 3, 1.5).fill({ color: PALETTE.failed, alpha: 0.85 }));
    disc.pivot.set(size / 2, size / 2);
    disc.position.set(r.x + r.width / 2, r.y + size / 2);
    disc.eventMode = "none";
    this.root.addChild(this.entry(disc, BOARD_BANDS.operators));
  }

  /** Draw the 1-04 teach-by-doing beat while the Director state stays pre-rewind. */
  private drawScriptedTrapBeat(s: ViewState, board: Bands): void {
    const beat = this.scriptedTrap;
    const warning = beat?.next.warning;
    if (!beat || !warning?.scripted) return;

    const sample = sampleScriptedTrapBeat(beat.elapsedMs);
    this.drawScriptedTrapCommitHonesty(s, board);
    const lane = board.lane;
    const equation = board.equation;
    const pool = board.pool;
    const laterIndex = Math.max(s.targetIndex + 1, warning.keystoneTargetIndex ?? s.targetIndex + 1);
    const focusOffset = Math.max(1, laterIndex - s.targetIndex);
    const focusSlot = targetSlot(focusOffset, lane, board.grid);
    const frontSlot = targetSlot(0, lane, board.grid);
    const focusX = focusSlot.x + focusSlot.width / 2;
    const focusY = focusSlot.y + focusSlot.height / 2;
    const frontX = frontSlot.x + frontSlot.width / 2;
    const frontY = frontSlot.y + frontSlot.height / 2;

    const veil = new Graphics()
      .rect(lane.x, lane.y - 8, lane.width, Math.max(0, focusSlot.y - lane.y + 8))
      .rect(lane.x, focusSlot.y + focusSlot.height, lane.width, Math.max(0, pool.y + pool.height + 8 - focusSlot.y - focusSlot.height))
      .fill({ color: 0x120c08, alpha: 0.12 + sample.focus * 0.12 });
    veil.eventMode = "none";
    // entry-exempt: scripted trap focus veil arrives with the mid-commit beat.
    this.root.addChild(veil);

    // The brass path freezes halfway from the tempting equation to the lane.
    const path = new Graphics()
      .moveTo(equation.x + equation.width / 2, equation.y + equation.height / 2)
      .lineTo(frontX, frontY)
      .lineTo(focusX, focusY)
      .stroke({ width: 3, color: PALETTE.brassLit, alpha: 0.68 + sample.focus * 0.25 });
    path.eventMode = "none";
    // entry-exempt: scripted trap focus path arrives with the mid-commit beat.
    this.root.addChild(path);
    const commitMarker = new Graphics()
      .circle(lerp(equation.x + equation.width / 2, frontX, sample.commitProgress), lerp(equation.y + equation.height / 2, frontY, sample.commitProgress), 11)
      .fill({ color: PALETTE.highlight, alpha: 0.18 })
      .circle(lerp(equation.x + equation.width / 2, frontX, sample.commitProgress), lerp(equation.y + equation.height / 2, frontY, sample.commitProgress), 11)
      .stroke({ width: 2, color: PALETTE.highlight, alpha: 0.9 });
    commitMarker.eventMode = "none";
    // entry-exempt: paused commit marker arrives with the mid-commit beat.
    this.root.addChild(commitMarker);

    const handX = sample.focus < 0.2
      ? lerp(equation.x + equation.width / 2, frontX, sample.commitProgress)
      : lerp(frontX, focusX, sample.focus);
    const handY = sample.focus < 0.2
      ? lerp(equation.y + equation.height / 2, frontY, sample.commitProgress)
      : lerp(frontY, focusY, sample.focus);
    const hand = new Sprite(this.ftueHandTexture);
    hand.anchor.set(0.31, 0.77);
    hand.position.set(handX + 22, handY + 26);
    hand.scale.set(0.22);
    hand.rotation = -0.28;
    hand.eventMode = "none";
    this.root.addChild(this.entry(hand, BOARD_BANDS.status));

    const pulse = 1 + 0.08 * Math.sin(sample.progress * Math.PI * 4);
    const focusRing = new Graphics()
      .roundRect(focusSlot.x - 7 * pulse, focusSlot.y - 7 * pulse, focusSlot.width + 14 * pulse, focusSlot.height + 14 * pulse, 8)
      .stroke({ width: 4, color: PALETTE.highlight, alpha: 0.55 + sample.focus * 0.35 });
    focusRing.eventMode = "none";
    // entry-exempt: later-target focus ring arrives with the mid-commit beat.
    this.root.addChild(focusRing);

    for (const id of warning.keystoneTileIds) {
      const index = s.tiles.findIndex((tile) => tile.id === id);
      if (index < 0) continue;
      const slot = poolSlot(index, pool, board.grid);
      const ring = new Graphics()
        .roundRect(slot.x - 5 * pulse, slot.y - 5 * pulse, slot.width + 10 * pulse, slot.height + 10 * pulse, 10)
        .stroke({ width: 3, color: PALETTE.highlight, alpha: 0.8 });
      ring.eventMode = "none";
      // entry-exempt: keystone tile pulse arrives with the mid-commit beat.
      this.root.addChild(this.entry(ring, BOARD_BANDS.status));
    }

    const caption = this.text(warning.line, 18, PALETTE.highlight);
    caption.anchor.set(0.5);
    caption.position.set(lane.x + lane.width / 2, lane.y + 20);
    caption.alpha = 0.9;
    // entry-exempt: scripted trap caption arrives with its focus treatment.
    this.root.addChild(caption);

    // Keep the later target visually dominant without adding a text wall.
    const later = this.text(String(warning.keystoneTarget ?? s.targets[laterIndex] ?? "?"), 16, PALETTE.tokenInk);
    later.anchor.set(0.5);
    later.position.set(focusX, focusY);
    later.alpha = 1;
    // entry-exempt: later-target value arrives with its focus treatment.
    this.root.addChild(later);
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
    text: string,
    onTap?: () => void,
    options: {
      readonly variant?: ButtonVariant | undefined;
      readonly state?: ButtonState | undefined;
      readonly armed?: boolean | undefined;
      readonly emblem?: (() => Container) | undefined;
    } = {},
  ): Container {
    const control = button({
      width: w,
      height: h,
      label: text,
      variant: options.variant,
      armed: options.armed,
      emblem: options.emblem,
      state: this.inputLocked ? "disabled" : options.state,
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
    // entry-exempt: a pool token, animated by its own lift and settle (§9.5)
    this.root.addChild(token);
    return token;
  }

  private drawLevelIntro(s: ViewState): void {
    if (!this.levelIntro) return;
    const veil = new Graphics().rect(0, 0, DESIGN.width, DESIGN.height).fill({ color: 0x120c08, alpha: 0.58 });
    veil.eventMode = "static";
    // entry-exempt: level intro veil is a modal surface.
    this.root.addChild(veil);
    const panelW = DESIGN.width - 36;
    const panel = framedPanel(panelW, 238);
    panel.panel.position.set(18, 300);
    // entry-exempt: level intro panel is a modal surface.
    this.root.addChild(panel.panel);
    const center = 18 + panel.interior.x + panel.interior.width / 2;
    const top = 300 + panel.interior.y;
    const title = this.text("Level " + s.levelId, 22, PALETTE.highlight);
    title.anchor.set(0.5, 0); title.position.set(center, top + 14);
    // entry-exempt: level intro title.
    this.root.addChild(title);
    const objective = this.text("Make " + (s.targets[0] ?? "the target"), 16, PALETTE.tokenInk);
    objective.anchor.set(0.5, 0); objective.position.set(center, top + 52);
    // entry-exempt: level intro objective.
    this.root.addChild(objective);
    const intro = this.levelIntro;
    const note = this.text(intro.message ?? intro.hint ?? "Plan the queue before you start.", 12, PALETTE.tokenInk);
    note.anchor.set(0.5, 0); note.position.set(center, top + 82);
    // entry-exempt: level intro copy.
    this.root.addChild(note);
    // entry-exempt: level intro hint control.
    if (intro.hint === null) this.root.addChild(this.box(center - 145, top + 112, 290, 34, "Watch a short ad for a hint", () => this.emit({ type: "tapLevelIntroHintAd" }), { variant: "secondary" }));
    else { const bounded = this.text("This hint does not give the whole answer.", 11, PALETTE.highlightInk); bounded.anchor.set(0.5, 0); bounded.position.set(center, top + 112); // entry-exempt: level intro bounded hint copy.
    this.root.addChild(bounded); }
    // entry-exempt: level intro start control.
    this.root.addChild(this.box(center - 145, top + 160, 290, 38, "Start Level", () => this.emit({ type: "tapLevelIntroStart" }), { variant: "primary" }));
  }

  /**
   * Exact-action family: brass pulse ring + HUMAN-FINAL hand + caption plaque.
   * Used for FTUE teach targets and for 1-04's settled Go Back CTA.
   */
  private drawExactActionCue(
    rect: Rect,
    line: string,
    opts: { readonly ringAlphaScale?: number; readonly plaqueY?: number } = {},
  ): void {
    const cue = teachCueSample(rect, this.teachCueMs, DESIGN.width);
    const ringAlphaScale = opts.ringAlphaScale ?? 1;
    const shadow = new Graphics()
      .ellipse(rect.x + rect.width * 0.2, rect.y + rect.height - 1, rect.width * 0.6, 8)
      .fill({ color: PALETTE.text, alpha: cue.shadowAlpha });
    shadow.zIndex = BOARD_BANDS.status + 19;
    this.root.addChild(this.entry(shadow, BOARD_BANDS.status));

    const ring = new Graphics()
      .roundRect(rect.x - 7, rect.y - cue.lift - 7, rect.width + 14, rect.height + 14, 14)
      .stroke({ width: 6, color: PALETTE.brassLit, alpha: cue.ringAlpha * ringAlphaScale });
    ring.zIndex = BOARD_BANDS.status + 20;
    this.root.addChild(this.entry(ring, BOARD_BANDS.status));

    const hand = new Sprite(this.ftueHandTexture);
    hand.anchor.set(0.31, 0.77);
    hand.position.set(cue.handX, cue.handY);
    hand.scale.set(0.22);
    hand.rotation = -0.28;
    hand.zIndex = BOARD_BANDS.status + 22;
    hand.eventMode = "none";
    this.root.addChild(this.entry(hand, BOARD_BANDS.status));

    const plaqueRect = opts.plaqueY === undefined ? cue.plaque : { ...cue.plaque, y: opts.plaqueY };
    const plaque = new Graphics()
      .roundRect(plaqueRect.x, plaqueRect.y, plaqueRect.width, plaqueRect.height, 14)
      .fill({ color: PALETTE.felt, alpha: 0.98 })
      .stroke({ width: 4, color: PALETTE.brass });
    plaque.zIndex = BOARD_BANDS.status + 21;
    this.root.addChild(this.entry(plaque, BOARD_BANDS.status));
    const copy = this.text(line, 20, PALETTE.tokenInk);
    copy.anchor.set(0.5);
    copy.position.set(plaqueRect.x + plaqueRect.width / 2, plaqueRect.y + plaqueRect.height / 2);
    copy.zIndex = BOARD_BANDS.status + 23;
    this.root.addChild(this.entry(copy, BOARD_BANDS.status));
  }

  /** Shared exact-action marker: live target, brass breath, hand, contextual plaque. */
  private drawTeachCue(s: ViewState, board: Bands, availableOps: readonly (BinaryOp | UnaryOp)[]): void {
    const target = s.teachingTarget;
    if (!target || !s.teachingLine || s.phase !== "playing") return;

    let rect: Rect | null = null;
    if (target.kind === "tile") {
      const index = s.tiles.findIndex((tile) => tile.id === target.tileId);
      if (index >= 0) rect = poolSlot(index, board.pool, board.grid);
    } else if (target.kind === "operator") {
      const index = availableOps.indexOf(target.op);
      if (index >= 0) rect = operatorSlot(index, availableOps.length, board.operators, board.operatorGrid);
    } else if (target.kind === "queue") {
      rect = targetSlot(target.offset, board.lane, board.grid);
    } else {
      rect = equationSlot(3, board.equation);
    }
    if (!rect) return;

    const queueSweep = target.kind === "queue";
    if (queueSweep) {
      // Look-only: sweep back→front (e.g. 2→17→4). Never park a tap pulse on the front plate.
      const remaining = Math.max(1, s.targets.length - s.targetIndex);
      const waypoints = [];
      for (let offset = remaining - 1; offset >= 0; offset -= 1) {
        waypoints.push(targetSlot(offset, board.lane, board.grid));
      }
      const look = queueLookSample(waypoints, this.teachCueMs);
      const route = new Graphics();
      for (let i = 0; i < waypoints.length; i += 1) {
        const plate = waypoints[i]!;
        const x = plate.x + plate.width / 2;
        const y = plate.y + plate.height / 2;
        if (i === 0) route.moveTo(x, y);
        else route.lineTo(x, y);
      }
      route.stroke({ width: 3, color: PALETTE.brassLit, alpha: 0.72 });
      route.eventMode = "none";
      this.root.addChild(this.entry(route, BOARD_BANDS.status));
      for (let i = 0; i < waypoints.length; i += 1) {
        const plate = waypoints[i]!;
        const alpha = look.plateAlphas[i] ?? 0;
        if (alpha <= 0.05) continue;
        const ring = new Graphics()
          .roundRect(plate.x - 5, plate.y - 5, plate.width + 10, plate.height + 10, 12)
          .stroke({ width: 4, color: PALETTE.brassLit, alpha });
        ring.zIndex = BOARD_BANDS.status + 20;
        ring.eventMode = "none";
        this.root.addChild(this.entry(ring, BOARD_BANDS.status));
      }
      if (look.handAlpha > 0.05) {
        const hand = new Sprite(this.ftueHandTexture);
        hand.anchor.set(0.31, 0.77);
        hand.position.set(look.handX, look.handY);
        hand.scale.set(0.22);
        hand.rotation = -0.28;
        hand.alpha = look.handAlpha;
        hand.zIndex = BOARD_BANDS.status + 22;
        hand.eventMode = "none";
        this.root.addChild(this.entry(hand, BOARD_BANDS.status));
      }
      const cue = teachCueSample(waypoints[0] ?? rect, this.teachCueMs, DESIGN.width);
      const plaqueRect = { ...cue.plaque, y: board.equation.y + 10 };
      const plaque = new Graphics()
        .roundRect(plaqueRect.x, plaqueRect.y, plaqueRect.width, plaqueRect.height, 14)
        .fill({ color: PALETTE.felt, alpha: 0.98 })
        .stroke({ width: 4, color: PALETTE.brass });
      plaque.zIndex = BOARD_BANDS.status + 21;
      this.root.addChild(this.entry(plaque, BOARD_BANDS.status));
      const copy = this.text(s.teachingLine, 20, PALETTE.tokenInk);
      copy.anchor.set(0.5);
      copy.position.set(plaqueRect.x + plaqueRect.width / 2, plaqueRect.y + plaqueRect.height / 2);
      copy.zIndex = BOARD_BANDS.status + 23;
      this.root.addChild(this.entry(copy, BOARD_BANDS.status));
      return;
    }

    this.drawExactActionCue(rect, s.teachingLine);
  }

  private draw(): void {
    this.root.sortableChildren = true;
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
    /*
     * THE LANE IS LINED, like every other band that holds tokens.
     *
     * It was the one token band without a lining — the operator band has felt,
     * the pool tray has felt, the lane was bare panel — and that is why brass
     * plaques measured 1.02:1 against it: the plaque's body luminance (L 0.1804)
     * and the veiled desk's (L 0.1757) are the same number. On felt the same
     * brass measures 3.79:1. Consistency and the contrast fix are one move.
     */
    this.entry(
      this.place(
        feltLinedTray(lane.width, lane.height, PALETTE.tray, TRAY_ALPHA, PALETTE.felt, LANE_FELT_ALPHA),
        lane.x,
        lane.y,
      ),
      BOARD_BANDS.furniture,
    );

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
    const scriptedFocusOffset = this.scriptedTrap?.next.warning?.scripted
      ? Math.max(1, (this.scriptedTrap.next.warning.keystoneTargetIndex ?? s.targetIndex + 1) - s.targetIndex)
      : -1;

    /*
     * Cleared targets leave a ghost, so the lane does not void out.
     * Drawn before the live plaques so a plaque advancing over a ghost covers
     * it rather than being covered.
     */
    for (let k = 0; k < s.targetIndex; k++) {
      /*
       * Offset 0 is the FRONT, at the bottom of the lane, and the queue drains
       * downward — so the void a cleared target leaves is at the TOP, above the
       * last live plaque, not below the front. Ghosts therefore occupy the
       * offsets the queue has already vacated: length-targetIndex .. length-1.
       */
      const slot = targetSlot(s.targets.length - s.targetIndex + k + advancing, lane, board.grid);
      this.root.addChild(
        this.entry(
          this.place(ghostPlaque(slot.width, slot.height), slot.x, slot.y),
          BOARD_BANDS.queue,
        ),
      );
    }

    for (let i = s.targets.length - 1; i >= s.targetIndex; i--) {
      const offset = i - s.targetIndex;
      const slot = targetSlot(offset + advancing, lane, board.grid);
      const front = offset === 0;

      // §9.4: the front target shudders and refuses to advance when the lane
      // rejects it. It never leaves its slot — not advancing IS the message.
      const shove = front && this.rejecting ? this.rejectOffset : { dx: 0, dy: 0, glow: 0 };

      /*
       * BRIGHTNESS CARRIES THE FRONT TARGET, NOT THE RIM (ART_DIRECTION §5).
       *
       * The rim is gold and so is the plaque, so gold-on-gold measured 2.58:1
       * against the brass body and 1.58:1 against its lit areas — on the old
       * navy plate the same rim was 8.21:1. A hue-only signal on the single
       * most important state on the board is not a signal.
       *
       * Queued plaques therefore render DIMMED and the front target at full
       * brightness, which is the disabled/available language the tokens already
       * speak, needs no new art, and survives both sunlight and colourblindness.
       * Phone-eye P0-3: the live rim is COOL STEEL (PALETTE.targetFrontRim), not
       * brighter gold — a different channel from brass so grayscale still finds
       * the front. Queued plaques dim harder; the front lifts slightly.
       *
       * Position remains the primary identifier (bottom of the lane). Brightness
       * is second; the cool rim is third. WCAG 2.2 SC 1.4.11 exempts information
       * available in another form.
       */
      // Look-at-queue beat: equal chrome on every plate so front 4 does not read as tap-this.
      const queueTeach = s.teachingTarget?.kind === "queue";
      const liveFront = front && !queueTeach;
      const plate = this.place(
        targetPlate(slot.width, slot.height, String(s.targets[i]), {
          fill: liveFront
            ? this.rejecting
              ? PALETTE.failed
              : PALETTE.targetFront
            : PALETTE.targetPlate,
          text: PALETTE.tokenInk,
          bevel: 0, // recessed: targets are spent ON, not picked up
          // Cool rim on the live target — gold-on-brass failed the phone glance.
          outline: liveFront
            ? this.rejecting
              ? PALETTE.failed
              : PALETTE.targetFrontRim
            : undefined,
          outlineWidth: liveFront ? 4 : undefined,
        // Two plaque castings, picked from the target's position in the queue
        // so a column does not repeat one of them down its length.
        }, i),
        slot.x + shove.dx,
        slot.y + shove.dy,
      );
      if (!front && offset !== scriptedFocusOffset && !queueTeach) {
        // Stronger queue recess so the front carries hierarchy without brighter gold.
        plate.alpha = Math.min(DIM.alpha, 0.7);
      }

      this.entry(
        plate,
        // The FRONT target lands last: it is the focal point (§9.0).
        liveFront ? BOARD_BANDS.front : BOARD_BANDS.queue,
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
      const armCue = index === 0 || index === 2
        ? armCueFor(index, s.swapArmedSlot, this.armCueMs)
        : null;
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
              bevel: armCue ? 1.12 : 1,
              outline: armCue?.outline,
              outlineWidth: armCue?.outlineWidth,
              elevation: armCue?.elevation,
            });
      // §3.5 swap gesture: selection is MORE presence (§9.6). The armed
      // operand lifts under a restrained brass rim; the other stays fully lit
      // because it is still the swap target.
      if (armCue) {
        token.scale.set(armCue.scale);
      }
      this.entry(
        this.place(
          token,
          r.x + resistDx + (index === 1 ? (r.width - Math.min(r.width, r.height)) / 2 : 0)
            - (armCue ? r.width * (armCue.scale - 1) / 2 : 0),
          r.y - (armCue ? armCue.lift + r.height * (armCue.scale - 1) / 2 : 0),
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
    /*
     * Brass, through the button component's material face, so the key keeps
     * all four interaction states and sinks as one object under a press.
     */
    const commitTeach = s.teachingTarget?.kind === "commit" ? teachCueSample(commitRect, this.teachCueMs) : null;
    const commit = button({
      width: commitRect.width,
      height: commitRect.height,
      // EMPTY. The `=` is engraved into the face by `commitKey`; a label here
      // printed a second one in cream on top of the cut one.
      label: "",
      variant: "primary",
      face: (w, h) => commitKey(w, h, canCommit),
      state: this.inputLocked || !canCommit ? "disabled" : "armed",
      onTap: this.inputLocked || !canCommit ? undefined : () => this.emit({ type: "tapCommit" }),
    });
    commit.position.set(commitRect.x + resistDx, commitRect.y - (commitTeach?.lift ?? 0));
    if (commitTeach) commit.scale.set(commitTeach.scale);
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
      const taught = s.teachingTarget?.kind === "operator" && s.teachingTarget.op === op;
      const teachingOperatorBeat = s.teachingTarget?.kind === "operator";
      const enabled = !spent && (taught || (isUnary ? true : s.affordance === "operators"));

      // §3.5: bold-active is ALWAYS paired with dim-inactive. Weight change
      // alone is easy to miss and poor for low-vision players.
      const size = Math.min(r.width, r.height);
      const lit = taught || (enabled && active);
      const opLift = this.lifts.get(OPERATOR_LIFT_KEY);
      const taughtSample = taught ? teachCueSample(r, this.teachCueMs) : null;
      const opRise = taughtSample?.lift ?? (opLift && s.slots.op === op ? Math.sin(Math.PI * opLift.value) : 0);
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
        elevation: taught ? 2.5 : lit ? 1 : DIM.elevation,
        outline: taught || s.transformOp === op ? PALETTE.brassLit : undefined,
        outlineWidth: taught ? 6 : undefined,
        /*
         * GDD §7.6: the count appears with counted operators at 3-3, and NEVER
         * in Casual. `budget[op]` is undefined exactly when the mode does not
         * count that operator, so the absence of a number is the signal — no
         * mode check needed here, and no infinity symbol, which §7.6 rules out
         * because unlimited is a different game rather than a bigger number.
         *
         * A spent dial keeps its 0: it is the last step of the sequence the
         * player has been watching, and it is what makes the tarnish mean
         * something rather than just look different.
         */
      }, tokenState, remaining ?? undefined);
      // Spent keeps full opacity and loses its light; disabled keeps its light
      // and loses presence. Two different signals, never the same treatment.
      if (tokenState === "disabled" && !teachingOperatorBeat) disc.alpha = DIM.alpha;
      if (tokenState === "unavailable") {
        disc.alpha = 0.85;
        disc.addChild(
          new Graphics()
            .roundRect(size * 0.16, size * 0.46, size * 0.68, 3, 1.5)
            .fill({ color: PALETTE.failed, alpha: 0.85 }),
        );
      }

      disc.pivot.set(size / 2, size / 2);
      disc.scale.set(taughtSample?.scale ?? (1 + opRise * 0.07));
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
    /*
     * ONLY §7.5's scripted trap pulses (GDD §5.4).
     *
     * A routine warning that lit the tiles reaching the starved target handed
     * out more than the star-1 Narrow hint sells. The Director already
     * withholds the ids on a routine warning, so this set is empty either way
     * — the `scripted` test is here so the rule is visible at the point of use
     * and cannot be reintroduced by restoring the field upstream.
     */
    const pulsed = new Set(s.warning?.scripted ? s.warning.keystoneTileIds : []);

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
      /*
       * GDD §7.7: on 1-01 a tile that cannot form the front target is DIM and
       * does not respond. `constrainedTileIds` is null everywhere else, which
       * is why this tests for null rather than for an empty list — an empty
       * list is a real answer meaning "none of them".
       *
       * DIM, NOT INERT, is the whole point. A tile that silently ignores a tap
       * reads as a broken game; one that is visibly unavailable reads as a
       * guided one, and the affordance already existed — it simply was never
       * driven by legality.
       */
      const illegal = s.constrainedTileIds !== null && !s.constrainedTileIds.includes(tile.id);
      const taught = s.teachingTarget?.kind === "tile" && s.teachingTarget.tileId === tile.id;
      const taughtSample = taught ? teachCueSample(r, this.teachCueMs) : null;
      const dimmed =
        s.affordance === "transform"
          ? !transformable
          : illegal || (!s.teachingTarget && s.affordance === "operators") || inSlot.has(tile.id);

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
        elevation: dimmed ? DIM.elevation : taught ? 2.5 : 1 + rise * 1.6,
        outline:
          taught || transformable || pulsed.has(tile.id) || hinted.has(tile.id)
            ? taught ? PALETTE.brassLit : PALETTE.highlight
            : undefined,
        outlineWidth: taught ? 6 : undefined,
      }, "idle", tile.id);
      if (dimmed) token.alpha = DIM.alpha;

      // Scale about the tile's own centre so it grows in place rather than
      // drifting toward its bottom-right corner.
      const grow = taughtSample?.scale ?? (1 + rise * 0.07);
      token.pivot.set(r.width / 2, r.height / 2);
      token.scale.set(grow * turned, grow);

      this.entry(
        this.place(
          token,
          r.x + r.width / 2,
          r.y + r.height / 2 - (taughtSample?.lift ?? rise * 5),
          // A constrained-out tile carries no tap. It is dim rather than
          // silent, so the absence reads as unavailable and not as broken.
          illegal ? undefined : () => this.emit({ type: "tapTile", id: tile.id }),
        ),
        BOARD_BANDS.pool,
      );
      this.tileBounds.set(tile.id, { x: r.x, y: r.y, w: r.width, h: r.height });
    }

    this.drawTeachCue(s, board, available);

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
        watches.position.set(lane.x + 8, Math.max(lane.y + 14, SAFE_TOP + 10));
        this.root.addChild(this.entry(watches, BOARD_BANDS.status));

        /*
         * CREAM, NOT `text`. Same defect as the status line: `text` is the ink
         * for paper and the lane is felt, so "5/5" measured 1.17:1 and could
         * not be read at all. `failed` is a plate colour and fared no better at
         * 1.69:1, so the zero state takes `failedLit` (5.79:1).
         */
        const hud = this.text(
          `${eco.lives}/${eco.maxLives}`,
          14,
          eco.lives === 0 ? PALETTE.failedLit : PALETTE.tokenInk,
        );
        /*
         * Clear of the meter, and centred against it.
         *
         * The counter sat 8px after `meterWidth`, which reports the meter's
         * nominal run and not the specular bloom on the last watch — so "0/5"
         * overlapped the fifth case. A wider gap, and the text is anchored on
         * its vertical middle against the emblems rather than on its top.
         */
        hud.anchor.set(0, 0.5);
        hud.position.set(lane.x + 8 + meterWidth(eco.maxLives, size) + 16, Math.max(lane.y + 14, SAFE_TOP + 10) + size / 2);
        this.root.addChild(this.entry(hud, BOARD_BANDS.status));
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
        const earned = starsForClear(eco);
        const size = 15;
        const stars = emblemMeter("star", earned, 3, size);
        // Same clearance at the other end: nothing sits beside the stars, but
        // the row is inset from the lane edge by the same margin so the two
        // meters read as a pair rather than as one tucked tighter than the other.
        stars.position.set(lane.x + lane.width - 16 - meterWidth(3, size), Math.max(lane.y + 14, SAFE_TOP + 10));
        this.root.addChild(this.entry(stars, BOARD_BANDS.status));
      }

      if (eco.firstFailureExempt) {
        const exempt = this.text("free first failure — no life lost", 12, PALETTE.highlight);
        exempt.anchor.set(1, 0);
        exempt.position.set(lane.x + lane.width - 8, lane.y + 26);
        this.root.addChild(this.entry(exempt, BOARD_BANDS.status));
      }

    }

    const outcomeOwnsMoment = s.phase === "won" || s.phase === "failed" || eco?.lockedOut === true;
    const firstTeach = isFirstClearTeach(s.levelId, eco?.cleared ?? false);

    if (!outcomeOwnsMoment) {
    /*
     * A RAIL UNDER THE CONTROLS (§9.0).
     *
     * restart, map and hints were flat rectangles on bare wood — the only
     * controls in the game with no housing, while every band that holds a token
     * sits in felt. They now sit in the same tray, so the status row reads as
     * part of the instrument rather than as three buttons dropped on the desk.
     *
     * Drawn beneath the controls, which are added after it.
     */
    const statusRail = feltLinedTray(
      status.width + 12,
      status.height + 6,
      PALETTE.tray,
      TRAY_ALPHA,
      PALETTE.felt,
    );
    statusRail.position.set(status.x - 6, status.y - 2);
    this.root.addChild(this.entry(statusRail, BOARD_BANDS.furniture));

    /*
     * THE BAND'S TWO ROWS, from the layout rather than from four literals.
     */
    const rows = statusRows(status);

    // --- status line + restart ---
    // §9.4: no "no solution exists" text. During play this line carries
    // rejections and confirmations; on failure the board has already said it.
    const banner = (s.teachingTarget ? null : s.teachingLine) ?? this.rejection ?? s.message ?? "";
    /*
     * CREAM AND GOLD, because this band is FELT now.
     *
     * It carried `textDim` and `highlightInk`, which are the paper inks — the
     * pair exists precisely so a call site has to choose a ground, and lining
     * the band moved the ground without moving the choice. On felt they measure
     * 3.03:1 and 2.92:1; cream and gold measure 14.50:1 and 12.50:1.
     */
    const colour = PALETTE.tokenInk;

    const statusText = this.text(banner, 15, colour);
    statusText.position.set(status.x, rows.message);
    this.root.addChild(this.entry(statusText, BOARD_BANDS.status));

    // Developer output: level id, mode, target counter, failure count. Behind
    // the flag, because a player met this in the first three seconds.
    if (debugChrome()) {
    const meta = this.text(
      `${s.levelId}  ${s.mode}  target ${Math.min(s.targetIndex + 1, s.targets.length)}/${s.targets.length}  fails ${s.failures}`,
      12,
      PALETTE.textDim,
    );
    // Below the band entirely: the two designed rows are full, and developer
    // chrome does not get to displace them.
    meta.position.set(status.x, status.y + status.height + 2);
    this.root.addChild(this.entry(meta, BOARD_BANDS.status));
    }

    /*
     * The build string, and the way telemetry gets off a phone (§7.8).
     *
     * LONG-PRESS, not a visible button: the funnel is a development concern and
     * a player should never find an "export data" control on the board. A build
     * string is something a playtester needs to see anyway, so it costs no
     * extra pixels and the gesture is discoverable only if you were told.
     */
    /*
     * ROW y+46, NOT y+22, AND THE REASON MATTERS.
     *
     * At y+22 the label sat at design x 363-408, and the restart button covers
     * x 318-408 of y 836-868 — the whole of it — and is added to root after it.
     * So the gesture was not merely hidden, it was UNREACHABLE: a long press on
     * the export target hit restart and threw the level away. Verified on the
     * live build with a real touch context before this moved.
     *
     * y+46 sits below restart and to the right of the map button, which is the
     * one free corner of the band.
     */
    // Behind the same flag: a build string and a telemetry export gesture are
    // both developer concerns, and a player should meet neither.
    if (debugChrome()) {
    const build = this.text(this.buildLabel, 10, PALETTE.textDim);
    build.anchor.set(1, 0);
    build.position.set(status.x + status.width, status.y + status.height + 2);
    build.alpha = 0.7;
    build.eventMode = "static";
    build.cursor = "pointer";
    /*
     * A 45x13 glyph run is a tenth of the area a finger needs. The visible text
     * stays small — it is a build string, not a control — while the hit area is
     * padded out to a real target, which is the whole point of a gesture that
     * has to work on a phone held one-handed.
     */
    const padX = 14;
    const padY = Math.max(0, (44 - build.height) / 2);
    build.hitArea = new Rectangle(
      -build.width - padX,
      -padY,
      build.width + padX * 2,
      build.height + padY * 2,
    );

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
    // entry-exempt: the dev build label, which is not part of the designed screen
    this.root.addChild(build);
    }

    if (!firstTeach) {
    // entry-exempt: the dev build label's hit area
    this.root.addChild(
      this.box(
        status.x + status.width - 90,
        rows.controlsY,
        90,
        rows.controlH,
        "Restart",
        () => this.emit({ type: "tapRestart" }),
        {
          variant: "secondary",
          // §9.4 forbids a banner, not a designed way out. After failure this
          // becomes a genuinely armed recovery action, not gold-coloured text.
          armed: false,
        },
      ),
    );

    // The way back to the map, ABSENT until 1-10 is cleared (§7.6). A door to a
    // room that does not exist yet is exactly the "not for me" the schedule
    // exists to prevent.
    if (u.worldMap) {
      /*
       * FULL LEFT OF THE ROW. It used to be offset by the mode selector's three
       * chips, and the arithmetic did not fit: chips 204 + map 72 + hints 92 +
       * restart 90 needs 458px of a 396px band. Map landed at 216..288 and the
       * hints chip at 218..310 — 70 of map's 72px covered, and the chip is
       * added later so it won hit-testing too. From 3-10 onward there was no
       * way back to the map from the board at all.
       *
       * The selector moved to the title screen's settings rather than the row
       * being shrunk to fit, so this offset has nothing left to dodge.
       */
      // entry-exempt: the dev level picker, absent from the shipped screen
      this.root.addChild(
        this.box(
          status.x,
          rows.controlsY,
          72,
          rows.controlH,
          "Map",
          () => this.emit({ type: "tapMap" }),
          { variant: "secondary" },
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
      // entry-exempt: the dev level picker, absent from the shipped screen
      this.root.addChild(mark);

      const label = this.text(hint.text, 12, PALETTE.highlightInk);
      label.position.set(board.hints.x + 4 + gem + 6, board.hints.y + i * HINT_LINE_H + 2);
      // entry-exempt: the dev level picker, absent from the shipped screen
      this.root.addChild(label);
    });

    // --- hint shop: absent before 3-6 (§7.6) ---
    if (u.hintShop && eco) {
      // entry-exempt: the dev level picker, absent from the shipped screen
      this.root.addChild(
        this.box(
          status.x + status.width - 190,
          rows.controlsY,
          92,
          rows.controlH,
          `Hints ${eco.starsAvailable}`,
          () => this.emit({ type: "toggleShop" }),
          {
            // Open is an armed MATERIAL state, never DIM (§9.6).
            armed: s.shopOpen,
            emblem: () => star(11),
          },
        ),
      );

      if (s.shopOpen) {
        // A card laid on the desk, anchored above the status band rather than
        // inside the pool: the pool is only one row tall on a small board and
        // the panel would have hung off the top of it.
        // Full band width, not the pool's — the pool now hugs its grid and can
        // be as narrow as three tiles, which is no width for a shop.
        /*
         * BRASS OVER FELT, like the other five modals (§9.0).
         *
         * This was a cream card with a gold stroke — the same treatment the
         * warning panel had, removed there for the same reason: ART_DIRECTION
         * §4 lists cream as light TEXT, not a surface. It survived here for two
         * rounds after that lesson because the fix landed where the bug was
         * noticed rather than everywhere the rule held.
         *
         * The rows were never the problem: they already run through the button
         * component with idle/unavailable states and a designed empty state.
         * Only the thing they sat on was wrong.
         */
        const panelH = 42 + s.shop.length * 40;
        // Sit above the pool when possible — phone-eye: shop must not guillotine cubes.
        const panelY = Math.min(status.y - 8, pool.y - 6) - panelH;
        const emptyShop = s.shop.every((e) => !e.owned && !e.affordable);
        const shopFrame = framedPanel(status.width, panelH);
        shopFrame.panel.position.set(status.x, panelY);
        this.root.addChild(this.entry(shopFrame.panel, BOARD_BANDS.furniture));

        const shopInner = shopFrame.interior;
        const innerX = status.x + shopInner.x;
        const innerY = panelY + shopInner.y;

        const title = this.text(
          emptyShop ? "Clear Levels to Earn Hint Stars" : "Hints — None Reveals a Keystone",
          12,
          PALETTE.tray,
        );
        // Inset from the interior's own left edge. Flush against it, the first
        // glyph was clipped by the frame's inner bevel — the rows get away with
        // it because they are filled boxes, and a letterform does not.
        title.position.set(innerX + 6, innerY + 2);
        this.root.addChild(this.entry(title, BOARD_BANDS.pool));

        /*
         * DESIGNED EMPTY STATE (§9.0). With nothing affordable the shop used to
         * be three greyed rows, which §7.6 names as the exact thing to avoid —
         * a greyed shop teaches "this is not for me". It now says how to earn
         * the stars instead, which is a route rather than a wall.
         */
        s.shop.forEach((entry, i) => {
          const y = innerY + 22 + i * 40;
          const enabled = entry.owned || entry.affordable;
          // Owned is "earned", so it is gold on the dark chip. Unaffordable is
          // the same chip under the dim treatment, not a greyer chip.
          // Cannot afford it: UNAVAILABLE, not disabled. It will not become
          // buyable by waiting — only by earning stars elsewhere.
          const row = this.box(
            innerX,
            y,
            shopInner.width,
            34,
            `${entry.label}   ${entry.owned ? "Owned" : `${entry.cost}`}`,
            () => this.emit({ type: "buyHint", hint: entry.type }),
            {
              variant: entry.affordable && !entry.owned ? "primary" : "secondary",
              state: enabled ? "idle" : "unavailable",
              armed: entry.owned,
              emblem: entry.owned ? undefined : () => star(11),
            },
          );
          this.root.addChild(this.entry(row, BOARD_BANDS.equation));
        });
      }
    }
    }

    }

    /*
     * THE MODE SELECTOR IS NOT ON THE BOARD ANY MORE.
     *
     * Three 62px chips in a 396px row that already held map, the hints chip and
     * restart — the row overflowed by 62px and silently ate the map button. It
     * lives in the title screen's settings now, which is also where a player
     * looks for it: §6 is a choice about how you play, not a board control, and
     * putting it on the board meant it could only appear once the board had
     * room, which is why it was gated at 3-10 in the first place.
     */

    if (eco?.lockedOut) {
      // The board recedes before the out-of-lives panel owns the moment.
      const veil = new Graphics()
        .rect(0, 0, DESIGN.width, DESIGN.height)
        .fill({ color: 0x120c08, alpha: 0.55 });
      veil.eventMode = "static";
      this.root.addChild(this.entry(veil, BOARD_BANDS.equation));
      this.drawOutOfLives(lane, eco);
    }

    this.drawScriptedTrapBeat(s, board);

    // --- fatal move: BLOCKED in Casual and at 1-4, WARNED in Normal (§6) ---
    if (s.warning) {
      const w = s.warning;
      /*
       * THE SAME OBJECT AS THE OTHER TWO MODALS (§9.0).
       *
       * This was a cream card with a gold stroke while the failure and cleared
       * modals are brass frame over felt — three interruptions, three different
       * materials. ART_DIRECTION §4 lists cream as LIGHT TEXT ONLY, not a
       * surface, so the panel was also using a colour off its own palette. It
       * now shares `framedPanel` with the other two, which means it inherits
       * their lighting, their corner studs and their contact shadow rather than
       * approximating them.
       */
      const panelH = w.overridable ? 186 : 158;
      const panelW = lane.width - 12;
      const panelX = lane.x + 6;
      const panelY = lane.y + 40;
      const framed = framedPanel(panelW, panelH);
      framed.panel.position.set(panelX, panelY);
      // entry-exempt: the fatal-move warning, which opens mid-play (§6)
      this.root.addChild(framed.panel);

      const inner = framed.interior;
      const midX = panelX + inner.x + inner.width / 2;
      const topY = panelY + inner.y;

      // §7.5 step 3: one line of text. Not a modal, not a chain of Next.
      const line = this.text(w.line, 19, PALETTE.tokenInk);
      line.anchor.set(0.5);
      line.position.set(midX, topY + 26);
      // entry-exempt: warning copy, arriving with its panel above
      this.root.addChild(line);

      /*
       * Three registers, one each: the CAUSE (the headline), the MOVE, the COST.
       *
       * The routine line used to read "8 - 4 starves it", whose "it" was the
       * target the headline named — and §5.4 now forbids naming it. What is
       * left is the move itself, quoted back without a verdict: the headline
       * already gave the reason and the line below gives the price, so a third
       * restatement of "this loses" was the redundancy anyway.
       */
      const refused = this.text(
        w.scripted ? `${asBoardGlyphs(w.move)} looks right. It is not.` : asBoardGlyphs(w.move),
        13,
        PALETTE.tray,
      );
      refused.anchor.set(0.5);
      refused.position.set(midX, topY + 54);
      // entry-exempt: warning copy, arriving with its panel above
      this.root.addChild(refused);

      if (w.scripted) {
        // Gold, not the paper gold: this line sits on the panel's felt, where
        // `highlightInk` measures 2.92:1. Same ink split as the status band.
        const free = this.text(
          "rewound free — no star, no life, no failure",
          12,
          PALETTE.highlight,
        );
        free.anchor.set(0.5);
        free.position.set(midX, topY + 78);
        // entry-exempt: warning copy, arriving with its panel above
        this.root.addChild(free);
      }

      if (w.overridable) {
        /*
         * GDD §6: Normal warns and allows the override, so the panel has to
         * state the PRICE of taking it. Without that line "commit anyway" reads
         * as a second confirmation of a move the game has already refused,
         * rather than a choice with a cost — and the cost is the whole reason
         * Normal has a failure state at all.
         */
        const cost = this.text("commit anyway and the level is lost", 12, PALETTE.tray);
        cost.anchor.set(0.5);
        cost.position.set(midX, topY + 80);
        // entry-exempt: warning copy, arriving with its panel above
        this.root.addChild(cost);

        // entry-exempt: warning buttons, arriving with their panel above
        this.root.addChild(
          this.box(
            midX - 128,
            topY + 104,
            124,
            34,
            "Go Back",
            () => this.emit({ type: "dismissWarning" }),
          ),
        );
        // The destructive option is the SECOND one and does not carry the gold
        // accent: gold means "ready, armed, earned" (§9.6) and this is none of
        // those.
        // entry-exempt: warning buttons, arriving with their panel above
        this.root.addChild(
          this.box(
            midX + 4,
            topY + 104,
            124,
            34,
            "Commit Anyway",
            () => this.emit({ type: "commitAnyway" }),
          ),
        );
      } else {
        // entry-exempt: warning buttons, arriving with their panel above
        this.root.addChild(
          this.box(
            midX - 60,
            topY + 98,
            120,
            32,
            w.scripted ? "Go Back" : "Got It",
            () => this.emit({ type: "dismissWarning" }),
            { variant: w.scripted ? "primary" : "secondary" },
          ),
        );
      }

      // 1-04 settled rewind: same hand+pulse+plaque family as board FTUE cues,
      // pointed at the live Go Back CTA (not only modal copy).
      if (w.scripted) {
        const goBack: Rect = w.overridable
          ? { x: midX - 128, y: topY + 104, width: 124, height: 34 }
          : { x: midX - 60, y: topY + 98, width: 120, height: 32 };
        this.drawExactActionCue(goBack, "Tap Go Back.", {
          plaqueY: panelY + panelH + 12,
        });
      }
    }

    // GDD §9.4: NO failure banner. The lane rejecting the number is the
    // message, and it is legible on the board — the front target shudders,
    // refuses to advance, and the pool visibly cannot feed it. Text is a
    // fallback for when the visual fails, not the primary channel.
    //
    /*
     * GDD §9.4's AFTERMATH — the way out, once the rejection has read.
     *
     * `this.rejecting` gates it: the options do not appear during the pulse,
     * they appear after it settles. The order matters. The board says "this
     * number cannot be made" first, on its own terms; the offer comes second,
     * as a response to something the player has already understood. Showing
     * both at once would make the refusal read as the setup for a sale.
     *
     * §9.0 applies because this is also a monetisation moment: it lands as a
     * seated panel of the same navy and gold as the cleared screen, arrives on
     * the entry bands like every other surface, and its three buttons are the
     * one button component — so the pressed state, the disabled state and the
     * tap target are the same ones the rest of the game already has.
     */
    if (s.phase === "failed" && s.exit !== null && this.rejectSettled) {
      /*
       * A FRAMED MODAL OVER A DIMMED BOARD (§9.0, §9.4).
       *
       * It was three flat buttons wedged into the equation row, which failed
       * the bar on depth, focal point and framing at the game's most emotional
       * moment — a monetisation moment wearing no design at all.
       *
       * The board DIMS but stays visible, and the panel starts below the lane.
       * The unreachable number is the reason the player is here; covering it
       * or hiding it would remove the evidence for the decision being asked
       * for. Dimming recedes the board without deleting it.
       */
      const exit = s.exit;

      const veil = new Graphics()
        .rect(0, 0, DESIGN.width, DESIGN.height)
        .fill({ color: 0x120c08, alpha: 0.55 });
      /*
       * The veil SWALLOWS INPUT, which is what makes this a modal rather than a
       * picture of one. Without it the dimmed board keeps its live controls —
       * the status band's restart and map sit right under the panel and would
       * still fire, so a player could act on a board they can barely see.
       */
      veil.eventMode = "static";
      this.root.addChild(this.entry(veil, BOARD_BANDS.equation));

      const panelX = equation.x;
      const panelW = equation.width;
      const panelY = equation.y;
      const panelH = Math.min(224, status.y - equation.y - 4);
      const framed = framedPanel(panelW, panelH);
      framed.panel.position.set(panelX, panelY);
      this.root.addChild(this.entry(framed.panel, BOARD_BANDS.equation));

      const inner = framed.interior;
      const innerX = panelX + inner.x;
      const innerY = panelY + inner.y;

      /*
       * §9.4 forbids announcing the FAILURE in text, and this does not: it
       * names the choice being offered, which is new information the board
       * cannot show. One line, per §7.7.
       */
      /*
       * THE HEADLINE CARRIES THE STAKES, not the mechanism.
       *
       * It read "the lane is stuck", which tells the player the one thing they
       * already know — it is why the panel appeared. What they do not know is
       * what starting over costs, and that line was sitting in 11px orange
       * BELOW the buttons. The hierarchy was inverted; this is the fix.
       *
       * The free variant fires on §5.2 exactly: first failure on a level never
       * cleared, persisted per level, so it is not "first this session" and not
       * "first since the last clear" — once a level is cleared the exemption is
       * gone for good.
       */
      const heading = this.text(
        exit.canCleanRetry
          ? "restart with a clean 3-star chance"
          : exit.restartCostsLife
            ? "starting over costs a life — going back does not"
            : "this restart is free — and going back is too",
        15,
        PALETTE.tokenInk,
      );
      heading.anchor.set(0.5, 0);
      heading.position.set(innerX + inner.width / 2, innerY + 10);
      this.root.addChild(this.entry(heading, BOARD_BANDS.equation));

      if (this.adMessage) {
        const note = this.text(this.adMessage, 11, PALETTE.highlight);
        note.anchor.set(0.5, 0);
        note.position.set(innerX + inner.width / 2, innerY + 30);
        this.root.addChild(this.entry(note, BOARD_BANDS.equation));
      }

      const buttonH = 34;
      const gap = 7;
      const buttonW = inner.width - 20;
      const firstY = innerY + 36;
      const seatY = (row: number): number => firstY + row * (buttonH + gap);
      const buttonX = innerX + 10;

      /*
       * CONTINUE FIRST, and stated as what it costs rather than what it is.
       * It is the offer the player is least likely to understand, and §9.4
       * makes it deliberately informative — it leaks where the mistake was —
       * so it earns the top slot and the gold.
       */
      const cleanRetry = exit.canCleanRetry;
      const continueLabel = cleanRetry
        ? "Watch a short ad to restart and try for 3 stars."
        : exit.canContinue
          ? "Watch an Ad · Back to Where It Still Worked"
        : exit.continuesLeft === 0
          ? "Continues Used"
          : "Nothing to Rewind To";
      this.root.addChild(
        this.entry(
          this.box(
            buttonX,
            seatY(0),
            buttonW,
            buttonH,
            continueLabel,
            cleanRetry
              ? () => this.emit({ type: "tapCleanRetryAd" })
              : exit.canContinue
                ? () => this.emit({ type: "tapContinue" })
                : undefined,
            {
              variant: "primary",
              state: cleanRetry || exit.canContinue ? "idle" : "unavailable",
            },
          ),
          BOARD_BANDS.equation,
        ),
      );

      const half = (buttonW - gap) / 2;
      this.root.addChild(
        this.entry(
          this.box(
            buttonX,
            seatY(1),
            half,
            buttonH,
            cleanRetry ? "Leave" : "Restart",
            cleanRetry ? () => this.emit({ type: "tapMap" }) : () => this.emit({ type: "tapRestart" }),
            { variant: "secondary" },
          ),
          BOARD_BANDS.equation,
        ),
      );
      this.root.addChild(
        this.entry(
          this.box(
            buttonX + half + gap,
            seatY(1),
            half,
            buttonH,
            cleanRetry ? "No free restart" : "Map",
            cleanRetry ? undefined : () => this.emit({ type: "tapMap" }),
            { variant: "secondary", state: cleanRetry ? "unavailable" : "idle" },
          ),
          BOARD_BANDS.equation,
        ),
      );

    }

    /*
     * THE CLEARED PANEL — the failure modal's sibling (§9.0, §9.4, §9.5).
     *
     * It was a flat blue rectangle with one "replay" button while the failure
     * panel had become a framed brass object, so the two most important moments
     * in a level were made of different materials and only one of them offered
     * a way forward. They are the SAME OBJECT with different content now: same
     * frame, same felt interior, same dimmed board, same entry bands, same
     * button component.
     *
     * The dim earns its place here too. A win is the one moment the board
     * should stop competing for attention, and the cleared lane behind is worth
     * seeing receded rather than deleted.
     */
    if (s.phase === "won") {
      const veil = new Graphics()
        .rect(0, 0, DESIGN.width, DESIGN.height)
        .fill({ color: 0x120c08, alpha: 0.55 });
      veil.eventMode = "static";
      this.root.addChild(this.entry(veil, CLEARED_BANDS.panel, true));

      const panelX = equation.x;
      const panelW = equation.width;
      const panelH = Math.min(232, status.y - equation.y - 4);
      const panelY = equation.y;
      const framed = framedPanel(panelW, panelH);
      framed.panel.position.set(panelX, panelY);
      this.root.addChild(this.entry(framed.panel, CLEARED_BANDS.panel, true));

      const inner = framed.interior;
      const innerX = panelX + inner.x;
      const innerY = panelY + inner.y;

      const headline = this.text(s.levelId === "1-10" ? "World 1 complete" : "cleared", 22, PALETTE.highlight);
      headline.anchor.set(0.5, 0);
      headline.position.set(innerX + inner.width / 2, innerY + 8);
      this.root.addChild(this.entry(headline, CLEARED_BANDS.headline, true));

      /*
       * §9.5: stars arrive ONE AT A TIME, weighted — and INSIDE the panel now,
       * seated in it after it lands rather than floating where the old banner
       * used to be. Three landing at once would be a celebration; three landing
       * in sequence is a tally being counted out, which is the register this
       * game earns its reward in.
       */
      const starSize = 30;
      const starsY = innerY + 48;
      this.starArrivals.forEach((arrival, i) => {
        if (!arrival.started) return;
        const glyph = star(starSize);
        const spread = starSize + 12;
        const x = innerX + inner.width / 2 + (i - (this.starArrivals.length - 1) / 2) * spread;
        glyph.scale.set(lerp(1.9, 1, arrival.value));
        glyph.alpha = Math.min(1, arrival.raw * 3);
        glyph.position.set(x, starsY);
        this.root.addChild(this.entry(glyph, CLEARED_BANDS.stars, true));
      });

      const buttonH = 34;
      const gap = 7;
      const buttonW = inner.width - 20;
      const buttonX = innerX + 10;
      const progressY = innerY + 82;
      const firstY = innerY + 112;
      const hasNext = this.nextLevelId !== null;

      /*
       * ART GATE B1: turn the star tally into a visible cause before offering
       * exits. The total is already banked by the Economy when this state is
       * rendered, and the shell has already identified the plate it unlocked.
       * One small star and one line are enough to connect clear → bank → map;
       * another celebration layer would weaken the deliberate register.
       */
      const progress = new Container();
      const banked = this.text(s.levelId === "1-01" ? "You earned " + (s.economy?.starsIfCleared ?? 0) + " stars." : (s.economy?.totalStars ?? 0) + " banked", 12, PALETTE.tokenInk);
      const destination = this.text(
        s.levelId === "1-01" ? "Used pieces stay used." : hasNext ? `next ${this.nextLevelId} now open on map` : "Academy progress waits on map",
        11,
        PALETTE.highlight,
      );
      const progressStar = star(13);
      const beat = this.clearProgressBeat ? Math.sin(Math.PI * this.clearProgressBeat.raw) : 0;
      progressStar.scale.set(1 + beat * 0.18);
      progressStar.position.set(6.5, banked.height / 2);
      banked.position.set(18, 0);
      destination.position.set(18 + banked.width + 7, 1);
      progress.addChild(progressStar, banked, destination);
      progress.position.set(innerX + (inner.width - progress.width) / 2, progressY);
      this.root.addChild(this.entry(progress, CLEARED_BANDS.progress, true));

      /*
       * NEXT LEVEL IS ABSENT, NOT DISABLED, at the end of the ladder.
       *
       * A disabled "next level" on 4-10 would be the game telling the player
       * they have failed to reach something that does not exist. There is no
       * next level, so there is no control for it — and the line that replaces
       * it says what the end of the ladder is, because finishing forty levels
       * deserves a sentence rather than a greyed-out button.
       */
      if (hasNext) {
        this.root.addChild(
          this.entry(
            this.box(
              buttonX,
              firstY,
              buttonW,
              buttonH,
              "Next Level",
              () => this.emit({ type: "tapNextLevel" }),
              { variant: "primary" },
            ),
            CLEARED_BANDS.actions,
            true,
          ),
        );
      } else {
        const done = this.text("that was the last one — for now", 12, PALETTE.highlight);
        done.anchor.set(0.5, 0);
        done.position.set(innerX + inner.width / 2, firstY + 9);
        this.root.addChild(this.entry(done, CLEARED_BANDS.actions, true));
      }

      /*
       * Replay is for improving a star rating (§5.1), so it sits beside map as
       * a secondary rather than competing with going forward. It was the ONLY
       * exit before this, which made the reward screen a dead end.
       */
      const half = (buttonW - gap) / 2;
      const secondRow = firstY + buttonH + gap;
      this.root.addChild(
        this.entry(
          this.box(
            buttonX,
            secondRow,
            half,
            buttonH,
            "Replay",
            () => this.emit({ type: "tapRestart" }),
            { variant: "secondary" },
          ),
          CLEARED_BANDS.actions,
          true,
        ),
      );
      this.root.addChild(
        this.entry(
          this.box(
            buttonX + half + gap,
            secondRow,
            half,
            buttonH,
            "Map",
            () => this.emit({ type: "tapMap" }),
            { variant: "secondary" },
          ),
          CLEARED_BANDS.actions,
          true,
        ),
      );
    }

    // Failure adds no button of its own: `restart` already sits in the status
    // band, and a second control over the equation row both collides with it
    // and re-narrates a loss the board has already communicated (§9.4).

    /*
     * THE EQUATION ROW IS LINED, like every other band that holds tokens.
     *
     * It was the only one on bare wood — a white veil over the desk — while the
     * lane, the operator band and the pool all sit in felt. It is where every
     * commit happens, so it was the one place the material stopped.
     *
     * Drawn beneath: added last it would cover the row it lines.
     */
    const equationTray = feltLinedTray(
      equation.width + 12,
      equation.height + 12,
      PALETTE.tray,
      TRAY_ALPHA,
      PALETTE.felt,
    );
    equationTray.position.set(equation.x - 6, equation.y - 6);
    this.root.addChildAt(equationTray, 1);
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

    // Automaton last among board chrome so cubes/tray cannot bury it (PE-01).
    this.root.sortableChildren = true;
    {
      const mood = automatonState(s, this.idleMs);
      const motion = this.automatonFeel
        ? sampleAutomatonMotion(this.automatonFeel.kind, this.automatonFeel.tween.raw)
        : null;
      const friend = automaton(mood, pool, motion);
      if (friend) this.root.addChild(this.entry(friend, BOARD_BANDS.furniture));
    }
    if (this.levelIntro) this.drawLevelIntro(s);
  }
}
