import type { Conditions } from "../sim/types";
import type { RaceProgress } from "../store/gameStore";
import { RACE_TRACKS } from "../tracks/race";
import { hashString, mulberry32 } from "./random";
import type { RaceSession } from "./session";

/** Local calendar date as YYYY-MM-DD. */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return localDateStr(new Date(y, m - 1, d + days));
}

export const dailyKey = (dateStr: string) => `daily:${dateStr}`;

/** The same circuit and weather for everyone on a given day. */
export function dailyChallenge(dateStr: string): { dateStr: string; trackId: string; conditions: Conditions } {
  const rnd = mulberry32(hashString(`trackmaster-daily-${dateStr}`));
  const trackId = RACE_TRACKS[Math.floor(rnd() * RACE_TRACKS.length)].id;
  const conditions: Conditions = {
    rain: rnd() < 0.35,
    windKmh: [0, 10, 20, 30, 40][Math.floor(rnd() * 5)],
    windToDeg: Math.floor(rnd() * 24) * 15,
  };
  return { dateStr, trackId, conditions };
}

export function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

export function dailySession(dateStr: string): RaceSession {
  const c = dailyChallenge(dateStr);
  return {
    kind: "daily",
    key: dailyKey(dateStr),
    trackId: c.trackId,
    conditions: c.conditions,
    label: `Desafío diario · ${formatDay(dateStr)}`,
    backHref: "/",
  };
}

const bestTime = (p: RaceProgress | undefined) => {
  let best: number | null = null;
  for (const a of p?.attempts ?? []) if (a.time !== null && (best === null || a.time < best)) best = a.time;
  return best;
};

/** Consecutive days (ending today, or yesterday if today isn't done yet) with a finished lap. */
export function dailyStreak(race: Record<string, RaceProgress>, today: string): number {
  let day = bestTime(race[dailyKey(today)]) !== null ? today : shiftDate(today, -1);
  let n = 0;
  while (bestTime(race[dailyKey(day)]) !== null) {
    n++;
    day = shiftDate(day, -1);
  }
  return n;
}

export function dailyHistory(race: Record<string, RaceProgress>, today: string, days = 7) {
  return Array.from({ length: days }, (_, k) => {
    const dateStr = shiftDate(today, -k);
    const p = race[dailyKey(dateStr)];
    return { ...dailyChallenge(dateStr), played: (p?.attempts.length ?? 0) > 0, best: bestTime(p) };
  });
}
