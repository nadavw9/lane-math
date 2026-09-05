import { Container, Text, type FederatedPointerEvent } from "pixi.js";
import { describe, expect, it } from "vitest";

import { button } from "./button.js";
import { DIM, PALETTE } from "./layout.js";

/**
 * THE PRESS MUST BE INSTANT, AND MUST NOT DESTROY ANYTHING.
 *
 * Atlas load is a browser/Vite concern; Node vitest exercises the shared
 * press/label contract on the Graphics fallback path (atlas not primed).
 */

const WIDTH = 90;
const HEIGHT = 30;
const PRESS_DEPTH = 2;

const EVENT = {} as FederatedPointerEvent;
const press = (root: Container): boolean => root.emit("pointerdown", EVENT);
const release = (root: Container): boolean => root.emit("pointerup", EVENT);

function named(root: Container, name: string): Container {
  const body = root.children[0] as Container;
  const child = body.children.find((candidate) => candidate.label === name);
  if (!child) throw new Error(`no ${name} in the button`);
  return child as Container;
}

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
    expect(press(root)).toBe(true);
    expect(label.y).toBe(atRest + PRESS_DEPTH);
  });

  it("returns the label when the pointer releases", () => {
    const root = button({ width: WIDTH, height: HEIGHT, label: "Restart", onTap: () => {} });
    const label = labelOf(root);
    const atRest = label.y;
    press(root);
    release(root);
    expect(label.y).toBe(atRest);
  });

  it("fires onTap from pointerup without destroying the button mid-gesture", () => {
    let taps = 0;
    const root = button({ width: WIDTH, height: HEIGHT, label: "Restart", onTap: () => (taps += 1) });
    press(root);
    expect(root.children.length).toBeGreaterThan(0);
    release(root);
    expect(taps).toBe(1);
  });

  it("survives a second press after the first completes", () => {
    let taps = 0;
    const root = button({ width: WIDTH, height: HEIGHT, label: "Map", onTap: () => (taps += 1) });
    press(root);
    release(root);
    press(root);
    release(root);
    expect(taps).toBe(2);
  });

  it("keeps Text labels (never baked into the chrome sprite)", () => {
    const root = button({
      width: WIDTH,
      height: HEIGHT,
      label: "Continue",
      variant: "primary",
      onTap: () => {},
    });
    expect(labelOf(root).text).toBe("Continue");
  });

  it("dims disabled while unavailable stays full opacity", () => {
    const disabled = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "disabled" });
    const unavailable = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "unavailable" });
    expect(disabled.alpha).toBe(DIM.alpha);
    expect(unavailable.alpha).toBe(1);
  });

  it("arms the label with highlight ink", () => {
    const idle = button({ width: WIDTH, height: HEIGHT, label: "Action" });
    const armed = button({ width: WIDTH, height: HEIGHT, label: "Action", state: "armed" });
    expect(labelOf(idle).style.fill).toBe(PALETTE.tokenInk);
    expect(labelOf(armed).style.fill).toBe(PALETTE.highlight);
  });

  it("keeps contact shadow on secondary and primary when elevated", () => {
    const secondary = button({ width: WIDTH, height: HEIGHT, label: "Map", variant: "secondary" });
    const primary = button({ width: WIDTH, height: HEIGHT, label: "Next", variant: "primary" });
    expect(named(secondary, "button-contact-shadow").visible).toBe(true);
    expect(named(primary, "button-contact-shadow").visible).toBe(true);
  });

  it("hides contact shadow when unavailable", () => {
    const secondary = button({
      width: WIDTH,
      height: HEIGHT,
      label: "Replay",
      variant: "secondary",
      state: "unavailable",
    });
    expect(named(secondary, "button-contact-shadow").visible).toBe(false);
  });
});
