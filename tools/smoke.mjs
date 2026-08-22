import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * BOOT SMOKE TEST — does the built page actually come up?
 *
 *   npm run smoke                    # serves dist/ at "/"
 *   node tools/smoke.mjs /lane-math/ # as GitHub Pages serves it, under a base
 *
 * This project has now had THREE silent-blank boot failures, every one of them
 * with a fully green CI:
 *
 *   1. the tool wrote assets/bg while the game loaded public/assets/bg
 *   2. loadAdMob returned Capacitor's proxy from an async function, so awaiting
 *      it called AdMob.then(), which the web shim throws on
 *   3. PixiJS's environment auto-detect deadlocked across split chunks, so
 *      Application.init() never settled — found BY this test
 *
 * All three killed module load. None produced a visible error. A unit suite
 * cannot see any of them, because none is a logic bug — they are BUILD and
 * MODULE-LOAD bugs that exist only in the built artefact.
 *
 * So this runs against dist/ and never the dev server, and it serves through a
 * plain static server rather than a dev tool, because a dev tool's conveniences
 * are exactly what hid two of the three.
 */
/**
 * The base path the artefact was built for.
 *
 * Read from the environment first: Git Bash rewrites a bare `/lane-math/`
 * argument into a Windows path before node ever sees it, which silently makes
 * the server serve the wrong prefix and the test fail for a reason that has
 * nothing to do with the build. The normalisation below catches it either way.
 */
function readBase() {
  const raw = process.env["SMOKE_BASE"] ?? process.argv[2] ?? "/";
  if (raw === "/") return "/";
  // A mangled value looks like C:/Program Files/Git/lane-math/ — keep the tail.
  const tail = raw.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
  return tail ? `/${tail}/` : "/";
}

const base = readBase();
const port = 4173;
const query = process.env["SMOKE_QUERY"] ?? "";
const url = `http://localhost:${port}${base}${query}`;
const expectsSprites = new URLSearchParams(query).get("sprites") === "1";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".css": "text/css",
};

/**
 * A dumb static host, mounted at `base`.
 *
 * Deliberately not `vite preview`: a project Pages site is served from a
 * subpath, and the point of this test is to catch things that only break once
 * the artefact is served the way it will really be served.
 */
const server = createServer((request, response) => {
  let path = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (base !== "/" && path.startsWith(base)) path = path.slice(base.length - 1);
  if (path.endsWith("/")) path += "index.html";

  // Strip leading separators so join() cannot be walked out of dist/.
  const file = join("dist", normalize(path).replace(/^[/\\]+/, ""));
  if (process.env["SMOKE_DEBUG"]) {
    process.stdout.write(`    [serve] base=${base} url=${request.url} -> ${file}\n`);
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

const stop = (code) => {
  server.close();
  process.exit(code);
};

async function waitForServer(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const failures = [];
const check = (ok, message) => {
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${message}\n`);
  if (!ok) failures.push(message);
};

try {
  // Bind before probing. Without this the probe can be answered by whatever
  // else happens to hold the port — which is exactly what happened locally, and
  // gave a PASS that was really a stale dev server answering.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });

  if (!(await waitForServer())) {
    process.stdout.write(`static server never came up at ${url}\n`);
    stop(1);
  }

  /*
   * Software WebGL. Headless Chromium has no GPU, and PixiJS asks for a WebGL
   * context on init — without these flags that request fails, the renderer's
   * init rejects, main's top-level await never resolves, and the page sits
   * there blank with NOTHING in the console. Which is indistinguishable from
   * the two real boot failures this test exists to catch, so it has to be ruled
   * out here rather than discovered again on every run.
   */
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });

  // Every uncaught error and console error during boot. A silent blank page is
  // usually loud in the console — nobody is just looking at it.
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  // A rejected top-level await surfaces here and nowhere else, and is exactly
  // how a silent blank page happens.
  await page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      console.error(`unhandledrejection: ${String(event.reason)}`);
    });
  });

  process.stdout.write(`\nboot smoke against ${url}\n`);
  await page.goto(url, { waitUntil: "networkidle" });
  // A frame or two for the renderer to draw after its async init.
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const api = window.laneMath;
    return {
      hasApi: typeof api === "object" && api !== null,
      hasLoad: typeof api?.load === "function",
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      // Proof a frame was DRAWN, not merely that a canvas exists: the renderer
      // only has children once draw() has run over a real board.
      drawnChildren: api?.diagnostics ? api.diagnostics().rootChildren : -1,
      levelId: api?.state ? (api.state()?.levelId ?? null) : null,
      spritesEnabled: api?.diagnostics ? api.diagnostics().spritesEnabled : 0,
      spritesLoaded: api?.diagnostics ? api.diagnostics().spritesLoaded : 0,
      spritesMissing: api?.diagnostics ? api.diagnostics().spritesMissing : -1,
      atlasFailures: api?.diagnostics ? api.diagnostics().spriteAtlasFailures : -1,
      missingNames: api?.sprites ? api.sprites().missing : [],
      failedNames: api?.sprites ? api.sprites().failed : [],
    };
  });

  check(state.hasApi && state.hasLoad, "window.laneMath exists and is wired up");
  check(state.canvasWidth > 0 && state.canvasHeight > 0, `canvas is ${state.canvasWidth}x${state.canvasHeight}`);
  check(state.drawnChildren > 0, `renderer drew a frame (${state.drawnChildren} objects)`);
  check(state.levelId !== null, `a level is open (${state.levelId})`);
  if (expectsSprites) {
    check(state.spritesEnabled === 1 && state.spritesLoaded === 8, `real WebP sprites loaded (${state.spritesLoaded}/8)`);
    /*
     * A MISSING ATLAS MUST FAIL, NOT FALL BACK.
     *
     * Every token can draw itself procedurally, which is the right behaviour
     * for a player and the wrong behaviour for a build: a broken atlas renders
     * flat rounded rectangles instead of amber glass, throws nothing, logs
     * nothing, and looks like a deliberate art style to anyone who did not
     * write it. That is the same silent-degradation class as the three
     * silent-blank boot failures above — it just degrades to the wrong picture
     * instead of to no picture.
     *
     * So with ?sprites=1 the fallback is a FAILURE, and the names of whatever
     * the game asked for and did not get are printed.
     */
    check(
      state.spritesMissing === 0,
      `no sprite fell back to procedural${state.spritesMissing ? `: ${JSON.stringify(state.missingNames)}` : ""}`,
    );
    /*
     * AND the atlas actually loaded. The check above is necessary but NOT
     * sufficient, proven by deleting tiles.json: the sprite path switches
     * itself off, spriteFor() returns early without recording anything, and
     * spritesMissing sits at 0 while the whole board draws procedurally.
     */
    check(
      state.atlasFailures === 0,
      `every atlas loaded${state.atlasFailures ? `: ${JSON.stringify(state.failedNames)} failed` : ""}`,
    );
  }
  check(errors.length === 0, `no errors during boot${errors.length ? `:\n      ${errors.join("\n      ")}` : ""}`);

  await browser.close();
} catch (error) {
  process.stdout.write(`\nsmoke test threw: ${String(error)}\n`);
  stop(1);
}

process.stdout.write(failures.length === 0 ? "\nboot smoke PASSED\n" : `\nboot smoke FAILED (${failures.length})\n`);
stop(failures.length === 0 ? 0 : 1);
