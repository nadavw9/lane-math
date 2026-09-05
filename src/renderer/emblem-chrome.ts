import { Assets, Texture } from "pixi.js";

export type EmblemKind = "star" | "life" | "hint";
export type StarEmblemState = "earned" | "empty";
export type LifeEmblemState = "full" | "spent";
export type HintEmblemState = "available" | "disabled";

/**
 * HUMAN-FINAL HUD emblem atlas (P1-02 / P1-03 / P1-04).
 * Authored @2x / @3x; runtime loads @2x and sizes in design CSS pixels.
 */
const KEYS: readonly { kind: EmblemKind; state: string; file: string }[] = [
  { kind: "star", state: "earned", file: "ui-star-earned@2x.png" },
  { kind: "star", state: "empty", file: "ui-star-empty@2x.png" },
  { kind: "life", state: "full", file: "ui-life-pocket-watch-full@2x.png" },
  { kind: "life", state: "spent", file: "ui-life-pocket-watch-spent@2x.png" },
  { kind: "hint", state: "available", file: "ui-hint-gem@2x.png" },
  { kind: "hint", state: "disabled", file: "ui-hint-gem-disabled@2x.png" },
];

const textures = new Map<string, Texture>();

function key(kind: EmblemKind, state: string): string {
  return `${kind}:${state}`;
}

/** Load all HUD emblem faces once before any meter paints. */
export async function loadEmblemChrome(baseUrl: string): Promise<boolean> {
  const roots = [`${baseUrl}assets/ui/emblems/`, "public/assets/ui/emblems/"];
  for (const root of roots) {
    try {
      await Promise.all(
        KEYS.map(async ({ kind, state, file }) => {
          const texture = await Assets.load<Texture>(`${root}${file}`);
          texture.source.scaleMode = "nearest";
          textures.set(key(kind, state), texture);
        }),
      );
      return true;
    } catch {
      textures.clear();
    }
  }
  return false;
}

export function emblemChromeReady(): boolean {
  return textures.size === KEYS.length;
}

export function emblemChromeTexture(kind: EmblemKind, state: string): Texture | null {
  return textures.get(key(kind, state)) ?? null;
}
