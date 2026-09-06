import { Assets, Texture } from "pixi.js";

/** HUMAN-FINAL commit key faces (P1-06). Master 93×60 @2x → 186×120. No pressed sprite — Eng compresses idle/armed on press. */
export type CommitKeyFace = "idle" | "armed" | "unavailable";

const FILES: readonly { face: CommitKeyFace; file: string }[] = [
  { face: "idle", file: "ui-commit-key-idle@2x.png" },
  { face: "armed", file: "ui-commit-key-armed@2x.png" },
  { face: "unavailable", file: "ui-commit-key-unavailable@2x.png" },
];

const textures = new Map<CommitKeyFace, Texture>();

export async function loadCommitKeyChrome(baseUrl: string): Promise<boolean> {
  const roots = [`${baseUrl}assets/ui/commit-key/`, "public/assets/ui/commit-key/"];
  for (const root of roots) {
    try {
      await Promise.all(
        FILES.map(async ({ face, file }) => {
          const texture = await Assets.load<Texture>(`${root}${file}`);
          texture.source.scaleMode = "linear";
          textures.set(face, texture);
        }),
      );
      return true;
    } catch {
      textures.clear();
    }
  }
  return false;
}

export function commitKeyChromeReady(): boolean {
  return textures.size === FILES.length;
}

export function commitKeyChromeTexture(face: CommitKeyFace): Texture | null {
  return textures.get(face) ?? null;
}
