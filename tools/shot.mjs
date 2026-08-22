import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * SCREENSHOT THE BUILT ARTEFACT, at phone aspect and real DPR.
 *
 *   node tools/shot.mjs 01-board.png                     # procedural tokens
 *   SHOT_QUERY=?sprites=1 node tools/shot.mjs 01-board.png # the real atlas
 *
 * A bare filename lands in docs/review/, which is the ONE review folder for
 * this repo and is wiped and replaced per batch. Screenshots do not go in the
 * .claude projects directory — that is shared across every project on this
 * machine and had collected 371 stray PNGs before anyone noticed.
 *
 * THE QUERY MATTERS. The sprite path is opt-in behind ?sprites=1 (main.ts), and
 * without it the game draws its procedural fallback — flat rounded rectangles
 * and flat circles instead of amber glass and brass. A screenshot taken without
 * the flag is a picture of the fallback, and it looks like missing art. That
 * exact confusion is why the query is a named parameter here and echoed in the
 * output rather than buried in a URL.
 */
const raw = process.argv[2] ?? "shot.png";
const out = raw.includes("/") || raw.includes("\\") ? raw : `docs/review/${raw}`;
const port = Number(process.env["SHOT_PORT"] ?? 4177);

function readBase() {
  const raw = process.env["SMOKE_BASE"] ?? "/";
  if (raw === "/") return "/";
  // Git Bash rewrites a bare /lane-math/ into C:/Program Files/Git/lane-math/.
  const tail = raw.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
  return tail ? `/${tail}/` : "/";
}

const base = readBase();
const query = process.env["SHOT_QUERY"] ?? "";
const url = `http://localhost:${port}${base}${query}`;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".css": "text/css",
  ".woff2": "font/woff2",
};

const server = createServer((request, response) => {
  let path = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (base !== "/" && path.startsWith(base)) path = path.slice(base.length - 1);
  if (path.endsWith("/")) path += "index.html";
  const file = join("dist", normalize(path).replace(/^[/\\]+/, ""));
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

// A stale server on this port would be photographed instead of dist/, and a
// second listen() can resolve without error on Windows while it keeps serving.
try {
  await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
  process.stdout.write(`something already answers on port ${port} — refusing to shoot its output\n`);
  process.exit(1);
} catch {
  /* free, as required */
}

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, resolve);
});

/**
 * Optional seeded save, written before the app boots.
 *
 * Most of the emblems only appear with progress behind them — star meters need
 * cleared levels, the pocket-watches need lives unlocked at 2-8, the hints chip
 * needs the shop at 3-6. Reviewing them on a fresh save shows an empty header
 * and proves nothing.
 */
const seed = process.env["SHOT_SAVE"] ?? "";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const level = process.env["SHOT_LEVEL"] ?? "";
if (seed) {
  await page.addInitScript((save) => {
    try {
      window.localStorage.setItem("lane-math.save.v1", save);
    } catch {
      /* private mode; the shot just shows a fresh save */
    }
  }, seed);
}
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
if (level) {
  // Lives are off in World 1 (§7.2), so the HUD watches only exist deeper in.
  await page.evaluate((id) => window.laneMath.load(id), level);
  await page.waitForTimeout(1500);
}

// Optional screen to drive to before the shutter, so the map and the cleared
// panel can be reviewed without a hand-written harness each time.
const screen = process.env["SHOT_SCREEN"] ?? "";
if (screen) {
  await page.evaluate(async (name) => {
    const api = window.laneMath;
    if (name === "map") api.showMap();
    if (name === "cleared") {
      api.showBoard();
      api.playIntoFailure?.();
    }
    if (name === "shop") {
      api.send({ type: "toggleShop" });
    }
    if (name === "hint") {
      // A bought hint is the only way the hint line, and its mark, appear.
      api.send({ type: "buyHint", hint: "narrow" });
    }
  }, screen);
  // Long enough for the entrance to finish. The map lands in bands and the
  // footer is one of the last, so a short wait photographs a half-arrived
  // screen and the missing element looks like a bug rather than a shutter
  // fired early — which is exactly how it read the first time.
  await page.waitForTimeout(3000);
}

// Say what was actually photographed, so a fallback render is never mistaken
// for missing art again.
const state = await page.evaluate(() => {
  const d = window.laneMath?.diagnostics?.();
  return {
    levelId: window.laneMath?.state?.()?.levelId ?? null,
    spritesEnabled: d?.spritesEnabled ?? -1,
    spritesLoaded: d?.spritesLoaded ?? -1,
    spritesMissing: d?.spritesMissing ?? -1,
    missing: window.laneMath?.sprites?.().missing ?? [],
  };
});

/*
 * Optional tap-latency probe, taken through the same built artefact.
 *
 * The board is rebuilt every frame, so anything added to a draw is paid for on
 * every tap. This project has already shipped one O(n)-per-tap leak, so a
 * change that adds objects to the board says what it cost rather than assuming
 * it cost nothing.
 */
if (process.env["SHOT_PROBE"] === "latency") {
  const latency = await page.evaluate(() => window.laneMath.measureTapLatency(200));
  process.stdout.write(
    `  tap latency: median ${latency.median.toFixed(3)}ms  mean ${latency.mean.toFixed(3)}ms  max ${latency.max.toFixed(3)}ms
`,
  );
}

await page.screenshot({ path: out });
process.stdout.write(
  `wrote ${out}\n  url=${url}\n  level=${state.levelId}  spritesEnabled=${state.spritesEnabled}` +
    `  loaded=${state.spritesLoaded}  missing=${state.spritesMissing}` +
    `${state.missing.length ? ` ${JSON.stringify(state.missing)}` : ""}\n`,
);

await browser.close();
server.close();
process.exit(0);
