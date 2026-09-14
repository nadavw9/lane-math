import { describe, expect, it } from "vitest";

import {
  DEFAULT_ECONOMY,
  DEFAULT_WORLD_STAR_GATES,
  STAR_GATE_WORLD_2,
  STAR_GATE_WORLD_3,
  STAR_GATE_WORLD_4,
} from "./config.js";

describe("production default world star gates (Track A)", () => {
  it("exports STAR_GATE_WORLD_2/3/4 as 10/20/30", () => {
    expect(STAR_GATE_WORLD_2).toBe(10);
    expect(STAR_GATE_WORLD_3).toBe(20);
    expect(STAR_GATE_WORLD_4).toBe(30);
  });

  it("DEFAULT_WORLD_STAR_GATES matches 0/10/20/30 for worlds 1–4", () => {
    expect(DEFAULT_WORLD_STAR_GATES).toEqual({ 1: 0, 2: 10, 3: 20, 4: 30 });
  });

  it("DEFAULT_ECONOMY.worldStarGates is the production default map (not an inject)", () => {
    expect(DEFAULT_ECONOMY.worldStarGates).toBe(DEFAULT_WORLD_STAR_GATES);
    expect(DEFAULT_ECONOMY.worldStarGates[2]).toBe(10);
    expect(DEFAULT_ECONOMY.worldStarGates[3]).toBe(20);
    expect(DEFAULT_ECONOMY.worldStarGates[4]).toBe(30);
  });
});
