import { describe, expect, it, vi } from "vitest";

import { armHaptic, type HapticDependencies } from "./haptics.js";

function dependencies(native: boolean) {
  const impact = vi.fn().mockResolvedValue(undefined);
  const loadNative = vi.fn().mockResolvedValue({
    plugin: { impact },
    lightStyle: "LIGHT",
  });
  const vibrate = vi.fn();
  const deps: HapticDependencies = {
    isNativePlatform: () => native,
    loadNative,
    vibrate,
  };
  return { deps, impact, loadNative, vibrate };
}

describe("swap arm haptic", () => {
  it("uses a light native impact when an operand is first armed", async () => {
    const { deps, impact, loadNative, vibrate } = dependencies(true);

    await armHaptic(null, 0, deps);

    expect(loadNative).toHaveBeenCalledOnce();
    expect(impact).toHaveBeenCalledOnce();
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("uses a short web vibration when an operand is first armed", async () => {
    const { deps, impact, loadNative, vibrate } = dependencies(false);

    await armHaptic(null, 2, deps);

    expect(vibrate).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith(12);
    expect(loadNative).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it.each([
    [null, null],
    [0, null],
    [2, null],
    [0, 2],
    [2, 0],
    [0, 0],
    [2, 2],
  ] as const)("does nothing for a %s -> %s transition", async (previous, next) => {
    const { deps, impact, loadNative, vibrate } = dependencies(true);

    await armHaptic(previous, next, deps);

    expect(loadNative).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("degrades to a no-op when native haptics are unavailable", async () => {
    const { deps, impact, vibrate } = dependencies(true);
    deps.loadNative = vi.fn().mockRejectedValue(new Error("plugin unavailable"));

    await expect(armHaptic(null, 0, deps)).resolves.toBeUndefined();
    expect(impact).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
