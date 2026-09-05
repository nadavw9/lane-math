import { Assets, Texture } from "pixi.js";

/**
 * HUMAN-FINAL modal frame (P1-05).
 * Clean ornate 9-slice + separate cartouche overlay.
 * Do NOT use ornate-master (byte-identical twin of clean ornate).
 *
 * Master logical: 480×560. Authored @2x → texture 960×1120.
 * Slice guides (logical → ×2 texture px): L72 R72 T112 B52.
 */
export const MODAL_SLICE = {
  /** Texture-pixel margins on the 960×1120 @2x master. */
  leftWidth: 144,
  topHeight: 224,
  rightWidth: 144,
  bottomHeight: 104,
  /** Logical design size (CSS px). */
  artWidth: 480,
  artHeight: 560,
} as const;

/** Cartouche overlay logical size (CSS px). @2x texture is 320×184. */
export const MODAL_CARTOUCHE = {
  width: 160,
  height: 92,
  /** Top-left on the 480×560 master. */
  masterX: 160,
  masterY: 18,
} as const;

let ornate: Texture | null = null;
let cartouche: Texture | null = null;

export async function loadModalChrome(baseUrl: string): Promise<boolean> {
  const roots = [`${baseUrl}assets/ui/modal/`, "public/assets/ui/modal/"];
  for (const root of roots) {
    try {
      const [frame, gem] = await Promise.all([
        Assets.load<Texture>(`${root}ui-modal-frame-ornate@2x.png`),
        Assets.load<Texture>(`${root}ui-modal-frame-cartouche@2x.png`),
      ]);
      frame.source.scaleMode = "linear";
      gem.source.scaleMode = "linear";
      ornate = frame;
      cartouche = gem;
      return true;
    } catch {
      ornate = null;
      cartouche = null;
    }
  }
  return false;
}

export function modalChromeReady(): boolean {
  return ornate !== null && cartouche !== null;
}

export function modalOrnateTexture(): Texture | null {
  return ornate;
}

export function modalCartoucheTexture(): Texture | null {
  return cartouche;
}
