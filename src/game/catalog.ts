import { autopilot, bestAutopilot } from "../sim/autopilot";
import { buildTrack, type Track } from "../sim/track";
import { DEFAULT_SETUP, type CarSetup, type Conditions, type Instruction } from "../sim/types";
import { RACE_TRACKS } from "../tracks/race";
import { TRAINING_LEVELS, type TrainingLevel } from "../tracks/training";

export interface RaceTrackInfo {
  kind: "race";
  id: string;
  track: Track;
  /** Lap time of the built-in reference driver: the seeded track record (s). */
  recordTime: number;
  /** Seeded average time shown before real player data exists (s). */
  averageTime: number;
  reference: Instruction[];
  /** Wing the reference driver used (the fastest of the three). */
  referenceSetup: CarSetup;
}

export interface TrainingTrackInfo {
  kind: "training";
  id: string;
  level: TrainingLevel;
  track: Track;
  referenceTime: number;
  stars: { three: number; two: number };
  reference: Instruction[];
  referenceSetup: CarSetup;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

const raceCache = new Map<string, RaceTrackInfo>();
const trainingCache = new Map<string, TrainingTrackInfo>();

export const RACE_IDS = RACE_TRACKS.map((t) => t.id);
export const TRAINING_IDS = TRAINING_LEVELS.map((l) => l.id);

/**
 * A race circuit with its reference (record) lap. `conditions` overrides the circuit's
 * own weather (daily challenge); the track, record and ghosts all use it.
 */
export function getRaceTrack(id: string, conditions?: Conditions): RaceTrackInfo | null {
  const key = conditions ? `${id}|${JSON.stringify(conditions)}` : id;
  const cached = raceCache.get(key);
  if (cached) return cached;
  const base = RACE_TRACKS.find((t) => t.id === id);
  if (!base) return null;
  const def = conditions ? { ...base, conditions } : base;
  const track = buildTrack(def);
  const ap = bestAutopilot(track);
  if (ap.result.time === null) throw new Error(`reference driver can't finish ${id}`);
  const info: RaceTrackInfo = {
    kind: "race",
    id,
    track,
    recordTime: ap.result.time,
    averageTime: round1(ap.result.time * 1.3),
    reference: ap.instructions,
    referenceSetup: ap.setup,
  };
  raceCache.set(key, info);
  return info;
}

export function getTrainingTrack(id: string): TrainingTrackInfo | null {
  const cached = trainingCache.get(id);
  if (cached) return cached;
  const level = TRAINING_LEVELS.find((l) => l.id === id);
  if (!level) return null;
  const track = buildTrack(level.track);
  const ap = autopilot(track, {}, { maxFinishKmh: level.maxFinishKmh });
  if (!ap.result.finished || ap.result.time === null) throw new Error(`reference driver can't finish ${id}`);
  const info: TrainingTrackInfo = {
    kind: "training",
    id,
    level,
    track,
    referenceTime: ap.result.time,
    stars: { three: round1(ap.result.time * 1.05), two: round1(ap.result.time * 1.3) },
    reference: ap.instructions,
    referenceSetup: DEFAULT_SETUP,
  };
  trainingCache.set(id, info);
  return info;
}

/** Stars for a training run: 0 = not passed. */
export function starsFor(info: TrainingTrackInfo, time: number | null, finishKmh: number | null): number {
  if (time === null) return 0;
  const max = info.level.maxFinishKmh;
  if (max !== undefined && finishKmh !== null && finishKmh > max) return 0;
  if (time <= info.stars.three) return 3;
  if (time <= info.stars.two) return 2;
  return 1;
}
