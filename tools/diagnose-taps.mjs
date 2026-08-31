import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * WHY DOES A TAP NOT REACH A PIXI CONTROL?
 *
 * Three candidates, and they need separating before anything is fixed:
 *
 *   a. synthetic vs real input — Playwright drives Chrome's real input
 *      pipeline (CDP Input.dispatchMouseEvent), so its events are trusted;
 *      if this were the cause nothing would ever be automatable.
 *   b. hit-area registration — a PRODUCT bug, meaning some controls may be
 *      unreachable for real players in some state.
 *   c. something swallowing the event — an overlay, eventMode, or z-order.
 *
 * This reports, for one control: what the DOM says is under the point, which
 * pointer events the canvas actually receives, and how the canvas maps CSS
 * pixels to its drawing buffer. Nothing is fixed here; it only measures.
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

await new Promise((resolve) => server.listen(5967, resolve));

const DPR = Number(process.env.DPR ?? 3);
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: DPR,
  isMobile: process.env.MOBILE !== "0",
  hasTouch: process.env.MOBILE !== "0",
});

await page.goto("http://localhost:5967/?sprites=1", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// Record every pointer/mouse/touch event the canvas and the document see.
await page.evaluate(() => {
  window.__taps = [];
  const canvas = document.querySelector("canvas");
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart"]) {
    canvas.addEventListener(type, (e) => {
      window.__taps.push(`canvas:${type} pointerType=${e.pointerType ?? "-"} x=${Math.round(e.clientX ?? -1)} y=${Math.round(e.clientY ?? -1)}`);
    });
    document.addEventListener(type, () => window.__taps.push(`document:${type}`));
  }
});

const metrics = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  return {
    cssSize: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    cssOrigin: `${Math.round(rect.left)},${Math.round(rect.top)}`,
    bufferSize: `${canvas.width}x${canvas.height}`,
    touchAction: getComputedStyle(canvas).touchAction,
    pointerEvents: getComputedStyle(canvas).pointerEvents,
  };
});

/** The restart button, in design space: x 318..408, y 854..884. */
const target = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.height / 900, rect.width / 420);
  const x = rect.left + 363 * scale;
  const y = rect.top + 869 * scale;
  const el = document.elementFromPoint(x, y);
  return {
    x,
    y,
    scale,
    elementAtPoint: el ? `${el.tagName}${el.id ? "#" + el.id : ""}` : "none",
  };
});

// Stage a tile so restart has something visible to undo.
await page.evaluate(() => {
  const s = window.laneMath.state();
  const tile = s.tiles.find((t) => !t.consumed);
  window.laneMath.send({ type: "tapTile", id: tile.id });
});
await page.waitForTimeout(400);
const before = await page.evaluate(() => window.laneMath.state().slots.leftTileId);

await page.mouse.click(target.x, target.y);
await page.waitForTimeout(900);

const after = await page.evaluate(() => window.laneMath.state().slots.leftTileId);

/*
 * SECOND CONTROL, a different kind. Pool tiles set eventMode on the token
 * itself; buttons go through the `button` component. If one answers and the
 * other does not, the fault is in the component rather than in the pipeline.
 */
await page.evaluate(() => window.laneMath.send({ type: "tapRestart" }));
await page.waitForTimeout(300);
const tilePoint = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.height / 900, rect.width / 420);
  const b = window.laneMath.poolSlotOf ? window.laneMath.poolSlotOf(0) : { x: 74, y: 620, width: 60, height: 60 };
  return { x: rect.left + (b.x + b.width / 2) * scale, y: rect.top + (b.y + b.height / 2) * scale };
});
const tileBefore = await page.evaluate(() => window.laneMath.state().slots.leftTileId);
await page.mouse.click(tilePoint.x, tilePoint.y);
await page.waitForTimeout(700);
const tileAfter = await page.evaluate(() => window.laneMath.state().slots.leftTileId);

/*
 * DOES THE BUTTON PRESS?
 *
 * `button` repaints on pointerdown, so if the DOWN lands the control visibly
 * sinks. Comparing a crop of it mid-press against the same crop at rest says
 * whether the down arrives and only the UP is lost — which would point at the
 * repaint destroying the object the pointer is over.
 */
const box = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.height / 900, rect.width / 420);
  return {
    x: Math.round(rect.left + 318 * scale),
    y: Math.round(rect.top + 850 * scale),
    width: Math.round(92 * scale),
    height: Math.round(40 * scale),
  };
});
const rest = await page.screenshot({ clip: box });
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.waitForTimeout(500);
const pressed = await page.screenshot({ clip: box });
await page.mouse.up();
await page.waitForTimeout(500);
const afterUp = await page.evaluate(() => window.laneMath.state().slots.leftTileId);
const pressedDiffers = Buffer.compare(rest, pressed) !== 0;
const taps = await page.evaluate(() => window.__taps);

process.stdout.write(
  [
    `dpr=${DPR} mobile=${process.env.MOBILE !== "0"}`,
    `canvas css ${metrics.cssSize} at ${metrics.cssOrigin}, buffer ${metrics.bufferSize}`,
    `touch-action=${metrics.touchAction} pointer-events=${metrics.pointerEvents}`,
    `target ${Math.round(target.x)},${Math.round(target.y)} scale=${target.scale.toFixed(4)}`,
    `elementFromPoint -> ${target.elementAtPoint}`,
    `staged before=${before} after=${after}  ${before !== after ? "RESTART FIRED" : "restart did NOT fire"}`,
    `pool tile at ${Math.round(tilePoint.x)},${Math.round(tilePoint.y)}: staged ${tileBefore} -> ${tileAfter}  ${tileBefore !== tileAfter ? "TILE FIRED" : "tile did NOT fire"}`,
    `button pressed visually on pointerdown: ${pressedDiffers}`,
    `staged after full down+up: ${afterUp}`,
    `events seen (${taps.length}):`,
    ...taps.slice(0, 12).map((t) => "  " + t),
  ].join("\n") + "\n",
);

await browser.close();
server.close();
process.exit(0);
