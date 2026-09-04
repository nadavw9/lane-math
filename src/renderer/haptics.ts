type ArmSlot = 0 | 2 | null;

interface NativeHaptics {
  impact(options: { style: unknown }): Promise<void>;
}

interface LoadedHaptics {
  readonly plugin: NativeHaptics | null;
  readonly lightStyle: unknown;
}

export interface HapticDependencies {
  isNativePlatform(): boolean | Promise<boolean>;
  loadNative(): Promise<LoadedHaptics>;
  vibrate(milliseconds: number): void;
}

/**
 * Load the Capacitor proxy without returning it directly from an async function.
 * The box prevents promise resolution from probing the proxy's `then` property.
 */
async function loadNativeHaptics(): Promise<LoadedHaptics> {
  try {
    const mod = await import("@capacitor/haptics");
    return {
      plugin: mod.Haptics as unknown as NativeHaptics,
      lightStyle: mod.ImpactStyle.Light,
    };
  } catch {
    return { plugin: null, lightStyle: null };
  }
}

const runtimeDependencies: HapticDependencies = {
  isNativePlatform: async () => {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  },
  loadNative: loadNativeHaptics,
  vibrate: (milliseconds) => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(milliseconds);
    }
  },
};

/** Give one restrained confirmation when a swap operand first becomes armed. */
export async function armHaptic(
  previous: ArmSlot,
  next: ArmSlot,
  dependencies: HapticDependencies = runtimeDependencies,
): Promise<void> {
  if (previous !== null || next === null) return;

  try {
    if (await dependencies.isNativePlatform()) {
      const { plugin, lightStyle } = await dependencies.loadNative();
      await plugin?.impact({ style: lightStyle });
      return;
    }
    dependencies.vibrate(12);
  } catch {
    // Haptics are polish. Unsupported or unavailable hardware is a no-op.
  }
}
