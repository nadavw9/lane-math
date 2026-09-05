import { Container, Graphics, NineSliceSprite, Text, TextStyle, type Texture } from "pixi.js";

import { CTA_SLICE, ctaChromeReady, ctaChromeTexture, type CtaChromeState } from "./cta-chrome.js";
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

function chromeState(state: ButtonState, pressed: boolean): CtaChromeState {
  if (pressed && (state === "idle" || state === "armed")) return "pressed";
  if (state === "armed") return "armed";
  if (state === "unavailable") return "unavailable";
  // disabled keeps idle chrome under DIM — temporary absence, not spent metal.
  return "idle";
}

/**
 * Shared CTA control: HUMAN-FINAL 9-slice chrome + Text label (ART_DIRECTION,
 * GDD §9.0). Primary/secondary faces come from the CTA atlas; labels are never
 * baked into the sprites. Custom `face` still replaces the atlas body (commit
 * key, map plaques). Hex shapes with no face keep a minimal Graphics fallback
 * because the atlas is authored for rounded rects only.
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

  const customFace = face ? face(width, height) : null;
  if (customFace) body.addChild(customFace);

  let slice: NineSliceSprite | null = null;
  const fallback = new Graphics();
  fallback.label = `button-${variant}`;
  fallback.visible = false;
  body.addChild(fallback);

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

  const useAtlas = customFace === null && shape === "rect" && ctaChromeReady();

  /** Draw the shared soft contact shadow from broad to tight. */
  const drawShadow = (lift: number): void => {
    shadow.clear();
    shadow.visible = elevated && lift > 0;
    if (!shadow.visible) return;
    const weight = variant === "secondary" ? 0.72 : 1;
    for (let i = 4; i >= 1; i--) {
      path(shadow, shape, width, height, i * 0.4)
        .fill({ color: 0x1a0f08, alpha: (0.05 + i * 0.014) * lift * weight });
    }
    shadow.position.set(0, variant === "secondary" ? 2.4 + lift * 1.6 : 2.8 + lift * 2.2);
  };

  const ensureSlice = (texture: Texture): NineSliceSprite => {
    if (slice) {
      slice.texture = texture;
      return slice;
    }
    slice = new NineSliceSprite({
      texture,
      leftWidth: CTA_SLICE.leftWidth,
      topHeight: CTA_SLICE.topHeight,
      rightWidth: CTA_SLICE.rightWidth,
      bottomHeight: CTA_SLICE.bottomHeight,
      width,
      height,
    });
    slice.label = `button-${variant}-slice`;
    body.addChildAt(slice, 1);
    return slice;
  };

  /** Minimal Graphics body only for hex / unloaded atlas — never the rect CTA kit. */
  const drawFallback = (g: Graphics): void => {
    const spent = state === "unavailable";
    const armed = state === "armed";
    if (variant === "primary") {
      const deep = spent ? 0x5d4b2b : PALETTE.brassDeep;
      const mid = spent ? 0x77613a : (armed ? PALETTE.highlight : PALETTE.brass);
      path(g, shape, width, height).fill({ color: deep });
      path(g, shape, width, height - Math.max(2, height * 0.09)).fill({ color: mid });
    } else {
      const rim = spent ? 0x67583b : (armed ? PALETTE.highlight : PALETTE.brassQuiet);
      const rimDeep = spent ? 0x493e2d : PALETTE.brassDeep;
      const felt = spent ? 0x2a231d : PALETTE.felt;
      const inset = Math.max(2.5, Math.min(3.5, height * 0.1));
      path(g, shape, width, height).fill({ color: rimDeep });
      path(g, shape, width, height - Math.max(2, height * 0.08)).fill({ color: rim });
      path(g, shape, width, height, inset).fill({ color: felt });
    }
  };

  /** Redraw at a given press depth. Called synchronously on pointerdown. */
  const paint = (depth: number): void => {
    const lift = elevated ? 1 - depth / PRESS_DEPTH : 0;
    drawShadow(lift);
    const pressed = depth > 0;

    if (customFace) {
      fallback.visible = false;
      if (slice) slice.visible = false;
      customFace.position.set(0, depth);
    } else if (useAtlas) {
      const texture = ctaChromeTexture(variant, chromeState(state, pressed));
      fallback.visible = false;
      if (texture) {
        const face = ensureSlice(texture);
        face.visible = true;
        face.width = width;
        face.height = height;
        face.position.set(0, depth);
      }
    } else {
      if (slice) slice.visible = false;
      fallback.visible = true;
      fallback.clear();
      drawFallback(fallback);
      fallback.position.set(0, depth);
    }

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
