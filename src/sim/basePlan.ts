import { cornerLimitKmh, gripAccel, kmhToMs, surfaceMu, WINGS } from "./constants";
import { simulate, trackConditions } from "./simulate";
import { project, type Track } from "./track";
import { DEFAULT_SETUP, type CarSetup, type Conditions, type Instruction, type RaceResult } from "./types";

/**
 * A simple, readable plan that finishes the lap: cruise at `cruiseKmh`, one steer
 * order per corner, and brake/accelerate only around corners too tight for the cruise
 * speed. Every time is rounded (0.05 s) and every corner is tuned with open-loop
 * simulations of the already-rounded plan, so what you see is exactly what runs.
 */
export function basePlan(
  track: Track,
  setup: CarSetup = DEFAULT_SETUP,
  conditions: Conditions = trackConditions(track),
  cruiseKmh = 100,
): Instruction[] {
  const r05 = (t: number) => Math.max(0, Math.round(t * 20) / 20);
  const opts = { setup, conditions };
  let id = 0;
  const node = (t: number, action: Instruction["action"]): Instruction => ({ id: `base${id++}`, t: r05(t), action });
  const nodes: Instruction[] = [node(0, { type: "accelerate", targetKmh: cruiseKmh })];

  const run = (list: Instruction[], stopAt?: number) => simulate(track, list, { ...opts, stopAtProgress: stopAt });
  const timeAt = (r: RaceResult, distance: number) => r.frames.find((f) => f.progress >= distance)?.t ?? null;

  /**
   * How well lined up the car leaves a corner: the worst lateral offset it will have
   * along the following straight (now, and at its end given the heading error).
   */
  const score = (r: RaceResult, since: number, straight: number) => {
    const f = r.frames[r.frames.length - 1];
    const p = project(track, f.x, f.y, -1);
    let dh = f.heading - track.hdg[p.i];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const later = p.lateral + Math.tan(dh) * straight;
    const trouble = r.events.filter((e) => e.t >= since && e.type !== "offtrack").length * 1000 + r.events.filter((e) => e.t >= since).length * 200;
    return Math.max(Math.abs(p.lateral), Math.abs(later)) + trouble;
  };

  const mu = surfaceMu("asphalt", conditions);
  const clA = WINGS[setup.wing].clA;

  /** Speed to take a corner at: the cruise speed, or a safe margin under its limit. */
  const targetFor = (radius: number) =>
    Math.min(cruiseKmh, Math.floor((cornerLimitKmh(radius, setup.wing, conditions) * 0.88) / 5) * 5);

  track.corners.forEach((c, k) => {
    const next = track.corners[k + 1];
    const target = targetFor(c.radius);
    const slow = target < cruiseKmh;
    // after a slow corner speed back up, but not past what a corner right behind it allows
    const nextClose = next && next.sStart - c.sEnd < 80;
    const resumeKmh = nextClose ? Math.min(cruiseKmh, Math.max(target, targetFor(next.radius))) : cruiseKmh;

    if (slow) {
      // brake so the target speed is reached a little before the corner
      const v0 = kmhToMs(cruiseKmh);
      const v1 = kmhToMs(target);
      const decel = gripAccel(v1, mu, clA) * 0.6;
      const brakeDist = (v0 * v0 - v1 * v1) / (2 * decel) + 15;
      const probe = run(nodes, c.sStart);
      const tb = timeAt(probe, Math.max(0, c.sStart - brakeDist));
      if (tb !== null) nodes.push(node(tb, { type: "brake", targetKmh: target }));
    }

    const probe = run(nodes, c.sStart);
    const tEntry = timeAt(probe, c.sStart);
    if (tEntry === null) return;
    const v = kmhToMs(target);
    const estimate = (c.sEnd - c.sStart) / v;
    const degrees = Math.round(c.steerDeg * 10) / 10;
    const exitCheck = Math.min(c.sEnd + 8, next ? next.sStart - 1 : Infinity, track.finishDistance);
    const straight = Math.max(0, (next ? next.sStart : track.finishDistance) - exitCheck);

    const tryPlan = (t: number, duration: number) => {
      const steer = node(t, { type: "steer", side: c.dir, degrees, duration: r05(duration) });
      const extra = slow && resumeKmh > target ? [node(t + duration, { type: "accelerate", targetKmh: resumeKmh })] : [];
      const list = [...nodes, steer, ...extra];
      return { list, s: score(run(list, exitCheck), t - 0.5, straight) };
    };

    // tune the duration, then nudge the start
    let best = tryPlan(tEntry, estimate);
    let bestDur = estimate;
    for (let d = -8; d <= 8; d++) {
      if (d === 0) continue;
      const dur = estimate + d * 0.05;
      if (dur <= 0.1) continue;
      const cand = tryPlan(tEntry, dur);
      if (cand.s < best.s) {
        best = cand;
        bestDur = dur;
      }
    }
    for (const dt of [-0.15, -0.1, -0.05, 0.05, 0.1]) {
      const cand = tryPlan(tEntry + dt, bestDur);
      if (cand.s < best.s) best = cand;
    }
    nodes.splice(0, nodes.length, ...best.list);
  });

  return nodes.map((n, k) => ({ ...n, id: `base${k}` }));
}
