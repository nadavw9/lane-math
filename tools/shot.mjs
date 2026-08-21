import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * SCREENSHOT THE BUILT ARTEFACT, at phone aspect and real DPR.
 *
 *   node tools/shot.mjs out.png                     # procedural tokens
 *   SHOT_QUERY=?sprites=1 node tools/shot.mjs a.png # the real atlas
 *
 * THE QUERY MATTERS. The sprite path is opt-in behind ?sprites=1 (main.ts), and
 * without it the game draws its procedural fallback — flat rounded rectangles
 * and flat circles instead of amber glass and brass. A screenshot taken without
 * the flag is a picture of the fallback, and it looks like missing art. That
 * exact confusion is why the query is a named parameter here and echoed in the
 * output rather than buried in a URL.
 */
const out = process.argv[2] ?? "shot.png";
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

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

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

await page.screenshot({ path: out });
process.stdout.write(
  `wrote ${out}\n  url=${url}\n  level=${state.levelId}  spritesEnabled=${state.spritesEnabled}` +
    `  loaded=${state.spritesLoaded}  missing=${state.spritesMissing}` +
    `${state.missing.length ? ` ${JSON.stringify(state.missing)}` : ""}\n`,
);

await browser.close();
server.close();
process.exit(0);
