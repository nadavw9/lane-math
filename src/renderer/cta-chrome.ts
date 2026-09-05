import { Assets, Texture } from "pixi.js";

export type CtaVariant = "primary" | "secondary";
export type CtaChromeState = "idle" | "pressed" | "armed" | "unavailable";

/**
 * HUMAN-FINAL CTA atlas (P1-01). Masters are 360×104 @2x for 9-slice.
 * Labels stay Text — sprites have no glyphs.
 */
export const CTA_SLICE = {
  /** Texture-pixel margins on the 360×104 @2x masters. */
  leftWidth: 48,
  topHeight: 32,
  rightWidth: 48,
  bottomHeight: 32,
  /** Authored art size at @2x (CSS design size is half). */
  artWidth: 360,
  artHeight: 104,
} as const;

const KEYS: readonly { variant: CtaVariant; state: CtaChromeState; file: string }[] = [
  { variant: "primary", state: "idle", file: "ui-cta-primary-idle@2x.png" },
  { variant: "primary", state: "pressed", file: "ui-cta-primary-pressed@2x.png" },
  { variant: "primary", state: "armed", file: "ui-cta-primary-armed@2x.png" },
  { variant: "primary", state: "unavailable", file: "ui-cta-primary-unavailable@2x.png" },
  { variant: "secondary", state: "idle", file: "ui-cta-secondary-idle@2x.png" },
  { variant: "secondary", state: "pressed", file: "ui-cta-secondary-pressed@2x.png" },
  { variant: "secondary", state: "armed", file: "ui-cta-secondary-armed@2x.png" },
  { variant: "secondary", state: "unavailable", file: "ui-cta-secondary-unavailable@2x.png" },
];

const textures = new Map<string, Texture>();

function key(variant: CtaVariant, state: CtaChromeState): string {
  return `${variant}:${state}`;
}

/** Load all CTA chrome faces once before any button paints. */
export async function loadCtaChrome(baseUrl: string): Promise<boolean> {
  const roots = [
    `${baseUrl}assets/ui/cta/`,
    // Vitest / Node: resolve against the repo public folder when BASE_URL is bare.
    "public/assets/ui/cta/",
  ];
  for (const root of roots) {
    try {
      await Promise.all(
        KEYS.map(async ({ variant, state, file }) => {
          const texture = await Assets.load<Texture>(`${root}${file}`);
          texture.source.scaleMode = "linear";
          textures.set(key(variant, state), texture);
        }),
      );
      return true;
    } catch {
      textures.clear();
    }
  }
  return false;
}

/** Test-only: mark chrome ready with already-built textures. */
export function __setCtaChromeTextureForTests(
  variant: CtaVariant,
  state: CtaChromeState,
  texture: Texture,
): void {
  textures.set(key(variant, state), texture);
}

export function ctaChromeReady(): boolean {
  return textures.size === KEYS.length;
}

export function ctaChromeTexture(variant: CtaVariant, state: CtaChromeState): Texture | null {
  return textures.get(key(variant, state)) ?? null;
}
