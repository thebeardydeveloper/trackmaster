import { CAR, DT, gripAccel, kmhToMs, maxCornerSpeed, msToKmh, surfaceMu, WINGS } from "./constants";
import { CarSim, runRace, Schedule, stepOf, trackConditions } from "./simulate";
import type { Track } from "./track";
import { DEFAULT_SETUP, type CarSetup, type Conditions, type Instruction, type RaceResult, type WingLevel } from "./types";

/**
 * Generates a reference solution for a track: a closed-loop driver that decides what to
 * do from the car's position, but expresses every decision as a timed instruction.
 * Replaying those instructions open-loop gives the exact same run (the sim is
 * deterministic), which proves the track can be completed and calibrates its times.
 */
export interface AutopilotOptions {
  /** Fraction of the theoretical corner speed to use (safety margin). */
  cornerFactor?: number;
  /** Fraction of grip used when planning braking. */
  brakeFactor?: number;
  /** Steering decisions are issued every N steps. */
  steerEvery?: number;
}

export function speedProfile(
  track: Track,
  cornerFactor: number,
  brakeFactor: number,
  setup: CarSetup = DEFAULT_SETUP,
  conditions: Conditions = trackConditions(track),
): Float64Array {
  const { n, curv } = track;
  const mu = surfaceMu("asphalt", conditions);
  const clA = WINGS[setup.wing].clA;
  const top = kmhToMs(CAR.maxKmh);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = curv[i] === 0 ? top : maxCornerSpeed(1 / Math.abs(curv[i]), mu, clA) * cornerFactor;
  }
  if (!track.closed) {
    // come to a reasonable speed by the end of the open track
    v[n - 1] = Math.min(v[n - 1], top);
  }
  // backward pass: make sure we can brake in time (twice around for closed tracks)
  const passes = track.closed ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let k = n - 2 + (track.closed ? 1 : 0); k >= 0; k--) {
      const i = k;
      const j = (k + 1) % n;
      const ds = track.closed && j === 0 ? track.length - track.s[i] : track.s[j] - track.s[i];
      const brake = gripAccel(v[j], mu, clA) * brakeFactor;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * ds));
    }
  }
  return v;
}

export function autopilot(
  track: Track,
  opts: AutopilotOptions = {},
  extra: { maxFinishKmh?: number; setup?: CarSetup; conditions?: Conditions } = {},
): { instructions: Instruction[]; result: RaceResult } {
  const setup = extra.setup ?? DEFAULT_SETUP;
  const conditions = extra.conditions ?? trackConditions(track);
  const mu = surfaceMu("asphalt", conditions);
  const clA = WINGS[setup.wing].clA;
  const cornerFactor = opts.cornerFactor ?? 0.92;
  const brakeFactor = opts.brakeFactor ?? 0.7;
  const steerEvery = opts.steerEvery ?? 12;
  const profile = speedProfile(track, cornerFactor, brakeFactor, setup, conditions);

  if (extra.maxFinishKmh !== undefined) {
    // brake for the finish line on open tracks
    const target = kmhToMs(extra.maxFinishKmh) * 0.9;
    let fin = 0;
    while (fin < track.n - 1 && track.s[fin] < track.finishDistance) fin++;
    for (let i = fin; i >= 0; i--) {
      const ds = track.s[fin] - track.s[i];
      const brake = gripAccel(target, mu, clA) * brakeFactor;
      profile[i] = Math.min(profile[i], Math.sqrt(target * target + 2 * brake * ds));
    }
    for (let i = fin; i < track.n; i++) profile[i] = Math.min(profile[i], target);
  }

  const instructions: Instruction[] = [];
  const schedule = new Schedule();
  const car = new CarSim(track, setup, conditions);
  let lastKmh = -1;
  let nextId = 0;

  const emit = (ins: Omit<Instruction, "id" | "t">, step: number) => {
    const full: Instruction = { id: `ap${nextId++}`, t: step * DT, ...ins };
    instructions.push(full);
    schedule.push(full);
  };

  const sampleAt = (i: number, ahead: number) => {
    let j = i;
    let dist = 0;
    while (dist < ahead) {
      const nj = track.closed ? (j + 1) % track.n : Math.min(track.n - 1, j + 1);
      if (nj === j) break;
      dist += Math.hypot(track.xs[nj] - track.xs[j], track.ys[nj] - track.ys[j]);
      j = nj;
    }
    return j;
  };

  const controlsAt = (step: number) => {
    const i = car.hint;
    if (!car.spinning) {
      // speed: look slightly ahead in the profile
      const look = sampleAt(i, Math.max(2, car.u * 0.15));
      const targetKmh = Math.round(msToKmh(profile[look]));
      if (Math.abs(targetKmh - lastKmh) >= 3 || (targetKmh >= CAR.maxKmh && lastKmh !== CAR.maxKmh)) {
        const kmh = Math.min(CAR.maxKmh, targetKmh);
        emit({ action: { type: msToKmh(car.u) > kmh ? "brake" : "accelerate", targetKmh: kmh } }, step);
        lastKmh = kmh;
      }
      // steering: pure pursuit, re-evaluated on a fixed grid
      if (step % steerEvery === 0) {
        const ld = Math.max(8, car.u * 0.45);
        const tj = sampleAt(i, ld);
        const dx = track.xs[tj] - car.x;
        const dy = track.ys[tj] - car.y;
        const alpha = Math.atan2(dy, dx) - car.heading;
        const dist = Math.hypot(dx, dy);
        const delta = Math.atan2(2 * CAR.wheelbase * Math.sin(alpha), dist);
        const deg = Math.round((delta * 180) / Math.PI * 100) / 100;
        if (Math.abs(deg) >= 0.01) {
          emit(
            {
              action: {
                type: "steer",
                side: deg > 0 ? "left" : "right",
                degrees: Math.min(CAR.maxSteerDeg, Math.abs(deg)),
                duration: steerEvery * DT,
              },
            },
            step,
          );
        }
      }
    }
    return schedule.controlsAt(step);
  };

  const result = runRace(track, car, controlsAt, () => schedule.pending);
  // sanity: stepOf must map our times back to the same steps
  for (const ins of instructions) {
    if (Math.abs(stepOf(ins.t) * DT - ins.t) > 1e-9) throw new Error("autopilot time drift");
  }
  return { instructions, result };
}

/** Run the reference driver with every wing level and keep the fastest. */
export function bestAutopilot(
  track: Track,
  extra: { maxFinishKmh?: number; conditions?: Conditions } = {},
): { instructions: Instruction[]; result: RaceResult; setup: CarSetup } {
  let best: { instructions: Instruction[]; result: RaceResult; setup: CarSetup } | null = null;
  for (const wing of Object.keys(WINGS) as WingLevel[]) {
    const setup = { wing };
    const ap = autopilot(track, {}, { ...extra, setup });
    if (!ap.result.finished) continue;
    if (!best || (ap.result.time as number) < (best.result.time as number)) best = { ...ap, setup };
  }
  if (!best) throw new Error(`reference driver can't finish ${track.def.id}`);
  return best;
}
