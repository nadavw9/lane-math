import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import { button, type ButtonState, type ButtonVariant } from "../renderer/button.js";
import { emblemMeter, meterWidth, star } from "../renderer/emblems.js";
import { MAP_BANDS, Entrance } from "../renderer/entry.js";
import { DESIGN, DIM, PALETTE, SAFE_TOP, TRAY_ALPHA } from "../renderer/layout.js";
import { UI_FONT, framedPanel, targetPlate, woodenTray } from "../renderer/tokens.js";
import { OBJECTS, objectsFor, slotsFor, veiled, type Restored } from "./veil.js";
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
  /** Buy the next Academy object in this world (ART_DIRECTION §6). */
  readonly onRestore: (world: number) => void;
}

/** §1's names for the four rooms. The map shows the room; it should say so. */
const WORLD_NAMES: Readonly<Record<number, string>> = {
  1: "Classroom",
  2: "Library",
  3: "Laboratory",
  4: "Observatory",
};

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
  /** Which room's next object the player is being asked to confirm (§6). */
  private pendingRestore: number | null = null;
  /**
   * Progress through the completion moment, 0-1, or null when not running
   * (ART_DIRECTION §6).
   *
   * Four rooms moving at once happens nowhere else in the game, and that is the
   * whole of why it reads as completion rather than as a fifth purchase — so it
   * is a single scalar driving every vignette, not four independent tweens that
   * could drift apart.
   */
  private completion: number | null = null;

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
    const before = this.view;
    if (before) {
      const was = [1, 2, 3, 4].reduce((t, w) => t + (before.restored[w] ?? 0), 0);
      const now = [1, 2, 3, 4].reduce((t, w) => t + (view.restored[w] ?? 0), 0);
      // The sixteenth object, and only the sixteenth.
      if (was === 15 && now === 16) this.completion = 0;
    }
    this.view = view;
    this.root.visible = true;
    this.entrance = new Entrance(Object.keys(MAP_BANDS).length);
    this.draw();
  }

  /** Open the restore confirm for a world. Review hook and real entry point. */
  openRestoreConfirm(world: number): void {
    this.pendingRestore = world;
    this.draw();
  }

  /** @returns true while the arrival is still running. */
  /** §6's completion sweep, in milliseconds. */
  private static readonly COMPLETION_MS = 900;

  advance(deltaMs: number): boolean {
    if (this.completion !== null) {
      this.completion += deltaMs / MapScreen.COMPLETION_MS;
      if (this.completion >= 1) this.completion = null;
      this.draw();
      return true;
    }
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
    onTap?: () => void,
    emblem?: () => Container,
    options: {
      readonly variant?: ButtonVariant;
      readonly state?: ButtonState;
      readonly armed?: boolean;
    } = {},
  ): Container {
    const control = button({
      width: w,
      height: h,
      label: text,
      variant: options.variant,
      state: options.state,
      armed: options.armed,
      emblem,
      onTap,
    });
    control.position.set(x, y);
    /*
     * entry-exempt: `chip` is a generic helper and its CALLERS decide the band —
     * the shop chip, the mode chips and the mute toggle all arrive with the
     * footer. Wrapping here would put every chip on one band regardless.
     */
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
    /*
     * OPAQUE UNDER A LOCKED PLATE (§9.6).
     *
     * Dim is LESS PRESENCE, not a different substance — and presence is exactly
     * what a locked plate lost when the block behind it became a room. The
     * numerals were never the problem: measured 6.81:1 on fully-locked World 4
     * against a 4.5:1 text bar, because the digit and its recessed panel dim
     * together. What went was the plate's separation from the scene behind it.
     *
     * So the seat carries it. An opaque ground under a locked plate restores
     * the separation without touching a colour, which is what §9.6 asks for.
     */
    seat
      .roundRect(-2, -2, w + 4, h + 4, 8)
      .fill({ color: PALETTE.felt, alpha: level.state === "locked" ? 1 : 0.85 });

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

    // Best-ever stars, which only a cleared plate has.
    if (level.state === "cleared") {
      // Drawn objects, not glyphs: Outfit has no star, so this used to be
      // whatever dingbat the device shipped (see emblems.ts).
      // 8, and sat low: at 9 the row clipped the numeral's descender, which is
      // the kind of overlap that only shows up once real progress is on screen.
      const size = 8;
      const stars = emblemMeter("star", level.stars, 3, size);
      stars.position.set((w - meterWidth(3, size)) / 2, h - 7 - size / 2);
      face.addChild(stars);
    }

    const control = button({
      width: w,
      height: h,
      shape: "hex",
      // The casting is the body. Supplying it as the face keeps the button
      // backing transparent and sinks the plaque itself under a press.
      label: "",
      face: () => face,
      state: level.state === "locked" ? "unavailable" : "idle",
      onTap: level.state === "locked" ? undefined : () => this.events?.onPlay(level.id),
    });
    control.addChildAt(seat, 0);

    control.position.set(x, y);
    // The one OPEN level lands last: forty plates, and that is the door (§9.0).
    this.root.addChild(this.entry(control, level.state === "open" ? MAP_BANDS.open : band));
  }

  /**
   * THE ACADEMY SHELF (ART_DIRECTION §6).
   *
   * One wide brass frame holding four vignettes, not four separate panels: at
   * this width each room gets about 95px, and four small scenes in one frame
   * read as a set — which is what "the Academy" is — where four framed panels
   * would read as four unrelated widgets.
   *
   * Built before any restoration object exists, deliberately. The veil is the
   * mechanism (§6), so if a quarter of the darkness retreating is not a visible
   * change at this size, no amount of globes and telescopes will save it, and
   * that is worth knowing before the art is commissioned.
   */
  private academyShelf(rect: { x: number; y: number; width: number; height: number }, v: MapView): void {
    if (rect.height < 120) return;

    const shelf = new Container();
    const panelH = Math.min(rect.height, 168);
    const framed = framedPanel(rect.width, panelH);
    shelf.addChild(framed.panel);

    /*
     * THE FRAME CATCHES LIGHT, left to right, during the completion moment.
     *
     * A narrow band swept across the brass rather than a glow over it: the
     * frame already reads as a lit material, so light MOVING along it is the
     * same substance behaving, where a bloom would be an effect laid on top.
     * §9.5's register is weight, not energy.
     */
    if (this.completion !== null) {
      const t = this.completion;
      const sweepX = -0.25 + t * 1.5;
      const band = new Graphics();
      for (let i = 0; i < 4; i++) {
        const x = (sweepX - i * 0.035) * rect.width;
        band
          .roundRect(x, 0, rect.width * 0.10, panelH, 6)
          .fill({ color: PALETTE.brassLit, alpha: 0.11 * (1 - i * 0.2) * Math.sin(Math.PI * t) });
      }
      const clip = new Graphics().roundRect(0, 0, rect.width, panelH, 12).fill(0xffffff);
      band.mask = clip;
      shelf.addChild(clip, band);
    }

    const inner = framed.interior;
    const title = this.text("THE ACADEMY", 11, PALETTE.tokenInk, "900");
    title.position.set(inner.x + 10, inner.y + 6);
    shelf.addChild(title);

    const restoredTotal = [1, 2, 3, 4].reduce((t, w) => t + (v.restored[w] ?? 0), 0);
    /*
     * A FINISHED ACADEMY SHOWS ITS NAME, NOT ITS ARITHMETIC (§6).
     *
     * Permanent, not part of the 900ms moment: the counter does not come back
     * on the next visit. Counting to sixteen is what the player was doing;
     * once they have stopped, saying "16 of 16" forever would keep them in it.
     */
    const finished = restoredTotal >= 16;
    const line = this.text(
      finished ? "The Academy is yours." : `${restoredTotal} of 16 restored`,
      11,
      finished ? PALETTE.highlight : PALETTE.tray,
    );
    line.position.set(inner.x + inner.width - line.width - 10, inner.y + 6);
    shelf.addChild(line);

    // Four vignettes across the interior, sized to what is left after the title.
    const top = inner.y + 24;
    const vh = Math.max(40, inner.height - 30);
    const gap = 6;
    const vw = (inner.width - gap * 3) / 4;

    for (let i = 0; i < 4; i++) {
      const world = i + 1;
      const x = inner.x + i * (vw + gap);
      const cell = new Container();
      cell.position.set(x, top);

      const room = this.rooms.get(world);
      if (room) {
        /*
         * CROPPED TO THE ROOM HALF (§6).
         *
         * The desk edge sits at ~61% of the 900x2100 plate, measured by row
         * focus energy. Cover-fitting the WHOLE plate into a 95x110 cell spent
         * about 40% of it on desk that is identical in both states — the
         * before/after diluted by inert wood. Fitting the room half instead
         * gives the same footprint ~60% more usable area, and the shelf's brass
         * frame is the surrounding surface the desk was standing in for.
         *
         * §6's no-veiled-desk rule is untouched: it governs the BOARD, where
         * the desk is what the player plays on.
         */
        const ROOM_FRACTION = 0.61;
        const roomH = room.height * ROOM_FRACTION;
        const art = new Sprite(room);
        const cover = Math.max(vw / room.width, vh / roomH);
        art.scale.set(cover);
        art.anchor.set(0.5);
        // Land the ROOM HALF's centre in the cell, not the whole plate's.
        art.position.set(vw / 2, vh / 2 - (roomH / 2 - room.height / 2) * cover);
        const mask = new Graphics().roundRect(0, 0, vw, vh, 5).fill(0xffffff);
        art.mask = mask;
        cell.addChild(art, mask);

        // The cell is now ALL room, so the veil covers all of it.
        const overlay = veiled(art, {
          width: vw,
          height: vh,
          roomFraction: 1,
          restored: (v.restored[world] ?? 0) as Restored,
          world,
        });
        /*
         * ALL FOUR AT ONCE (§6). Each room's own veil is already gone by the
         * time the sixteenth object lands, so what fades here is the last of
         * the cast across every vignette together — the one moment in the game
         * where the four move as one.
         */
        if (this.completion !== null) overlay.alpha = 1 - this.completion;
        /*
         * Objects UNDER the veil, so a room that is half restored shows its
         * earned furniture through the remaining darkness rather than in front
         * of it. The drapes cover the slots that are still unbought.
         */
        const props = objectsFor(world, (v.restored[world] ?? 0) as Restored, vw, vh);
        props.mask = mask;
        cell.addChild(props);

        overlay.mask = mask;
        cell.addChild(overlay);
      }

      /*
       * THE NEXT DRAPE IS THE BUY BUTTON (§6).
       *
       * The drape is already the affordance — it is the visible "something is
       * under here", it sits at a known slot, and it is the thing that
       * disappears. A shop row would make restoration a third hint, and §6 is
       * explicit that it is the GOAL rather than a spend.
       *
       * The slot boxes are 21x24 to 38x44 design px, under a comfortable tap
       * target, so the hit area is the slot expanded to a 44px minimum. The
       * four slots are far enough apart that this does not overlap.
       */
      const done = (v.restored[world] ?? 0) as Restored;
      const cost = v.restoreCost[world] ?? null;
      if (cost !== null && done < 4) {
        const slot = slotsFor(world)[done]!;
        const cx = slot.x * vw;
        const cy = (slot.y + slot.h / 2) * vh;
        const hw = Math.max(44, slot.w * vw) / 2;
        const hh = Math.max(44, slot.h * vh) / 2;
        const hit = new Graphics()
          .rect(cx - hw, cy - hh, hw * 2, hh * 2)
          .fill({ color: 0xffffff, alpha: 0.001 });
        hit.eventMode = "static";
        hit.cursor = "pointer";
        hit.on("pointertap", () => {
          this.pendingRestore = world;
          this.draw();
        });
        cell.addChild(hit);
      }

      cell.addChild(
        new Graphics().roundRect(0, 0, vw, vh, 5).stroke({ width: 1.5, color: 0x000000, alpha: 0.35 }),
      );
      const label = this.text(String(world), 10, PALETTE.tokenInk, "900");
      label.position.set(4, vh - 14);
      cell.addChild(label);
      shelf.addChild(cell);
    }

    shelf.position.set(rect.x, rect.y);
    this.root.addChild(this.entry(shelf, MAP_BANDS.footer));

    if (this.pendingRestore !== null) this.restoreConfirm(rect, v, this.pendingRestore);
  }

  /**
   * "Restore the reading lamp — 2★, you have 7."
   *
   * §6 wants the price visible whether or not it can be paid: seeing what the
   * next thing costs IS the loop, so an unaffordable object shows a disabled
   * button and its cost rather than hiding. That is the opposite of §7.6's
   * absent-before-unlock rule, and deliberately — a locked SYSTEM has nothing
   * to say, an unaffordable object has a price.
   */
  private restoreConfirm(
    rect: { x: number; y: number; width: number; height: number },
    v: MapView,
    world: number,
  ): void {
    const done = (v.restored[world] ?? 0) as Restored;
    const cost = v.restoreCost[world];
    if (cost === null || cost === undefined || done >= 4) {
      this.pendingRestore = null;
      return;
    }
    const name = (OBJECTS[world] ?? [])[done] ?? "object";
    const affordable = v.starsAvailable >= cost;

    const w = Math.min(300, rect.width - 24);
    const h = 116;
    const x = rect.x + (rect.width - w) / 2;
    const y = rect.y + Math.max(8, (rect.height - h) / 2);

    const panel = new Container();
    const framed = framedPanel(w, h);
    panel.addChild(framed.panel);
    const inner = framed.interior;

    const title = this.text(name.replace(/-/g, " "), 15, PALETTE.tokenInk, "900");
    title.anchor.set(0.5, 0);
    title.position.set(inner.x + inner.width / 2, inner.y + 6);
    panel.addChild(title);

    /*
     * The price is the same line whether or not it can be paid, and it is NOT
     * failure red: §9.6's red measured 1.69:1 on the felt — the one place the
     * player most needs to read the number, made least legible by the colour
     * meant to signal it. The refusal is carried by the disabled button, which
     * says "not enough" in words; the price stays legible at 7.58:1.
     */
    /*
     * THE STARS ARE OBJECTS, not characters in the string.
     *
     * This line carried two literal U+2605s and the font coverage gate is
     * right to refuse them: the UI face cannot supply that glyph, so it would
     * ship as a fallback box or nothing at all on a device without a system
     * font that has it. The same fix as the star meter, the life marker and
     * the hint mark — the map header already draws its banked total this way,
     * a number followed by a drawn star.
     */
    const priceGlyph = 11;
    const priceRun = new Container();
    const costText = this.text(`${cost}`, 11, PALETTE.tray);
    const costStar = star(priceGlyph);
    const sep = this.text("  ·  you have ", 11, PALETTE.tray);
    const haveText = this.text(`${v.starsAvailable}`, 11, PALETTE.tray);
    const haveStar = star(priceGlyph);

    let runX = 0;
    for (const part of [costText, costStar, sep, haveText, haveStar]) {
      part.position.set(runX, part === costStar || part === haveStar ? priceGlyph / 2 + 1 : 0);
      priceRun.addChild(part);
      runX += part.width + 2;
    }
    priceRun.position.set(inner.x + inner.width / 2 - runX / 2, inner.y + 28);
    panel.addChild(priceRun);

    const bw = (inner.width - 12) / 2;
    const cancel = button({
      width: bw,
      height: 32,
      label: "Cancel",
      variant: "secondary",
      onTap: () => {
        this.pendingRestore = null;
        this.draw();
      },
    });
    cancel.position.set(inner.x, inner.y + 50);
    panel.addChild(cancel);

    const buy = button({
      width: bw,
      height: 32,
      label: affordable ? "Restore" : "Not Enough",
      variant: "primary",
      // Disabled, not hidden: the price is the point (§6).
      state: affordable ? "idle" : "unavailable",
      onTap: affordable
        ? () => {
            this.pendingRestore = null;
            this.events?.onRestore(world);
          }
        : undefined,
    });
    buy.position.set(inner.x + bw + 12, inner.y + 50);
    panel.addChild(buy);

    panel.position.set(x, y);
    this.root.addChild(this.entry(panel, MAP_BANDS.footer));
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
    header.position.set(PAD, SAFE_TOP);
    this.root.addChild(this.entry(header, MAP_BANDS.header));

    const title = this.text("LANE MATH", 18, PALETTE.text, "900");
    title.position.set(PAD + 10, SAFE_TOP + 9);
    this.root.addChild(this.entry(title, MAP_BANDS.header));

    // Banked total. The map is the only place this belongs (§9.6: gold = earned).
    // The count reads as text and the star reads as an object, so the emblem is
    // placed after the number rather than being a character inside it.
    const bankedStar = 15;
    const banked = this.text(`${v.starsAvailable}`, 17, PALETTE.highlightInk);
    banked.anchor.set(1, 0);
    banked.position.set(DESIGN.width - PAD - 10 - bankedStar - 4, SAFE_TOP + 9);
    this.root.addChild(this.entry(banked, MAP_BANDS.header));
    const bankedEmblem = star(bankedStar);
    bankedEmblem.position.set(DESIGN.width - PAD - 10 - bankedStar / 2, SAFE_TOP + 9 + bankedStar * 0.62);
    this.root.addChild(this.entry(bankedEmblem, MAP_BANDS.header));

    // §7.6: lives are ABSENT before 2-8, not greyed out.
    if (v.showLives) {
      // §8: a brass pocket-watch, not a heart. Lives refill on a timer, so the
      // object that stands for one is a clock.
      const lives = emblemMeter("life", v.lives, v.maxLives, 14);
      lives.position.set(PAD + 10, SAFE_TOP + 33);
      this.root.addChild(this.entry(lives, MAP_BANDS.header));
    }

    const muteLabel = v.muted ? "Sound Off" : "Sound On";
    this.chip(DESIGN.width - PAD - 84, SAFE_TOP + 30, 84, 20, muteLabel, () =>
      this.events?.onToggleMute(),
    );

    // --- the ladder: four worlds, ten levels each ---
    let y = SAFE_TOP + 58 + 14;
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

      /*
       * The rooms have names (§1) and the map was refusing to say them while
       * showing a painted library behind the word "WORLD 2". The number stays
       * for navigation — the ladder is numbered and the plates say 1 to 10.
       */
      const name = this.text(`${world}  ${WORLD_NAMES[world] ?? ""}`.toUpperCase(), 11, PALETTE.tokenInk, "900");
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

    /*
     * --- RESERVED: THE ACADEMY (ART_DIRECTION §6) ---
     *
     * Everything above this point is sized to its content and stacks from the
     * top, so what remains is one contiguous full-width region at the bottom.
     * Measured on the shipped map that is 20.2% of the screen with all four
     * worlds shown, and MORE early on when fewer blocks exist — which is
     * exactly backwards, because the player with the least progress sees the
     * most emptiness.
     *
     * It is named rather than filled. §6's restoration lives here: four rooms'
     * worth of furnishings, priced off the struggling player's income, with the
     * shabby veil retreating as objects appear. Naming it now is the difference
     * between designing the panel a home and wedging it in later — the same
     * mistake the board made before its bands sized to content.
     *
     * DO NOT consume this space for decoration, a wider footer, or a fifth
     * block. If the ladder ever grows past four worlds, the Academy moves to
     * its own screen rather than losing its room.
     */
    /*
     * FOUR WORLDS, AND THE SHELF ASSUMES IT.
     *
     * The vignettes divide the interior into exactly four cells. There is no
     * scroll, no wrap and no overflow handling, and at five worlds each cell
     * would fall to ~75px, below the size the objects were composed for.
     *
     * §6's answer is that the Academy moves to its OWN SCREEN rather than
     * losing its room — but nothing here enforces that, so this comment is what
     * the person adding World 5 finds instead of discovering it.
     */
    const academy = {
      x: PAD,
      y: y + 68,
      width: DESIGN.width - PAD * 2,
      height: Math.max(0, DESIGN.height - (y + 68) - PAD),
    };
    this.academyShelf(academy, v);

    // --- footer: shop and modes, each absent before its unlock (§7.6) ---
    let footerX = PAD;
    if (v.showShop) {
      this.chip(
        footerX,
        y,
        104,
        30,
        `Hints ${v.starsAvailable}`,
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
          mode[0]!.toUpperCase() + mode.slice(1),
          () => this.events?.onSelectMode(mode),
          undefined,
          { armed: active },
        );
        footerX += 66;
      }
    }
  }
}
