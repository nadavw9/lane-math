import { Economy } from "./economy/economy.js";
import { LocalStorageStore } from "./economy/save.js";
import { Director } from "./game/director.js";
import type { Command, InputEvent, LadderLevel, ViewState } from "./game/types.js";
import { Renderer } from "./renderer/renderer.js";
import { enumerate, enumerateTransforms } from "./solver/index.js";

/**
 * Wires the Director to the Renderer. Casual is hardcoded: §6 defines Casual as
 * unlimited operators, so no operator is ever exhausted and no count needs to
 * appear on the board. The mode selector unlocks at 3-10 (§7.6) and is not
 * built yet.
 */
const MODE = "casual" as const;

const LEVEL_IDS: string[] = [];
for (let world = 1; world <= 4; world++) {
  for (let slot = 1; slot <= 10; slot++) {
    LEVEL_IDS.push(`${world}-${String(slot).padStart(2, "0")}`);
  }
}

const levelModules = import.meta.glob("../levels/*.json", { eager: true }) as Record<
  string,
  { default: LadderLevel }
>;

const levels = new Map<string, LadderLevel>();
for (const [path, module] of Object.entries(levelModules)) {
  const id = path.split("/").pop()!.replace(".json", "");
  levels.set(id, module.default);
}

const host = document.getElementById("app")!;
const picker = document.getElementById("levels")!;

const renderer = new Renderer();
await renderer.init(host);

// One economy for the whole session, persisted to localStorage.
const economy = new Economy(new LocalStorageStore());

let currentLevel = levels.get(LEVEL_IDS[0]!)!;
let director = new Director(currentLevel, MODE, economy);
let lastState: ViewState | null = null;

function apply(commands: readonly Command[]): void {
  for (const command of commands) {
    if (command.type === "render") lastState = command.state;
  }
  renderer.apply(commands);
}

function send(input: InputEvent): void {
  apply(director.handle(input));
}

function open(level: LadderLevel): void {
  currentLevel = level;
  director = new Director(level, MODE, economy);
  apply(director.loadLevel(level));
}

renderer.onInput(send);
open(currentLevel);

// Lives regenerate on a timer, so the HUD has to notice without an input event.
setInterval(() => send({ type: "tick" }), 5_000);

for (const id of LEVEL_IDS) {
  const level = levels.get(id);
  if (!level) continue;
  const button = document.createElement("button");
  button.textContent = id;
  button.dataset.levelId = id;
  button.addEventListener("click", () => {
    open(level);
    for (const other of picker.querySelectorAll("button")) other.classList.remove("active");
    button.classList.add("active");
  });
  picker.appendChild(button);
}
picker.querySelector("button")?.classList.add("active");

/**
 * Walk the board into a genuine loss by playing real moves through the
 * Director — used by the screenshot harness so the economy can be exercised
 * without hand-computing a fatal line for every level. It decides nothing
 * itself: the solver says what is legal, the Director says what it costs.
 */
function playIntoFailure(): string {
  for (let guard = 0; guard < 30; guard++) {
    if (!lastState || lastState.phase !== "playing") break;
    const live = lastState.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = lastState.targets[lastState.targetIndex];
    if (target === undefined) break;

    const decomps = enumerate(live, target, lastState.budget, currentLevel.rules);
    if (decomps.length > 0) {
      // Take the last option: on a trapped board the natural-looking move is
      // enumerated first, so this reliably walks into trouble.
      const pick = decomps[decomps.length - 1]!;
      send({ type: "tapTile", id: pick.leftId });
      send({ type: "tapOperator", op: pick.op });
      send({ type: "tapTile", id: pick.rightId });
      send({ type: "tapCommit" });
      continue;
    }
    const transforms = enumerateTransforms(live, lastState.budget, currentLevel.rules);
    if (transforms.length > 0) {
      send({ type: "tapUnary", op: transforms[0]!.op });
      send({ type: "tapTile", id: transforms[0]!.tileId });
      continue;
    }
    break;
  }
  return lastState?.phase ?? "unknown";
}

Object.assign(window, {
  laneMath: {
    load: (id: string) => {
      const level = levels.get(id);
      if (!level) throw new Error(`no level ${id}`);
      open(level);
    },
    send,
    playIntoFailure,
    economy: () => economy.state,
    state: () => lastState,
  },
});
