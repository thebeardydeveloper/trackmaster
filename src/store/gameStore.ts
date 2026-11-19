"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETUP, DRY_CALM, type CarSetup, type Conditions, type DnfReason, type Instruction } from "../sim/types";

export const MAX_ATTEMPTS = 3;

export interface Attempt {
  time: number | null;
  dnfReason: DnfReason | null;
  /** Snapshot of the instructions used: re-simulating them reproduces the run exactly. */
  instructions: Instruction[];
  at: number;
  /** Missing on attempts saved before setups existed (= medium wing). */
  setup?: CarSetup;
  /** Missing on attempts saved before weather existed (= dry, no wind). */
  conditions?: Conditions;
}

/** Everything needed to re-simulate an attempt exactly as it was run. */
export const attemptConfig = (a: Attempt) => ({ setup: a.setup ?? DEFAULT_SETUP, conditions: a.conditions ?? DRY_CALM });

export interface RaceProgress {
  draft: Instruction[];
  attempts: Attempt[];
  /** Car setup for the next attempt. */
  setup?: CarSetup;
  /** Championship: the player ended the round before using every attempt. */
  closed?: boolean;
  /** The base plan was already loaded once (don't regenerate if the player clears it). */
  baseLoaded?: boolean;
}

export interface TrainingProgress {
  draft: Instruction[];
  runs: number;
  bestTime: number | null;
  stars: number;
  lastInstructions: Instruction[] | null;
  /** Instructions of the best run (for the ghost). */
  bestInstructions?: Instruction[] | null;
}

/** Which ghost car to race against. */
export type GhostMode = "best" | "record" | "off";

export interface Settings {
  muted: boolean;
  ghost: GhostMode;
}

interface GameState {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  race: Record<string, RaceProgress>;
  training: Record<string, TrainingProgress>;
  setRaceDraft: (id: string, draft: Instruction[]) => void;
  setRaceSetup: (id: string, setup: CarSetup) => void;
  closeRace: (id: string) => void;
  loadRaceBase: (id: string, draft: Instruction[]) => void;
  championship: { season: number };
  newSeason: () => void;
  addRaceAttempt: (id: string, attempt: Attempt) => void;
  setTrainingDraft: (id: string, draft: Instruction[]) => void;
  addTrainingRun: (id: string, run: { time: number | null; stars: number; instructions: Instruction[] }) => void;
  resetRace: (id: string) => void;
}

const emptyRace = (): RaceProgress => ({ draft: [], attempts: [] });
const emptyTraining = (): TrainingProgress => ({ draft: [], runs: 0, bestTime: null, stars: 0, lastInstructions: null });

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      settings: { muted: false, ghost: "best" },
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      race: {},
      training: {},
      setRaceDraft: (id, draft) =>
        set((s) => ({ race: { ...s.race, [id]: { ...(s.race[id] ?? emptyRace()), draft } } })),
      setRaceSetup: (id, setup) =>
        set((s) => ({ race: { ...s.race, [id]: { ...(s.race[id] ?? emptyRace()), setup } } })),
      loadRaceBase: (id, draft) =>
        set((s) => ({ race: { ...s.race, [id]: { ...(s.race[id] ?? emptyRace()), draft, baseLoaded: true } } })),
      closeRace: (id) => set((s) => ({ race: { ...s.race, [id]: { ...(s.race[id] ?? emptyRace()), closed: true } } })),
      championship: { season: 1 },
      newSeason: () => set((s) => ({ championship: { season: s.championship.season + 1 } })),
      addRaceAttempt: (id, attempt) =>
        set((s) => {
          const cur = s.race[id] ?? emptyRace();
          if (cur.attempts.length >= MAX_ATTEMPTS || cur.closed) return s;
          return { race: { ...s.race, [id]: { ...cur, attempts: [...cur.attempts, attempt] } } };
        }),
      setTrainingDraft: (id, draft) =>
        set((s) => ({ training: { ...s.training, [id]: { ...(s.training[id] ?? emptyTraining()), draft } } })),
      addTrainingRun: (id, run) =>
        set((s) => {
          const cur = s.training[id] ?? emptyTraining();
          const better = run.stars > 0 && (cur.bestTime === null || (run.time !== null && run.time < cur.bestTime));
          return {
            training: {
              ...s.training,
              [id]: {
                ...cur,
                // the first run may use the level's starter nodes, which were never saved as a draft
                draft: cur.draft.length ? cur.draft : run.instructions,
                runs: cur.runs + 1,
                bestTime: better ? run.time : cur.bestTime,
                bestInstructions: better ? run.instructions : (cur.bestInstructions ?? null),
                stars: Math.max(cur.stars, run.stars),
                lastInstructions: run.instructions,
              },
            },
          };
        }),
      resetRace: (id) => set((s) => ({ race: { ...s.race, [id]: emptyRace() } })),
    }),
    { name: "trackmaster-v1" },
  ),
);

export function bestAttempt(p: RaceProgress | undefined): Attempt | null {
  if (!p) return null;
  let best: Attempt | null = null;
  for (const a of p.attempts) if (a.time !== null && (best === null || a.time < (best.time as number))) best = a;
  return best;
}
