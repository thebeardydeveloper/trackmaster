import type { Frame } from "../sim/types";

/** Top speed (km/h) of each gear, used to fake revs and gear changes. */
const GEARS = [95, 135, 170, 205, 240, 272, 305, 345];

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Synthesised race sounds (no audio files): engine with gear shifts, tyre squeal,
 * gravel/grass rumble, wall impacts and start-light beeps.
 * Must be created/resumed from a user gesture (browser autoplay rules).
 */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineA!: OscillatorNode;
  private engineB!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private squealOsc!: OscillatorNode;
  private squealGain!: GainNode;
  private rumbleGain!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  private running = false;

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m || !this.running ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  /** Call from a click handler. */
  unlock() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.noise = noiseBuffer(ctx, 2);

    // engine: two detuned oscillators through a lowpass that opens with revs
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineA = ctx.createOscillator();
    this.engineA.type = "sawtooth";
    this.engineB = ctx.createOscillator();
    this.engineB.type = "square";
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    this.engineA.connect(this.engineFilter);
    this.engineB.connect(bGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineA.start();
    this.engineB.start();

    // tyre squeal: narrow band around ~1.1 kHz with a little wobble
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = "sawtooth";
    this.squealOsc.frequency.value = 1100;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 9;
    const wobbleAmt = ctx.createGain();
    wobbleAmt.gain.value = 60;
    wobble.connect(wobbleAmt).connect(this.squealOsc.frequency);
    const squealBand = ctx.createBiquadFilter();
    squealBand.type = "bandpass";
    squealBand.frequency.value = 1150;
    squealBand.Q.value = 6;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealOsc.connect(squealBand).connect(this.squealGain).connect(this.master);
    this.squealOsc.start();
    wobble.start();

    // off-track rumble: looped lowpassed noise
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.noise;
    rumble.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = "lowpass";
    rumbleLp.frequency.value = 260;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(rumbleLp).connect(this.rumbleGain).connect(this.master);
    rumble.start();
  }

  /** Engine idling at the start line. */
  start() {
    if (!this.ctx) return;
    this.running = true;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.12, t, 0.1);
    this.engineA.frequency.setTargetAtTime(62, t, 0.05);
    this.engineB.frequency.setTargetAtTime(31, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(700, t, 0.05);
  }

  stop() {
    if (!this.ctx) return;
    this.running = false;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0, t, 0.3);
    this.squealGain.gain.setTargetAtTime(0, t, 0.05);
    this.rumbleGain.gain.setTargetAtTime(0, t, 0.05);
    this.master.gain.setTargetAtTime(0, t + 0.4, 0.2);
  }

  update(f: Frame) {
    if (!this.ctx || !this.running) return;
    const t = this.ctx.currentTime;
    const kmh = f.speed * 3.6;
    let g = GEARS.findIndex((top) => kmh <= top);
    if (g < 0) g = GEARS.length - 1;
    const low = g === 0 ? 0 : GEARS[g - 1] * 0.92;
    const rev = Math.max(0, Math.min(1, (kmh - low) / (GEARS[g] - low)));
    const rpm = g === 0 ? 0.25 + 0.75 * rev : 0.5 + 0.5 * rev;
    const freq = 62 + rpm * 250;
    this.engineA.frequency.setTargetAtTime(freq, t, 0.03);
    this.engineB.frequency.setTargetAtTime(freq / 2, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(500 + rpm * 2600, t, 0.05);
    this.engineGain.gain.setTargetAtTime(f.braking ? 0.09 : 0.15, t, 0.05);

    const onAsphalt = f.surface === "asphalt" || f.surface === "kerb";
    const squeal = onAsphalt && kmh > 20 ? Math.max(f.slip, f.braking ? 0.15 : 0) : 0;
    this.squealGain.gain.setTargetAtTime(squeal * 0.16, t, 0.04);
    this.squealOsc.frequency.setTargetAtTime(950 + f.slip * 350, t, 0.1);

    const off = f.surface === "grass" || f.surface === "gravel";
    const rumble = off ? Math.min(1, kmh / 120) * (f.surface === "gravel" ? 0.6 : 0.4) : f.surface === "kerb" ? 0.15 : 0;
    this.rumbleGain.gain.setTargetAtTime(rumble, t, 0.04);
  }

  /** Short crunch for wall hits. */
  impact(strength = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.9 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.4);
  }

  /** Start light beep; `go` is the higher "lights out" tone. */
  beep(go = false) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = go ? 1046 : 523;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (go ? 0.45 : 0.18));
    // beeps bypass the race master so they're audible before the engine starts
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.5);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
