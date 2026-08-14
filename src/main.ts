import { Director } from "./game/director.js";
import type { LadderLevel } from "./game/types.js";
import { Renderer } from "./renderer/renderer.js";

/**
 * Wires the Director to the Renderer. Phase 3 hardcodes Normal (GDD §7.6 puts
 * the mode selector at 3-10, which is out of scope here).
 */
const MODE = "normal" as const;

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

const first = levels.get(LEVEL_IDS[0]!)!;
const renderer = new Renderer();
await renderer.init(host);

let director = new Director(first, MODE);
renderer.onInput((input) => renderer.apply(director.handle(input)));
renderer.apply(director.loadLevel(first));

for (const id of LEVEL_IDS) {
  const level = levels.get(id);
  if (!level) continue;
  const button = document.createElement("button");
  button.textContent = id;
  button.dataset.levelId = id;
  button.addEventListener("click", () => {
    director = new Director(level, MODE);
    renderer.onInput((input) => renderer.apply(director.handle(input)));
    renderer.apply(director.loadLevel(level));
    for (const other of picker.querySelectorAll("button")) other.classList.remove("active");
    button.classList.add("active");
  });
  picker.appendChild(button);
}
picker.querySelector("button")?.classList.add("active");

// Exposed for the screenshot harness to drive taps deterministically.
Object.assign(window, {
  laneMath: {
    load: (id: string) => {
      const level = levels.get(id);
      if (!level) throw new Error(`no level ${id}`);
      director = new Director(level, MODE);
      renderer.onInput((input) => renderer.apply(director.handle(input)));
      renderer.apply(director.loadLevel(level));
    },
    send: (input: unknown) => renderer.apply(director.handle(input as never)),
  },
});
