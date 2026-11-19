import type { Conditions } from "../sim/types";

/**
 * One place where you race a circuit with 3 attempts: free race, daily challenge or a
 * championship round. Attempts are stored under `key`.
 */
export interface RaceSession {
  kind: "race" | "daily" | "championship";
  key: string;
  trackId: string;
  /** Overrides the circuit's own weather (daily challenge). */
  conditions?: Conditions;
  /** Badge shown in the header. */
  label: string;
  backHref: string;
  /** Championship: season number and round index. */
  season?: number;
  round?: number;
}

export const freeRaceSession = (trackId: string): RaceSession => ({
  kind: "race",
  // free race keeps the plain track id as key (attempts saved before sessions existed)
  key: trackId,
  trackId,
  label: "Carrera",
  backHref: "/",
});
