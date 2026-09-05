import { Container, Text, type FederatedPointerEvent } from "pixi.js";
import { describe, expect, it } from "vitest";

import { button } from "./button.js";
import { DIM, PALETTE } from "./layout.js";

/**
 * THE PRESS MUST BE INSTANT, AND MUST NOT DESTROY ANYTHING.
 *
 * Those two requirements pulled against each other and the destructive one won
 * for months. `paint` opened by destroying every child, synchronously, inside
 * the pointerdown handler — which gave §9.5 its immediate press and took the
 * pointer's tracked object out from under Pixi at the same moment. The
 * following pointerup had no valid target, never reached the root, and the tap
 * was lost. It survived human taps only because a 50-150ms finger leaves a
 * frame in the gap; `touchscreen.tap()` and every instant click failed.
 *
 * Both properties are asserted here because fixing either one alone
 * reintroduces the other: defer the repaint and the press stops being instant,
 * keep the teardown and fast taps keep vanishing.
 */

const WIDTH = 90;
const HEIGHT = 30;
const PRESS_DEPTH = 2;

/*
 * Pixi's emitter is typed to carry a FederatedPointerEvent. The handlers under
 * test read nothing off it, so a stub stands in rather than assembling a real
 * event and its whole boundary.
 */
const EVENT = {} as FederatedPointerEvent;
const press = (root: Container): boolean => root.emit("pointerdown", EVENT);
const release = (root: Container): boolean => root.emit("pointerup", EVENT);

function named(root: Container, name: string): Container {
  const body = root.children[0] as Container;
  const child = body.children.find((candidate) => candidate.label === name);
  if (!child) throw new Error(`no ${name} in the button`);
  return child as Container;
}

/** Colours recorded by the real Pixi Graphics context built by button(). */
function coloursOf(root: Container, name: string): number[] {
  const graphics = named(root, name) as Container & {
    context: {
      instructions: Array<{ data?: { style?: { color?: number } } }>;
    };
  };
  return graphics.context.instructions.flatMap((instruction) => {
    const colour = instruction.data?.style?.color;
    return colour === undefined ? [] : [colour];
  });
}

/** The label, which moves by exactly the press depth. */
function labelOf(root: Container): Text {
  const body = root.children[0] as Container;
  const text = body.children.find((child) => child instanceof Text);
  if (!text) throw new Error("no label in the button");
  return text as Text;
}

describe("a button press", () => {
  it("moves the label DOWN by the press depth, synchronously inside pointerdown", () => {
    const root = button({ width: WIDTH, height: HEIGHT, label: "Restart", onTap: () => {} });
    const label = labelOf(root);
    const atRest = label.y;
    expect(atRest).toBe(HEIGHT / 2);

    press(root);
    /*
     * NO await, NO frame. §9.5: "a button that animates its press over 100ms
     * feels broken however good the animation is". The assertion is on the very
     * next line on purpose — if the repaint is ever deferred to a tick, this
     * fails.
     */
    expect(label.y, "the press must land inside the handler").toBe(PRESS_DEPTH + HEIGHT / 2);
  });

  it("keeps the SAME child objects across a press — nothing is destroyed", () => {
    const root = button({ width: WIDTH, height: HEIGHT, label: "Restart", onTap: () => {} });
    const body = root.children[0] as Container;
    const before = [...body.children];

    press(root);
    release(root);

    const after = [...body.children];
    expect(after.length, "the child count changed across a press").toBe(before.length);
    for (const [index, child] of before.entries()) {
      expect(after[index], `child ${index} was replaced`).toBe(child);
      expect(child.destroyed, `child ${index} was destroyed by the press`).toBe(false);
    }
  });

  it("fires onTap on release and returns the label to rest", () => {
    let taps = 0;
    const root = button({ width: WIDTH, height: HEIGHT, label: "Restart", onTap: () => (taps += 1) });
    const label = labelOf(root);

    press(root);
    release(root);

    expect(taps).toBe(1);
    expect(label.y, "released buttons come back up").toBe(HEIGHT / 2);
  });

  it("survives a down and up with no frame between them", () => {
    /*
     * The exact shape that was failing: `touchscreen.tap()` and
     * `mouse.click()` deliver both halves in one batch with nothing rendered in
     * between. Nothing here may depend on a tick having run.
     */
    let taps = 0;
    const root = button({ width: WIDTH, height: HEIGHT, label: "Map", onTap: () => (taps += 1) });
    for (let i = 0; i < 5; i++) {
      press(root);
      release(root);
    }
    expect(taps).toBe(5);
    expect((root.children[0] as Container).children.every((c) => !c.destroyed)).toBe(true);
  });

  /*
   * NOT COVERED HERE: the emblem path.
   *
   * A button with an emblem centres the label and the mark as one run, which
   * reads `text.width` — and measuring text needs a DOM this environment does
   * not have ("document is not defined"). The emblem is now built once at
   * construction rather than per repaint, like every other child, and that is
   * exercised by the board tests that run against a real canvas. Recorded so
   * the gap reads as known rather than forgotten.
   */
});

describe("the brass and glass CTA material", () => {
  it("draws primary and secondary bodies without the old navy fill", () => {
    for (const variant of ["primary", "secondary"] as const) {
      const root = button({
        width: WIDTH,
        height: HEIGHT,
        label: "Action",
        variant,
        // A legacy caller cannot paint navy over the selected material.
        fill: PALETTE.slotFilled,
      });
      expect(named(root, `button-${variant}`).visible).toBe(true);
      expect(coloursOf(root, `button-${variant}`)).not.toContain(PALETTE.slotFilled);
      expect(labelOf(root).style.fill).toBe(PALETTE.tokenInk);
    }
  });

  it("sinks the material and removes its idle elevation while pressed", () => {
    const root = button({
      width: WIDTH,
      height: HEIGHT,
      label: "Action",
      variant: "primary",
      onTap: () => {},
    });
    const material = named(root, "button-primary");
    const shadow = named(root, "button-contact-shadow");
    expect(material.y).toBe(0);
    expect(shadow.visible).toBe(true);

    press(root);
    expect(material.y).toBe(PRESS_DEPTH);
    expect(shadow.visible).toBe(false);
  });

  it("makes unavailable flush while disabled retains a muted elevation", () => {
    const disabled = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "disabled" });
    const unavailable = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "unavailable" });

    expect(named(disabled, "button-contact-shadow").visible).toBe(true);
    expect(named(unavailable, "button-contact-shadow").visible).toBe(false);
    expect(disabled.alpha).toBeLessThan(1);
    expect(unavailable.alpha).toBe(1);
  });

  it("makes armed a first-class gold material, never the DIM treatment", () => {
    const idle = button({ width: WIDTH, height: HEIGHT, label: "Action" });
    const armed = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "armed" });

    expect(coloursOf(armed, "button-secondary")).toContain(PALETTE.highlight);
    expect(coloursOf(idle, "button-secondary")).not.toContain(PALETTE.highlight);
    expect(labelOf(armed).style.fill).toBe(PALETTE.highlight);
    expect(labelOf(idle).style.fill).toBe(PALETTE.tokenInk);
    expect(armed.alpha).toBe(1);
    expect(armed.alpha).not.toBe(DIM.alpha);
  });
});


describe("secondary CTA hierarchy", () => {
  it("keeps a quiet inset face, sheen and contact shadow", () => {
    const secondary = button({ width: WIDTH, height: HEIGHT, label: "Map", variant: "secondary" });
    const primary = button({ width: WIDTH, height: HEIGHT, label: "Next", variant: "primary" });

    expect(coloursOf(secondary, "button-secondary")).toContain(PALETTE.felt);
    expect(coloursOf(secondary, "button-secondary")).toContain(PALETTE.brassQuietLit);
    expect(coloursOf(primary, "button-primary")).not.toContain(PALETTE.brassQuietLit);
    expect(named(secondary, "button-contact-shadow").visible).toBe(true);
  });
});
