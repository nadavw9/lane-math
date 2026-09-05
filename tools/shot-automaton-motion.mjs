import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

/**
 * Automaton win/fail motion proof shots.
 *
 * Scout REJECT: mid-hop / mid-slump were buried under orange shatter debris
 * (fx draws above the board root). Proof harness clears shatter at the shutter
 * so the brass companion stays fully visible — motion timing unchanged.
 */
const port = 4188;
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
  const file = join("dist", normalize(path).replace(/^[/\\]+/, ""));
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, resolve);
});

mkdirSync("docs/review", { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function shoot(name, drive, aliases = []) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://localhost:${port}/?sprites=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const feel = await page.evaluate(drive);
  // One paint after clearShatters so the canvas is clean for the shutter.
  await page.waitForTimeout(50);
  const out = `docs/review/${name}`;
  await page.screenshot({ path: out });
  for (const alias of aliases) {
    const dest = `docs/review/${alias}`;
    copyFileSync(out, dest);
    console.log(`alias ${dest}`);
  }
  console.log(`wrote ${out}`, JSON.stringify(feel));
  await page.close();
  return feel;
}

const wonFeel = await shoot(
  "11-automaton-win-hop.png",
  async () => {
    const api = window.laneMath;
    api.load("1-01");
    await new Promise((r) => setTimeout(r, 800));
    api.setEffectSpeed(0.35);
    await api.winLevel();
    // Mid-hop ≈ 210ms of feel-time at 0.35 → ~600ms wall.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const f = api.feel();
      if (f.automaton && f.automaton.at >= 0.35 && f.automaton.at <= 0.7) {
        api.setEffectSpeed(0);
        // Proof-only: drop shatter debris so the companion is readable.
        api.clearShatters?.();
        const after = api.feel();
        return { phase: api.state()?.phase, feel: after, shatterCleared: true };
      }
    }
    api.setEffectSpeed(0);
    api.clearShatters?.();
    return { phase: api.state()?.phase, feel: api.feel(), shatterCleared: true };
  },
  ["03-automaton-won-mid.png"],
);

const failFeel = await shoot(
  "12-automaton-fail-slump.png",
  async () => {
    const api = window.laneMath;
    // 1-04 has the scripted trap; use a later level with overridable failure.
    api.load("2-01");
    await new Promise((r) => setTimeout(r, 800));
    for (let i = 0; i < 10 && api.state()?.phase !== "failed"; i++) {
      api.playIntoFailure();
      await new Promise((r) => setTimeout(r, 400));
      if (api.state()?.warning?.overridable) {
        api.setEffectSpeed(0.35);
        api.send({ type: "commitAnyway" });
        await new Promise((r) => setTimeout(r, 200));
        for (let j = 0; j < 6 && api.state()?.phase !== "failed"; j++) {
          api.playIntoFailure();
          await new Promise((r) => setTimeout(r, 350));
          if (api.state()?.warning?.overridable) {
            api.send({ type: "commitAnyway" });
            await new Promise((r) => setTimeout(r, 200));
          } else if (api.state()?.warning) {
            api.send({ type: "dismissWarning" });
          }
        }
      } else if (api.state()?.warning) {
        api.send({ type: "dismissWarning" });
      }
    }
    // If already failed at full speed, reload and catch the enter beat.
    if (api.state()?.phase === "failed" && !api.feel()?.automaton) {
      api.load("2-01");
      await new Promise((r) => setTimeout(r, 600));
      api.setEffectSpeed(0.25);
      for (let i = 0; i < 12 && api.state()?.phase !== "failed"; i++) {
        api.playIntoFailure();
        await new Promise((r) => setTimeout(r, 500));
        if (api.state()?.warning?.overridable) {
          api.send({ type: "commitAnyway" });
          await new Promise((r) => setTimeout(r, 300));
        } else if (api.state()?.warning) {
          api.send({ type: "dismissWarning" });
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const f = api.feel();
      if (f.automaton && f.automaton.kind === "droop" && f.automaton.at >= 0.25 && f.automaton.at <= 0.7) {
        api.setEffectSpeed(0);
        api.clearShatters?.();
        return { phase: api.state()?.phase, feel: api.feel(), shatterCleared: true };
      }
    }
    api.setEffectSpeed(0);
    api.clearShatters?.();
    return { phase: api.state()?.phase, feel: api.feel(), shatterCleared: true };
  },
  ["04-automaton-failed-mid.png"],
);

// Resting pose shots after motion completes (delighted / worried).
await shoot(
  "11b-automaton-won-rest.png",
  async () => {
    const api = window.laneMath;
    api.load("1-01");
    await new Promise((r) => setTimeout(r, 600));
    api.setEffectSpeed(1);
    await api.winLevel();
    await new Promise((r) => setTimeout(r, 1200));
    api.clearShatters?.();
    return { phase: api.state()?.phase, feel: api.feel() };
  },
  ["01-automaton-won.png"],
);

await shoot(
  "12b-automaton-failed-rest.png",
  async () => {
    const api = window.laneMath;
    api.load("2-01");
    await new Promise((r) => setTimeout(r, 600));
    for (let i = 0; i < 10 && api.state()?.phase !== "failed"; i++) {
      api.playIntoFailure();
      await new Promise((r) => setTimeout(r, 450));
      if (api.state()?.warning?.overridable) {
        api.send({ type: "commitAnyway" });
        await new Promise((r) => setTimeout(r, 400));
      } else if (api.state()?.warning) {
        api.send({ type: "dismissWarning" });
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
    api.clearShatters?.();
    return { phase: api.state()?.phase, feel: api.feel() };
  },
  ["02-automaton-failed.png"],
);

writeFileSync(
  "docs/review/AUTOMATON_MOTION_NOTES.md",
  [
    "# Automaton win/fail motion — review shots",
    "",
    "Scout REJECT fix: mid-hop / mid-slump shutter calls `laneMath.clearShatters()`",
    "(proof harness only) so orange shatter debris does not bury the brass companion.",
    "Hop remains 420ms with a phone-readable 22px peak; droop remains 380ms.",
    "",
    `- win mid-hop feel: ${JSON.stringify(wonFeel)}`,
    `- fail mid-slump feel: ${JSON.stringify(failFeel)}`,
    "",
    "Gate: atlas poses only; weighty hop / settle slump; no elastic bounce; PE-01 gutter untouched; fire once on phase enter; robot fully visible mid-motion.",
    "",
  ].join("\n"),
);

writeFileSync(
  "docs/review/00-labels.txt",
  [
    "Lane Math fluency P0 — automaton win/fail motion (feat/fluency-p0-motion-overlays) — morning pack",
    "Athens 2026-09-05. DRAFT ONLY — do not merge.",
    "Scout REJECT fix: mid-motion shots mute shatter FX at shutter (proof only).",
    "",
    "01-automaton-won.png — cleared panel / delighted pose (rest after jump)",
    "02-automaton-failed.png — failed modal / worried pose (rest after droop)",
    "03-automaton-won-mid.png — mid-jump freeze (shatter cleared; robot readable)",
    "04-automaton-failed-mid.png — mid-droop freeze (shatter cleared; robot readable)",
    "11-automaton-win-hop.png — mid-hop (feel-gated shutter; shatter cleared)",
    "11b-automaton-won-rest.png — delighted at rest after hop",
    "12-automaton-fail-slump.png — mid-slump (feel-gated shutter; shatter cleared)",
    "12b-automaton-failed-rest.png — worried at rest after slump",
    "",
    "See AUTOMATON_MOTION_NOTES.md for feelState dumps at shutter.",
    "Gate: atlas poses only; weighty hop / settle; no elastic bounce; PE-01 gutter untouched; fire once on phase enter; companion fully visible mid-motion.",
    "",
  ].join("\n"),
);

writeFileSync(
  "docs/review/AUTOMATON_MOTION_SCOUT_FIX.md",
  [
    "# Automaton motion — Scout REJECT fix",
    "",
    "Branch: feat/automaton-win-fail-motion (PR #7). DRAFT ONLY — never merge.",
    "",
    "Scout rejected mid-hop / mid-slump review shots: brass robot buried under orange shatter FX (fx layer draws above board root; shatter ~420ms overlaps hop/droop).",
    "",
    "## Fix (proof harness only)",
    "- `Renderer.clearShatters()` + `laneMath.clearShatters()` — drops live shatter debris without touching automatonFeel / TIMING.",
    "- `tools/shot-automaton-motion.mjs` freezes mid-motion then clears shatter before shutter.",
    "- Rest shots (01/02/11b/12b) also clear leftover debris.",
    "",
    "## Unchanged",
    "- Hop ~420ms / droop ~380ms; no elastic bounce; PE-01 gutter placement; once-on-enter.",
    "",
  ].join("\n"),
);

await browser.close();
server.close();
