import type { Conditions, Surface, WingLevel } from "./types";

export const G = 9.81;
export const RHO = 1.225;

/** Fixed simulation step (s). Never change without re-validating every track. */
export const DT = 1 / 120;
/** A frame is recorded every N steps (60 Hz playback). */
export const FRAME_EVERY = 2;

export const CAR = {
  mass: 800, // kg (car + driver)
  wheelbase: 3.6, // m
  power: 750_000, // W
  /** Max acceleration the rear tyres can put down at low speed on asphalt (m/s²). */
  maxTractionAccel: 11.5,
  rollDecel: 0.15, // rolling resistance (m/s²)
  maxSteerDeg: 30, // front wheel lock
  steerRateDeg: 60, // how fast the wheels can turn (°/s)
  maxKmh: 360,
  /** Proportional gain of the speed controller (1/s). */
  speedGain: 8,
} as const;

export interface SurfaceProps {
  mu: number;
  /** Constant extra deceleration (m/s²). */
  roll: number;
  /** Speed proportional extra deceleration (1/s). */
  drag: number;
}

export const SURFACES: Record<Surface, SurfaceProps> = {
  asphalt: { mu: 1.7, roll: 0, drag: 0 },
  kerb: { mu: 1.45, roll: 0.3, drag: 0 },
  grass: { mu: 0.6, roll: 1.0, drag: 0.06 },
  gravel: { mu: 0.45, roll: 2.0, drag: 0.12 },
};

export interface WingProps {
  label: string;
  /** downforce coefficient × area (m²) */
  clA: number;
  /** drag coefficient × frontal area (m²) */
  cdA: number;
}

/** More wing = more downforce (grip in corners) but more drag (lower top speed). */
export const WINGS: Record<WingLevel, WingProps> = {
  low: { label: "Bajo", clA: 3.9, cdA: 1.05 },
  medium: { label: "Medio", clA: 4.5, cdA: 1.6 },
  high: { label: "Alto", clA: 5.7, cdA: 2.3 },
};

/** Grip multiplier per surface when the track is wet. */
export const WET_GRIP: Record<Surface, number> = { asphalt: 0.7, kerb: 0.6, grass: 0.8, gravel: 0.9 };

export function surfaceMu(surface: Surface, c: Conditions): number {
  return SURFACES[surface].mu * (c.rain ? WET_GRIP[surface] : 1);
}

/** Wind as a velocity vector (m/s) in track coordinates. */
export function windVector(c: Conditions): [number, number] {
  const w = kmhToMs(c.windKmh);
  const a = (c.windToDeg * Math.PI) / 180;
  return [Math.cos(a) * w, Math.sin(a) * w];
}

/** Top speed (km/h) on a flat straight without wind: power = aero drag × speed. */
export function topSpeedKmh(wing: WingLevel): number {
  return Math.min(CAR.maxKmh, msToKmh(Math.cbrt((2 * CAR.power) / (RHO * WINGS[wing].cdA))));
}

/** Ratio between requested and available lateral grip that triggers a spin. */
export const SPIN_RATIO = 1.35;
/** Minimum speed (m/s) for a spin to happen; slower cars just understeer. */
export const SPIN_MIN_SPEED = 12;

export const kmhToMs = (kmh: number) => kmh / 3.6;
export const msToKmh = (ms: number) => ms * 3.6;

/** Grip-limited acceleration available at airspeed `u` on a surface. */
export function gripAccel(u: number, mu: number, clA = WINGS.medium.clA): number {
  const downforce = (0.5 * RHO * clA * u * u) / CAR.mass;
  return mu * (G + downforce);
}

/**
 * Theoretical max cornering speed (m/s) for a radius on asphalt:
 * u²/R = mu (g + c u²)  ⇒  u = sqrt(mu g / (1/R − mu c)).
 */
export function maxCornerSpeed(radius: number, mu = SURFACES.asphalt.mu, clA = WINGS.medium.clA): number {
  const c = (0.5 * RHO * clA) / CAR.mass;
  const denom = 1 / radius - mu * c;
  const top = kmhToMs(CAR.maxKmh);
  if (denom <= 0) return top;
  return Math.min(top, Math.sqrt((mu * G) / denom));
}

/** Front wheel angle (degrees) that makes the car follow a circle of `radius`. */
export function steerForRadius(radius: number): number {
  return (Math.atan(CAR.wheelbase / radius) * 180) / Math.PI;
}

/** Theoretical max speed (km/h) through a corner of `radius` for a setup and weather. */
export function cornerLimitKmh(radius: number, wing: WingLevel, c: Conditions): number {
  return msToKmh(maxCornerSpeed(radius, surfaceMu("asphalt", c), WINGS[wing].clA));
}
