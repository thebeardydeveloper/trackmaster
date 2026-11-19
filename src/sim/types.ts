// Core simulation types. This module (and everything in src/sim) must stay free of
// React / Three.js so it can run in tests and, later, on the server.

export type SteerSide = "left" | "right";

export type Action =
  | { type: "accelerate"; targetKmh: number }
  | { type: "brake"; targetKmh: number }
  | { type: "steer"; side: SteerSide; degrees: number; duration: number }
  | { type: "coast" };

export type ActionType = Action["type"];

export interface Instruction {
  id: string;
  /** Seconds since the start of the race when the order is executed. */
  t: number;
  action: Action;
}

export type Surface = "asphalt" | "kerb" | "grass" | "gravel";

/** One recorded moment of the race, used by the renderer for playback. */
export interface Frame {
  t: number;
  x: number;
  y: number;
  /** Direction the car body points (radians, CCW from +x). */
  heading: number;
  /** Speed in m/s. */
  speed: number;
  /** Actual front-wheel steering angle in degrees (left positive). */
  steer: number;
  /** Distance travelled along the track centerline (m), unwrapped. */
  progress: number;
  surface: Surface;
  spinning: boolean;
  /** How much the tyres are sliding, 0..1 (for sound and visual effects only). */
  slip: number;
  /** Braking hard (for sound and visual effects only). */
  braking: boolean;
}

export type RaceEventType = "offtrack" | "spin" | "wall";

export interface RaceEvent {
  type: RaceEventType;
  t: number;
  x: number;
  y: number;
  /** Speed (km/h) when the event happened. */
  kmh: number;
  /** Index of the corner closest to the event, if any. */
  corner: number | null;
}

export type DnfReason = "timeout" | "stopped";

export interface RaceResult {
  finished: boolean;
  /** Lap / run time in seconds when finished. */
  time: number | null;
  dnfReason: DnfReason | null;
  /** Speed (km/h) when crossing the finish line. */
  finishKmh: number | null;
  maxKmh: number;
  /** Fraction of the required distance covered (0..1). */
  completion: number;
  events: RaceEvent[];
  frames: Frame[];
  /** Highest speed reached while entering each corner (km/h), indexed by corner. */
  cornerEntryKmh: (number | null)[];
}

export type WingLevel = "low" | "medium" | "high";

/** Choices the player makes before each attempt. */
export interface CarSetup {
  wing: WingLevel;
}

/** Weather of a session. Fixed per circuit so times stay comparable. */
export interface Conditions {
  rain: boolean;
  windKmh: number;
  /** Direction the wind blows towards (degrees, CCW from +x in track coordinates). */
  windToDeg: number;
}

export const DEFAULT_SETUP: CarSetup = { wing: "medium" };
export const DRY_CALM: Conditions = { rain: false, windKmh: 0, windToDeg: 0 };
