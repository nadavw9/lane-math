import { Container, Graphics, Text, TextStyle } from "pixi.js";

import { DIM, PALETTE } from "./layout.js";
import { UI_FONT } from "./tokens.js";

/**
 * The one button in the game (GDD §9.0: four interaction states).
 *
 * Before this, every control was a flat rounded rectangle with a two-line bevel
 * drawn inline, and NOT ONE had a pressed state. Several were not buttons at
 * all — a bare Container with a `pointertap` listener and no visual response to
 * being touched.
 *
 * FOUR STATES, with the same semantics settled for tokens:
 *
 *   idle         full material, elevated, casting
 *   pressed      depressed into the surface, shadow pulled in
 *   disabled     temporarily unusable, CAN return to idle
 *   unavailable  locked or spent, will NOT return in this context
 *
 * The mechanism differs from the glass cubes because a button is not a glass
 * cube. A cube's `unavailable` is a separate unlit sprite, since its glow is
 * emitted light that a tint cannot remove. A button has no glow to extinguish,
 * so its `unavailable` is expressed as material instead: it loses its
 * elevation entirely and sits flush and inert, which is what a dead control
 * looks like. `disabled` keeps its elevation and only loses presence, so the
 * two remain distinguishable at a glance — which is the distinction the §9.0
 * audit found collapsed everywhere.
 */
export type ButtonState = "idle" | "disabled" | "unavailable";

export interface ButtonOptions {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly state?: ButtonState;
  /** Gold for armed/earned, cream otherwise (§9.6 — gold is the one accent). */
  readonly labelColour?: number;
  readonly fill?: number;
  readonly outline?: number | undefined;
  readonly fontSize?: number;
  /**
   * Hexagonal buttons exist for the map, whose level plates are the same
   * hexagon the lane queues (§9.2 shape-coding). Routing them through this
   * component rather than leaving them as bare hit areas is what gives forty
   * of the game's most-pressed controls a pressed state.
   */
  readonly shape?: "rect" | "hex";
  /**
   * An emblem set beside the label, sharing its centring — a star on the hints
   * chip, for instance, which used to be a `★` inside the label string.
   *
   * A factory rather than a Container. It was required when paint() destroyed
   * and rebuilt every child on each press; it is now called ONCE and the
   * result repositioned, and the signature is kept because every caller passes
   * a closure and there is nothing to gain from churning them.
   */
  readonly emblem?: (() => Container) | undefined;
  /**
   * A MATERIAL FACE drawn over the flat fill — brass on the commit key.
   *
   * A factory for the same reason `emblem` is one: paint() destroys and
   * rebuilds every child on each press. It is built inside paint and offset by
   * the press depth, so the material sinks with the button instead of floating
   * above a key that has moved out from under it. Adding the face as a sibling
   * outside the component was the first attempt and it drew BEHIND the fill,
   * which is why the key photographed as flat navy.
   */
  readonly face?: ((width: number, height: number) => Container) | undefined;
  readonly onTap?: (() => void) | undefined;
}

/** How far a pressed button sinks. Small — it is depressing, not collapsing. */
const PRESS_DEPTH = 2;

export function button(options: ButtonOptions): Container {
  const {
    width,
    height,
    label,
    state = "idle",
    labelColour = PALETTE.tokenInk,
    fill = PALETTE.slotFilled,
    outline,
    fontSize,
    shape = "rect",
    emblem,
    face,
    onTap,
  } = options;

  const root = new Container();
  const body = new Container();
  root.addChild(body);

  const radius = 7;
  const interactive = state === "idle" && onTap !== undefined;

  /*
   * THE CHILDREN ARE BUILT ONCE AND REDRAWN IN PLACE.
   *
   * `paint` used to open with
   *
   *   body.removeChildren().forEach((child) => child.destroy({ children: true }))
   *
   * which DESTROYED the display object the pointer was tracking, synchronously,
   * inside the pointerdown handler. The immediately following pointerup then
   * had no valid target, never reached this root, and the tap was lost. Given a
   * gap the boundary re-resolved against the rebuilt children and the press
   * worked — which is why it survived human taps of 50-150ms and failed every
   * instant one. A pool tile, which does not repaint on press, was hit by the
   * same synthetic click and fired: that contrast is what named the cause.
   *
   * Redrawing keeps §9.5's requirement intact. `Graphics.clear()` and a
   * reposition are synchronous and land inside the same pointerdown, so the
   * press is still immediate — the instantness never depended on the teardown,
   * only on being done in the handler.
   */
  const g = new Graphics();
  body.addChild(g);

  const material = face ? face(width, height) : null;
  if (material) body.addChild(material);

  const text = new Text({
    text: label,
    style: new TextStyle({
      fontFamily: UI_FONT,
      fontSize: fontSize ?? Math.min(14, height * 0.42),
      fontWeight: "800",
      fill: labelColour,
    }),
  });
  text.anchor.set(0.5);
  body.addChild(text);

  const mark = emblem ? emblem() : null;
  if (mark) body.addChild(mark);

  const elevated = state !== "unavailable";
  const notch = width * 0.16;
  const path = (gr: Graphics, dy: number): Graphics =>
    shape === "hex"
      ? gr.poly([
          notch, dy,
          width - notch, dy,
          width, dy + height / 2,
          width - notch, dy + height,
          notch, dy + height,
          0, dy + height / 2,
        ])
      : gr.roundRect(0, dy, width, height, radius);

  /** Redraw at a given press depth. Called synchronously on pointerdown. */
  const paint = (depth: number): void => {
    const lift = elevated ? 1 - depth / PRESS_DEPTH : 0;
    g.clear();

    /*
     * The shadow is the state. An idle button casts, a pressed one pulls its
     * shadow in tight because it has sunk toward the surface, and an
     * unavailable one casts nothing at all because it is flush with it.
     */
    if (elevated && lift > 0) {
      path(g, 2 + 1.5 * lift).fill({ color: 0x000000, alpha: 0.3 * lift });
    }

    path(g, depth).fill(fill);
    // Same lighting as every other surface (§9.6): shadow along the top edge,
    // rim light along the bottom.
    g.moveTo(radius, depth + 2)
      .lineTo(width - radius, depth + 2)
      .stroke({ width: 2, color: 0x000000, alpha: 0.3 });
    if (elevated) {
      g.moveTo(radius, depth + height - 2)
        .lineTo(width - radius, depth + height - 2)
        .stroke({ width: 1.5, color: 0xffffff, alpha: 0.14 });
    }
    if (outline !== undefined) {
      path(g, depth).stroke({ width: 2, color: outline });
    }

    if (material) material.position.set(0, depth);

    const midY = depth + height / 2;
    if (mark) {
      // Label and emblem are centred as one run, so the pair sits where a plain
      // label would rather than the text drifting left of centre.
      const gap = 4;
      const run = text.width + gap + mark.width;
      text.position.set(width / 2 - run / 2 + text.width / 2, midY);
      mark.position.set(width / 2 + run / 2 - mark.width / 2, midY);
    } else {
      text.position.set(width / 2, midY);
    }
  };

  paint(0);

  // `disabled` loses presence but keeps its shape and elevation: it is still
  // here, just not now. `unavailable` keeps full opacity and loses its
  // elevation instead, so the two never read as the same thing.
  if (state === "disabled") root.alpha = DIM.alpha;

  if (interactive) {
    root.eventMode = "static";
    root.cursor = "pointer";

    /*
     * PRESSED IS IMMEDIATE. Repainted synchronously inside the pointerdown
     * handler, with no tween and no frame of delay: a button that animates its
     * press over 100ms feels broken however good the animation is, because the
     * one thing a press must communicate is that the machine heard you.
     */
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
