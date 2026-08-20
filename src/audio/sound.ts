import { effectSpeed } from "../renderer/tween.js";
import type { Cue, CueName } from "./cues.js";

/**
 * The sound layer, SYNTHESISED — the game ships no audio files.
 *
 * Same reasoning as the procedural tokens (§9.2): no assets to load, no
 * compression step, and every sound is a parameter away from being retuned. It
 * also lets a sound scale with the event that fired it, which a sample cannot —
 * a tap on a 3 and a tap on a 64 are the same object at different sizes.
 *
 * THE PALETTE IS WOODEN AND PAPERY, never musical. Every voice is filtered
 * noise and low detuned oscillators with short decays: knocks, scrapes, tears,
 * thunks. There are deliberately no bells, no ascending intervals and no
 * ringing tails, because the register belongs to the same family as §9.5's —
 * weight, not energy.
 */

/** What was played and when — kept so the review harness can prove silence. */
export interface PlayedCue {
  readonly name: CueName;
  /** Milliseconds on the audio clock, not wall time. */
  readonly at: number;
}

interface Voice {
  /** Seconds, at speed 1. */
  readonly duration: number;
  readonly render: (sound: Sound, at: number, cue: Cue, seconds: number) => void;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  /** Recent cues, bounded. Exists so silence can be PROVEN, not asserted. */
  readonly log: PlayedCue[] = [];

  get ready(): boolean {
    return this.ctx !== null;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get contextTimeMs(): number {
    return this.ctx ? this.ctx.currentTime * 1000 : 0;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Build the context.
   *
   * MUST be called from a user gesture, because browsers refuse to start audio
   * otherwise — and must never be called ON the input path, since constructing
   * a context and filling a noise buffer is synchronous work measured in
   * milliseconds. The game's tap response does not pay for audio setup; the
   * first gesture schedules this and returns immediately.
   */
  warm(): void {
    if (this.ctx) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(ctx.destination);

      // One second of white noise, generated once and shared by every voice.
      // The wooden and papery half of the palette is almost entirely filtered
      // noise, so this buffer is most of the instrument.
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noise = buffer;
      void ctx.resume();
    } catch {
      // No audio is a perfectly playable game, so this is never an error path.
      this.ctx = null;
    }
  }

  /**
   * Play a cue. Silent when muted, before warming, or when the feel layer is
   * PAUSED — a frozen review frame must not make noise for motion that is not
   * running.
   */
  play(cue: Cue): void {
    const speed = effectSpeed();
    if (!this.ctx || !this.master || this.muted || speed <= 0) return;

    const voice = VOICES[cue.name];
    const at = this.ctx.currentTime;

    // Durations follow the same clock as the animation, so a slowed review
    // keeps sound and motion together. Stretching does change the timbre — a
    // slowed knock is a different object — which is fine for review and never
    // happens at speed 1. Clamped so a 20x slowdown is not a 9-second knock.
    const seconds = voice.duration / Math.min(Math.max(speed, 0.25), 4);

    voice.render(this, at, cue, seconds);

    this.log.push({ name: cue.name, at: at * 1000 });
    if (this.log.length > 64) this.log.shift();
  }

  playAll(cues: readonly Cue[]): void {
    for (const cue of cues) this.play(cue);
  }

  /** A filtered burst of the shared noise. Knocks, scrapes, tears, transients. */
  burst(
    at: number,
    seconds: number,
    gain: number,
    filter: { type: BiquadFilterType; from: number; to?: number; q?: number },
    attack = 0.002,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = filter.type;
    band.frequency.setValueAtTime(filter.from, at);
    if (filter.to !== undefined) {
      band.frequency.exponentialRampToValueAtTime(filter.to, at + seconds);
    }
    band.Q.value = filter.q ?? 1;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    source.connect(band).connect(env).connect(this.master);
    source.start(at);
    source.stop(at + seconds + 0.02);
  }

  /** A short pitched body, detuned per trigger so repetition never grates. */
  body(
    at: number,
    seconds: number,
    frequency: number,
    gain: number,
    type: OscillatorType = "sine",
    lowpass?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    // +/-12% per trigger (§9.5 technique): the tenth knock in a row still has
    // to sound like an object being set down, not like a repeated file.
    osc.frequency.setValueAtTime(frequency * (0.88 + Math.random() * 0.24), at);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

    let node: AudioNode = osc;
    if (lowpass !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      node = osc.connect(lp);
    }
    node.connect(env).connect(this.master);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }
}

/**
 * The voices — one per §9.5 feel target.
 *
 * Every one is an impact PLUS a reaction rather than a single blip, which is
 * what stops them sounding like UI beeps: something strikes, and the material
 * it struck answers.
 */
const VOICES: Record<CueName, Voice> = {
  /**
   * Tap a tile — a dry click, pitched by the tile's value.
   * Bandpass noise at 1500-2900Hz (Q 3.5), 28ms, over a small wooden body. The
   * board should sound like a set of distinct objects, not one button.
   */
  click: {
    duration: 0.028,
    render: (s, at, cue, seconds) => {
      const tone = cue.tone ?? 0.5;
      s.burst(at, seconds, 0.16, { type: "bandpass", from: 1500 + tone * 1400, q: 3.5 });
      s.body(at, seconds * 2.2, 320 + tone * 220, 0.05, "triangle", 2000);
    },
  },

  /**
   * Choose an operator — the tile click's drier, smaller cousin.
   *
   * Same wooden family, deliberately distinguishable: 18ms against the click's
   * 28ms, a tighter bandpass at a FIXED 2400Hz (an operator has no value to
   * modulate against), and only a trace of body at 430Hz. Less resonance is
   * what "drier" means physically — a small hard thing tapped, where a number
   * tile is a heavier one.
   */
  clack: {
    duration: 0.018,
    render: (s, at, _cue, seconds) => {
      s.burst(at, seconds, 0.14, { type: "bandpass", from: 2400, q: 5 });
      s.body(at, seconds * 1.6, 430, 0.035, "triangle", 2600);
    },
  },

  /**
   * Place into a slot — a wooden knock that settles.
   * A 9ms lowpassed transient, a 190Hz triangle body over 130ms, then a
   * quieter second contact at 150Hz: the piece lands, rocks once, is still.
   */
  knock: {
    duration: 0.13,
    render: (s, at, _cue, seconds) => {
      s.burst(at, 0.009, 0.2, { type: "lowpass", from: 2200 });
      s.body(at, seconds, 190, 0.22, "triangle", 1300);
      s.body(at + seconds * 0.42, seconds * 0.5, 150, 0.07, "triangle", 900);
    },
  },

  /**
   * Tap to return — the same object handled rather than dropped.
   * No transient at all and a 45ms attack, so it swells instead of striking.
   * That missing edge is what reads as "reversed"; nothing is literally played
   * backwards, which would sound like an effect rather than a material.
   */
  knockSoft: {
    duration: 0.16,
    render: (s, at, _cue, seconds) => {
      s.burst(at, seconds, 0.05, { type: "lowpass", from: 900 }, 0.045);
      s.body(at, seconds, 155, 0.1, "triangle", 800);
    },
  },

  /**
   * Commit correct — a low resonant thunk as the shatter lands.
   * The heaviest sound in the game: a 30ms lowpassed thump, a 96Hz sine with a
   * 420ms tail, and a fifth above it for body. The hit-stop before it is
   * silent, so this arrives into a gap that was made for it.
   */
  thunk: {
    duration: 0.42,
    render: (s, at, _cue, seconds) => {
      s.burst(at, 0.03, 0.22, { type: "lowpass", from: 700 });
      s.body(at, seconds, 96, 0.3, "sine");
      s.body(at, seconds * 0.55, 144, 0.1, "sine", 1200);
    },
  },

  /**
   * Commit incorrect — a dull scrape. NOT a buzzer.
   * Lowpassed noise sliding 620Hz down to 300Hz over 200ms with an 18ms
   * attack. No oscillator at all: nothing pitched, so nothing can be heard as
   * a wrong note. §2 step 4 says wrong arithmetic is not a failure state, and a
   * punishing sound would teach the opposite of the rule the difficulty model
   * rests on.
   */
  scrape: {
    duration: 0.2,
    render: (s, at, _cue, seconds) => {
      s.burst(at, seconds, 0.13, { type: "lowpass", from: 620, to: 300 }, 0.018);
    },
  },

  /**
   * Unary transform — paper.
   * Bandpass noise sweeping 900Hz to 2600Hz at Q 1.4 over 190ms, and no body
   * underneath. The only voice with no wooden component, so a transform can
   * never be mistaken for a binary move.
   */
  tear: {
    duration: 0.19,
    render: (s, at, _cue, seconds) => {
      s.burst(at, seconds, 0.11, { type: "bandpass", from: 900, to: 2600, q: 1.4 }, 0.012);
    },
  },

  /**
   * Failure — one low, quiet, final note.
   * A 68Hz sine, 900ms, lowpassed to 400Hz and deliberately the quietest
   * pitched voice in the game. The board has already said it (§9.4); this marks
   * the moment without editorialising about a loss the player can see.
   */
  fail: {
    duration: 0.9,
    render: (s, at, _cue, seconds) => {
      s.body(at, seconds, 68, 0.17, "sine", 400);
    },
  },

  /**
   * A star seating — one of three, fired as each arrives (§9.5), never together.
   * Struck wood, not a bell: a 6ms transient and a 220Hz triangle lowpassed
   * hard at 1100Hz, 220ms. The three pitches move by about a tone in total, so
   * it reads as a tally being counted out rather than a fanfare resolving.
   */
  star: {
    duration: 0.22,
    render: (s, at, cue, seconds) => {
      const step = cue.tone ?? 0;
      s.burst(at, 0.006, 0.07, { type: "lowpass", from: 1800 });
      s.body(at, seconds, 220 * Math.pow(1.06, step * 2), 0.16, "triangle", 1100);
    },
  },
};
