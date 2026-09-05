import { Container, Graphics, Text, TextStyle } from "pixi.js";

import { DIM, PALETTE } from "./layout.js";
import { UI_FONT } from "./tokens.js";

/** GDD §9.0's persistent states. Pressed is sampled synchronously from input. */
export type ButtonState = "idle" | "armed" | "disabled" | "unavailable";
export type ButtonVariant = "primary" | "secondary";

export interface ButtonOptions {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly variant?: ButtonVariant | undefined;
  readonly state?: ButtonState | undefined;
  /** Convenience for models that already carry selection separately. */
  readonly armed?: boolean | undefined;
  /** @deprecated Material variants own their body colour. */
  readonly fill?: number;
  /** @deprecated Labels are cream, or gold only while armed. */
  readonly labelColour?: number;
  /** @deprecated Armed state owns the gold rim; variants own every other rim. */
  readonly outline?: number | undefined;
  readonly fontSize?: number;
  readonly shape?: "rect" | "hex";
  readonly emblem?: (() => Container) | undefined;
  /** A bespoke casting, such as the engraved commit key or a map plaque. */
  readonly face?: ((width: number, height: number) => Container) | undefined;
  readonly onTap?: (() => void) | undefined;
}

/** How far a pressed button sinks. Small — it is depressing, not collapsing. */
const PRESS_DEPTH = 2;

/** Flat-top hexagon, shared by the hit material and map plaque face. */
function path(g: Graphics, shape: "rect" | "hex", w: number, h: number, inset = 0): Graphics {
  if (shape === "hex") {
    const width = Math.max(0, w - inset * 2);
    const height = Math.max(0, h - inset * 2);
    const notch = Math.min(width * 0.16, height * 0.5);
    return g.poly([
      inset + notch, inset,
      inset + width - notch, inset,
      inset + width, inset + height / 2,
      inset + width - notch, inset + height,
      inset + notch, inset + height,
      inset, inset + height / 2,
    ]);
  }
  return g.roundRect(
    inset,
    inset,
    Math.max(0, w - inset * 2),
    Math.max(0, h - inset * 2),
    Math.max(3, 7 - inset),
  );
}

/**
 * One procedural brass/glass CTA kit (ART_DIRECTION §3–5, GDD §9.0).
 *
 * Primary controls are raised brass keys. Secondary controls are felt wells
 * held in brass. Both use the commit key's upper-left light, inset face,
 * restrained grain and contact shadow; neither has a flat-fill escape hatch.
 * State changes material and elevation instead of asking opacity to carry
 * selected, disabled and spent at once.
 */
export function button(options: ButtonOptions): Container {
  const {
    width,
    height,
    label,
    variant = "secondary",
    fontSize,
    shape = "rect",
    emblem,
    face,
    onTap,
  } = options;
  const state: ButtonState = options.armed ? "armed" : (options.state ?? "idle");
  const interactive = (state === "idle" || state === "armed") && onTap !== undefined;
  const elevated = state !== "unavailable";

  const root = new Container();
  const body = new Container();
  root.addChild(body);

  const shadow = new Graphics();
  shadow.label = "button-contact-shadow";
  body.addChild(shadow);

  const material = new Graphics();
  material.label = `button-${variant}`;
  body.addChild(material);

  const customFace = face ? face(width, height) : null;
  if (customFace) body.addChild(customFace);

  const text = new Text({
    text: label,
    style: new TextStyle({
      fontFamily: UI_FONT,
      fontSize: fontSize ?? Math.min(14, height * 0.42),
      fontWeight: "800",
      fill: state === "armed" ? PALETTE.highlight : PALETTE.tokenInk,
    }),
  });
  text.anchor.set(0.5);
  body.addChild(text);

  const mark = emblem ? emblem() : null;
  if (mark) body.addChild(mark);

  const radius = Math.min(9, height * 0.26);

  /** Draw the shared soft contact shadow from broad to tight. */
  const drawShadow = (lift: number): void => {
    shadow.clear();
    shadow.visible = elevated && lift > 0;
    if (!shadow.visible) return;
    // Secondary CTAs keep a contact shadow, but at a lower luminance and shorter
    // reach than primary keys. The shadow supplies weight without stealing the
    // action hierarchy from the brass face.
    const weight = variant === "secondary" ? 0.72 : 1;
    for (let i = 4; i >= 1; i--) {
      path(shadow, shape, width, height, i * 0.4)
        .fill({ color: 0x1a0f08, alpha: (0.05 + i * 0.014) * lift * weight });
    }
    shadow.position.set(0, variant === "secondary" ? 2.4 + lift * 1.6 : 2.8 + lift * 2.2);
  };

  const grain = (g: Graphics, inset: number, colour: number, alpha: number): void => {
    const usableW = Math.max(1, width - inset * 2);
    const usableH = Math.max(1, height - inset * 2);
    for (let i = 0; i < 7; i++) {
      const x = inset + usableW * ((i * 0.37 + 0.11) % 1);
      const y = inset + usableH * ((i * 0.61 + 0.17) % 1);
      g.circle(x, y, 0.45 + (i % 2) * 0.25).fill({ color: colour, alpha });
    }
  };

  const drawPrimary = (g: Graphics): void => {
    const spent = state === "unavailable";
    const armed = state === "armed";
    const deep = spent ? 0x5d4b2b : PALETTE.brassDeep;
    const mid = spent ? 0x77613a : (armed ? PALETTE.highlight : PALETTE.brass);
    const light = spent ? 0x9b855d : PALETTE.brassLit;

    path(g, shape, width, height).fill({ color: deep });
    path(g, shape, width, height - Math.max(2, height * 0.09)).fill({ color: mid });
    for (let i = 0; i < 4; i++) {
      path(g, shape, width, height * (0.26 + i * 0.09), 1)
        .fill({ color: light, alpha: spent ? 0.035 : 0.08 });
    }
    path(g, shape, width, height, 1.5)
      .stroke({ width: 2, color: light, alpha: spent ? 0.22 : 0.55 });
    g.moveTo(radius, 2).lineTo(width - radius, 2)
      .stroke({ width: 2.5, color: light, alpha: spent ? 0.15 : 0.48 });
    g.moveTo(radius, height - 2).lineTo(width - radius, height - 2)
      .stroke({ width: 2.5, color: 0x2b1608, alpha: 0.42 });
    g.ellipse(width * 0.22, height * 0.22, width * 0.18, Math.max(1, height * 0.07))
      .fill({ color: 0xffffff, alpha: spent ? 0.04 : 0.15 });
    grain(g, 5, 0x4a2f13, spent ? 0.07 : 0.13);
  };

  const drawSecondary = (g: Graphics): void => {
    const spent = state === "unavailable";
    const armed = state === "armed";
    const rim = spent ? 0x67583b : (armed ? PALETTE.highlight : PALETTE.brassQuiet);
    const rimDeep = spent ? 0x493e2d : PALETTE.brassDeep;
    const rimLight = spent ? 0x9b855d : PALETTE.brassQuietLit;
    const felt = spent ? 0x2a231d : PALETTE.felt;
    // A narrow casting around a broad felt face: furniture, not an outline chip.
    const inset = Math.max(3, Math.min(4.5, height * 0.13));

    path(g, shape, width, height).fill({ color: rimDeep });
    path(g, shape, width, height - Math.max(2, height * 0.08)).fill({ color: rim });
    path(g, shape, width, height, inset).fill({ color: felt });
    // The face is recessed by two lit edges, never by a perimeter outline.
    g.moveTo(radius + inset, inset + 1.5)
      .lineTo(width - radius - inset, inset + 1.5)
      .stroke({ width: 2, color: 0x000000, alpha: 0.42 });
    g.moveTo(radius + inset, height - inset - 1)
      .lineTo(width - radius - inset, height - inset - 1)
      .stroke({ width: 1, color: rimLight, alpha: spent ? 0.04 : 0.12 });
    // One asymmetric upper-left sheen establishes the shared studio light.
    g.moveTo(radius + 1, 1.6).lineTo(width * 0.58, 1.6)
      .stroke({ width: 1.8, color: rimLight, alpha: spent ? 0.12 : 0.55 });
    g.ellipse(width * 0.2, 2.1, width * 0.13, Math.max(0.8, height * 0.045))
      .fill({ color: rimLight, alpha: spent ? 0.03 : 0.13 });
    grain(g, inset + 2, PALETTE.brassQuietLit, spent ? 0.03 : 0.055);
  };

  /** Redraw at a given press depth. Called synchronously on pointerdown. */
  const paint = (depth: number): void => {
    const lift = elevated ? 1 - depth / PRESS_DEPTH : 0;
    drawShadow(lift);
    material.clear();
    material.visible = customFace === null;
    if (material.visible) {
      if (variant === "primary") drawPrimary(material);
      else drawSecondary(material);
    }
    material.position.set(0, depth);
    if (customFace) customFace.position.set(0, depth);

    const midY = depth + height / 2;
    if (mark) {
      const gap = 4;
      const run = text.width + gap + mark.width;
      text.position.set(width / 2 - run / 2 + text.width / 2, midY);
      mark.position.set(width / 2 + run / 2 - mark.width / 2, midY);
    } else {
      text.position.set(width / 2, midY);
    }
  };

  paint(0);

  // Disabled is temporary absence: it keeps the raised material. Unavailable
  // is spent material at full opacity and sits flush with no contact shadow.
  if (state === "disabled") root.alpha = DIM.alpha;

  if (interactive) {
    root.eventMode = "static";
    root.cursor = "pointer";
    root.on("pointerdown", () => paint(PRESS_DEPTH));
    root.on("pointerup", () => {
      paint(0);
      onTap?.();
    });
    root.on("pointerupoutside", () => paint(0));
    root.on("pointercancel", () => paint(0));
  }

  return root;
}
