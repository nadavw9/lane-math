import { Container, Text, type FederatedPointerEvent } from "pixi.js";
import { describe, expect, it } from "vitest";

import { button } from "./button.js";

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

/** The label, which moves by exactly the press depth. */
function labelOf(root: Container): Text {
  const body = root.children[0] as Container;
  const text = body.children.find((child) => child instanceof Text);
  if (!text) throw new Error("no label in the button");
  return text as Text;
}

describe("a button press", () => {
  it("moves the label DOWN by the press depth, synchronously inside pointerdown", () => {
    const root = button({ width: WIDTH, height: HEIGHT, label: "restart", onTap: () => {} });
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
    const root = button({ width: WIDTH, height: HEIGHT, label: "restart", onTap: () => {} });
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
    const root = button({ width: WIDTH, height: HEIGHT, label: "restart", onTap: () => (taps += 1) });
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
    const root = button({ width: WIDTH, height: HEIGHT, label: "map", onTap: () => (taps += 1) });
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
