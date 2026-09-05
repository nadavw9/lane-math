import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

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

async function shoot(name, drive) {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`http://localhost:${port}/?sprites=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const feel = await page.evaluate(drive);
  const out = `docs/review/${name}`;
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`, JSON.stringify(feel));
  await page.close();
  return feel;
}

const wonFeel = await shoot("11-automaton-win-hop.png", async () => {
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
      return { phase: api.state()?.phase, feel: f };
    }
  }
  api.setEffectSpeed(0);
  return { phase: api.state()?.phase, feel: api.feel() };
});

const failFeel = await shoot("12-automaton-fail-slump.png", async () => {
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
      // Keep driving until failed if needed
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
      return { phase: api.state()?.phase, feel: f };
    }
  }
  api.setEffectSpeed(0);
  return { phase: api.state()?.phase, feel: api.feel() };
});

// Also resting pose shots after motion completes (delighted / worried).
await shoot("11b-automaton-won-rest.png", async () => {
  const api = window.laneMath;
  api.load("1-01");
  await new Promise((r) => setTimeout(r, 600));
  api.setEffectSpeed(1);
  await api.winLevel();
  await new Promise((r) => setTimeout(r, 1200));
  return { phase: api.state()?.phase, feel: api.feel() };
});

await shoot("12b-automaton-failed-rest.png", async () => {
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
  return { phase: api.state()?.phase, feel: api.feel() };
});

writeFileSync(
  "docs/review/AUTOMATON_MOTION_NOTES.md",
  [
    "# Automaton win/fail motion — review shots",
    "",
    `- win mid-hop feel: ${JSON.stringify(wonFeel)}`,
    `- fail mid-slump feel: ${JSON.stringify(failFeel)}`,
    "",
    "Gate: atlas poses only; weighty hop / settle slump; no elastic bounce; PE-01 gutter untouched; fire once on phase enter.",
    "",
  ].join("\n"),
);

await browser.close();
server.close();
