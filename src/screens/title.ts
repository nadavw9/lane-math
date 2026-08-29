import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import { THINKING_AFTER_MS } from "../renderer/automaton.js";
import { button } from "../renderer/button.js";
import { star } from "../renderer/emblems.js";
import { TITLE_BANDS, Entrance } from "../renderer/entry.js";
import { DESIGN, PALETTE, TRAY_ALPHA } from "../renderer/layout.js";
import { spriteFor } from "../renderer/sprites.js";
import { UI_FONT, framedPanel, targetPlate, woodenTray } from "../renderer/tokens.js";

/**
 * THE TITLE SCREEN (GDD §7.4).
 *
 * §7.4 sends a FIRST run straight into 1-01 — no title, no tap-to-start, no
 * decision before the player has seen a board — and that stays. This screen is
 * for the RETURNING player, who arrives with a save and deserves a moment that
 * says where they are rather than being dropped back mid-ladder.
 *
 * What a top-grossing puzzle title puts here, and nothing else: logo, character,
 * ONE primary action, quiet access to settings, and the progress state visible.
 * No level select — the map is one tap further. No store, no daily reward, no
 * social.
 *
 * Built in the §9.6 material language like the map: the room behind, a brass
 * plaque for the name, a wooden tray under the numbers, and gold reserved for
 * the one thing the player came here to press.
 */
export interface TitleEvents {
  /** Continue into the level the save is sitting on. */
  readonly onContinue: () => void;
  readonly onToggleMute: () => void;
  readonly onSelectMode: (mode: string) => void;
}

export interface TitleView {
  /** The level `continue` opens, e.g. "3-07". */
  readonly continueId: string;
  readonly cleared: number;
  readonly total: number;
  readonly starsEarned: number;
  readonly restored: number;
  readonly restoreTotal: number;
  /** Which room to show behind — the world the player is in. */
  readonly world: number;
  readonly muted: boolean;
  readonly mode: string;
  /** §7.6: modes are absent before 1-10, like every other gated system. */
  readonly showModes: boolean;
}

const PAD = 12;

/**
 * How long the arrival gets before it is finished for you (see `settleTimer`).
 * Comfortably past the entrance's own duration, so a healthy screen never
 * reaches it and a starved one is never stuck behind it.
 */
const SETTLE_DEADLINE_MS = 1_200;

/** Review affordance: `?settings=1` opens the panel on arrival. */
function openSettingsRequested(): boolean {
  if (typeof window === "undefined") return false;
  return /(^|[?&])settings=1(&|$)/.test(window.location?.search ?? "");
}

export class TitleScreen {
  readonly root = new Container();
  private view: TitleView | null = null;
  private events: TitleEvents | null = null;
  private entrance: Entrance | null = null;
  private readonly rooms = new Map<number, Texture>();
  private settingsOpen = false;
  /** Milliseconds since the screen appeared, for the automaton's 9s tell. */
  private idleMs = 0;
  /**
   * WALL CLOCK, not accumulated frame deltas.
   *
   * The arrival was driven by whatever `deltaMs` the caller passed, which made
   * its duration a function of FRAME RATE rather than of time: under software
   * rendering the screen photographed frozen a third of the way in, minutes
   * after it opened. An entrance that takes 700ms should take 700ms whether the
   * machine is drawing at 120fps or at 3.
   */
  private shownAt = 0;
  /**
   * A DEADLINE, not a clock.
   *
   * The arrival is an enhancement; the screen being USABLE is not. On the live
   * build the entrance froze with only the logo drawn — frames were arriving
   * far too rarely to carry it — and a returning player's entry screen showed a
   * plaque and nothing else, no continue button at all. Whatever the frame rate
   * does, this fires once and finishes the arrival.
   *
   * setTimeout is the right tool precisely because it is NOT tied to rendering:
   * the failure being guarded is "no frames", so the guard cannot want a frame.
   */
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(base: string) {
    void this.loadRooms(base);
  }

  private async loadRooms(base: string): Promise<void> {
    for (const world of [1, 2, 3, 4]) {
      try {
        this.rooms.set(world, await Assets.load<Texture>(`${base}assets/bg/world-${world}.webp`));
        if (this.view) this.draw();
      } catch {
        /* the screen falls back to its own ground rather than failing to open */
      }
    }
  }

  attach(events: TitleEvents): void {
    this.events = events;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  show(view: TitleView): void {
    this.view = view;
    this.root.visible = true;
    /*
     * `?settings=1` opens the panel in the FIRST draw, for review.
     *
     * Same family as `?sprites=1` and `?debug`: a reviewer needs to photograph
     * a state, and driving it after the screen has already drawn means chasing
     * a repaint through a harness that cannot deliver taps to a canvas. Putting
     * it in the opening frame removes the chase entirely.
     */
    this.settingsOpen = openSettingsRequested();
    this.idleMs = 0;
    this.shownAt = performance.now();
    this.entrance = new Entrance(Object.keys(TITLE_BANDS).length);
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (!this.entrance) return;
      this.entrance = null;
      this.draw();
      this.onSettled?.();
    }, SETTLE_DEADLINE_MS);
    this.draw();
  }

  /** Called when the deadline finishes the arrival, so the shell can present. */
  onSettled: (() => void) | null = null;

  /** Review hook: is the settings panel open? */
  get isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  /** Review hook: open the settings panel without a tap. */
  openSettings(): void {
    this.settingsOpen = true;
    this.draw();
  }

  hide(): void {
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
    this.root.visible = false;
  }

  /** @returns true while something still needs redrawing. */
  advance(_deltaMs: number): boolean {
    if (!this.root.visible) return false;
    const elapsed = performance.now() - this.shownAt;
    const before = this.idleMs;
    this.idleMs = elapsed;
    // Redraw ONCE, on the crossing — not every frame for the rest of the wait.
    const crossed = before < THINKING_AFTER_MS && this.idleMs >= THINKING_AFTER_MS;

    if (this.entrance) {
      // Fed real elapsed time since the last call, so the arrival lands on
      // schedule however many frames the machine managed in between.
      if (this.entrance.advance(Math.max(0, elapsed - before))) {
        this.draw();
        return true;
      }
      this.entrance = null;
      if (this.settleTimer !== null) {
        clearTimeout(this.settleTimer);
        this.settleTimer = null;
      }
      this.draw();
      return false;
    }
    if (crossed) {
      this.draw();
      return true;
    }
    return false;
  }

  private entry(node: Container, band: number): Container {
    if (!this.entrance) return node;
    const sample = this.entrance.sample(band);
    node.position.y += sample.dy;
    node.alpha *= sample.alpha;
    return node;
  }

  private text(value: string, size: number, colour: number, weight: "bold" | "900" = "bold"): Text {
    return new Text({
      text: value,
      style: new TextStyle({ fontFamily: UI_FONT, fontSize: size, fontWeight: weight, fill: colour }),
    });
  }

  private draw(): void {
    const v = this.view;
    if (!v) return;
    this.root.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.drawRoom(v);

    /*
     * THE LOGO IS A BRASS PLAQUE, the same object the lane queues. A wordmark
     * in a typeface the game does not otherwise use would be the only thing on
     * screen not made of something.
     */
    const plateW = 268;
    const plateH = 74;
    /*
     * The plate is drawn with an EMPTY value and the name set over it. Its
     * engraved box is sized for a two-digit target, and "LANE MATH" is nine
     * characters — passing it through would either overflow the recess or
     * shrink the name to fit a hole meant for a number.
     */
    const plate = targetPlate(plateW, plateH, "", {
      fill: PALETTE.targetPlate,
      text: PALETTE.tokenInk,
      bevel: 0,
    });
    plate.position.set((DESIGN.width - plateW) / 2, 74);
    this.root.addChild(this.entry(plate, TITLE_BANDS.logo));

    const name = this.text("LANE MATH", 27, PALETTE.tokenInk, "900");
    name.anchor.set(0.5);
    name.position.set(DESIGN.width / 2, 74 + plateH / 2);
    this.root.addChild(this.entry(name, TITLE_BANDS.logo));

    this.drawAutomaton();
    this.drawContinue(v);
    this.drawProgress(v);
    this.drawSettings(v);
  }

  /** The room the player is in, cover-fitted, then pushed back so copy reads. */
  private drawRoom(v: TitleView): void {
    const texture = this.rooms.get(v.world);
    if (!texture) return;
    const sprite = new Sprite(texture);
    const scale = Math.max(DESIGN.width / texture.width, DESIGN.height / texture.height);
    sprite.scale.set(scale);
    sprite.position.set(
      (DESIGN.width - texture.width * scale) / 2,
      (DESIGN.height - texture.height * scale) / 2,
    );
    this.root.addChild(sprite);

    // No tokens live on this screen, so there is no §9.1 gate to meet — but the
    // copy still has to read, so the room is pushed back a stop.
    const veil = new Graphics();
    veil.rect(0, 0, DESIGN.width, DESIGN.height).fill({ color: 0x1a0f08, alpha: 0.34 });
    this.root.addChild(veil);
  }

  /**
   * THE AUTOMATON, at nearly three times its board size.
   *
   * On the board it is 88px standing in the pool's left margin, occluded — it
   * has to be, because the bands fill the surface. This screen has a middle
   * third doing nothing, and it is the only place in the game the character can
   * actually be looked at. Same 9s tell as the board: calm, then thinking.
   */
  private drawAutomaton(): void {
    const state = this.idleMs >= THINKING_AFTER_MS ? "thinking" : "calm";
    const entry = spriteFor(`automaton-${state}`);
    if (!entry) return;
    const height = 240;
    const sprite = new Sprite(entry.texture);
    sprite.scale.set(height / sprite.height);
    sprite.anchor.set(0.5, 1);
    sprite.position.set(DESIGN.width / 2, 512);
    this.root.addChild(this.entry(sprite, TITLE_BANDS.automaton));
  }

  /**
   * ONE PRIMARY CONTROL, and it names its destination.
   *
   * "continue · 3-07" rather than "play": the player is resuming a specific
   * board and the screen should say which, so pressing it is a decision rather
   * than an act of faith. Gold, because §9.6 gives gold to ready and this is the
   * one ready thing on the screen.
   */
  private drawContinue(v: TitleView): void {
    const w = 244;
    const h = 52;
    const control = button({
      width: w,
      height: h,
      label: `continue · ${v.continueId}`,
      fontSize: 17,
      labelColour: PALETTE.highlight,
      fill: PALETTE.slotFilled,
      outline: PALETTE.highlight,
      onTap: () => this.events?.onContinue(),
    });
    control.position.set((DESIGN.width - w) / 2, 560);
    this.root.addChild(this.entry(control, TITLE_BANDS.cta));
  }

  /**
   * THREE NUMBERS, quietly — how far through the ladder, what has been earned,
   * and how much of the Academy is standing. On a tray, so the line reads as a
   * label on the desk rather than text floating over a photograph.
   */
  private drawProgress(v: TitleView): void {
    const row = new Container();
    const glyph = 13;

    const cleared = this.text(`${v.cleared} of ${v.total} cleared`, 13, PALETTE.text);
    const dot = this.text("  ·  ", 13, PALETTE.text);
    const earned = this.text(`${v.starsEarned}`, 13, PALETTE.text);
    const mark = star(glyph);
    const academy = this.text(`  ·  Academy ${v.restored} of ${v.restoreTotal}`, 13, PALETTE.text);

    /*
     * The star is an OBJECT, never a ★ in the string. Outfit has no U+2605 to
     * give, and §9.7's font rule means an unsuppliable glyph ships as a
     * fallback box — the same defect the restore confirm had.
     *
     * `star()` draws from its CENTRE, so it is laid out on its half-width and
     * advances by its full one. Treating it like the Texts, which draw from
     * their top-left, pulled it back over the number it follows.
     */
    let x = 0;
    for (const part of [cleared, dot, earned, mark, academy]) {
      if (part === mark) {
        part.position.set(x + glyph / 2, glyph / 2 + 2);
        x += glyph + 4;
        row.addChild(part);
        continue;
      }
      part.position.set(x, 0);
      row.addChild(part);
      x += part.width + 2;
    }

    const tray = woodenTray(x + 24, 34, PALETTE.tray, TRAY_ALPHA);
    tray.position.set((DESIGN.width - (x + 24)) / 2, 636);
    this.root.addChild(this.entry(tray, TITLE_BANDS.progress));

    row.position.set((DESIGN.width - x) / 2, 646);
    this.root.addChild(this.entry(row, TITLE_BANDS.progress));
  }

  /**
   * SETTINGS, bottom-right and quiet — sound and, once §7.6 opens it, mode.
   *
   * Closed it is one small control. Open it is a framedPanel like every other
   * modal surface in the game, which is the rule the §9.0 sweep settled: no
   * panel gets its own treatment without a stated reason.
   */
  private drawSettings(v: TitleView): void {
    const w = 92;
    const h = 34;
    const x = DESIGN.width - PAD - w;
    /*
     * NOT flush to the bottom edge. The surface is letterboxed to CONTAIN, so
     * the last few design rows are the first thing a short viewport gives up,
     * and a settings control the player cannot reach is worse than one sitting
     * a little higher. It also closes the empty third the first draft left
     * between the progress line and the bottom of the desk.
     */
    const y = 706;

    const toggle = button({
      width: w,
      height: h,
      label: this.settingsOpen ? "close" : "settings",
      fontSize: 13,
      labelColour: PALETTE.tokenInk,
      fill: PALETTE.slotFilled,
      onTap: () => {
        this.settingsOpen = !this.settingsOpen;
        this.draw();
      },
    });
    toggle.position.set(x, y);
    this.root.addChild(this.entry(toggle, TITLE_BANDS.settings));

    if (!this.settingsOpen) return;

    /*
     * OPEN, IT IS A MODAL — dimmed ground, panel centred.
     *
     * The first draft opened it upward from the toggle, which put its top edge
     * at y 568 and straight through the continue button at 560. Every other
     * panel in this game dims what is behind it and takes the middle; there is
     * no reason for this one to be the exception, and "opens into the primary
     * control" is not a layout, it is a collision.
     */
    const dim = new Graphics();
    dim.rect(0, 0, DESIGN.width, DESIGN.height).fill({ color: 0x1a0f08, alpha: 0.55 });
    dim.eventMode = "static";
    dim.on("pointertap", () => {
      this.settingsOpen = false;
      this.draw();
    });
    this.root.addChild(dim);

    const panelW = DESIGN.width - PAD * 2;
    const panelH = v.showModes ? 128 : 78;
    const panelY = Math.round((DESIGN.height - panelH) / 2);
    const frame = framedPanel(panelW, panelH);
    frame.panel.position.set(PAD, panelY);
    this.root.addChild(frame.panel);

    const innerX = PAD + frame.interior.x;
    const innerY = panelY + frame.interior.y;

    const sound = button({
      width: frame.interior.width,
      height: 32,
      label: v.muted ? "sound off" : "sound on",
      fontSize: 14,
      labelColour: v.muted ? PALETTE.tokenInk : PALETTE.highlight,
      fill: PALETTE.slotFilled,
      onTap: () => this.events?.onToggleMute(),
    });
    sound.position.set(innerX, innerY + 6);
    // entry-exempt: the settings panel opens on demand, not on arrival
    this.root.addChild(sound);

    if (!v.showModes) return;

    /*
     * §6 LIVES HERE NOW. It was three chips on the BOARD's status row, where it
     * overflowed the band and covered the map button, and where it had to wait
     * until level 30 for the room. A choice about how you play belongs with the
     * other settings, not among the controls pressed mid-puzzle.
     */
    const label = this.text("difficulty", 12, PALETTE.tray);
    label.position.set(innerX, innerY + 46);
    // entry-exempt: the settings panel opens on demand, not on arrival
    this.root.addChild(label);

    const chipW = (frame.interior.width - 12) / 3;
    ["casual", "normal", "expert"].forEach((mode, i) => {
      const active = v.mode === mode;
      const chip = button({
        width: chipW,
        height: 32,
        label: mode,
        fontSize: 13,
        labelColour: active ? PALETTE.highlight : PALETTE.tokenInk,
        fill: active ? PALETTE.slotFilled : PALETTE.felt,
        outline: active ? PALETTE.highlight : undefined,
        onTap: () => this.events?.onSelectMode(mode),
      });
      chip.position.set(innerX + i * (chipW + 6), innerY + 64);
      // entry-exempt: the settings panel opens on demand, not on arrival
      this.root.addChild(chip);
    });
  }
}
