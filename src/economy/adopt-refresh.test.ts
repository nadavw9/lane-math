import { describe, expect, it } from "vitest";

import { planAdoptRefresh } from "./adopt-refresh.js";

describe("planAdoptRefresh (storage-event UI hook)", () => {
  it("syncs sound mute and refreshes map only when map is visible", () => {
    expect(planAdoptRefresh({ mapVisible: true })).toEqual({
      syncSoundMute: true,
      refreshMap: true,
      interruptBoard: false,
    });
    expect(planAdoptRefresh({ mapVisible: false })).toEqual({
      syncSoundMute: true,
      refreshMap: false,
      interruptBoard: false,
    });
  });
});
