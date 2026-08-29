import runtimeLevels from "./generated/levels.json";
import { Ads, loadAdMob } from "./ads/ads.js";
import { Sound } from "./audio/sound.js";
import { MapScreen } from "./map/map-screen.js";
import { TitleScreen } from "./screens/title.js";
import { continueId, titleEarnedFor, titleView } from "./screens/title-model.js";
import { failedAtlases, loadedSprites, missingSprites, setSpritesEnabled } from "./renderer/sprites.js";
import { mapView } from "./map/model.js";
import { Economy } from "./economy/economy.js";
import { LocalStorageStore } from "./economy/save.js";
import { Director } from "./game/director.js";
import type { Command, InputEvent, LadderLevel, ViewState } from "./game/types.js";
import { Renderer } from "./renderer/renderer.js";
import { setEffectSpeed } from "./renderer/effects.js";
import { WinnabilityService } from "./game/winnability-service.js";
import { buildExport, deliver } from "./telemetry/export.js";
import { ConsoleSink, LocalStorageSink, Telemetry } from "./telemetry/telemetry.js";
import { applyMove, enumerate, enumerateTransforms } from "./solver/index.js";

/**
 * Mode comes from the save and defaults to Normal (§6). The selector that lets
 * the player change it is gated to 3-10 by §7.6; before then the default is
 * what they play, and Casual — unlimited operators AND the fatal-move warning —
 * is a choice they make once they understand what they are choosing.
 */

const LEVEL_IDS: string[] = [];
for (let world = 1; world <= 4; world++) {
  for (let slot = 1; slot <= 10; slot++) {
    LEVEL_IDS.push(`${world}-${String(slot).padStart(2, "0")}`);
  }
}

/*
 * The SHIPPED levels (GDD §10: metrics do not ship).
 *
 * Derived from levels/ by tools/build-levels.mts, carrying only the fields the
 * loader reads. Globbing the authored files put 560KB of generator and curation
 * metrics into the bundle — keystones, decisionPoints, survivalRate — none of
 * which any runtime code touches. The derived file is 13KB.
 */
const levels = new Map<string, LadderLevel>();
for (const level of runtimeLevels as LadderLevel[]) levels.set(level.id, level);

const host = document.getElementById("app")!;
const picker = document.getElementById("levels")!;

/*
 * SPRITES ARE THE DEFAULT. `?sprites=0` is the escape hatch.
 *
 * Every token family is real art now — glass tiles, brass dials lit and spent,
 * and brass plaques — and all of it clears its contrast bar: tiles 8.6:1,
 * operators 3.9-4.2:1, plaques 3.8:1 on the lined lane, and spent dials at
 * 2.0:1 under SC 1.4.11's inactive-component exemption.
 *
 * The procedural path stays exactly where it is. It is not dead code: it is
 * what draws if an atlas fails to load, and `?sprites=0` is how it gets looked
 * at deliberately rather than only during an incident.
 *
 * Set BEFORE init, which is where the atlases are loaded.
 */
const wantSprites = new URLSearchParams(window.location.search).get("sprites") !== "0";
setSpritesEnabled(wantSprites);

const renderer = new Renderer();
await renderer.init(host);

// One economy for the whole session, persisted to localStorage.
const economy = new Economy(new LocalStorageStore());

// §7.8 funnel, local sinks only. The remote sink plugs in at Phase 6 by
// implementing TelemetrySink and adding it to this list.
const localSink = new LocalStorageSink();
const telemetry = new Telemetry([new ConsoleSink(), localSink]);
telemetry.open();

/** Which build this is, injected at compile time. Shown in the status band. */
const BUILD = __BUILD_HASH__;
renderer.setBuildLabel(BUILD);

/**
 * Get the §7.8 funnel off the device.
 *
 * Two ways in, because a playtester on a phone has no DevTools:
 *   - LONG-PRESS the build string in the status band (600ms)
 *   - or open the game with ?telemetry=1
 *
 * The long-press is the primary one: it needs no typing and leaves no visible
 * control for a player to find. The query parameter exists because a gesture is
 * awkward to describe over a message and impossible if the board will not open.
 */
async function exportTelemetry(): Promise<string> {
  const events = localSink.read();
  const payload = buildExport(events, BUILD, telemetry.session);
  const method = await deliver(payload);
  // eslint-disable-next-line no-console
  console.log(`[telemetry] ${events.length} events via ${method}`, payload.summary);
  return method;
}

if (new URLSearchParams(window.location.search).get("telemetry") === "1") {
  // Deferred so the board is up first — a share sheet over a blank canvas is
  // indistinguishable from a crash.
  setTimeout(() => void exportTelemetry(), 400);
}

// Winnability off the render thread. The Phase 5 commit animation occupies the
// pause the warm-up used to sit in, so it had to move before the animation.
const winnability = new WinnabilityService(
  () => new Worker(new URL("./solver/winnability.worker.ts", import.meta.url), { type: "module" }),
);

let currentLevel = levels.get(LEVEL_IDS[0]!)!;
let director = new Director(currentLevel, economy.selectedMode, economy, telemetry, winnability);
let lastState: ViewState | null = null;

function apply(commands: readonly Command[]): void {
  for (const command of commands) {
    if (command.type === "render") lastState = command.state;
  }
  renderer.apply(commands);
}

function send(input: InputEvent): void {
  apply(director.handle(input));
  // Changing mode changes the budgets in play, so the level is re-opened under
  // the new one rather than mutated mid-board.
  if (input.type === "selectMode") /*
 * BOOT. §7.4's cold-start rule decides which surface opens.
 *
 * The level is opened either way so the board is warm behind the title and
 * `continue` is instant — the screen is an entry moment, not a loading gate.
 */
open(currentLevel);
if (titleEarnedFor(economy)) showTitle();
}

function nextLevelIdAfter(id: string): string | null {
  const at = LEVEL_IDS.indexOf(id);
  return at >= 0 && at + 1 < LEVEL_IDS.length ? (LEVEL_IDS[at + 1] ?? null) : null;
}

function open(level: LadderLevel): void {
  currentLevel = level;
  // Null on the last level of the ladder, which is what the cleared panel uses
  // to decide between a button and a sentence.
  renderer.setNextLevel(nextLevelIdAfter(level.id));
  director = new Director(level, economy.selectedMode, economy, telemetry, winnability);
  void renderer.setWorld(level.world);
  // §9.7's room tone follows the room. Safe before warm(): it no-ops until
  // there is a context, and the next call after the first gesture starts it.
  sound.setRoom(level.world);
  // The board arrives (§9.0). Every open, including a replay of the same level.
  renderer.setAdMessage(null);
  renderer.beginEntrance();
  apply(director.firstRender());
}

/*
 * AUDIO — created on the first user gesture, and NEVER on the input path.
 *
 * Browsers refuse to start an AudioContext outside a gesture, but constructing
 * one and filling a noise buffer is synchronous work measured in milliseconds,
 * and the game's tap response is not allowed to pay for it. So the first
 * pointerdown SCHEDULES the warm-up and returns immediately: the gesture that
 * unlocks audio is silent, every gesture after it is not, and no tap ever waits
 * for the audio system.
 */
const sound = new Sound();
sound.setMuted(economy.muted);
renderer.attachSound(sound);

const warmAudio = (): void => {
  window.removeEventListener("pointerdown", warmAudio);
  // Deferred off the gesture so the handler returns before any audio work.
  setTimeout(() => {
    sound.warm();
    // The bed can only start once a gesture has given us a context.
    sound.setRoom(currentLevel.world);
  }, 0);
};
window.addEventListener("pointerdown", warmAudio);

/*
 * THE WORLD MAP (§7.6, unlocked by clearing 1-10).
 *
 * A second screen on the same Application rather than a second canvas: it is
 * built from the same tokens and the same material, so it shares the renderer.
 * It is also where best-ever stars, the banked total, lives and the hint shop
 * finally live — they had no home before it, which is why they were all trying
 * to fit in the lane header at once.
 */
const map = new MapScreen();
renderer.stage.addChild(map.root);
/*
 * The map's room art, loaded off the critical path.
 *
 * Not awaited: the map is reachable only after 1-10 (§7.6) and redraws on every
 * show(), so a room that arrives late simply appears on the next open. Blocking
 * boot on four backgrounds the player cannot reach yet would trade a real cost
 * for no benefit.
 */
void map.loadRooms(import.meta.env.BASE_URL);

/*
 * THE TITLE SCREEN (§7.4), for a returning player only.
 *
 * A third surface on the same Application, same as the map. A FIRST run still
 * goes straight into 1-01 — §7.4 is explicit that a cold start meets a board
 * rather than a menu, and that has not changed.
 */
const title = new TitleScreen(import.meta.env.BASE_URL);
renderer.stage.addChild(title.root);

function showTitle(): void {
  map.hide();
  renderer.setBoardVisible(false);
  title.show(titleView(economy, LEVEL_IDS));
}

title.attach({
  onContinue: () => {
    title.hide();
    const level = levels.get(continueId(economy, LEVEL_IDS));
    renderer.setBoardVisible(true);
    if (level) open(level);
  },
  onToggleMute: () => {
    economy.setMuted(!economy.muted);
    sound.setMuted(economy.muted);
    // The bed is not a cue and does not pass through the mute gain path the
    // way `play` does, so it is stopped and restarted explicitly.
    if (economy.muted) sound.stopRoom();
    else sound.setRoom(currentLevel.world);
    title.show(titleView(economy, LEVEL_IDS));
  },
  onSelectMode: (mode) => {
    send({ type: "selectMode", mode: mode as "casual" | "normal" | "expert" });
    title.show(titleView(economy, LEVEL_IDS));
  },
});

/**
 * Force the Academy's restoration state, for review only.
 *
 * There is no purchase path yet — the veil is being proved before any object
 * exists (ART_DIRECTION §6), so the only way to see step 4 is to say so. This
 * is a debug hook on the same object as the other shot drivers and reads no
 * saved state, which is what keeps it from becoming an accidental cheat.
 */
let forcedRestored: Record<number, 0 | 1 | 2 | 3 | 4> | null = null;
let forcedStars: number | null = null;

function viewWithRestoration(): ReturnType<typeof mapView> {
  const base = mapView(economy, LEVEL_IDS);
  const withRooms = forcedRestored ? { ...base, restored: forcedRestored } : base;
  return forcedStars === null ? withRooms : { ...withRooms, starsAvailable: forcedStars };
}

function showMap(): void {
  title.hide();
  renderer.setBoardVisible(false);
  map.show(viewWithRestoration());
}

function showBoard(): void {
  title.hide();
  map.hide();
  renderer.setBoardVisible(true);
}

map.attach({
  onPlay: (id) => {
    const level = levels.get(id);
    if (!level) return;
    showBoard();
    open(level);
  },
  onToggleMute: () => {
    economy.setMuted(!economy.muted);
    sound.setMuted(economy.muted);
    map.show(viewWithRestoration());
  },
  onOpenShop: () => {
    // The shop lives on the board, where the hints apply. The map is the door.
    showBoard();
    send({ type: "toggleShop" });
  },
  /*
   * §6: the purchase is real. Economy.restore commits to the store
   * immediately, so a force-quit between the tap and the next frame cannot
   * refund it — the same class as the failure counter in §5.1.
   */
  onRestore: (world: number) => {
    economy.restore(world);
    map.show(viewWithRestoration());
  },
  onSelectMode: (mode) => {
    send({ type: "selectMode", mode: mode as "casual" | "normal" | "expert" });
    map.show(viewWithRestoration());
  },
});

/*
 * Ads: rewarded video only, for the §5.2 life refill. No interstitials.
 *
 * Loaded lazily and off the boot path — on the web the plugin resolves to null
 * and everything below is a no-op, so the browser build never carries the
 * native bridge and never waits on it.
 */
const ads = new Ads(await loadAdMob());
void ads.initialize();

renderer.onInput((input) => {
  // §7.6: the map is absent until 1-10 is cleared, so the way back is too.
  if (input.type === "tapMap") {
    showMap();
    return;
  }
  if (input.type === "tapNextLevel") {
    const next = nextLevelIdAfter(currentLevel.id);
    const level = next === null ? null : (levels.get(next) ?? null);
    if (level) open(level);
    else showMap();
    return;
  }
  if (input.type === "exportTelemetry") {
    void exportTelemetry();
    return;
  }
  /*
   * §5.2's rewarded refill — the first player-facing route to it.
   *
   * Every outcome is reported back to the screen, because silence after a
   * dismissed ad is indistinguishable from a bug, and a player who suspects the
   * button is broken will not press it again.
   */
  /*
   * GDD §9.4's Continue: the SHELL shows the ad, the Director owns the rewind.
   *
   * All three AdMob outcomes are handled visibly, as the out-of-lives screen
   * does — and the honest one is the third. `unavailable` degrades to Restart
   * with a message that says so, because a player who chose to watch an ad and
   * got nothing must not be left staring at an unchanged board wondering
   * whether they were charged.
   */
  if (input.type === "tapContinue") {
    void (async () => {
      renderer.setAdMessage("opening…");
      const outcome = await ads.showRewarded();
      if (outcome === "rewarded") {
        renderer.setAdMessage("rewound to where it was still winnable");
        apply(director.handle({ type: "continueFromBranch" }));
        return;
      }
      renderer.setAdMessage(
        outcome === "dismissed"
          ? "no rewind this time, and nothing lost — restart is still free of charge"
          : "no ad available just now — restart to try the level again",
      );
      send({ type: "tick" });
    })();
    return;
  }

  if (input.type === "tapWatchAd") {
    void (async () => {
      renderer.setAdMessage("opening…");
      const outcome = await ads.offerLifeForAd(economy);
      renderer.setAdMessage(
        outcome === "rewarded"
          ? "a life is yours — back to it"
          : outcome === "dismissed"
            ? "no life this time, and nothing lost — the timer is still running"
            : "no ad available just now — the timer is still running",
      );
      send({ type: "tick" });
    })();
    return;
  }
  send(input);
});
open(currentLevel);

// Lives regenerate on a timer, so the HUD has to notice without an input event.
// Lives regenerate on a timer, so the HUD notices without an input event. Once
// a second rather than every five, because the out-of-lives screen shows a
// COUNTDOWN and a clock that jumps five seconds at a time reads as broken.
setInterval(() => send({ type: "tick" }), 1_000);

/*
 * The map and the title run their own arrivals, on the RENDERER'S clock.
 *
 * This was a bare requestAnimationFrame loop here — a second clock beside
 * Pixi's. It half-worked, which is the worst way for it to fail: the title
 * photographed frozen part-way through its entrance while its scene graph was
 * perfectly correct, because the frames it was drawing into were not the
 * frames being presented.
 */
renderer.onFrame((deltaMs) => {
  if (map.visible) map.advance(deltaMs);
  if (title.visible) title.advance(deltaMs);
  roomEvents(deltaMs);
});

/*
 * §9.7's SPARSE ROOM EVENTS — the clock, the page, the glass, the dome.
 *
 * Long gaps, jittered, so the room never sounds like a metronome. Silent while
 * a modal is up: the room is background and a decision is not.
 */
const ROOM_EVENT_MIN_MS = 9_000;
const ROOM_EVENT_RANGE_MS = 13_000;
let nextRoomEvent = ROOM_EVENT_MIN_MS;

function roomEvents(deltaMs: number): void {
  if (title.visible || map.visible) return;
  const state = lastState;
  if (!state || state.phase !== "playing" || state.warning !== null) return;
  nextRoomEvent -= deltaMs;
  if (nextRoomEvent > 0) return;
  nextRoomEvent = ROOM_EVENT_MIN_MS + Math.random() * ROOM_EVENT_RANGE_MS;
  sound.play({ name: "room", tone: (currentLevel.world - 1) / 3 });
}

for (const id of LEVEL_IDS) {
  const level = levels.get(id);
  if (!level) continue;
  const button = document.createElement("button");
  button.textContent = id;
  button.dataset.levelId = id;
  button.addEventListener("click", () => {
    open(level);
    for (const other of picker.querySelectorAll("button")) other.classList.remove("active");
    button.classList.add("active");
  });
  picker.appendChild(button);
}
picker.querySelector("button")?.classList.add("active");

/**
 * Walk the board into a genuine loss by playing real moves through the
 * Director — used by the screenshot harness so the economy can be exercised
 * without hand-computing a fatal line for every level. It decides nothing
 * itself: the solver says what is legal, the Director says what it costs.
 */
/**
 * Play a level to a WIN, choosing only moves that keep it winnable.
 *
 * The mirror of playIntoFailure, and it exists for the same reason: the
 * cleared panel is a screen a review has to be able to reach, and reaching it
 * by forcing the phase would photograph a state the game never produces. This
 * plays the level the way a player who never errs would.
 */
function playIntoWin(): string {
  /*
   * Its OWN winnability service, computed on this thread.
   *
   * The shell's is worker-backed and answers from a warmed cache, returning
   * conservatively for states it has not been asked about — so the search for
   * a winnable-preserving move found none and the fallback took a losing one,
   * which lost 4-10 while the same strategy computed exactly wins it in seven.
   * A driver that is meant to play perfectly needs exact answers, and it is a
   * dev affordance so the cost does not matter.
   */
  const exact = new WinnabilityService();
  exact.reset(currentLevel.id);

  for (let guard = 0; guard < 30; guard++) {
    if (!lastState || lastState.phase !== "playing") break;
    const live = lastState.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = lastState.targets[lastState.targetIndex];
    if (target === undefined) break;

    const budget = currentLevel.modes[economy.selectedMode]?.budget ?? {};
    const state = lastState;
    const solverLevel = {
      id: currentLevel.id,
      pool: currentLevel.pool,
      targets: currentLevel.targets,
      operators: { casual: budget, normal: budget, expert: budget },
      rules: currentLevel.rules,
    };
    const decomps = enumerate(live, target, state.budget, currentLevel.rules);
    // The FIRST option that leaves the level winnable. Taking any legal move
    // walks into the traps §8.2 exists to set.
    const safe = decomps.find((option) =>
      exact.isWinnable(
        solverLevel,
        budget,
        applyMove(
          { tiles: live, targetIndex: state.targetIndex, budget: state.budget },
          { ...option, kind: "binary", targetIndex: state.targetIndex },
        ),
      ),
    );
    // No fallback to a losing move: if nothing preserves winnability the driver
    // is broken and should stop saying so, not quietly play on and lose.
    if (!safe) break;
    const pick = safe;
    send({ type: "tapTile", id: pick.leftId });
    send({ type: "tapOperator", op: pick.op });
    send({ type: "tapTile", id: pick.rightId });
    send({ type: "tapCommit" });
  }
  return lastState?.phase ?? "unknown";
}

function playIntoFailure(): string {
  for (let guard = 0; guard < 30; guard++) {
    if (!lastState || lastState.phase !== "playing") break;
    const live = lastState.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = lastState.targets[lastState.targetIndex];
    if (target === undefined) break;

    const decomps = enumerate(live, target, lastState.budget, currentLevel.rules);
    if (decomps.length > 0) {
      // Take the last option: on a trapped board the natural-looking move is
      // enumerated first, so this reliably walks into trouble.
      const pick = decomps[decomps.length - 1]!;
      send({ type: "tapTile", id: pick.leftId });
      send({ type: "tapOperator", op: pick.op });
      send({ type: "tapTile", id: pick.rightId });
      send({ type: "tapCommit" });
      continue;
    }
    const transforms = enumerateTransforms(live, lastState.budget, currentLevel.rules);
    if (transforms.length > 0) {
      send({ type: "tapUnary", op: transforms[0]!.op });
      send({ type: "tapTile", id: transforms[0]!.tileId });
      continue;
    }
    break;
  }
  return lastState?.phase ?? "unknown";
}

/**
 * Measure the retry path (GDD §9.5: retry must be instantaneous).
 *
 * Counts animation frames between the restart input and a playable board. The
 * number matters directly for retention — failure rewinds a whole level, which
 * is the harshest retry in casual puzzle, so any screen in the way is paid for
 * repeatedly. Measured rather than asserted, because "there is no modal in the
 * code" and "the player is playing again" are different claims.
 */
function measureRetry(): Promise<{ frames: number; ms: number; playable: boolean }> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    let frames = 0;

    send({ type: "tapRestart" });
    // Playable the instant the Director has rewound and the board has been
    // drawn from it: no modal to dismiss, no transition to sit through.
    const playable = lastState?.phase === "playing" && lastState.targetIndex === 0;

    const step = (): void => {
      frames++;
      resolve({ frames, ms: performance.now() - startedAt, playable });
    };
    requestAnimationFrame(step);
  });
}

/**
 * Tap-to-response latency, measured end to end (Phase 5F verification).
 *
 * Times the whole synchronous path a tap takes — Director rules, solver
 * queries, the renderer rebuilding the board, and now the audio layer
 * scheduling a cue. Audio is the thing on trial: sound must never be paid for
 * on the input path, so this is run twice, once unmuted and once muted, and the
 * two numbers have to agree.
 *
 * Alternates staging and returning the same tile so every iteration does
 * identical work and the board ends where it started.
 */
function measureTapLatency(iterations = 200): { median: number; mean: number; max: number } {
  const samples: number[] = [];
  const tile = lastState?.tiles.find((t) => !t.consumed);
  if (!tile) return { median: 0, mean: 0, max: 0 };

  for (let i = 0; i < iterations; i++) {
    const started = performance.now();
    send({ type: "tapTile", id: tile.id });
    samples.push(performance.now() - started);
    send({ type: "tapSlot", index: 0 });
  }

  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.floor(samples.length / 2)]!,
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    max: samples[samples.length - 1]!,
  };
}

Object.assign(window, {
  laneMath: {
    measureRetry,
    measureTapLatency,
    load: (id: string) => {
      const level = levels.get(id);
      if (!level) throw new Error(`no level ${id}`);
      open(level);
    },
    send,
    playIntoFailure,
    winLevel: playIntoWin,
    economy: () => economy.state,
    state: () => lastState,
    setEffectSpeed,
    showMap,
    /** Review hook: open the title screen regardless of §7.4's cold-start rule. */
    showTitle,
    /** Review hook: open the title's settings panel. */
    titleSettings: () => {
      title.openSettings();
      renderer.present();
    },
    /** Review hook: the title's scene graph, for the shot harness. */
    /** Review hook: force the spendable star balance. */
    setStars: (n: number) => {
      forcedStars = n;
      if (map.visible) map.show(viewWithRestoration());
    },
    /** Review hook: open the restore confirm for a world. */
    tapRestore: (world: number) => map.openRestoreConfirm(world),
    /** Review hook: set every room's restored count (ART_DIRECTION §6). */
    setRestored: (n: 0 | 1 | 2 | 3 | 4) => {
      forcedRestored = { 1: n, 2: n, 3: n, 4: n };
      if (map.visible) map.show(viewWithRestoration());
    },
    showBoard,
    mapView: () => mapView(economy, LEVEL_IDS),
    ads: () => ({ available: ads.available }),
    /** The §5.2 refill offer, exposed so the ad path can be exercised. */
    watchAdForLife: async () => {
      const outcome = await ads.offerLifeForAd(economy);
      if (map.visible) map.show(viewWithRestoration());
      else send({ type: "tick" });
      return outcome;
    },
    /** Audio, for the harness: state, the played-cue log, and the mute toggle. */
    audio: () => ({
      ready: sound.ready,
      muted: sound.isMuted,
      contextTimeMs: sound.contextTimeMs,
      log: [...sound.log],
    }),
    warmAudio: () => sound.warm(),
    clearAudioLog: () => {
      sound.log.length = 0;
    },
    setMuted: (muted: boolean) => {
      economy.setMuted(muted);
      sound.setMuted(muted);
    },
    /** What the feel layer is running right now — see Renderer.feelState. */
    feel: () => renderer.feelState(),
    /** Every unbounded-growth candidate the renderer holds. */
    diagnostics: () => renderer.diagnostics(),
    sprites: () => ({ missing: missingSprites(), loaded: loadedSprites(), failed: failedAtlases() }),
    telemetry: () => localSink.read(),
    exportTelemetry,
    build: BUILD,
    clearTelemetry: () => localSink.clear(),
    offThread: () => winnability.offThread,
  },
});
