import { spawnSync } from "node:child_process";
const shots = [
  ["47-commit-key-idle.png", "board-first", "2-08"],
  ["48-commit-key-armed.png", "armed", "2-08"],
];
let port = 4430;
for (const [out, screen, level] of shots) {
  port += 1;
  const env = {
    ...process.env,
    SHOT_PORT: String(port),
    SHOT_QUERY: "?sprites=1",
    SHOT_SAVE_FILE: "docs/review/_hud-emblem-seed.json",
    SHOT_SCREEN: screen,
    SHOT_LEVEL: level,
  };
  console.log("SHOT", out, screen, level);
  const r = spawnSync(process.execPath, ["tools/shot.mjs", out], { env, encoding: "utf8" });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) { console.error("FAIL", out); process.exit(r.status || 1); }
}
console.log("ALL OK");
