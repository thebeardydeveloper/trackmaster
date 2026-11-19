import type { RaceProgress } from "../store/gameStore";
import { MAX_ATTEMPTS } from "../store/gameStore";
import { getRaceTrack } from "./catalog";
import { hashString, mulberry32 } from "./random";
import type { RaceSession } from "./session";

export const CHAMPIONSHIP_ROUNDS = ["anillo-del-sur", "valle-hondo", "bahia-ventosa"];
export const POINTS = [25, 18, 15, 12, 10, 8, 6];

/** Invented rival drivers; `gap` = how much slower than the track record they usually are. */
export const AI_DRIVERS = [
  { id: "montero", name: "Lía Montero", gap: 0.03 },
  { id: "asante", name: "Kofi Asante", gap: 0.06 },
  { id: "varga", name: "Ines Varga", gap: 0.1 },
  { id: "quiroga", name: "Tomás Quiroga", gap: 0.15 },
  { id: "takeda", name: "Mei Takeda", gap: 0.22 },
  { id: "salvatierra", name: "Bruno Salvatierra", gap: 0.3 },
];

export const PLAYER_ID = "player";

export const roundKey = (season: number, round: number) => `champ:${season}:${round}`;

export function roundSession(season: number, round: number): RaceSession {
  return {
    kind: "championship",
    key: roundKey(season, round),
    trackId: CHAMPIONSHIP_ROUNDS[round],
    label: `Campeonato T${season} · Ronda ${round + 1}/${CHAMPIONSHIP_ROUNDS.length}`,
    backHref: "/championship",
    season,
    round,
  };
}

/** A round is over once all attempts are used or the player closed it. */
export const roundDone = (p: RaceProgress | undefined) => !!p && (p.closed || p.attempts.length >= MAX_ATTEMPTS);

export function playerRoundTime(p: RaceProgress | undefined): number | null {
  let best: number | null = null;
  for (const a of p?.attempts ?? []) if (a.time !== null && (best === null || a.time < best)) best = a.time;
  return best;
}

/** Rival lap times for a round (deterministic per season). null = DNF. */
export function aiRoundTimes(season: number, round: number): { id: string; name: string; time: number | null }[] {
  const record = getRaceTrack(CHAMPIONSHIP_ROUNDS[round])!.recordTime;
  const rnd = mulberry32(hashString(`season-${season}-round-${round}`));
  return AI_DRIVERS.map((d) => {
    const form = (rnd() - 0.5) * 0.04; // ±2% day-to-day form
    const dnf = rnd() < 0.06;
    return { id: d.id, name: d.name, time: dnf ? null : record * (1 + d.gap + form) };
  });
}

export interface Classified {
  id: string;
  name: string;
  time: number | null;
  position: number;
  points: number;
  isPlayer: boolean;
}

export function classifyRound(season: number, round: number, playerTime: number | null): Classified[] {
  const rows = [...aiRoundTimes(season, round), { id: PLAYER_ID, name: "Vos", time: playerTime }];
  rows.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
  return rows.map((r, k) => ({
    ...r,
    position: k + 1,
    points: r.time === null ? 0 : (POINTS[k] ?? 0),
    isPlayer: r.id === PLAYER_ID,
  }));
}

export interface StandingRow {
  id: string;
  name: string;
  isPlayer: boolean;
  /** Points per round, null for rounds not raced yet. */
  rounds: (number | null)[];
  total: number;
}

/** Championship table after the rounds the player has finished. */
export function standings(season: number, race: Record<string, RaceProgress>): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const ensure = (id: string, name: string) => {
    if (!rows.has(id)) rows.set(id, { id, name, isPlayer: id === PLAYER_ID, rounds: CHAMPIONSHIP_ROUNDS.map(() => null), total: 0 });
    return rows.get(id)!;
  };
  ensure(PLAYER_ID, "Vos");
  AI_DRIVERS.forEach((d) => ensure(d.id, d.name));
  CHAMPIONSHIP_ROUNDS.forEach((_, r) => {
    const p = race[roundKey(season, r)];
    if (!roundDone(p)) return;
    for (const c of classifyRound(season, r, playerRoundTime(p))) {
      const row = ensure(c.id, c.name);
      row.rounds[r] = c.points;
      row.total += c.points;
    }
  });
  return [...rows.values()].sort((a, b) => b.total - a.total || (a.isPlayer ? -1 : 1));
}
