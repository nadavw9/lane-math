import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import { button } from "../renderer/button.js";
import { emblemMeter, meterWidth, star } from "../renderer/emblems.js";
import { MAP_BANDS, Entrance } from "../renderer/entry.js";
import { DESIGN, DIM, PALETTE, TRAY_ALPHA } from "../renderer/layout.js";
import { UI_FONT, targetPlate, woodenTray } from "../renderer/tokens.js";
import type { MapLevel, MapView } from "./model.js";

/**
 * The world map (GDD §7.6, unlocked by clearing 1-10).
 *
 * Built in the §9.6 material language rather than as a menu: the same squared
 * paper, the same wooden tray, the same navy plates and the single gold accent.
 * A level is a plate you can pick up, which is the same object the lane is full
 * of — the map is the same desk seen from further back.
 *
 * It exists because the board had nowhere to put best-ever stars, the banked
 * total, lives or the hint shop, and was trying to show them all in the lane
 * header at once.
 */
export interface MapEvents {
  readonly onPlay: (levelId: string) => void;
  readonly onToggleMute: () => void;
  readonly onOpenShop: () => void;
  readonly onSelectMode: (mode: string) => void;
}

const PAD = 12;
const COLS = 5;
const CELL = 62;
const GAP = 8;

export class MapScreen {
  readonly root = new Container();
  private view: MapView | null = null;
  private events: MapEvents | null = null;
  /** The map ARRIVES (§9.0), it does not appear. */
  private entrance: Entrance | null = null;

  /**
   * The four rooms, keyed by world (ART_DIRECTION §5, §6).
   *
   * The map is where the rooms can actually be seen. On the board they are 6%
   * of the screen — measured — because the board has earned its 84% and the
   * lane's lining cannot open without dropping plaques to 1.2:1. Here there is
   * room, so each world block sits in its own room and the player sees where
   * they are going.
   */
  private rooms = new Map<number, Texture>();

  constructor() {
    this.root.visible = false;
  }

  /** Load the room art. Safe to call repeatedly; a failure leaves the wood. */
  async loadRooms(base = "/"): Promise<void> {
    for (const world of [1, 2, 3, 4]) {
      if (this.rooms.has(world)) continue;
      try {
        this.rooms.set(world, await Assets.load<Texture>(`${base}assets/bg/world-${world}.webp`));
      } catch {
        // The wooden tray underneath is the fallback, and it is a designed
        // surface rather than a blank — a missing room costs depth, not sense.
      }
    }
  }

  attach(events: MapEvents): void {
    this.events = events;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  show(view: MapView): void {
    this.view = view;
    this.root.visible = true;
    this.entrance = new Entrance(Object.keys(MAP_BANDS).length);
    this.draw();
  }

  /** @returns true while the arrival is still running. */
  advance(deltaMs: number): boolean {
    if (!this.entrance) return false;
    if (this.entrance.advance(deltaMs)) {
      this.draw();
      return true;
    }
    this.entrance = null;
    this.draw();
    return false;
  }

  /** Offset a node for its arrival band. */
  private entry(node: Container, band: number): Container {
    if (!this.entrance) return node;
    const sample = this.entrance.sample(band);
    node.position.y += sample.dy;
    node.alpha *= sample.alpha;
    return node;
  }

  hide(): void {
    this.root.visible = false;
  }

  private text(value: string, size: number, colour: number, weight: "bold" | "900" = "bold"): Text {
    return new Text({
      text: value,
      style: new TextStyle({
        fontFamily: UI_FONT,
        fontSize: size,
        fontWeight: weight,
        fill: colour,
      }),
    });
  }

  /** Every control on the map is the same button as everywhere else. */
  private chip(
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    colour: number,
    onTap?: () => void,
    emblem?: () => Container,
  ): Container {
    const control = button({
      width: w,
      height: h,
      label: text,
      labelColour: colour,
      emblem,
      onTap,
    });
    control.position.set(x, y);
    this.root.addChild(control);
    return control;
  }

  /**
   * One level: a hexagonal plate, the same object the lane queues.
   *
   * Locked levels are DIMMED, not absent — §7.6's absent-before-unlock rule is
   * about SYSTEMS the player has no use for yet, not about the ladder itself.
   * Seeing that there are forty levels is the point of a map.
   */
  private plate(level: MapLevel, x: number, y: number, band: number): void {
    const w = CELL;
    const h = CELL * 0.66;

    /*
     * A REAL BUTTON, not a bare hit area with a listener.
     *
     * These are forty of the most-pressed controls in the game and they had no
     * pressed state at all. Locked plates are `unavailable` rather than
     * `disabled`: a locked level does not become playable by waiting, only by
     * clearing the one before it.
     */
    const control = button({
      width: w,
      height: h,
      shape: "hex",
      // The plate's face is the brass casting below; the button supplies the
      // hit area and the four states, and must not paint over it.
      label: "",
      fill: PALETTE.targetPlate,
      state: level.state === "locked" ? "unavailable" : "idle",
      onTap: level.state === "locked" ? undefined : () => this.events?.onPlay(level.id),
    });

    /*
     * BRASS, the same casting the lane queues (ART_DIRECTION §5).
     *
     * The map drew its own navy hexagon, so the object standing for a level on
     * the map and the object standing for it in play were different things.
     * `targetPlate` is the lane's, sprite and recessed numeral included, which
     * also answers §9.0's depth complaint without inventing a second treatment.
     *
     * A SEAT UNDERNEATH, because the block behind is now a room: brass on bare
     * room measures 1.11-1.27:1. The plates carry their own ground so the room
     * can stay visible between them rather than being veiled to death.
     */
    const seat = new Graphics();
    for (let i = 3; i >= 1; i--) {
      seat.roundRect(-i * 0.8, 2 + i * 1.2, w + i * 1.6, h + i, 8).fill({ color: 0x1a0f08, alpha: 0.12 });
    }
    seat.roundRect(-2, -2, w + 4, h + 4, 8).fill({ color: PALETTE.felt, alpha: 0.85 });
    control.addChildAt(seat, 0);

    const face = targetPlate(
      w,
      h,
      String(level.slot),
      {
        fill: level.state === "cleared" ? PALETTE.targetFront : PALETTE.targetPlate,
        text: PALETTE.tokenInk,
        // Flat, like the lane's: a target is a thing you spend tiles ON, and
        // the map plate stands for the same object.
        bevel: 0,
        outline: level.state === "cleared" ? PALETTE.highlight : undefined,
      },
      level.slot,
    );
    if (level.state === "locked") face.alpha = DIM.alpha;
    control.addChild(face);

    // Best-ever stars, which only a cleared plate has.
    if (level.state === "cleared") {
      // Drawn objects, not glyphs: Outfit has no star, so this used to be
      // whatever dingbat the device shipped (see emblems.ts).
      // 8, and sat low: at 9 the row clipped the numeral's descender, which is
      // the kind of overlap that only shows up once real progress is on screen.
      const size = 8;
      const stars = emblemMeter("star", level.stars, 3, size);
      stars.position.set((w - meterWidth(3, size)) / 2, h - 7 - size / 2);
      control.addChild(stars);
    }

    control.position.set(x, y);
    // The one OPEN level lands last: forty plates, and that is the door (§9.0).
    this.root.addChild(this.entry(control, level.state === "open" ? MAP_BANDS.open : band));
  }

  private draw(): void {
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
    const v = this.view;
    if (!v) return;

    const width = DESIGN.width - PAD * 2;

    /*
     * --- header: the desk, with the totals that were crowding the board ---
     *
     * Wooden, not squared paper. The header's own name has always said "the
     * desk" while it drew graph paper — a §9.1 classroom surface that
     * ART_DIRECTION §10 superseded with the desk-in-room scenes. It was the
     * last paper surface left in the game.
     */
    const header = woodenTray(width, 58, PALETTE.tray, TRAY_ALPHA);
    header.position.set(PAD, PAD);
    this.root.addChild(this.entry(header, MAP_BANDS.header));

    const title = this.text("LANE MATH", 18, PALETTE.text, "900");
    title.position.set(PAD + 10, PAD + 9);
    this.root.addChild(this.entry(title, MAP_BANDS.header));

    // Banked total. The map is the only place this belongs (§9.6: gold = earned).
    // The count reads as text and the star reads as an object, so the emblem is
    // placed after the number rather than being a character inside it.
    const bankedStar = 15;
    const banked = this.text(`${v.starsAvailable}`, 17, PALETTE.highlightInk);
    banked.anchor.set(1, 0);
    banked.position.set(DESIGN.width - PAD - 10 - bankedStar - 4, PAD + 9);
    this.root.addChild(this.entry(banked, MAP_BANDS.header));
    const bankedEmblem = star(bankedStar);
    bankedEmblem.position.set(DESIGN.width - PAD - 10 - bankedStar / 2, PAD + 9 + bankedStar * 0.62);
    this.root.addChild(this.entry(bankedEmblem, MAP_BANDS.header));

    // §7.6: lives are ABSENT before 2-8, not greyed out.
    if (v.showLives) {
      // §8: a brass pocket-watch, not a heart. Lives refill on a timer, so the
      // object that stands for one is a clock.
      const lives = emblemMeter("life", v.lives, v.maxLives, 14);
      lives.position.set(PAD + 10, PAD + 33);
      this.root.addChild(lives);
    }

    const muteLabel = v.muted ? "sound off" : "sound on";
    this.chip(DESIGN.width - PAD - 84, PAD + 30, 84, 20, muteLabel, PALETTE.tokenInk, () =>
      this.events?.onToggleMute(),
    );

    // --- the ladder: four worlds, ten levels each ---
    let y = PAD + 58 + 14;
    for (const world of v.worlds) {
      const levels = v.levels.filter((l) => l.world === world);
      const rows = Math.ceil(levels.length / COLS);
      const trayH = rows * (CELL * 0.66 + GAP) - GAP + 30;

      /*
       * THE WORLD'S ROOM, behind its levels (§9.0 depth, focal point).
       *
       * Cover-fitted and masked to the block, so each world shows a different
       * slice of its own scene rather than a tiled swatch. The wooden tray
       * stays ON TOP of it as the frame — that is what keeps the block reading
       * as a shelf holding plates rather than as a photograph with buttons on.
       */
      const block = new Container();
      const room = this.rooms.get(world);
      if (room) {
        const art = new Sprite(room);
        const cover = Math.max(width / room.width, trayH / room.height);
        art.scale.set(cover);
        art.anchor.set(0.5);
        art.position.set(width / 2, trayH / 2);
        const mask = new Graphics().roundRect(0, 0, width, trayH, 10).fill(0xffffff);
        art.mask = mask;
        /*
         * A SCRIM, at the opacity the lane sweep proved necessary.
         *
         * Brass on bare room measures 1.11-1.27:1 — the same reason the lane
         * cannot open. The plates carry their own seat below, so this only has
         * to take the room far enough down that the grid reads as foreground.
         */
        const scrim = new Graphics()
          .roundRect(0, 0, width, trayH, 10)
          .fill({ color: PALETTE.felt, alpha: 0.55 });
        block.addChild(art, mask, scrim);
      }
      const tray = woodenTray(width, trayH, PALETTE.tray, room ? TRAY_ALPHA * 0.45 : TRAY_ALPHA);
      block.addChild(tray);
      block.position.set(PAD, y);
      this.root.addChild(this.entry(block, MAP_BANDS.header + world));

      const name = this.text(`WORLD ${world}`, 11, PALETTE.text, "900");
      name.position.set(PAD + 10, y + 7);
      this.root.addChild(this.entry(name, MAP_BANDS.header + world));

      const gridWidth = COLS * CELL + (COLS - 1) * GAP;
      const left = (DESIGN.width - gridWidth) / 2;
      levels.forEach((level, i) => {
        this.plate(
          level,
          left + (i % COLS) * (CELL + GAP),
          y + 24 + Math.floor(i / COLS) * (CELL * 0.66 + GAP),
          MAP_BANDS.header + world,
        );
      });

      y += trayH + 12;
    }

    /*
     * THE TAIL OF THE MAP, designed rather than left over (§9.0).
     *
     * There used to be ~280px of bare paper below World 4 — the screen simply
     * ended because it ran out of content. It now closes with a progress line,
     * which is information the player wants at exactly the moment they have
     * finished scanning the ladder.
     *
     * STILL BLOCKED ON ART: ART_DIRECTION §6 makes this space the Academy
     * restoration — the rooms furnishing themselves as stars are spent — and
     * that is the real answer. This is a composed placeholder, not the design.
     */
    const cleared = v.levels.filter((l) => l.state === "cleared").length;
    // Text, emblem, text — measured and centred as one run, because the star is
    // an object now and cannot be a character in the middle of a string.
    const progress = new Container();
    const size = 11;
    /*
     * CREAM, not ink. This line was `PALETTE.text` at alpha 0.75 — the
     * ink-on-PAPER colour — sitting on a wooden desk, which is the same error
     * as the warning panel's cream card: a colour chosen for the ground the
     * screen used to have. Measured against the desk it read 1.92:1; cream
     * takes it to 6.49:1.
     */
    const head = this.text(`${cleared} of ${v.levels.length} cleared · ${v.totalStars}`, 12, PALETTE.tokenInk);
    const mark = star(size);
    const tail = this.text("earned", 12, PALETTE.tokenInk);
    const gap = 4;
    head.position.set(0, 0);
    mark.position.set(head.width + gap + size / 2, head.height / 2);
    tail.position.set(head.width + gap + size + gap, 0);
    progress.addChild(head, mark, tail);
    progress.position.set(DESIGN.width / 2 - (head.width + tail.width + size + gap * 2) / 2, y + 44);
    progress.alpha = 0.9;
    this.root.addChild(this.entry(progress, MAP_BANDS.footer));

    // --- footer: shop and modes, each absent before its unlock (§7.6) ---
    let footerX = PAD;
    if (v.showShop) {
      this.chip(
        footerX,
        y,
        104,
        30,
        `hints ${v.starsAvailable}`,
        PALETTE.highlight,
        () => this.events?.onOpenShop(),
        () => star(11),
      );
      footerX += 112;
    }
    if (v.showModes) {
      for (const mode of ["casual", "normal", "expert"]) {
        const active = v.mode === mode;
        this.chip(
          footerX,
          y,
          62,
          30,
          mode,
          active ? PALETTE.highlight : PALETTE.tokenInk,
          () => this.events?.onSelectMode(mode),
        ).alpha = active ? 1 : DIM.alpha;
        footerX += 66;
      }
    }
  }
}
