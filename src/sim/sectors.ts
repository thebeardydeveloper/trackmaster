import type { Track } from "./track";
import type { RaceResult } from "./types";

export const SECTOR_COUNT = 3;

/** Distances (m of progress) where each sector ends. The last one is the finish. */
export function sectorBounds(track: Track): number[] {
  const d = track.finishDistance;
  return Array.from({ length: SECTOR_COUNT }, (_, k) => (k === SECTOR_COUNT - 1 ? d : (d * (k + 1)) / SECTOR_COUNT));
}

/** Time (s) at which progress first reached `distance`, interpolated between frames. */
export function timeAtProgress(r: RaceResult, distance: number): number | null {
  const f = r.frames;
  for (let k = 1; k < f.length; k++) {
    if (f[k].progress >= distance && f[k - 1].progress < distance) {
      const a = f[k - 1];
      const b = f[k];
      return a.t + ((distance - a.progress) / (b.progress - a.progress)) * (b.t - a.t);
    }
  }
  return null;
}

/** Duration of each sector, null for sectors not completed. */
export function sectorTimes(track: Track, r: RaceResult): (number | null)[] {
  const bounds = sectorBounds(track);
  const cum = bounds.map((b, k) => (k === bounds.length - 1 ? (r.finished ? r.time : null) : timeAtProgress(r, b)));
  return cum.map((t, k) => {
    if (t === null) return null;
    if (k === 0) return t;
    const prev = cum[k - 1];
    return prev === null ? null : t - prev;
  });
}

/** Sector-wise minimum across several runs. */
export function bestSectors(runs: (number | null)[][]): (number | null)[] {
  return Array.from({ length: SECTOR_COUNT }, (_, k) => {
    let best: number | null = null;
    for (const r of runs) {
      const t = r[k];
      if (t !== null && t !== undefined && (best === null || t < best)) best = t;
    }
    return best;
  });
}

/** purple = best ever (incl. record), green = personal best, yellow = slower. */
export type SectorColor = "purple" | "green" | "yellow";

export function sectorColor(t: number, personal: number | null, overall: number | null): SectorColor {
  if (overall === null || t <= overall + 1e-9) return "purple";
  if (personal === null || t <= personal + 1e-9) return "green";
  return "yellow";
}

/**
 * Lookup of "when did this run first reach each metre" (1 m resolution), used for the
 * live delta against a ghost. NaN where the run never got.
 */
export function progressTimeline(r: RaceResult, maxDistance: number): Float64Array {
  const n = Math.ceil(maxDistance) + 1;
  const out = new Float64Array(n).fill(NaN);
  const f = r.frames;
  out[0] = 0;
  let m = 1;
  for (let k = 1; k < f.length && m < n; k++) {
    const a = f[k - 1];
    const b = f[k];
    // progress can go backwards (spins): m only advances when a metre is reached for the first time
    while (m < n && b.progress >= m) {
      out[m] = a.progress < m ? a.t + ((m - a.progress) / (b.progress - a.progress)) * (b.t - a.t) : a.t;
      m++;
    }
  }
  return out;
}

/** Interpolated time at a progress value from a progress timeline (NaN if unknown). */
export function lookupTime(line: Float64Array, progress: number): number {
  if (progress <= 0) return 0;
  const i = Math.floor(progress);
  if (i + 1 >= line.length) return NaN;
  const a = line[i];
  const b = line[i + 1];
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return a + (b - a) * (progress - i);
}
