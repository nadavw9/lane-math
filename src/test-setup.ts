/*
 * Pixi 8.19 reads navigator while its browser adapter module is evaluated.
 * Node 20 does not provide one, so renderer suites otherwise fail during
 * collection before touching their subject. This is environment plumbing, not
 * a product mock: the tests still construct the real Pixi display objects.
 */
if (!("navigator" in globalThis)) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "node.js" },
  });
}
