/**
 * Ambient soundscapes and phase chimes, synthesized with the Web Audio API so
 * the app ships no audio files and works offline. Browser-only.
 *
 * Browsers (iOS Safari especially) only allow audio after a user gesture, so
 * call `unlock()` from a click/tap handler before anything should be audible.
 */

export type SoundKind = "ocean" | "fire" | "rain" | "nature";

type NoiseColor = "white" | "pink" | "brown";

interface Voice {
  stop(): void;
}

const FADE_S = 1.2;

class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<NoiseColor, AudioBuffer>();
  private voice: Voice | null = null;
  private kind: SoundKind | null = null;
  private playing = false;
  private volume = 0.6;

  /** Creates/resumes the AudioContext. Must run inside a user gesture. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.sync();
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx && this.master && this.playing && this.voice) {
      this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
  }

  /** Declares what should be heard; the engine reconciles to it. */
  set(kind: SoundKind | null, playing: boolean) {
    if (kind === this.kind && playing === this.playing) return;
    this.kind = kind;
    this.playing = playing;
    this.sync();
  }

  private sync() {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const want = this.playing ? this.kind : null;

    if (!want) {
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, FADE_S / 3);
      const old = this.voice;
      this.voice = null;
      if (old) setTimeout(() => old.stop(), FADE_S * 1000 + 200);
      return;
    }

    this.voice?.stop();
    this.voice = this.build(want);
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(this.volume, now + FADE_S);
  }

  /** A short two-note chime; rising before focus, falling before a break. */
  chime(direction: "up" | "down") {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = direction === "up" ? [659.25, 987.77] : [987.77, 659.25];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  }

  // -------------------------------------------------------------------------
  // Building blocks

  private noise(color: NoiseColor): AudioBuffer {
    const cached = this.buffers.get(color);
    if (cached) return cached;
    const ctx = this.ctx!;
    const length = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (color === "white") {
        data[i] = white;
      } else if (color === "pink") {
        // Paul Kellet's refined pink noise filter.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    this.buffers.set(color, buffer);
    return buffer;
  }

  private loop(color: NoiseColor): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise(color);
    src.loop = true;
    src.start();
    return src;
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private gain(value: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    return g;
  }

  /** Slow sine modulation of an AudioParam around its current value. */
  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const osc = this.ctx!.createOscillator();
    const amount = this.gain(depth);
    osc.frequency.value = rate;
    osc.connect(amount).connect(target);
    osc.start();
    return osc;
  }

  /** Runs `schedule` repeatedly at random intervals between min and max ms. */
  private every(minMs: number, maxMs: number, schedule: () => void): () => void {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      schedule();
      timer = setTimeout(tick, minMs + Math.random() * (maxMs - minMs));
    };
    timer = setTimeout(tick, minMs);
    return () => clearTimeout(timer);
  }

  /** A very short filtered noise burst (raindrop, ember crackle). */
  private burst(out: AudioNode, durationS: number, freq: number, level: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noise("white");
    const bp = this.filter("bandpass", freq, 1.5);
    const g = this.gain(0);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durationS);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 3);
    src.stop(t + durationS + 0.05);
  }

  private build(kind: SoundKind): Voice {
    const out = this.gain(1);
    out.connect(this.master!);
    const sources: AudioScheduledSourceNode[] = [];
    const cancels: (() => void)[] = [];

    switch (kind) {
      case "ocean": {
        // Low rumble whose loudness swells like waves, plus a hiss of surf.
        const rumble = this.loop("brown");
        const swell = this.gain(0.45);
        rumble.connect(this.filter("lowpass", 500)).connect(swell).connect(out);

        const hiss = this.loop("white");
        const surf = this.gain(0.06);
        hiss.connect(this.filter("bandpass", 1400, 0.5)).connect(surf).connect(out);
        sources.push(rumble, hiss, this.lfo(swell.gain, 0.08, 0.35), this.lfo(surf.gain, 0.08, 0.05));
        break;
      }
      case "rain": {
        const bed = this.gain(0.5);
        const drizzle = this.loop("pink");
        sources.push(drizzle);
        drizzle
          .connect(this.filter("highpass", 500))
          .connect(this.filter("lowpass", 7000))
          .connect(bed)
          .connect(out);
        cancels.push(
          this.every(15, 90, () => this.burst(out, 0.02, 2500 + Math.random() * 3000, 0.25 * Math.random())),
        );
        break;
      }
      case "fire": {
        const embers = this.loop("brown");
        const roar = this.gain(0.55);
        embers.connect(this.filter("lowpass", 260)).connect(roar).connect(out);
        sources.push(embers, this.lfo(roar.gain, 0.3, 0.12));
        cancels.push(
          this.every(40, 380, () => {
            const pops = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < pops; i++) {
              this.burst(out, 0.005 + Math.random() * 0.03, 1500 + Math.random() * 4000, 0.15 + Math.random() * 0.5);
            }
          }),
        );
        break;
      }
      case "nature": {
        // Soft wind in the trees with occasional bird song.
        const breeze = this.loop("pink");
        const wind = this.gain(0.18);
        breeze.connect(this.filter("lowpass", 450)).connect(wind).connect(out);
        sources.push(breeze, this.lfo(wind.gain, 0.05, 0.1));
        cancels.push(this.every(1500, 5000, () => this.birdPhrase(out)));
        break;
      }
    }

    return {
      stop: () => {
        cancels.forEach((cancel) => cancel());
        sources.forEach((s) => {
          try {
            s.stop();
          } catch {
            // already stopped
          }
        });
        out.disconnect();
      },
    };
  }

  private birdPhrase(out: AudioNode) {
    const ctx = this.ctx!;
    const base = 2600 + Math.random() * 2000;
    const chirps = 2 + Math.floor(Math.random() * 4);
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < chirps; i++) {
      const len = 0.05 + Math.random() * 0.09;
      const osc = ctx.createOscillator();
      const g = this.gain(0);
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t);
      osc.frequency.exponentialRampToValueAtTime(base * (Math.random() > 0.5 ? 1.35 : 0.75), t + len);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + len * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len + 0.04 + Math.random() * 0.08;
    }
  }
}

export const ambient = new AmbientEngine();
