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
    onTap,
  } = options;

  const root = new Container();
  const body = new Container();
  root.addChild(body);

  const radius = 7;
  const interactive = state === "idle" && onTap !== undefined;

  /** Redraw at a given press depth. Called synchronously on pointerdown. */
  const paint = (depth: number): void => {
    body.removeChildren().forEach((child) => child.destroy({ children: true }));

    const g = new Graphics();
    const elevated = state !== "unavailable";
    const lift = elevated ? 1 - depth / PRESS_DEPTH : 0;

    /*
     * The shadow is the state. An idle button casts, a pressed one pulls its
     * shadow in tight because it has sunk toward the surface, and an
     * unavailable one casts nothing at all because it is flush with it.
     */
    if (elevated && lift > 0) {
      g.roundRect(1, 2 + 1.5 * lift, width, height, radius).fill({
        color: 0x000000,
        alpha: 0.3 * lift,
      });
    }

    g.roundRect(0, depth, width, height, radius).fill(fill);
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
      g.roundRect(0, depth, width, height, radius).stroke({ width: 2, color: outline });
    }
    body.addChild(g);

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
    text.position.set(width / 2, depth + height / 2);
    body.addChild(text);
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
