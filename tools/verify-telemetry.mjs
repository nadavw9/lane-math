import { chromium, devices } from "playwright";

/**
 * TELEMETRY EXPORT, END TO END, ON THE LIVE BUILD.
 *
 *   node tools/verify-telemetry.mjs [url]
 *
 * The export is the only way play data comes back off a phone, and it is a
 * hidden long-press with three fallbacks — share sheet, clipboard, file. Every
 * one of those is a browser capability that differs on a touch device, so
 * verifying it against a desktop localhost proves close to nothing.
 *
 * This drives a real touch context against the deployed site.
 *
 * TWO THINGS THIS TOOL GOT WRONG FIRST, both worth keeping in mind:
 *
 *  - it matched any console line starting with `[telemetry]`, which is also the
 *    ConsoleSink's prefix for every ordinary event. The gesture "passed" on an
 *    app_open line while the export had not run at all.
 *  - it checked that the event count after a reload was >= the count before,
 *    which passes trivially because a reload RECORDS new events. Surviving a
 *    reload means the specific earlier events are still there.
 */
const url = process.argv[2] ?? "https://nadavw9.github.io/lane-math/";
const phone = devices["Pixel 7"] ?? devices["Pixel 5"];

/**
 * Where the build label sits, in DESIGN coordinates (layout.ts).
 *
 * The status band is bottom-anchored: 888 - STATUS_H(60) = 828, x = PAD(12),
 * width = 420 - 24 = 396. The label is drawn at (status.x + status.width,
 * status.y + 22) with anchor (1, 0), so its right edge is at x 408, top at
 * y 874 (status.y + 46). Aiming a little left of the right edge and a little
 * below the top lands inside the glyphs rather than on the anchor point.
 *
 * It was at status.y + 22 until this tool proved the restart button covered it.
 */
const LABEL = { x: 408 - 24, y: 828 + 46 + 6 };
const DESIGN = { width: 420, height: 900 };

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  ...phone,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();

const failures = [];
const check = (ok, message) => {
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${message}\n`);
  if (!ok) failures.push(message);
};

const logs = [];
page.on("console", (m) => logs.push(m.text()));
let downloaded = null;
page.on("download", (d) => {
  downloaded = d.suggestedFilename();
});

process.stdout.write(`\ntelemetry export against ${url}\n`);
process.stdout.write(
  `  ${phone.userAgent.includes("Android") ? "Android" : "touch"} context, ` +
    `${phone.viewport.width}x${phone.viewport.height} @ dpr ${phone.deviceScaleFactor}\n\n`,
);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

check(await page.evaluate(() => "ontouchstart" in window), "context is touch-capable");

// Play a little, so the export has a first tap to summarise.
await page.evaluate(() => {
  const state = window.laneMath.state();
  const tile = (state?.tiles ?? [])[0];
  if (tile) window.laneMath.send({ type: "tapTile", id: tile.id });
});
await page.waitForTimeout(600);

const before = await page.evaluate(() => {
  const events = window.laneMath.telemetry();
  return { count: events.length, names: events.map((e) => e.name) };
});
check(before.count > 0, `events recorded before export (${before.count}: ${before.names.join(", ")})`);

/* Design coordinates -> CSS pixels on the live canvas. */
const target = await page.evaluate(
  ({ label, design }) => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return {
      x: rect.x + (label.x / design.width) * rect.width,
      y: rect.y + (label.y / design.height) * rect.height,
      rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
    };
  },
  { label: LABEL, design: DESIGN },
);
process.stdout.write(`  canvas ${target.rect.w}x${target.rect.h} css px; holding at ${target.x.toFixed(0)},${target.y.toFixed(0)}\n`);

// A genuine held touch: tap() is far too short for a 600ms threshold.
const client = await context.newCDPSession(page);
await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: target.x, y: target.y }] });
await page.waitForTimeout(900);
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await page.waitForTimeout(1500);

// The EXPORT's own line, not the ConsoleSink's per-event prefix.
const exportLog = logs.find((l) => /^\[telemetry\] \d+ events via /.test(l));
check(Boolean(exportLog), `the long-press fired the export${exportLog ? ` — ${exportLog.slice(0, 100)}` : " (no export line in the console)"}`);

const method = exportLog?.match(/via (\w+)/)?.[1] ?? null;

let parsed = null;
const clip = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    return `ERR:${String(error).slice(0, 60)}`;
  }
});
if (clip && !clip.startsWith("ERR:")) {
  try {
    parsed = JSON.parse(clip);
  } catch {
    /* not json */
  }
}

check(
  Boolean(parsed) || Boolean(downloaded),
  `payload delivered via ${method ?? "?"}${parsed ? " (read back as JSON)" : downloaded ? ` (download ${downloaded})` : ` — clipboard said ${clip.slice(0, 60)}`}`,
);

if (parsed) {
  /*
   * The session identifier is an ORDINAL, not a uuid: Telemetry persists a
   * counter at lane-math.session.v1 and tags every event with session_index.
   * That distinguishes playtests on one device, which is what it is for, and
   * would collide across devices.
   */
  check(
    typeof parsed.sessionIndex === "number" && parsed.sessionIndex > 0,
    `session index — ${parsed.sessionIndex}`,
  );
  check(typeof parsed.build === "string" && parsed.build.length > 0, `build hash — ${parsed.build}`);
  const medians = parsed.summary?.firstTapMedianByWorld;
  const samples = parsed.summary?.firstTapSamplesByWorld;
  check(
    medians !== undefined && Object.keys(medians ?? {}).length > 0,
    `per-world first_tap_latency — medians ${JSON.stringify(medians)}, samples ${JSON.stringify(samples)}`,
  );
  check(
    parsed.events.every((e) => typeof e.session === "number"),
    `every carried event is session-tagged (${parsed.events.length} events)`,
  );
  process.stdout.write(`\n  top-level keys: ${Object.keys(parsed).join(", ")}\n`);
  process.stdout.write(`  summary: ${JSON.stringify(parsed.summary, null, 2).replace(/\n/g, "\n  ")}\n`);
  process.stdout.write(`  events carried: ${parsed.events?.length ?? "n/a"}\n\n`);
}

/*
 * SURVIVES A RELOAD — meaning the events from BEFORE are still present, not
 * merely that the count went up. A reload records its own app_open, so a
 * count comparison passes even when the sink has been wiped.
 */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const after = await page.evaluate(() => {
  const events = window.laneMath.telemetry();
  return { count: events.length, names: events.map((e) => e.name) };
});
const kept = before.names.every((name, i) => after.names[i] === name);
check(
  kept && after.count >= before.count,
  `the pre-reload events are still there (${before.count} -> ${after.count}, first ${before.count} unchanged: ${kept})`,
);

await browser.close();
process.stdout.write(failures.length === 0 ? "\ntelemetry export VERIFIED\n" : `\ntelemetry export FAILED (${failures.length})\n`);
process.exit(failures.length === 0 ? 0 : 1);
