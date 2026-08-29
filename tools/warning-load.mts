import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Director } from "../src/game/director.js";
import type { Command, LadderLevel, ViewState } from "../src/game/types.js";
import { enumerate, makePool, solve } from "../src/solver/index.js";

const stateOf = (c: readonly Command[]): ViewState => {
  const r = [...c].reverse().find((x) => x.type === "render");
  if (!r || r.type !== "render") throw new Error("no render");
  return r.state;
};

/**
 * HOW OFTEN CAN NORMAL'S WARNING FIRE?
 *
 * For each shipped level: how many of the legal decompositions of the FIRST
 * target are fatal? That is the chance a first move trips the warning, and it
 * is also the density of the trap field the warning is policing.
 */
const files = readdirSync("levels").filter((f) => /^\d-\d\d\.json$/.test(f)).sort();
const rows: string[] = [];
let anyTrap = 0;
let firstMoveTrap = 0;

for (const file of files) {
  const level = JSON.parse(readFileSync(join("levels", file), "utf8")) as LadderLevel;
  const budget = level.modes.normal?.budget ?? {};
  const pool = makePool(level.pool);
  const target = level.targets[0]!;
  const options = enumerate(pool, target, budget, level.rules);

  let fatal = 0;
  for (const option of options) {
    const director = new Director(level, "normal");
    let state = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    stateOf(director.handle({ type: "tapTile", id: option.leftId }));
    stateOf(director.handle({ type: "tapOperator", op: option.op }));
    stateOf(director.handle({ type: "tapTile", id: option.rightId }));
    state = stateOf(director.handle({ type: "tapCommit" }));
    if (state.warning) fatal++;
  }

  const solvable = true;
  if (fatal > 0) { anyTrap++; firstMoveTrap += fatal; }
  rows.push(
    `${file.replace(".json", "")}  first-target options ${String(options.length).padStart(2)}  fatal ${String(fatal).padStart(2)}  ${
      options.length ? `${Math.round((fatal / options.length) * 100)}%` : "-"
    }${solvable ? "" : "  UNSOLVABLE"}`,
  );
}

console.log(rows.join("\n"));
console.log(`\n${anyTrap} of ${files.length} levels can trip the warning on the FIRST move`);
console.log(`${firstMoveTrap} fatal first moves across the ladder`);
