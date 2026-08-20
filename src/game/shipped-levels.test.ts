import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNTIME_LEVEL_FIELDS, RUNTIME_MODE_FIELDS } from "./level-fields.js";
import type { LadderLevel } from "./types.js";

/**
 * THE SHIPPED LEVEL PAYLOAD (GDD §10: metrics do not ship).
 *
 * Two failures this exists to catch, and they point in opposite directions:
 *
 *   1. A field added to the loader that the build does not emit. The game would
 *      ask for it at runtime, on a device, in a level nobody happened to test —
 *      which is how a size optimisation becomes a crash. The compile-time check
 *      in types.ts catches the type side; this catches the DATA side, which the
 *      type cannot see.
 *
 *   2. Metrics creeping back in. The whole 549KB saving is one careless
 *      `JSON.stringify(full)` away from being undone, and nothing about the
 *      game would look wrong.
 */
const SHIPPED = join("src", "generated", "levels.json");
const AUTHORED = "levels";

const shipped = JSON.parse(readFileSync(SHIPPED, "utf8")) as Record<string, unknown>[];
const authoredFiles = readdirSync(AUTHORED).filter((f) => /^\d-\d\d\.json$/.test(f));

describe("the shipped file carries exactly what the loader reads", () => {
  it("has every authored level", () => {
    expect(shipped).toHaveLength(authoredFiles.length);
    expect(shipped).toHaveLength(40);
  });

  it("carries every field the loader declares — no more, no less", () => {
    const expected = [...RUNTIME_LEVEL_FIELDS].sort();
    for (const level of shipped) {
      // Exact set equality in both directions. A missing field is a runtime
      // crash; an extra one is payload nobody asked to ship.
      expect(Object.keys(level).sort(), `level ${String(level["id"])}`).toEqual(expected);
    }
  });

  it("carries exactly the per-mode fields, and never metrics", () => {
    const expected = [...RUNTIME_MODE_FIELDS].sort();
    for (const level of shipped) {
      const modes = level["modes"] as Record<string, Record<string, unknown>>;
      expect(Object.keys(modes).length).toBeGreaterThan(0);
      for (const [name, block] of Object.entries(modes)) {
        expect(Object.keys(block).sort(), `${String(level["id"])} / ${name}`).toEqual(expected);
        expect(block["metrics"], `${String(level["id"])} / ${name} still ships metrics`).toBe(
          undefined,
        );
      }
    }
  });

  it("is not stale — it matches the authored files it was derived from", () => {
    /*
     * The derived file is committed, so it can rot. This compares the PLAYABLE
     * content against the source of truth: if a level was recurated and the
     * build not re-run, the game would ship a board that no longer exists.
     */
    for (const file of authoredFiles) {
      const authored = JSON.parse(readFileSync(join(AUTHORED, file), "utf8")) as LadderLevel;
      const built = shipped.find((l) => l["id"] === authored.id);
      expect(built, `${file} missing from the shipped file`).toBeDefined();

      expect(built!["pool"]).toEqual(authored.pool);
      expect(built!["targets"]).toEqual(authored.targets);
      expect(built!["rules"]).toEqual(authored.rules);
      expect(built!["surplus"]).toEqual(authored.surplus);

      const builtModes = built!["modes"] as Record<string, { budget: unknown }>;
      for (const [name, block] of Object.entries(authored.modes)) {
        expect(builtModes[name]?.budget, `${file} / ${name} budget drifted`).toEqual(block?.budget);
      }
    }
  });

  it("is dramatically smaller than the authored payload", () => {
    const authoredBytes = authoredFiles.reduce(
      (sum, f) => sum + readFileSync(join(AUTHORED, f)).length,
      0,
    );
    const shippedBytes = readFileSync(SHIPPED).length;

    // Measured 560,077 -> 13,176. Asserted as a ratio rather than a number so
    // recuration does not make this flaky, but a regression that re-adds the
    // metrics would blow straight through it.
    expect(shippedBytes).toBeLessThan(authoredBytes * 0.1);
  });
});
