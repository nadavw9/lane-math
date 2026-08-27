import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * §9.0 MOTION ON ENTRY: "every screen animates in, nothing appears
 * instantaneously."
 *
 * Gap 6 was open because 18 of 55 board adds and 2 of 12 map adds bypassed the
 * entrance system — including the AUTOMATON, so the game's character popped in
 * while everything around it settled. Nobody had decided that; it was just
 * never noticed.
 *
 * A standard that depends on remembering is not a standard. So every
 * `this.root.addChild(...)` must either go through `this.entry(...)` — which
 * puts it on an entrance band — or carry an `entry-exempt:` comment saying why
 * it does not. Exemptions are legitimate: a tile flying to a slot mid-play and
 * a modal that opens on demand are not part of a screen's arrival. What is not
 * legitimate is an unexamined one.
 */
const SOURCES = ["src/renderer/renderer.ts", "src/map/map-screen.ts"];

function unexplainedAdds(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const offenders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes("this.root.addChild(")) continue;
    // Wrapped on this line, or on the next (multi-line calls).
    const window = `${line}\n${lines[i + 1] ?? ""}\n${lines[i + 2] ?? ""}`;
    if (window.includes("this.entry(")) continue;
    // Exempt, with a stated reason in the preceding four lines.
    const preamble = lines.slice(Math.max(0, i - 4), i).join("\n");
    if (/entry-exempt:/.test(preamble)) continue;
    offenders.push(`${file}:${i + 1}  ${line.trim()}`);
  }
  return offenders;
}

describe("§9.0 motion on entry", () => {
  it("every add is entrance-wrapped or explicitly exempt", () => {
    const offenders = SOURCES.flatMap(unexplainedAdds);
    expect(
      offenders,
      `these appear instantaneously. Wrap in this.entry(...) or add an\n` +
        `"entry-exempt: <reason>" comment above:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
