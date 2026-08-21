import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

/**
 * FONT COVERAGE GATE — does the bundled font contain what the game draws?
 *
 *   node tools/font-coverage.mjs
 *
 * WHY THIS EXISTS. The bundled Outfit file was the LATIN-EXT subset, whose
 * unicode-range starts at U+0100 — so it held no digits, no `=`, and no
 * punctuation. It was picked by a `grep -o '...woff2' | head -1` over the
 * Google Fonts CSS, which returns TWO @font-face blocks; the first is
 * latin-ext and the second is the latin one anybody actually wants.
 *
 * Nothing failed. No request 404'd, no console error, no blank screen. Every
 * glyph in the game silently fell back to system-ui, and the commit button drew
 * a single bar where `=` belonged. A missing glyph is a SILENT SUBSTITUTION,
 * which is the same failure shape as the three silent-blank boot bugs in
 * CLAUDE.md: invisible to a unit suite, invisible to CI, visible only in pixels.
 *
 * So coverage is measured, and in two independent halves:
 *
 *   INVENTORY  hook CanvasRenderingContext2D.fillText on the real built app and
 *              record every string actually painted, walking the funnel. Not a
 *              grep of source literals: those cannot see interpolated values
 *              and cannot tell a drawn string from a word in a comment. The
 *              runtime set is UNIONED with REQUIRED below, because a single
 *              playthrough never reaches every operator or every screen.
 *
 *   COVERAGE   for each character, compare the font under test against a
 *              deliberately dissimilar fallback on TWO signals — advance width
 *              and ink-pixel count. Matching on both means the browser fell
 *              back, i.e. the font supplied no glyph.
 *
 * WHY TWO SIGNALS AND NOT A BITMAP DIFF. The first version of this compared raw
 * getImageData bytes, and reported every character present — including `★` in a
 * 6KB latin-ext subset. Successive canvas draws of the SAME glyph differ by a
 * pixel or two of antialiasing, so byte-equality answers "was this rasterised
 * twice", not "does this font have the glyph". Width and ink count are stable
 * across draws. Width alone cannot see a space (no ink, but a real advance);
 * ink alone cannot separate glyphs that share an advance. Together they can.
 */

/**
 * Characters Outfit does NOT contain, at any subset, verified against the
 * upstream variable font's cmap (tools/font-cmap.mjs, google/fonts ofl/outfit).
 * These fall through to system-ui by necessity, not by accident — Outfit is a
 * geometric sans with no dingbats. If a design ever needs these ON-brand they
 * have to be drawn as Graphics, not asked of the typeface.
 */
const KNOWN_ABSENT = new Set(["√", "♥", "★", "☆", "◆"]);

/**
 * Every character the UI can draw, including ones a single run never reaches:
 * the four operator glyphs, the star/heart meters, the hint diamond, ellipsis.
 * Digits and letters are covered by the ASCII sweep.
 */
const REQUIRED = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)),
  "√", "²", "×", "÷", "−", "—", "♥", "·", "★", "☆", "◆", "…",
];

/**
 * The base the artefact was built for. CI builds against /lane-math/ for Pages,
 * so serving at "/" here would 404 every asset and measure nothing. Read from
 * the environment because Git Bash rewrites a bare `/lane-math/` argument into
 * a Windows path before node sees it — the same trap smoke.mjs documents.
 */
function readBase() {
  const raw = process.env["SMOKE_BASE"] ?? process.argv[2] ?? "/";
  if (raw === "/") return "/";
  const tail = raw.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop();
  return tail ? `/${tail}/` : "/";
}

const base = readBase();
const port = 4174;
const url = `http://localhost:${port}${base}`;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
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
  if (process.env["COVERAGE_DEBUG"]) {
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
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const cp = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;

/**
 * REFUSE TO MEASURE THROUGH SOMEONE ELSE'S SERVER.
 *
 * On Windows a second listen() on this port can succeed while a stale process
 * keeps answering the requests, so `listen` resolving proves nothing. That is
 * not hypothetical: every run of this tool while it was being written was
 * answered by a node process left over from the previous day, and the harness
 * reported a confident PASS the whole time. Probe first, and fail loudly.
 */
async function portIsFree() {
  try {
    await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

try {
  if (!(await portIsFree())) {
    process.stdout.write(
      `\nsomething is already answering on port ${port}.\n` +
        `This tool would measure ITS output, not the dist/ you just built. Stop it and re-run.\n`,
    );
    stop(1);
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  if (!(await waitForServer())) {
    process.stdout.write(`static server never came up at ${url}\n`);
    stop(1);
  }

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });

  // A harness that measures nothing must SAY so. Two of the long debugging
  // detours on this project were a broken probe trusted as a result.
  const boot = [];
  page.on("pageerror", (error) => boot.push(`pageerror: ${error.message}`));
  page.on("console", (m) => m.type() === "error" && boot.push(`console: ${m.text()}`));
  page.on("requestfailed", (r) => boot.push(`requestfailed: ${r.url()}`));

  // Pixi v8 rasterises Text through a 2D context, so every glyph the game shows
  // arrives here — including strings built at runtime that no static scan finds.
  await page.addInitScript(() => {
    window.__drawn = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
      window.__drawn.push(String(text));
      return original.call(this, text, ...rest);
    };
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const visited = [];
  const step = async (name, fn) => {
    try {
      await page.evaluate(fn);
      await page.waitForTimeout(700);
      visited.push(name);
    } catch (error) {
      visited.push(`${name}(FAILED ${String(error).slice(0, 60)})`);
    }
  };
  await step("board", () => window.laneMath.showBoard());
  await step("placed", () => {
    const state = window.laneMath.state();
    const tile = (state?.tiles ?? [])[0];
    if (tile) window.laneMath.send({ type: "tapTile", id: tile.id });
  });
  await step("map", () => window.laneMath.showMap());
  await step("failure", () => window.laneMath.playIntoFailure());
  await step("out-of-lives", () => window.laneMath.watchAdForLife());

  const drawn = await page.evaluate(() => window.__drawn);
  const observed = [...new Set(drawn.join("").split(""))];
  const chars = [...new Set([...observed, ...REQUIRED])].sort(
    (a, b) => a.codePointAt(0) - b.codePointAt(0),
  );

  process.stdout.write(`\nINVENTORY\n`);
  process.stdout.write(`  screens        : ${visited.join(", ")}\n`);
  process.stdout.write(`  fillText calls : ${drawn.length}\n`);
  process.stdout.write(`  observed chars : ${observed.length} (unioned with ${REQUIRED.length} required)\n`);

  /*
   * The coverage half reads the font from disk, so it would happily PASS
   * against a page that never booted — measuring the file while proving
   * nothing about the game. An app that drew no text at all is a broken run,
   * not a clean one, so say so rather than report a green tick over a corpse.
   */
  if (drawn.length === 0) {
    process.stdout.write(`\n  the app painted NO text — the page did not boot, so the inventory is empty\n`);
    for (const line of boot) process.stdout.write(`      ${line}\n`);
    await browser.close();
    process.stdout.write(`\nfont coverage FAILED (app did not render)\n`);
    stop(1);
  }

  const bytes = [...readFileSync("dist/assets/fonts/outfit-800.woff2")];
  const coverage = await page.evaluate(
    async ({ bytes, chars }) => {
      const family = `Probe${Math.random().toString(36).slice(2)}`;
      const face = new FontFace(family, new Uint8Array(bytes).buffer);
      await face.load();
      document.fonts.add(face);

      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      // A fallback chosen to look nothing like a geometric sans, so agreement on
      // both signals can only mean "the browser fell back".
      const measure = (ch, font) => {
        ctx.font = `48px ${font}`;
        const width = ctx.measureText(ch).width;
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = "#000";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, 12, 64);
        const d = ctx.getImageData(0, 0, 128, 128).data;
        let ink = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++;
        return { width, ink };
      };

      return chars.map((ch) => {
        const withFont = measure(ch, `"${family}", monospace`);
        const fallback = measure(ch, `monospace`);
        return {
          ch,
          present: withFont.width !== fallback.width || withFont.ink !== fallback.ink,
        };
      });
    },
    { bytes, chars },
  );

  const present = coverage.filter((c) => c.present).map((c) => c.ch);
  const absent = coverage.filter((c) => !c.present).map((c) => c.ch);
  const unexpected = absent.filter((ch) => !KNOWN_ABSENT.has(ch));
  const expectedAbsent = absent.filter((ch) => KNOWN_ABSENT.has(ch));

  process.stdout.write(`\nCOVERAGE — dist/assets/fonts/outfit-800.woff2\n`);
  process.stdout.write(`  present (${present.length}): ${present.join("")}\n`);
  process.stdout.write(
    `  absent by design (${expectedAbsent.length}): ${expectedAbsent.map((c) => `${c} ${cp(c)}`).join("   ") || "none"}\n`,
  );
  process.stdout.write(
    `  UNEXPECTEDLY ABSENT (${unexpected.length}): ${unexpected.map((c) => `${c} ${cp(c)}`).join("   ") || "none"}\n`,
  );

  await browser.close();
  const ok = unexpected.length === 0;
  process.stdout.write(ok ? "\nfont coverage PASSED\n" : `\nfont coverage FAILED (${unexpected.length} missing)\n`);
  stop(ok ? 0 : 1);
} catch (error) {
  process.stdout.write(`\nfont coverage threw: ${String(error)}\n`);
  stop(1);
}
