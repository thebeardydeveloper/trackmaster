import { describe, expect, it } from "vitest";
import { getRaceTrack, getTrainingTrack, RACE_IDS, starsFor, TRAINING_IDS } from "../game/catalog";
import { RACE_TRACKS } from "../tracks/race";
import { CAR, steerForRadius } from "./constants";
import { simulate, Schedule } from "./simulate";
import { buildTrack, type TrackDef } from "./track";
import type { Instruction } from "./types";

const straight: TrackDef = {
  id: "test-straight",
  name: "",
  description: "",
  closed: false,
  segments: [{ type: "straight", length: 3000 }],
  timeLimit: 60,
  scenery: { seed: 1, trees: 0 },
};
const straightTrack = buildTrack(straight);
/** Same straight with a huge runoff, to drive circles without touching walls. */
const openField = buildTrack({ ...straight, id: "test-field", runoffWidth: 300 });

const node = (t: number, action: Instruction["action"], id = `${t}-${action.type}`): Instruction => ({ id, t, action });

const pathLength = (frames: { t: number; x: number; y: number }[], t0: number, t1: number) => {
  let d = 0;
  for (let k = 1; k < frames.length; k++) {
    if (frames[k].t <= t0 || frames[k].t > t1) continue;
    d += Math.hypot(frames[k].x - frames[k - 1].x, frames[k].y - frames[k - 1].y);
  }
  return d;
};

/** First time (s) the car reaches a speed (km/h). */
const timeToKmh = (r: ReturnType<typeof simulate>, kmh: number) => r.frames.find((f) => f.speed * 3.6 >= kmh)?.t ?? Infinity;

describe("car physics", () => {
  const full = simulate(straightTrack, [node(0, { type: "accelerate", targetKmh: 340 })], { timeLimit: 40 });

  it("accelerates 0-100 km/h in a single-seater range", () => {
    const t = timeToKmh(full, 100);
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(3.2);
  });

  it("reaches a top speed above 300 km/h", () => {
    expect(full.maxKmh).toBeGreaterThan(300);
    expect(full.maxKmh).toBeLessThanOrEqual(CAR.maxKmh);
  });

  it("holds the requested speed", () => {
    const r = simulate(straightTrack, [node(0, { type: "accelerate", targetKmh: 150 })], { timeLimit: 15 });
    const last = r.frames[r.frames.length - 1];
    expect(last.speed * 3.6).toBeCloseTo(150, 0);
  });

  it("brakes from 300 to 100 km/h in a plausible distance", () => {
    const r = simulate(
      straightTrack,
      [node(0, { type: "accelerate", targetKmh: 300 }), node(14, { type: "brake", targetKmh: 100 })],
      { timeLimit: 20 },
    );
    const start = r.frames.find((f) => f.t >= 14)!;
    const end = r.frames.find((f) => f.t > 14 && f.speed * 3.6 <= 101)!;
    expect(start.speed * 3.6).toBeGreaterThan(290);
    const dist = end.progress - start.progress;
    expect(dist).toBeGreaterThan(60);
    expect(dist).toBeLessThan(160);
  });

  it("spins when steering hard at high speed, but not at low speed", () => {
    const fast = simulate(
      straightTrack,
      [node(0, { type: "accelerate", targetKmh: 200 }), node(8, { type: "steer", side: "left", degrees: 20, duration: 1 })],
      { timeLimit: 15 },
    );
    expect(fast.events.some((e) => e.type === "spin")).toBe(true);

    const slow = simulate(
      straightTrack,
      [node(0, { type: "accelerate", targetKmh: 30 }), node(3, { type: "steer", side: "left", degrees: 10, duration: 0.5 })],
      { timeLimit: 8 },
    );
    expect(slow.events.some((e) => e.type === "spin")).toBe(false);
  });

  it("slows down on grass", () => {
    const onTrack = simulate(straightTrack, [node(0, { type: "accelerate", targetKmh: 340 })], { timeLimit: 12 });
    const offTrack = simulate(
      straightTrack,
      [node(0, { type: "accelerate", targetKmh: 340 }), node(2, { type: "steer", side: "left", degrees: 3, duration: 0.6 })],
      { timeLimit: 12 },
    );
    expect(offTrack.events.some((e) => e.type === "offtrack")).toBe(true);
    const a = onTrack.frames[onTrack.frames.length - 1].progress;
    const b = offTrack.frames[offTrack.frames.length - 1].progress;
    expect(b).toBeLessThan(a - 50);
  });

  it("follows a circle of the expected radius with the suggested steering angle", () => {
    const radius = 50;
    const r = simulate(
      openField,
      [node(0, { type: "accelerate", targetKmh: 60 }), node(5, { type: "steer", side: "left", degrees: steerForRadius(radius), duration: 20 })],
      { timeLimit: 15 },
    );
    const a = r.frames.find((f) => f.t >= 7)!;
    const b = r.frames.find((f) => f.t >= 12)!;
    const mean = pathLength(r.frames, a.t, b.t) / Math.abs(b.heading - a.heading);
    expect(mean).toBeGreaterThan(radius * 0.85);
    expect(mean).toBeLessThan(radius * 1.15);
  });
});

describe("instructions", () => {
  it("a new steer order replaces the previous one and the wheel recenters after", () => {
    const s = new Schedule([
      node(0, { type: "steer", side: "left", degrees: 5, duration: 2 }),
      node(1, { type: "steer", side: "right", degrees: 3, duration: 0.5 }),
    ]);
    expect(s.controlsAt(60).steerDeg).toBe(5); // 0.5 s
    expect(s.controlsAt(150).steerDeg).toBe(-3); // 1.25 s
    expect(s.controlsAt(200).steerDeg).toBe(0); // 1.67 s: right order ended, left one was replaced
  });

  it("is deterministic and independent of node order in the list", () => {
    const nodes = [
      node(0, { type: "accelerate", targetKmh: 250 }),
      node(9, { type: "brake", targetKmh: 120 }),
      node(10, { type: "steer", side: "right", degrees: 4, duration: 1.2 }),
      node(12, { type: "coast" }),
    ];
    const a = simulate(straightTrack, nodes, { timeLimit: 20 });
    const b = simulate(straightTrack, [...nodes].reverse(), { timeLimit: 20 });
    expect(b.frames).toEqual(a.frames);
  });

  it("reports a DNF when the car stops with nothing left to do", () => {
    const r = simulate(straightTrack, [node(0, { type: "accelerate", targetKmh: 100 }), node(5, { type: "brake", targetKmh: 0 })]);
    expect(r.finished).toBe(false);
    expect(r.dnfReason).toBe("stopped");
  });
});

describe("tracks", () => {
  it.each(RACE_TRACKS.map((t) => t.id))("%s closes and keeps sections apart", (id) => {
    const t = getRaceTrack(id)!.track;
    expect(Math.hypot(t.xs[t.n - 1] - t.xs[0], t.ys[t.n - 1] - t.ys[0])).toBeLessThan(2);
    let worst = Infinity;
    for (let i = 0; i < t.n; i += 3) {
      for (let j = 0; j < t.n; j += 3) {
        let d = Math.abs(t.s[i] - t.s[j]);
        d = Math.min(d, t.length - d);
        if (d < 120) continue;
        const dist = Math.hypot(t.xs[i] - t.xs[j], t.ys[i] - t.ys[j]);
        worst = Math.min(worst, dist - (Math.max(t.wallL[i], t.wallR[i]) + t.halfWidth + 2));
      }
    }
    expect(worst).toBeGreaterThan(0);
  });

  it.each(RACE_IDS)("reference solution completes %s and replays identically", (id) => {
    const info = getRaceTrack(id)!;
    const replay = simulate(info.track, info.reference, { setup: info.referenceSetup });
    expect(replay.finished).toBe(true);
    expect(replay.time).toBe(info.recordTime);
    expect(replay.events).toHaveLength(0);
  });

  it.each(TRAINING_IDS)("reference solution earns 3 stars on training level %s", (id) => {
    const info = getTrainingTrack(id)!;
    const r = simulate(info.track, info.reference);
    expect(r.finished).toBe(true);
    expect(starsFor(info, r.time, r.finishKmh)).toBe(3);
  });

  it("training level 2 can be passed with a simple hand-written plan", () => {
    const info = getTrainingTrack("una-curva")!;
    const c = info.track.corners[0];
    const r = simulate(info.track, [
      node(0, { type: "accelerate", targetKmh: 100 }),
      node(12.1, { type: "steer", side: "right", degrees: Math.round(c.steerDeg * 10) / 10, duration: 2.3 }),
    ]);
    expect(r.finished).toBe(true);
    expect(r.events.filter((e) => e.type !== "offtrack")).toHaveLength(0);
  });

  it("training level 1 fails if you cross the line too fast", () => {
    const info = getTrainingTrack("recta")!;
    const r = simulate(info.track, [node(0, { type: "accelerate", targetKmh: 200 })]);
    expect(r.finished).toBe(true);
    expect(starsFor(info, r.time, r.finishKmh)).toBe(0);
  });
});

describe("sectors", () => {
  it("sector times add up to the lap time and the progress lookup matches", async () => {
    const { sectorTimes, progressTimeline, lookupTime, sectorBounds } = await import("./sectors");
    const info = getRaceTrack(RACE_IDS[0])!;
    const r = simulate(info.track, info.reference, { setup: info.referenceSetup });
    const secs = sectorTimes(info.track, r);
    expect(secs.every((t) => t !== null && t > 0)).toBe(true);
    expect((secs as number[]).reduce((a, b) => a + b, 0)).toBeCloseTo(r.time!, 6);
    const line = progressTimeline(r, info.track.finishDistance);
    const b = sectorBounds(info.track)[0];
    expect(lookupTime(line, b)).toBeCloseTo(secs[0]!, 1);
  });

  it("colours sectors like the TV graphics", async () => {
    const { sectorColor } = await import("./sectors");
    expect(sectorColor(10, 11, 10.5)).toBe("purple");
    expect(sectorColor(10.8, 11, 10.5)).toBe("green");
    expect(sectorColor(11.2, 11, 10.5)).toBe("yellow");
    expect(sectorColor(11.2, null, 10.5)).toBe("green");
  });
});

describe("setup and weather", () => {
  const field = buildTrack({ ...straight, id: "test-field-2", halfWidth: 300, runoffWidth: 10 }); // all asphalt
  const flatOut = [node(0, { type: "accelerate", targetKmh: 360 })];

  it("a low wing is faster on the straight, a high wing grips more", async () => {
    const { topSpeedKmh, cornerLimitKmh } = await import("./constants");
    const { DRY_CALM } = await import("./types");
    expect(topSpeedKmh("low")).toBeGreaterThan(topSpeedKmh("medium"));
    expect(topSpeedKmh("medium")).toBeGreaterThan(topSpeedKmh("high"));
    expect(cornerLimitKmh(60, "high", DRY_CALM)).toBeGreaterThan(cornerLimitKmh(60, "low", DRY_CALM));
    const low = simulate(straightTrack, flatOut, { timeLimit: 40, setup: { wing: "low" } });
    const high = simulate(straightTrack, flatOut, { timeLimit: 40, setup: { wing: "high" } });
    expect(low.maxKmh).toBeGreaterThan(high.maxKmh + 30);
  });

  it("rain lowers the cornering limit and makes the same corner spin", async () => {
    const { cornerLimitKmh } = await import("./constants");
    const wet = { rain: true, windKmh: 0, windToDeg: 0 };
    const dry = { rain: false, windKmh: 0, windToDeg: 0 };
    expect(cornerLimitKmh(50, "medium", wet)).toBeLessThan(cornerLimitKmh(50, "medium", dry) * 0.9);
    const plan = [node(0, { type: "accelerate", targetKmh: 160 }), node(9, { type: "steer", side: "left", degrees: 3, duration: 1.5 })];
    expect(simulate(field, plan, { conditions: dry, timeLimit: 12 }).events.some((e) => e.type === "spin")).toBe(false);
    expect(simulate(field, plan, { conditions: wet, timeLimit: 12 }).events.some((e) => e.type === "spin")).toBe(true);
  });

  it("a headwind lowers top speed and a tailwind raises it", () => {
    const head = simulate(straightTrack, flatOut, { timeLimit: 40, conditions: { rain: false, windKmh: 30, windToDeg: 180 } });
    const tail = simulate(straightTrack, flatOut, { timeLimit: 40, conditions: { rain: false, windKmh: 30, windToDeg: 0 } });
    const calm = simulate(straightTrack, flatOut, { timeLimit: 40 });
    expect(head.maxKmh).toBeLessThan(calm.maxKmh - 5);
    expect(tail.maxKmh).toBeGreaterThan(calm.maxKmh + 5);
  });

  it("the reference driver picks the fastest wing per circuit", () => {
    expect(getRaceTrack("anillo-del-sur")!.referenceSetup.wing).toBe("low");
    expect(getRaceTrack("valle-hondo")!.referenceSetup.wing).toBe("high");
  });
});
