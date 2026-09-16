/**
 * Deterministic post-adoption refresh plan for economy-derived UI.
 *
 * The `storage` listener adopts Economy + Sound only. It must not imply a full
 * Map/HUD redraw, and must not discard an in-progress board when the foreign
 * change is preference/progress that the board can pick up on the next map
 * open / HUD poll.
 */
export interface AdoptRefreshPlan {
  /** Apply `economy.muted` to Sound. */
  readonly syncSoundMute: true;
  /** Redraw the world map when it is currently visible. */
  readonly refreshMap: boolean;
  /** Never tear down / restart an in-progress board from adopt alone. */
  readonly interruptBoard: false;
}

export function planAdoptRefresh(opts: { readonly mapVisible: boolean }): AdoptRefreshPlan {
  return {
    syncSoundMute: true,
    refreshMap: opts.mapVisible,
    interruptBoard: false,
  };
}
