import runtimeLevels from "./generated/levels.json";
import { Ads, loadAdMob } from "./ads/ads.js";
import { Sound } from "./audio/sound.js";
import { MapScreen } from "./map/map-screen.js";
import { mapView } from "./map/model.js";
import { Economy } from "./economy/economy.js";
import { LocalStorageStore } from "./economy/save.js";
import { Director } from "./game/director.js";
import type { Command, InputEvent, LadderLevel, ViewState } from "./game/types.js";
import { Renderer } from "./renderer/renderer.js";
import { setEffectSpeed } from "./renderer/effects.js";
import { WinnabilityService } from "./game/winnability-service.js";
import { ConsoleSink, LocalStorageSink, Telemetry } from "./telemetry/telemetry.js";
import { enumerate, enumerateTransforms } from "./solver/index.js";

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

const renderer = new Renderer();
await renderer.init(host);

// One economy for the whole session, persisted to localStorage.
const economy = new Economy(new LocalStorageStore());

// §7.8 funnel, local sinks only. The remote sink plugs in at Phase 6 by
// implementing TelemetrySink and adding it to this list.
const localSink = new LocalStorageSink();
const telemetry = new Telemetry([new ConsoleSink(), localSink]);
telemetry.open();

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
  if (input.type === "selectMode") open(currentLevel);
}

function open(level: LadderLevel): void {
  currentLevel = level;
  director = new Director(level, economy.selectedMode, economy, telemetry, winnability);
  void renderer.setWorld(level.world);
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
  setTimeout(() => sound.warm(), 0);
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

function showMap(): void {
  renderer.setBoardVisible(false);
  map.show(mapView(economy, LEVEL_IDS));
}

function showBoard(): void {
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
    map.show(mapView(economy, LEVEL_IDS));
  },
  onOpenShop: () => {
    // The shop lives on the board, where the hints apply. The map is the door.
    showBoard();
    send({ type: "toggleShop" });
  },
  onSelectMode: (mode) => {
    send({ type: "selectMode", mode: mode as "casual" | "normal" | "expert" });
    map.show(mapView(economy, LEVEL_IDS));
  },
});

/*
 * Ads: rewarded video only, for the §5.2 life refill. No interstitials.
 *
 * Loaded lazily and off the boot path — on the web the plugin resolves to null
 * and everything below is a no-op, so the browser build never carries the
 * native bridge and never waits on it.
 */
const ads = new Ads({ plugin: await loadAdMob() });
void ads.initialize();

renderer.onInput((input) => {
  // §7.6: the map is absent until 1-10 is cleared, so the way back is too.
  if (input.type === "tapMap") {
    showMap();
    return;
  }
  send(input);
});
open(currentLevel);

// Lives regenerate on a timer, so the HUD has to notice without an input event.
setInterval(() => send({ type: "tick" }), 5_000);

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
    economy: () => economy.state,
    state: () => lastState,
    setEffectSpeed,
    showMap,
    showBoard,
    mapView: () => mapView(economy, LEVEL_IDS),
    ads: () => ({ available: ads.available }),
    /** The §5.2 refill offer, exposed so the ad path can be exercised. */
    watchAdForLife: async () => {
      const outcome = await ads.offerLifeForAd(economy);
      if (map.visible) map.show(mapView(economy, LEVEL_IDS));
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
    telemetry: () => localSink.read(),
    clearTelemetry: () => localSink.clear(),
    offThread: () => winnability.offThread,
  },
});
