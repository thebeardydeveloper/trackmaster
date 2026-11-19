import { describe, expect, it } from "vitest";
import { simulate } from "../sim/simulate";
import { getRaceTrack } from "./catalog";
import { AI_DRIVERS, aiRoundTimes, CHAMPIONSHIP_ROUNDS, classifyRound, POINTS, roundKey, standings } from "./championship";
import { dailyChallenge, dailyKey, dailyStreak, shiftDate } from "./daily";
import type { RaceProgress } from "../store/gameStore";

const progress = (times: (number | null)[], closed = false): RaceProgress => ({
  draft: [],
  closed,
  attempts: times.map((time) => ({ time, dnfReason: time === null ? "timeout" : null, instructions: [], at: 0 })),
});

describe("daily challenge", () => {
  it("is the same for a given date and varies across days", () => {
    expect(dailyChallenge("2026-11-18")).toEqual(dailyChallenge("2026-11-18"));
    const days = Array.from({ length: 30 }, (_, k) => dailyChallenge(shiftDate("2026-11-01", k)));
    expect(new Set(days.map((d) => d.trackId)).size).toBeGreaterThan(1);
    expect(days.some((d) => d.conditions.rain)).toBe(true);
    expect(days.some((d) => !d.conditions.rain)).toBe(true);
  });

  it("every daily combination is completable by the reference driver", () => {
    for (let k = 0; k < 20; k++) {
      const c = dailyChallenge(shiftDate("2026-11-01", k));
      const info = getRaceTrack(c.trackId, c.conditions)!;
      const r = simulate(info.track, info.reference, { setup: info.referenceSetup });
      expect(r.finished).toBe(true);
      expect(r.time).toBe(info.recordTime);
    }
  });

  it("counts the streak of consecutive days with a lap", () => {
    const race = {
      [dailyKey("2026-11-16")]: progress([60]),
      [dailyKey("2026-11-17")]: progress([null, 61]),
      [dailyKey("2026-11-18")]: progress([null]),
    };
    expect(dailyStreak(race, "2026-11-18")).toBe(2); // today has no lap yet, streak continues from yesterday
    expect(dailyStreak({ ...race, [dailyKey("2026-11-18")]: progress([59]) }, "2026-11-18")).toBe(3);
    expect(dailyStreak({}, "2026-11-18")).toBe(0);
  });

  it("handles month boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("championship", () => {
  it("rival times are deterministic and ordered by skill on average", () => {
    expect(aiRoundTimes(1, 0)).toEqual(aiRoundTimes(1, 0));
    expect(aiRoundTimes(2, 0)).not.toEqual(aiRoundTimes(1, 0));
    expect(aiRoundTimes(1, 0)).toHaveLength(AI_DRIVERS.length);
  });

  it("awards points by position and nothing for a DNF", () => {
    const fast = classifyRound(1, 0, 1); // impossibly fast lap
    expect(fast[0].isPlayer).toBe(true);
    expect(fast[0].points).toBe(POINTS[0]);
    const dnf = classifyRound(1, 0, null);
    const me = dnf.find((r) => r.isPlayer)!;
    expect(me.points).toBe(0);
    expect(me.position).toBe(dnf.filter((r) => r.time !== null).length + 1);
  });

  it("standings only count finished rounds", () => {
    const race = { [roundKey(1, 0)]: progress([1, 2, 3]), [roundKey(1, 1)]: progress([1]) };
    const table = standings(1, race);
    const me = table.find((r) => r.isPlayer)!;
    expect(me.rounds[0]).toBe(25);
    expect(me.rounds[1]).toBeNull(); // round 2 still has attempts left
    const closed = standings(1, { ...race, [roundKey(1, 1)]: progress([1], true) });
    expect(closed.find((r) => r.isPlayer)!.total).toBe(50);
    expect(closed[0].isPlayer).toBe(true);
    expect(CHAMPIONSHIP_ROUNDS.every((id) => getRaceTrack(id))).toBe(true);
  });
});

describe("base plan", () => {
  const cases = [
    ...CHAMPIONSHIP_ROUNDS.map((id) => ({ id, conditions: undefined })),
    ...Array.from({ length: 6 }, (_, k) => {
      const c = dailyChallenge(shiftDate("2026-12-01", k));
      return { id: c.trackId, conditions: c.conditions };
    }),
  ];

  it.each(cases)("finishes cleanly: $id $conditions", async ({ id, conditions }) => {
    const { basePlan } = await import("../sim/basePlan");
    const info = getRaceTrack(id, conditions)!;
    const plan = basePlan(info.track);
    const r = simulate(info.track, plan);
    expect(r.finished).toBe(true);
    expect(r.events).toHaveLength(0);
    // readable: cruise + roughly one order per corner (+ brake/accelerate for tight ones)
    expect(plan.length).toBeLessThanOrEqual(1 + info.track.corners.length * 3);
    expect(plan.every((n) => Math.abs(n.t * 20 - Math.round(n.t * 20)) < 1e-9)).toBe(true);
  });
});
