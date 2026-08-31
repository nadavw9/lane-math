import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * WHICH WAY OF TAPPING REACHES A PIXI CONTROL?
 *
 * The button is reachable — a move/down/up sequence fires it. `mouse.click()`
 * does not. This runs each method against the SAME control and reads the game
 * state rather than the picture, because canvas captures in this harness have
 * already proved unreliable.
 *
 * Signal: restart clears a staged tile, so `slots.leftTileId` goes 0 -> null
 * exactly when the control fires.
 */
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
  if (path.endsWith("/")) path += "index.html";
  const file = join("dist", normalize(path).replace(/^[\\/]+/, ""));
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(5969, resolve));

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

await page.goto("http://localhost:5969/?sprites=1", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const point = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.height / 900, rect.width / 420);
  // restart: design x 318..408, y 854..884.
  return { x: rect.left + 363 * scale, y: rect.top + 869 * scale };
});

/** Stage a tile, so restart has something to clear. */
async function stage() {
  await page.evaluate(() => {
    window.laneMath.send({ type: "tapRestart" });
    const s = window.laneMath.state();
    const tile = s.tiles.find((t) => !t.consumed);
    window.laneMath.send({ type: "tapTile", id: tile.id });
  });
  await page.waitForTimeout(250);
  return page.evaluate(() => window.laneMath.state().slots.leftTileId);
}

const read = () => page.evaluate(() => window.laneMath.state().slots.leftTileId);

const results = [];

/*
 * A FRESH PAGE PER METHOD.
 *
 * Run back-to-back in one page these results contradicted each other — the
 * same sequence fired early in the run and not later — which means the run was
 * measuring its own leftover state, not the method. Reloading isolates the one
 * variable.
 */
async function attempt(name, drive) {
  await page.goto("http://localhost:5969/?sprites=1", { waitUntil: "networkidle" });
  /*
   * WAIT FOR THE BOARD TO STOP MOVING.
   *
   * The board ARRIVES (§9.0) — every band drops into place — so a tap sent
   * before the entrance finishes lands where the control is going to be, not
   * where it is. Under software rendering that arrival takes seconds, which is
   * why the same input fired on one run and missed on the next. Polling the
   * label position until it stops changing settles it without guessing.
   */
  await page.waitForTimeout(1500);
  let previous = null;
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => {
      const s = window.laneMath.state();
      return s ? `${s.levelId}:${s.phase}` : null;
    });
    if (now !== null && now === previous) break;
    previous = now;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1200);
  const point = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.height / 900, rect.width / 420);
    return { x: rect.left + 363 * scale, y: rect.top + 869 * scale };
  });
  await page.evaluate(() => {
    const s = window.laneMath.state();
    const tile = s.tiles.find((t) => !t.consumed);
    window.laneMath.send({ type: "tapTile", id: tile.id });
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.laneMath.state().slots.leftTileId);
  await drive(point);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.laneMath.state().slots.leftTileId);
  results.push(`  ${name.padEnd(34)} ${String(before)} -> ${String(after)}   ${before !== null && after === null ? "FIRED" : "no"}`);
}

await attempt("mouse.click", async (p) => page.mouse.click(p.x, p.y));
await attempt("mouse.click delay 120", async (p) => page.mouse.click(p.x, p.y, { delay: 120 }));
await attempt("move / down / up, no waits", async (p) => {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
});
await attempt("move, wait, down, wait, up", async (p) => {
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
});
await attempt("touchscreen.tap", async (p) => page.touchscreen.tap(p.x, p.y));

/*
 * THE MINIMUM GAP, measured properly: a FRESH PAGE per variant.
 *
 * The first attempt at this number ran every variant in one page and the
 * results contradicted each other — identical sequences firing early in the
 * run and not later — because each attempt was reading the leftover state of
 * the one before it. That number was thrown away rather than reported.
 */
for (const delay of [0, 1, 8, 16, 33]) {
  await attempt(`instant tap, ${String(delay).padStart(2)}ms gap`, async (p) => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    if (delay > 0) await page.waitForTimeout(delay);
    await page.mouse.up();
  });
}

process.stdout.write(`restart at ${Math.round(point.x)},${Math.round(point.y)}\n${results.join("\n")}\n`);

await browser.close();
server.close();
process.exit(0);
