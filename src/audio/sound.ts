import { effectSpeed } from "../renderer/tween.js";
import type { Cue, CueName } from "./cues.js";

/**
 * The sound layer. THE RULES ARE GDD §9.7 — read them there.
 *
 * This comment used to BE the rule: procedural, no files, wooden and papery,
 * no ascending intervals. It governed a whole subsystem from the top of one
 * implementation file, where nothing pointed at it and nobody looking for the
 * audio scope would find it. §9.7 now carries it, including the one deliberate
 * exception this file implements — the level-complete cadence rises.
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
   * ROOM TONE (§9.7): a slow filtered-noise bed, per room.
   *
   * Not music, and deliberately not: the complaint was SILENCE, and a melody is
   * only one answer to it. This is the room the player is sitting in — a low
   * band of noise, moving slowly enough that it is never a note, under the
   * sparse `room` cue that gives each world its own object. It costs nothing to
   * ship, which is the other half of why a 180-360KB loop can wait for data.
   *
   * One source, retuned on world change. Starting a second would layer two
   * rooms and the player would hear the seam.
   */
  private bed: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private bedRoom = 0;

  setRoom(world: number): void {
    this.bedRoom = Math.min(3, Math.max(0, world - 1));
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;

    // Centre frequency per room: the Classroom is bright and papery, the
    // Observatory is a big cold space. Same instrument, different room.
    const centre = [420, 320, 500, 240][this.bedRoom] ?? 380;

    if (!this.bed) {
      const source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = centre;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      // Far below every cue. It should be noticed only when it stops.
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.028, ctx.currentTime, 1.2);
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      this.bed = { source, filter, gain };
      return;
    }
    // A room change is a slow crossfade of the same bed, not a cut.
    this.bed.filter.frequency.setTargetAtTime(centre, ctx.currentTime, 1.5);
  }

  /** Stop the bed — muting, or leaving for a screen that has no room. */
  stopRoom(): void {
    if (!this.bed || !this.ctx) return;
    this.bed.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
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
   * A star seating — one of three, fired as each arrives, never together.
   *
   * IT RISES NOW, and that is §9.7's one deliberate exception. The three notes
   * were 220 / 247 / 277Hz — a whole tone across all three — all lowpassed hard
   * at 1100Hz, and a player who had just cleared a level said it did not read
   * as a reward. They were right: nothing resolved, nothing brightened, and the
   * filter removed the harmonics that would have made it feel like anything. It
   * was a tally being counted out.
   *
   * Three changes, all inside the register:
   *
   *   220 -> 293 -> 330Hz     a perfect fifth in total, so the third note
   *                           ARRIVES somewhere instead of near where it began
   *   1100 -> 1600 -> 2200Hz  the filter opens as the pitch climbs: the same
   *                           material with more light on it, which is the
   *                           single biggest part of the change
   *   0.22 -> 0.38s on the    long enough not to stop dead. Not a bell tail
   *   third                   — struck wood that is allowed to finish
   *
   * Still struck wood. Still a 6ms transient, a triangle and a lowpass. The
   * fourth event that these three lead to is `seat`, below.
   */
  star: {
    duration: 0.22,
    render: (s, at, cue, seconds) => {
      const step = Math.round((cue.tone ?? 0) * 2);
      const pitch = [220, 293, 330][Math.min(2, Math.max(0, step))] ?? 220;
      const cutoff = [1100, 1600, 2200][Math.min(2, Math.max(0, step))] ?? 1100;
      const tail = step >= 2 ? seconds * 1.7 : seconds;
      s.burst(at, 0.006, 0.07, { type: "lowpass", from: 1800 + step * 400 });
      s.body(at, tail, pitch, 0.16, "triangle", cutoff);
    },
  },

  /**
   * THE MECHANISM CLOSING — the fourth event, as the cleared panel seats.
   *
   * The three stars are a phrase and this is what they resolve into: one low
   * 110Hz thunk with a long decay, landing after the last star rather than with
   * it. This is what makes the win a cadence instead of a list, and it is an
   * OBJECT sound rather than a note, which is how a rising figure stays inside
   * §9.7's register — a drawer closing well, not a fanfare.
   */
  seat: {
    duration: 0.4,
    render: (s, at, _cue, seconds) => {
      s.burst(at, 0.01, 0.05, { type: "lowpass", from: 900 });
      s.body(at, seconds, 110, 0.2, "sine", 700);
      s.body(at + 0.01, seconds * 0.7, 165, 0.07, "triangle", 900);
    },
  },

  /**
   * ROOM TONE'S sparse event (§9.7) — the object in the room that occasionally
   * makes a noise. `tone` selects which room, so the Classroom's clock and the
   * Observatory's dome are the same voice with different parameters rather than
   * four hand-written ones.
   */
  room: {
    duration: 0.5,
    render: (s, at, cue, seconds) => {
      const room = Math.round((cue.tone ?? 0) * 3);
      if (room === 0) {
        // CLASSROOM: a clock escapement. Two dry ticks, the second quieter.
        s.burst(at, 0.008, 0.045, { type: "bandpass", from: 2600, q: 6 });
        s.burst(at + 0.26, 0.007, 0.03, { type: "bandpass", from: 2400, q: 6 });
        return;
      }
      if (room === 1) {
        // LIBRARY: a page settling. Paper, no pitch at all.
        s.burst(at, 0.16, 0.03, { type: "highpass", from: 1400, to: 3200 }, 0.05);
        return;
      }
      if (room === 2) {
        // LABORATORY: glass touching glass, once, at the far end of the bench.
        s.burst(at, 0.006, 0.028, { type: "bandpass", from: 4200, q: 9 });
        s.body(at, seconds * 0.5, 1180, 0.02, "sine", 5200);
        return;
      }
      // OBSERVATORY: the dome, or something large turning slowly a long way off.
      s.body(at, seconds * 1.6, 62, 0.05, "sine", 300);
      s.burst(at, seconds, 0.012, { type: "lowpass", from: 220, to: 140 }, 0.2);
    },
  },
};
