import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MODAL_CARTOUCHE, MODAL_SLICE } from "./modal-chrome.js";

describe("modal frame atlas on disk", () => {
  it("ships clean ornate + cartouche @2x (not master twin)", () => {
    expect(MODAL_SLICE.artWidth).toBe(480);
    expect(MODAL_SLICE.artHeight).toBe(560);
    expect(MODAL_SLICE.leftWidth).toBe(144);
    expect(MODAL_SLICE.topHeight).toBe(224);
    expect(MODAL_CARTOUCHE.width).toBe(160);
    expect(existsSync("public/assets/ui/modal/ui-modal-frame-ornate@2x.png")).toBe(true);
    expect(existsSync("public/assets/ui/modal/ui-modal-frame-cartouche@2x.png")).toBe(true);
    expect(existsSync("public/assets/ui/modal/ui-modal-frame-ornate-master@2x.png")).toBe(false);
  });
});
