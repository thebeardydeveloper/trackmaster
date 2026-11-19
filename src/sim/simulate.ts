import {
  CAR,
  DT,
  FRAME_EVERY,
  RHO,
  SPIN_MIN_SPEED,
  SPIN_RATIO,
  SURFACES,
  gripAccel,
  kmhToMs,
  msToKmh,
  surfaceMu,
  windVector,
  WINGS,
  type WingProps,
} from "./constants";
import { cornerAt, project, surfaceAt, wallAt, type Track } from "./track";
import { DEFAULT_SETUP, DRY_CALM, type CarSetup, type Conditions, type DnfReason, type Frame, type Instruction, type RaceEvent, type RaceResult, type Surface } from "./types";

const DEG = Math.PI / 180;

export interface Controls {
  /** null = coast (no throttle, no brake). */
  targetMs: number | null;
  /** Requested front wheel angle (°, left positive). */
  steerDeg: number;
}

/** Converts a time in seconds to the simulation step at which it takes effect. */
export const stepOf = (t: number) => Math.max(0, Math.ceil(t / DT - 1e-6));

/**
 * Turns instructions into controls, step by step. Orders take effect at the first step
 * whose time is ≥ their `t`. A new speed order replaces the previous one; a new steer
 * order replaces the previous steer order. When a steer order ends the wheel returns
 * to center.
 */
export class Schedule {
  private queue: Instruction[];
  private next = 0;
  private targetMs: number | null = null;
  private steerDeg = 0;
  private steerEnd = -1;

  constructor(instructions: Instruction[] = []) {
    // stable sort by time
    this.queue = instructions
      .map((ins, order) => ({ ins, order }))
      .sort((a, b) => a.ins.t - b.ins.t || a.order - b.order)
      .map((x) => x.ins);
  }

  /** Append an order (must not be earlier than the ones already queued). */
  push(ins: Instruction) {
    this.queue.push(ins);
  }

  get pending() {
    return this.queue.length - this.next;
  }

  controlsAt(step: number): Controls {
    while (this.next < this.queue.length && stepOf(this.queue[this.next].t) <= step) {
      const { t, action } = this.queue[this.next++];
      switch (action.type) {
        case "accelerate":
        case "brake":
          this.targetMs = kmhToMs(Math.max(0, Math.min(CAR.maxKmh, action.targetKmh)));
          break;
        case "coast":
          this.targetMs = null;
          break;
        case "steer": {
          const deg = Math.min(CAR.maxSteerDeg, Math.max(0, action.degrees));
          this.steerDeg = action.side === "left" ? deg : -deg;
          this.steerEnd = stepOf(t + Math.max(0, action.duration));
          break;
        }
      }
    }
    return {
      targetMs: this.targetMs,
      steerDeg: step < this.steerEnd ? this.steerDeg : 0,
    };
  }
}

const SPIN_MIN_TIME = 1.6;
const SPIN_MAX_TIME = 3.5;

/** Mutable car state + one physics step. Deterministic for a given sequence of controls. */
export class CarSim {
  x = 0;
  y = 0;
  heading = 0;
  /** Travel direction (differs from heading only while spinning). */
  travel = 0;
  u = 0;
  steer = 0; // actual wheel angle (°)
  progress = 0;
  surface: Surface = "asphalt";
  spinT = -1;
  spinRate = 0;
  inWall = false;
  slip = 0;
  braking = false;
  hint: number;
  lastS: number;
  step = 0;
  maxU = 0;
  events: RaceEvent[] = [];
  private lastOfftrackT = -10;
  cornerEntry: (number | null)[];
  readonly wing: WingProps;
  readonly wind: [number, number];

  constructor(
    readonly track: Track,
    readonly setup: CarSetup = DEFAULT_SETUP,
    readonly conditions: Conditions = trackConditions(track),
  ) {
    this.wing = WINGS[setup.wing];
    this.wind = windVector(conditions);
    this.x = track.xs[0];
    this.y = track.ys[0];
    this.heading = this.travel = track.hdg[0];
    const p = project(track, this.x, this.y, -1);
    this.hint = p.i;
    this.lastS = p.s;
    this.cornerEntry = track.corners.map(() => null);
  }

  get t() {
    return this.step * DT;
  }

  get spinning() {
    return this.spinT >= 0;
  }

  frame(): Frame {
    return {
      t: this.t,
      x: this.x,
      y: this.y,
      heading: this.heading,
      speed: this.u,
      steer: this.steer,
      progress: this.progress,
      surface: this.surface,
      spinning: this.spinning,
      slip: this.slip,
      braking: this.braking,
    };
  }

  private event(type: RaceEvent["type"]) {
    this.events.push({
      type,
      t: this.t,
      x: this.x,
      y: this.y,
      kmh: Math.round(msToKmh(this.u)),
      corner: cornerAt(this.track, this.lastS),
    });
  }

  advance(c: Controls) {
    const track = this.track;
    const surf = SURFACES[this.surface];
    const mu = surfaceMu(this.surface, this.conditions);
    const u = this.u;
    // aerodynamics work with the airspeed: a headwind adds drag and downforce
    const air = u - (this.wind[0] * Math.cos(this.travel) + this.wind[1] * Math.sin(this.travel));
    const aMax = gripAccel(air, mu, this.wing.clA);
    const drag = (0.5 * RHO * this.wing.cdA * air * Math.abs(air)) / CAR.mass + CAR.rollDecel + surf.roll + surf.drag * u;

    // steering actuator (rate limited)
    const maxDelta = CAR.steerRateDeg * DT;
    const want = this.spinning ? 0 : c.steerDeg;
    this.steer += Math.max(-maxDelta, Math.min(maxDelta, want - this.steer));

    let a: number;
    let yawRate: number;
    let slip = 0;
    let braking = false;

    if (this.spinning) {
      // sliding: no control, the car rotates and scrubs speed
      a = -(aMax * 0.75 + drag);
      yawRate = this.spinRate;
      this.spinRate *= Math.exp(-1.2 * DT);
      this.spinT += DT;
      slip = 1;
    } else {
      const delta = this.steer * DEG;
      const rDes = u > 0.05 ? (u * Math.tan(delta)) / CAR.wheelbase : 0;
      const aReq = Math.abs(u * rDes);
      let aLat = aReq;
      let scrub = 0;
      yawRate = rDes;
      if (aReq > aMax) {
        const ratio = aReq / aMax;
        if (ratio > SPIN_RATIO && u > SPIN_MIN_SPEED) {
          this.spinT = 0;
          this.spinRate = Math.sign(rDes) * 7;
          this.travel = this.heading;
          this.event("spin");
          yawRate = this.spinRate;
        } else {
          // understeer: the car can only turn as much as the tyres allow
          yawRate = (Math.sign(rDes) * aMax) / u;
          aLat = aMax;
          scrub = (ratio - 1) * aMax * 0.6;
          slip = Math.min(1, 0.25 + ((ratio - 1) / (SPIN_RATIO - 1)) * 0.75);
        }
      }

      // longitudinal: lateral grip has priority, the rest is available for traction/braking
      const aLong = Math.sqrt(Math.max(0, aMax * aMax - aLat * aLat));
      const aDrive = Math.min(CAR.power / (CAR.mass * Math.max(u, 3)), CAR.maxTractionAccel * (mu / SURFACES.asphalt.mu), aLong);
      const aBrake = aLong;
      let thrust = 0;
      if (c.targetMs !== null) {
        thrust = Math.max(-aBrake, Math.min(aDrive, drag + CAR.speedGain * (c.targetMs - u)));
      }
      a = thrust - drag - scrub;
      if (slip === 0 && aMax > 0) slip = Math.max(0, (aLat / aMax - 0.85) / 0.15) * 0.25;
      braking = thrust < -0.6 * aBrake && u > 15;
      if (!this.spinning) this.travel = this.heading;
    }

    this.slip = this.spinning ? 1 : slip;
    this.braking = braking;
    this.u = Math.max(0, u + a * DT);
    this.heading += yawRate * DT;
    if (!this.spinning) this.travel = this.heading;
    const v = (u + this.u) / 2;
    this.x += Math.cos(this.travel) * v * DT;
    this.y += Math.sin(this.travel) * v * DT;
    this.step++;

    // where are we on the track?
    let p = project(track, this.x, this.y, this.hint);
    const limit = wallAt(track, p.i, p.lateral);
    if (Math.abs(p.lateral) > limit) {
      // push back inside the wall and slide along it
      const side = Math.sign(p.lateral);
      const h = track.hdg[p.i];
      const off = (Math.abs(p.lateral) - limit + 0.05) * side;
      this.x -= -Math.sin(h) * off;
      this.y -= Math.cos(h) * off;
      // keep only the speed component parallel to the wall, minus some scraping loss
      const impact = Math.abs(Math.sin(this.travel - h));
      if (!this.inWall && impact > 0.15) this.event("wall");
      this.u = Math.max(0, this.u * Math.sqrt(1 - impact * impact) * (impact > 0.15 ? 0.8 : 1) - 4 * DT);
      if (!this.spinning) {
        const forward = Math.cos(this.heading - h) >= 0;
        this.heading = this.travel = forward ? h : h + Math.PI;
      }
      this.inWall = true;
      p = project(track, this.x, this.y, p.i);
    } else {
      this.inWall = false;
    }

    let ds = p.s - this.lastS;
    if (track.closed) {
      if (ds > track.length / 2) ds -= track.length;
      if (ds < -track.length / 2) ds += track.length;
    }
    this.progress += ds;
    this.lastS = p.s;
    this.hint = p.i;

    const prevSurface = this.surface;
    this.surface = surfaceAt(track, p.i, p.lateral);
    const offNow = this.surface === "grass" || this.surface === "gravel";
    const offBefore = prevSurface === "grass" || prevSurface === "gravel";
    if (offNow && !offBefore && this.t - this.lastOfftrackT > 0.5) {
      this.event("offtrack");
      this.lastOfftrackT = this.t;
    }

    // corner entry speed (first pass of each corner on this lap)
    for (const corner of track.corners) {
      if (this.cornerEntry[corner.index] === null && this.progress >= corner.sStart && this.progress < corner.sStart + 15) {
        this.cornerEntry[corner.index] = Math.round(msToKmh(this.u));
      }
    }

    if (this.spinning && ((this.spinT >= SPIN_MIN_TIME && this.u < 8) || this.spinT >= SPIN_MAX_TIME)) {
      // recover facing the right way
      this.spinT = -1;
      this.spinRate = 0;
      this.heading = this.travel = track.hdg[p.i];
      this.steer = 0;
    }

    this.maxU = Math.max(this.maxU, this.u);
  }
}

export interface SimulateOptions {
  /** Override the track time limit (s). */
  timeLimit?: number;
  setup?: CarSetup;
  /** Defaults to the track's conditions. */
  conditions?: Conditions;
  /** Stop (unfinished) as soon as the car has covered this distance. For planning tools. */
  stopAtProgress?: number;
}

export const trackConditions = (track: Track): Conditions => track.def.conditions ?? DRY_CALM;

/** Run a whole race for a list of instructions. Pure and deterministic. */
export function simulate(track: Track, instructions: Instruction[], opts: SimulateOptions = {}): RaceResult {
  const schedule = new Schedule(instructions);
  const car = new CarSim(track, opts.setup ?? DEFAULT_SETUP, opts.conditions ?? trackConditions(track));
  return runRace(track, car, (step) => schedule.controlsAt(step), () => schedule.pending, opts);
}

export function runRace(
  track: Track,
  car: CarSim,
  controlsAt: (step: number) => Controls,
  pending: () => number,
  opts: SimulateOptions = {},
): RaceResult {
  const limit = opts.timeLimit ?? track.def.timeLimit;
  const frames: Frame[] = [car.frame()];
  let finishTime: number | null = null;
  let finishKmh: number | null = null;
  let dnf: DnfReason | null = null;
  let stoppedFor = 0;

  while (true) {
    const c = controlsAt(car.step);
    const prevProgress = car.progress;
    const prevT = car.t;
    car.advance(c);

    if (car.progress >= track.finishDistance && prevProgress < track.finishDistance) {
      const f = (track.finishDistance - prevProgress) / (car.progress - prevProgress);
      finishTime = prevT + f * DT;
      finishKmh = Math.round(msToKmh(car.u));
      frames.push(car.frame());
      break;
    }
    if (car.step % FRAME_EVERY === 0) frames.push(car.frame());
    if (opts.stopAtProgress !== undefined && car.progress >= opts.stopAtProgress) {
      frames.push(car.frame());
      break;
    }

    const idle = (c.targetMs === null || c.targetMs < 0.3) && car.u < 0.3 && !car.spinning;
    stoppedFor = idle && pending() === 0 ? stoppedFor + DT : 0;
    if (stoppedFor > 2) {
      dnf = "stopped";
      break;
    }
    if (car.t >= limit) {
      dnf = "timeout";
      break;
    }
  }

  const completion = Math.max(0, Math.min(1, car.progress / track.finishDistance));
  return {
    finished: finishTime !== null,
    time: finishTime,
    dnfReason: dnf,
    finishKmh,
    maxKmh: Math.round(msToKmh(car.maxU)),
    completion,
    events: car.events,
    frames,
    cornerEntryKmh: car.cornerEntry,
  };
}
