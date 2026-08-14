import { defineConfig } from "vitest/config";

export default defineConfig({
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
