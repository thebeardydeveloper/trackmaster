import type { Frame, RaceEvent, RaceResult } from "../sim/types";

export type PlaybackState = "idle" | "countdown" | "playing" | "done";

/** Lights come on one by one every LIGHT_STEP s, then all go out at LIGHTS_OUT. */
export const LIGHT_STEP = 0.55;
export const LIGHTS_OUT = LIGHT_STEP * 5 + 0.7;

/** Interpolated frame of a run at time t. `cursor` speeds up sequential lookups. */
export function sampleRun(r: RaceResult, t: number, cursor: { k: number }): Frame {
  const frames = r.frames;
  const end = frames[frames.length - 1];
  if (t >= end.t) return end;
  if (t <= 0) return frames[0];
  if (cursor.k >= frames.length - 1 || frames[cursor.k].t > t) cursor.k = 0;
  while (cursor.k < frames.length - 2 && frames[cursor.k + 1].t <= t) cursor.k++;
  const a = frames[cursor.k];
  const b = frames[cursor.k + 1];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  let dh = b.heading - a.heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return {
    ...a,
    t,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    heading: a.heading + dh * k,
    speed: a.speed + (b.speed - a.speed) * k,
    steer: a.steer + (b.steer - a.steer) * k,
    progress: a.progress + (b.progress - a.progress) * k,
    slip: a.slip + (b.slip - a.slip) * k,
  };
}

export interface PlaybackListeners {
  onTick?: (f: Frame, ghost: Frame | null) => void;
  onDone?: () => void;
  /** lights on (1..5), 0 = lights out (go!). */
  onLights?: (n: number) => void;
  onEvent?: (e: RaceEvent) => void;
}

/**
 * Plain object shared between the React UI and the R3F render loop. The render loop
 * advances it every frame; the UI only listens (no React state updates at 60 fps).
 */
export class PlaybackController {
  result: RaceResult | null = null;
  ghost: RaceResult | null = null;
  state: PlaybackState = "idle";
  time = 0;
  speed = 1;
  frame: Frame | null = null;
  ghostFrame: Frame | null = null;
  private countdown = 0;
  private lights = -1;
  private eventCursor = 0;
  private cursor = { k: 0 };
  private ghostCursor = { k: 0 };
  private listeners: PlaybackListeners = {};

  setSpeed(x: number) {
    this.speed = x;
  }

  listen(l: PlaybackListeners) {
    this.listeners = l;
  }

  /** Start a run with the light sequence, optionally racing a ghost. */
  start(result: RaceResult, ghost: RaceResult | null) {
    this.result = result;
    this.ghost = ghost;
    this.time = 0;
    this.countdown = 0;
    this.lights = -1;
    this.eventCursor = 0;
    this.cursor.k = 0;
    this.ghostCursor.k = 0;
    this.state = "countdown";
  }

  /** Show a finished run with the car parked at its last position. */
  show(result: RaceResult | null) {
    this.result = result;
    this.ghost = null;
    this.state = result ? "done" : "idle";
    this.time = result ? result.frames[result.frames.length - 1].t : 0;
  }

  skip() {
    if (!this.result || (this.state !== "playing" && this.state !== "countdown")) return;
    this.state = "playing";
    this.time = this.result.frames[this.result.frames.length - 1].t;
    this.eventCursor = this.result.events.length; // don't fire every event at once
  }

  /** Start lights currently lit (only during the countdown). */
  get lightsOn() {
    return this.state === "countdown" ? Math.max(0, this.lights) : 0;
  }

  get duration() {
    return this.result ? this.result.frames[this.result.frames.length - 1].t : 0;
  }

  /** Advance by real seconds; updates `frame` / `ghostFrame`. */
  advance(dt: number) {
    const r = this.result;
    const L = this.listeners;
    if (!r) {
      this.frame = this.ghostFrame = null;
      return;
    }
    if (this.state === "countdown") {
      this.countdown += dt;
      const on = this.countdown >= LIGHTS_OUT ? 0 : Math.min(5, Math.floor(this.countdown / LIGHT_STEP));
      if (on !== this.lights) {
        this.lights = on;
        if (on > 0 || this.countdown >= LIGHTS_OUT) L.onLights?.(on);
      }
      if (this.countdown >= LIGHTS_OUT) this.state = "playing";
    } else if (this.state === "playing") {
      this.time += dt * this.speed;
    }

    const end = r.frames[r.frames.length - 1].t;
    if (this.time > end) this.time = end;
    this.frame = sampleRun(r, this.time, this.cursor);
    this.ghostFrame = this.ghost && this.state !== "done" ? sampleRun(this.ghost, this.time, this.ghostCursor) : null;

    if (this.state === "playing") {
      while (this.eventCursor < r.events.length && r.events[this.eventCursor].t <= this.time) {
        L.onEvent?.(r.events[this.eventCursor++]);
      }
      L.onTick?.(this.frame, this.ghostFrame);
      if (this.time >= end) {
        this.state = "done";
        L.onDone?.();
      }
    }
  }
}
