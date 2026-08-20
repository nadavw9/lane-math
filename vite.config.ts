import { execSync } from "node:child_process";

import { defineConfig } from "vitest/config";

/**
 * Which build produced a telemetry export (§7.8).
 *
 * Prefers the CI commit, falls back to the local HEAD, and degrades to
 * "unknown" rather than failing a build in a checkout with no git. Without this
 * a playtest export cannot be attributed to a build, and two sessions from
 * different builds look like one inconsistent session.
 */
function buildHash(): string {
  const fromCi = process.env["GITHUB_SHA"];
  if (fromCi) return fromCi.slice(0, 8);
  try {
    return execSync("git rev-parse --short=8 HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash()),
  },
  build: {
    /*
     * Top-level await is used to initialise the renderer before anything else
     * touches it, and the default target (chrome87/safari14) predates it.
     * Capacitor ships a modern WebView on both platforms, so es2022 is safe and
     * avoids wrapping main in an IIFE purely to satisfy a browser we do not
     * support.
     */
    target: "es2022",
  },
  worker: {
    // The winnability worker is an ES module and imports the solver.
    format: "es",
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
