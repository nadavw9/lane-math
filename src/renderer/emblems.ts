import { Container, Graphics, Sprite } from "pixi.js";

import {
  emblemChromeReady,
  emblemChromeTexture,
  type HintEmblemState,
  type LifeEmblemState,
  type StarEmblemState,
} from "./emblem-chrome.js";
import { PALETTE } from "./layout.js";

/**
 * HUD emblems — HUMAN-FINAL sprites when atlas is loaded; Graphics fallback
 * otherwise (tests / missing assets). Radical stays Graphics (operator glyph).
 *
 * Selection language elsewhere is lift/outline/brass — never DIM-as-armed.
 */

/** §4 palette. Gold is the accent — "ready, armed, earned. Stars." */
const GOLD = 0xffc94a;
const GOLD_LIT = 0xfff0c0;
const GOLD_DEEP = 0xb07d18;
/** §4 felt, for an empty socket. */
const FELT = 0x241812;
/** The warm contact shadow. Never neutral grey — the light is warm (§3). */
const SHADOW = 0x2b1a10;

function contactShadow(g: Graphics, cx: number, cy: number, rx: number, ry: number): void {
  for (let i = 3; i >= 1; i--) {
    const spread = 1 + i * 0.22;
    g.ellipse(cx, cy, rx * spread, ry * spread).fill({ color: SHADOW, alpha: 0.1 });
  }
}

function specular(g: Graphics, cx: number, cy: number, r: number): void {
  g.ellipse(cx, cy, r, r * 0.72).fill({ color: 0xffffff, alpha: 0.16 });
  g.ellipse(cx, cy, r * 0.55, r * 0.4).fill({ color: 0xffffff, alpha: 0.34 });
}

function starPath(g: Graphics, r: number): Graphics {
  const inner = r * 0.48;
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  return g.closePath();
}

function spriteEmblem(textureKey: { kind: "star" | "life" | "hint"; state: string }, size: number): Container | null {
  if (!emblemChromeReady()) return null;
  const texture = emblemChromeTexture(textureKey.kind, textureKey.state);
  if (!texture) return null;
  const emblem = new Container();
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  // @2x masters: fit longest side to `size` in design CSS pixels.
  const aspect = texture.width / texture.height;
  if (aspect >= 1) {
    sprite.width = size;
    sprite.height = size / aspect;
  } else {
    sprite.height = size;
    sprite.width = size * aspect;
  }
  emblem.addChild(sprite);
  return emblem;
}

/**
 * THE STAR — reward currency. `earned` gold; `empty` felt socket.
 */
export function star(size: number, state: StarEmblemState = "earned"): Container {
  const sprite = spriteEmblem({ kind: "star", state }, size);
  if (sprite) {
    // Empty wells must stay the HF recessed stamp — never a tilted/tinted earned.
    const face = sprite.children[0] as { tint?: number; label?: string };
    if (face) {
      face.tint = 0xffffff;
      face.label = `star-${state}`;
    }
    if (state === "empty") {
      // Brass map plates wash out the empty rim; seat the stamp on felt first
      // so phone-eye still reads a #241812 hole + warm lip (Scout empty-on-felt).
      const seat = new Graphics();
      const r = size * 0.58;
      seat.circle(0, 0, r).fill({ color: FELT, alpha: 1 });
      seat.circle(0, 0, r).stroke({ width: Math.max(1, size * 0.08), color: 0x9a8064, alpha: 0.95 });
      sprite.addChildAt(seat, 0);
    } else {
      sprite.rotation = -0.05;
    }
    return sprite;
  }

  const emblem = new Container();
  const r = size / 2;
  const round = r * 0.3;
  const body = r - round / 2;

  if (state === "earned") {
    const shadow = new Graphics();
    contactShadow(shadow, 0, r * 0.82, r * 0.62, r * 0.2);
    emblem.addChild(shadow);
  }

  const g = new Graphics();
  const fill = state === "earned" ? GOLD : FELT;
  const alpha = state === "earned" ? 1 : 0.5;
  starPath(g, body).fill({ color: fill, alpha });
  starPath(g, body).stroke({ width: round, color: fill, alpha, join: "round", cap: "round" });

  if (state === "earned") {
    const g2 = new Graphics();
    starPath(g2, body * 0.92).fill({ color: GOLD_DEEP, alpha: 0.42 });
    g2.position.set(r * 0.12, r * 0.14);
    emblem.addChild(g);
    emblem.addChild(g2);

    const g3 = new Graphics();
    starPath(g3, body * 0.66).fill({ color: GOLD_LIT, alpha: 0.5 });
    g3.position.set(-r * 0.1, -r * 0.12);
    emblem.addChild(g3);

    const hi = new Graphics();
    specular(hi, -r * 0.26, -r * 0.3, r * 0.24);
    emblem.addChild(hi);
  } else {
    emblem.addChild(g);
    const rim = new Graphics();
    starPath(rim, body).stroke({ width: Math.max(1, r * 0.12), color: 0x000000, alpha: 0.3, join: "round" });
    rim.position.set(0, -r * 0.06);
    emblem.addChild(rim);
  }

  emblem.rotation = -0.05;
  return emblem;
}

/**
 * THE LIFE MARKER — brass pocket-watch (`full` / `spent`).
 */
export function pocketWatch(size: number, state: LifeEmblemState = "full"): Container {
  const sprite = spriteEmblem({ kind: "life", state }, size);
  if (sprite) {
    sprite.rotation = 0.04;
    return sprite;
  }

  const emblem = new Container();
  const r = size / 2;
  const caseR = r * 0.82;
  const cy = r * 0.16;
  const lit = state === "full";

  const shadow = new Graphics();
  contactShadow(shadow, 0, cy + caseR * 0.92, caseR * 0.74, caseR * 0.2);
  emblem.addChild(shadow);

  const g = new Graphics();
  const crownW = caseR * 0.54;
  const crownH = caseR * 0.3;
  g.roundRect(-crownW / 2, cy - caseR - crownH * 0.82, crownW, crownH, crownH * 0.4).fill({
    color: lit ? PALETTE.brass : PALETTE.brassSpent,
  });
  g.circle(0, cy, caseR).fill({ color: lit ? PALETTE.brassDeep : PALETTE.brassSpent });
  g.circle(0, cy, caseR * 0.82).fill({ color: lit ? PALETTE.brass : PALETTE.brassSpent });
  g.circle(caseR * 0.14, cy + caseR * 0.16, caseR * 0.68).fill({
    color: lit ? PALETTE.brassDeep : 0x000000,
    alpha: lit ? 0.45 : 0.3,
  });
  g.circle(-caseR * 0.14, cy - caseR * 0.16, caseR * 0.52).fill({
    color: lit ? GOLD : PALETTE.brass,
    alpha: lit ? 0.35 : 0.12,
  });
  emblem.addChild(g);

  if (lit) {
    if (size >= 20) {
      const face = new Graphics();
      face
        .circle(0, cy, caseR * 0.54)
        .stroke({ width: Math.max(0.75, caseR * 0.07), color: 0x4a3a14, alpha: 0.3 });
      face
        .moveTo(0, cy)
        .lineTo(caseR * 0.26, cy - caseR * 0.26)
        .stroke({ width: Math.max(1, caseR * 0.12), color: 0x3a2c14, alpha: 0.55, cap: "round" });
      emblem.addChild(face);
    }
    const hi = new Graphics();
    specular(hi, -caseR * 0.34, cy - caseR * 0.4, caseR * 0.22);
    emblem.addChild(hi);
  }

  emblem.rotation = 0.04;
  return emblem;
}

/**
 * THE HINT MARK — gold gem. Optional `disabled` uses the quieter stamp.
 */
export function hintDiamond(size: number, state: HintEmblemState = "available"): Container {
  const sprite = spriteEmblem({ kind: "hint", state }, size);
  if (sprite) {
    sprite.rotation = 0.03;
    return sprite;
  }

  const emblem = new Container();
  const w = size * 0.4;
  const h = size * 0.5;
  const cx = 0;
  const cy = -h * 0.12;
  const facet = (g: Graphics, ax: number, ay: number, bx: number, by: number, colour: number, alpha = 1) =>
    g.moveTo(ax, ay).lineTo(bx, by).lineTo(cx, cy).closePath().fill({ color: colour, alpha });

  const shadow = new Graphics();
  contactShadow(shadow, 0, h * 0.94, w * 0.86, h * 0.16);
  emblem.addChild(shadow);

  const round = size * 0.1;
  const px = w - round / 2;
  const py = h - round / 2;

  const g = new Graphics();
  const body = (gr: Graphics): Graphics =>
    gr.moveTo(0, -py).lineTo(px, cy).lineTo(0, py).lineTo(-px, cy).closePath();
  const fill = state === "available" ? GOLD : PALETTE.brassSpent;
  body(g).fill({ color: fill });
  body(g).stroke({ width: round, color: fill, join: "round", cap: "round" });
  emblem.addChild(g);

  if (state === "available") {
    const f = new Graphics();
    facet(f, 0, -py, -px, cy, GOLD_LIT, 0.85);
    facet(f, 0, -py, px, cy, GOLD, 1);
    facet(f, -px, cy, 0, py, GOLD_DEEP, 0.35);
    facet(f, px, cy, 0, py, GOLD_DEEP, 0.7);
    emblem.addChild(f);

    const table = new Graphics();
    table
      .moveTo(0, -h * 0.52)
      .lineTo(w * 0.34, cy * 0.6)
      .lineTo(0, h * 0.1)
      .lineTo(-w * 0.34, cy * 0.6)
      .closePath()
      .fill({ color: GOLD_LIT, alpha: 0.45 });
    emblem.addChild(table);

    const hi = new Graphics();
    specular(hi, -w * 0.42, -h * 0.42, Math.max(1.2, size * 0.11));
    emblem.addChild(hi);
  }

  emblem.rotation = 0.03;
  return emblem;
}

/**
 * THE RADICAL — `√`, drawn rather than typed. Stays Graphics (not HUD atlas).
 */
export function radical(size: number, colour: number): Container {
  const emblem = new Container();
  const g = new Graphics();
  const w = size;
  const h = size;
  const stroke = Math.max(1.5, size * 0.115);

  g.moveTo(-w * 0.46, -h * 0.04)
    .lineTo(-w * 0.24, -h * 0.04)
    .lineTo(-w * 0.04, h * 0.42)
    .lineTo(w * 0.24, -h * 0.42)
    .lineTo(w * 0.5, -h * 0.42)
    .stroke({ width: stroke, color: colour, join: "round", cap: "round" });
  emblem.addChild(g);
  return emblem;
}

export function emblemMeter(
  kind: "star" | "life",
  filled: number,
  total: number,
  size: number,
  gap = size * 0.22,
): Container {
  const row = new Container();
  const step = size + gap;
  for (let i = 0; i < total; i++) {
    const lit = i < filled;
    const emblem =
      kind === "star" ? star(size, lit ? "earned" : "empty") : pocketWatch(size, lit ? "full" : "spent");
    emblem.position.set(size / 2 + i * step, size / 2);
    row.addChild(emblem);
  }
  return row;
}

export function meterWidth(total: number, size: number, gap = size * 0.22): number {
  return total <= 0 ? 0 : total * size + (total - 1) * gap;
}
