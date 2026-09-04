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

/**
 * SHOT_URL photographs a LIVE site instead of dist/, so a deploy can be
 * confirmed by what it actually serves rather than by a green job.
 */
const liveUrl = process.env["SHOT_URL"] ?? "";
const base = readBase();
const query = process.env["SHOT_QUERY"] ?? "";
const url = liveUrl ? `${liveUrl}${query}` : `http://localhost:${port}${base}${query}`;

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
if (!liveUrl) {
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
}

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
/*
 * SHOT_VIEWPORT=360x640 to photograph a size other than the design one. The
 * layout shipped broken on every real phone because it was only ever seen at
 * 393x852, so being able to shoot the small end cheaply matters.
 */
const [vpW, vpH] = (process.env["SHOT_VIEWPORT"] ?? "393x852").split("x").map(Number);
const page = await browser.newPage({
  viewport: { width: vpW, height: vpH },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
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
    if (name.startsWith("academy-")) {
      const n = Number(name.slice("academy-".length));
      if (Number.isFinite(n)) {
        api.setRestored?.(n);
        api.showMap();
      }
    }
    if (name.startsWith("confirm-")) {
      // Open the restore confirm on world 1, with the star balance forced so
      // the affordable and unaffordable states can both be photographed.
      api.setStars?.(name === "confirm-poor" ? 0 : 20);
      api.showMap();
      api.tapRestore?.(1);
    }
    if (name === "shop") {
      api.send({ type: "toggleShop" });
    }
    if (name === "spent") {
      // Exhaust an operator budget so the unavailable state is on screen
      // alongside available ones — the comparison is the point.
      api.playIntoFailure();
      /*
       * The front target keeps §9.4's red rim afterwards, and that is correct:
       * playIntoFailure is the only programmatic route to a spent operator, and
       * it necessarily leaves the level in its refused state. Neither a settle
       * nor a legal input clears it, because the state is real rather than a
       * decaying pulse. For the plain gold front-target rim, shoot without this
       * screen.
       */
      await new Promise((r) => setTimeout(r, 1200));
    }
    if (name === "cleared") {
      /*
       * Win the level through the solver, so the cleared panel is reached the
       * way a player reaches it rather than by forcing a phase.
       *
       * This branch used to be TWO branches: an older one that called
       * playIntoFailure(), and this one. Both ran, so `cleared` lost the level
       * and then asked a lost level to win — and 4-10 photographed as the
       * FAILURE modal. I read that as the win driver diverging between node and
       * the browser and went looking for a solver bug. The solver was fine; the
       * harness was driving the opposite of what it claimed to.
       */
      api.showBoard();
      await api.winLevel?.();
    }
    if (name === "warned") {
      /*
       * §6's Normal warning, which is a WARNING and not a block: the panel has
       * to show both ways out. Driving it with the solver rather than forcing
       * the state, and refusing to shoot anything else — a screenshot of a
       * board with no warning on it would look like a passing check.
       */
      api.playIntoFailure?.();
      if (!api.state()?.warning) throw new Error("no warning on screen — nothing to shoot");
    }
    if (name === "failed") {
      /*
       * THE FAILURE MODAL, which needs the warning OVERRIDDEN to reach.
       *
       * `spent` alone photographs the warning panel instead: in Normal the
       * warning intercepts the fatal move, which is the whole point of §6. And
       * it has to be a level with a trap — the tutorial tier is trapless by
       * §8.3, so `playIntoFailure` at 1-03 photographs the CLEARED panel.
       */
      /*
       * Overriding the warning does not lose the level on the spot — it takes
       * the fatal move and play CONTINUES until the lane cannot advance, which
       * is §9.4's failure signal rather than a verdict announced up front. So
       * this drives the loop rather than the single move.
       */
      for (let i = 0; i < 8 && api.state()?.phase !== "failed"; i++) {
        api.playIntoFailure();
        await new Promise((r) => setTimeout(r, 500));
        if (api.state()?.warning?.overridable) {
          api.send({ type: "commitAnyway" });
          await new Promise((r) => setTimeout(r, 500));
        } else if (api.state()?.warning) {
          api.send({ type: "dismissWarning" });
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
      if (api.state()?.phase !== "failed") throw new Error(`phase is ${api.state()?.phase}, not failed`);
    }
    if (name === "armed") {
      /*
       * Stage a legal expression so the commit key is ARMED. Its gold state is
       * the one §9.6 actually specifies, and every board shot before this
       * photographed the disarmed key — so the state the rule is about had
       * never been reviewed.
       */
      const s0 = api.state();
      const [a, b] = s0.tiles.filter((t) => !t.consumed);
      const op = Object.keys(s0.budget)[0];
      api.send({ type: "tapTile", id: a.id });
      api.send({ type: "tapOperator", op });
      api.send({ type: "tapTile", id: b.id });
      if (api.state()?.affordance !== "commit") throw new Error("key not armed — nothing to shoot");
    }
    if (name === "swap-armed") {
      // Reach the swap arm through the same filled-slot tap a player uses.
      const s0 = api.state();
      const [a, b] = s0.tiles.filter((t) => !t.consumed);
      const op = Object.keys(s0.budget)[0];
      api.send({ type: "tapTile", id: a.id });
      api.send({ type: "tapOperator", op });
      api.send({ type: "tapTile", id: b.id });
      api.send({ type: "tapSlot", index: 0 });
      if (api.state()?.swapArmedSlot !== 0) throw new Error("operand not armed — nothing to shoot");
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
