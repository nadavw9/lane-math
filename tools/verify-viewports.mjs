import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * DOES THE BOARD FIT ON A REAL PHONE?
 *
 *   node tools/verify-viewports.mjs [url]
 *
 * The layout was only ever checked at 393x852 — one viewport, the design one,
 * in a desktop harness. It shipped with `#app` hard-coded to 393x852px, so the
 * frame ignored the viewport entirely: on a device with browser chrome the
 * bottom of the pool fell off the screen, and body padding plus the debug
 * panel's flex gap pushed the commit button past the right edge. Both axes,
 * invisible to a single-viewport check.
 *
 * So this measures the RANGE (§9.1: 16:9 through 21:9), and it measures what is
 * actually visible rather than what the document thinks it is:
 *
 *   - `visualViewport` is the truth on mobile. `innerHeight` includes area
 *     hidden behind browser chrome, which is exactly the lie that hid this.
 *   - the canvas must fit inside the visual viewport on BOTH axes;
 *   - and it must not be silently cropped by an ancestor's overflow:hidden,
 *     which looks identical to fitting until you look at the pixels.
 */
const VIEWPORTS = [
  { name: "360x640  small 16:9", width: 360, height: 640 },
  { name: "393x852  design", width: 393, height: 852 },
  { name: "412x915  large", width: 412, height: 915 },
  { name: "412x960  21:9", width: 412, height: 960 },
  // Browser chrome eats the bottom: the same device mid-scroll, which is the
  // state the reported screenshot was taken in.
  { name: "393x720  design, chrome shown", width: 393, height: 720 },
];

/*
 * The artefact is built for the Pages base in CI, so the server has to mount
 * there or every asset 404s and this measures a blank page. Read from the
 * environment because Git Bash rewrites a bare /lane-math/ into a Windows path.
 */
function readBase() {
  const raw = process.env["SMOKE_BASE"] ?? "/";
  if (raw === "/") return "/";
  const tail = raw.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
  return tail ? `/${tail}/` : "/";
}

const base = readBase();
const port = 4179;
const url = process.argv[2] ?? `http://localhost:${port}${base}`;
const serving = !process.argv[2];

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

if (serving) {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1200) });
    process.stdout.write(`something already answers on port ${port} — refusing to measure its output\n`);
    process.exit(1);
  } catch {
    /* free */
  }
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const failures = [];
process.stdout.write(`\nviewport fit against ${url}\n\n`);
process.stdout.write(
  `  viewport                 visible      canvas       overflow x/y   verdict\n`,
);

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  /*
   * A blank page has no canvas and would otherwise sail through with an
   * overflow of zero — a gate that measures nothing reports "fits".
   */
  const booted = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    return Boolean(c) && c.getBoundingClientRect().width > 0;
  });
  if (!booted) {
    failures.push(`${vp.name}: the app did not render — nothing to measure`);
    process.stdout.write(`  ${vp.name.padEnd(24)} DID NOT BOOT\n`);
    await context.close();
    continue;
  }

  const m = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;

    // An ancestor with overflow:hidden crops the canvas without changing its
    // own rect, so compare the drawn box against every clipping ancestor.
    let clipW = Infinity;
    let clipH = Infinity;
    for (let node = canvas.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflow !== "visible") {
        const r = node.getBoundingClientRect();
        clipW = Math.min(clipW, r.width);
        clipH = Math.min(clipH, r.height);
      }
    }
    return {
      vw,
      vh,
      canvas: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      clipW,
      clipH,
      docW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
      // The dev level picker must never take space from the board.
      picker: (() => {
        const l = document.getElementById("levels");
        if (!l) return "absent";
        const st = getComputedStyle(l);
        return `${st.display} ${Math.round(l.getBoundingClientRect().width)}px`;
      })(),
    };
  });

  const overX = Math.max(0, Math.round(m.canvas.x + m.canvas.w - m.vw), Math.round(m.docW - m.vw));
  const overY = Math.max(0, Math.round(m.canvas.y + m.canvas.h - m.vh), Math.round(m.docH - m.vh));
  const cropX = Math.max(0, Math.round(m.canvas.w - m.clipW));
  const cropY = Math.max(0, Math.round(m.canvas.h - m.clipH));
  /*
   * The dev level picker must be GONE at phone widths, not merely out of flow.
   * Two `#levels` rules existed, mine before the media query and the original
   * after it, so at equal specificity the later one re-set display:grid and the
   * picker sat on top of the pool at every size. Reporting it was not enough —
   * it needs to fail.
   */
  const pickerShown = !m.picker.startsWith("none") && m.picker !== "absent";
  const bad = overX > 1 || overY > 1 || cropX > 1 || cropY > 1 || pickerShown;
  if (bad) {
    failures.push(
      `${vp.name}: overflow ${overX}x${overY}px` +
        (cropX || cropY ? `, cropped ${cropX}x${cropY}px` : "") +
        (pickerShown ? `, dev picker visible (${m.picker})` : ""),
    );
  }
  process.stdout.write(
    `  ${vp.name.padEnd(24)} ${String(Math.round(m.vw)).padStart(4)}x${String(Math.round(m.vh)).padEnd(5)} ` +
      `${String(Math.round(m.canvas.w)).padStart(4)}x${String(Math.round(m.canvas.h)).padEnd(6)} ` +
      `${String(overX).padStart(5)}/${String(overY).padEnd(6)} ${bad ? "CLIPPED" : "fits"}  picker:${m.picker}` +
      `${cropX || cropY ? `  (cropped ${cropX}x${cropY})` : ""}\n`,
  );
  await context.close();
}

await browser.close();
if (serving) server.close();
process.stdout.write(
  failures.length === 0
    ? "\nevery supported viewport fits\n"
    : `\nVIEWPORTS THAT DO NOT FIT (${failures.length}):\n  ${failures.join("\n  ")}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
