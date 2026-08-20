import { Container, Graphics, Text, TextStyle } from "pixi.js";

import { button } from "../renderer/button.js";
import { MAP_BANDS, Entrance } from "../renderer/entry.js";
import { BACKDROP, DESIGN, DIM, PALETTE, TRAY_ALPHA } from "../renderer/layout.js";
import { UI_FONT, squaredPaper, woodenTray } from "../renderer/tokens.js";
import { label } from "../renderer/tokens.js";
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

  constructor() {
    this.root.visible = false;
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
  ): Container {
    const control = button({
      width: w,
      height: h,
      label: text,
      labelColour: colour,
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
    const cell = new Container();

    const g = new Graphics();
    const notch = w * 0.16;
    const path = (): Graphics =>
      g.poly([notch, 0, w - notch, 0, w, h / 2, w - notch, h, notch, h, 0, h / 2]);

    path().fill(level.state === "cleared" ? PALETTE.targetFront : PALETTE.targetPlate);
    path().stroke({ width: 2, color: 0x000000, alpha: 0.35, alignment: 1 });
    if (level.state === "cleared") {
      path().stroke({ width: 2, color: PALETTE.highlight, alpha: 0.5 });
    }
    cell.addChild(g);

    const number = label(String(level.slot), 20, PALETTE.tokenInk);
    number.position.set(w / 2, h / 2 - 4);
    cell.addChild(number);

    // Best-ever stars, finally with somewhere to live.
    if (level.state === "cleared") {
      const stars = this.text(
        `${"★".repeat(level.stars)}${"☆".repeat(Math.max(0, 3 - level.stars))}`,
        10,
        PALETTE.highlight,
      );
      stars.anchor.set(0.5);
      stars.position.set(w / 2, h - 9);
      cell.addChild(stars);
    }

    cell.position.set(x, y);
    if (level.state === "locked") {
      /*
       * Recessive but still NAVY (§9.6: dim is less presence, not a different
       * substance). Measured lower than this the plate composites against the
       * warm tray into a grey-brown, which is a colour the palette does not
       * have — the exact failure the rule is written to prevent.
       */
      cell.alpha = 0.62;
    } else {
      cell.eventMode = "static";
      cell.cursor = "pointer";
      cell.on("pointertap", () => this.events?.onPlay(level.id));
    }
    // The one OPEN level lands last: forty plates, and that is the door (§9.0).
    this.root.addChild(this.entry(cell, level.state === "open" ? MAP_BANDS.open : band));
  }

  private draw(): void {
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
    const v = this.view;
    if (!v) return;

    const width = DESIGN.width - PAD * 2;

    // --- header: the desk, with the totals that were crowding the board ---
    const header = squaredPaper(width, 58, BACKDROP);
    header.position.set(PAD, PAD);
    this.root.addChild(this.entry(header, MAP_BANDS.header));

    const title = this.text("LANE MATH", 18, PALETTE.text, "900");
    title.position.set(PAD + 10, PAD + 9);
    this.root.addChild(this.entry(title, MAP_BANDS.header));

    // Banked total. The map is the only place this belongs (§9.6: gold = earned).
    const banked = this.text(`${v.starsAvailable}★`, 17, PALETTE.highlightInk);
    banked.anchor.set(1, 0);
    banked.position.set(DESIGN.width - PAD - 10, PAD + 9);
    this.root.addChild(this.entry(banked, MAP_BANDS.header));

    // §7.6: lives are ABSENT before 2-8, not greyed out.
    if (v.showLives) {
      const lives = this.text(
        `${"♥".repeat(v.lives)}${"·".repeat(Math.max(0, v.maxLives - v.lives))}`,
        14,
        v.lives === 0 ? PALETTE.failed : PALETTE.highlightInk,
      );
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

      const tray = woodenTray(width, trayH, PALETTE.tray, TRAY_ALPHA);
      tray.position.set(PAD, y);
      this.root.addChild(this.entry(tray, MAP_BANDS.header + world));

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

    // --- footer: shop and modes, each absent before its unlock (§7.6) ---
    let footerX = PAD;
    if (v.showShop) {
      this.chip(footerX, y, 104, 30, `hints ${v.starsAvailable}★`, PALETTE.highlight, () =>
        this.events?.onOpenShop(),
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
