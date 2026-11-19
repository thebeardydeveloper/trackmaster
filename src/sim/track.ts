import { maxCornerSpeed, msToKmh, steerForRadius } from "./constants";
import type { Conditions, SteerSide, Surface } from "./types";

export type Segment =
  | { type: "straight"; length: number | "auto" }
  | { type: "arc"; radius: number; angle: number; dir: SteerSide };

type ArcSegment = Extract<Segment, { type: "arc" }>;
export type ResolvedSegment = { type: "straight"; length: number } | ArcSegment;

export interface TrackDef {
  id: string;
  name: string;
  description: string;
  /** Closed circuits are laps (start = finish); open tracks go from start to finish. */
  closed: boolean;
  /**
   * Geometry as a list of straights and arcs starting at the origin heading east (+x).
   * Closed tracks must turn a full 360° and mark exactly two straights as "auto":
   * their lengths are solved so the loop closes.
   */
  segments: Segment[];
  halfWidth?: number;
  kerbWidth?: number;
  runoffWidth?: number;
  /** Corner indices (0-based) that have a gravel trap on the outside. */
  gravelCorners?: number[];
  /** Open tracks: distance of the finish line from the start (default: length − 60). */
  finishAt?: number;
  /** Runs longer than this are a DNF (s). */
  timeLimit: number;
  /** Weather of the session (default: dry, no wind). */
  conditions?: Conditions;
  scenery: {
    seed: number;
    trees: number;
    grandstands?: { s: number; side: SteerSide; length: number }[];
  };
}

export interface Corner {
  index: number;
  dir: SteerSide;
  angle: number;
  radius: number;
  sStart: number;
  sEnd: number;
  /** Theoretical max speed through the corner on asphalt (km/h). */
  maxKmh: number;
  /** Front wheel angle needed to follow the corner radius (°). */
  steerDeg: number;
}

export interface Track {
  def: TrackDef;
  closed: boolean;
  length: number;
  /** Distance the car must cover to finish. */
  finishDistance: number;
  halfWidth: number;
  kerbWidth: number;
  runoffWidth: number;
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  hdg: Float64Array;
  s: Float64Array;
  /** Signed curvature (1/m, left positive). */
  curv: Float64Array;
  kerb: Uint8Array;
  gravelL: Uint8Array;
  gravelR: Uint8Array;
  wallL: Float64Array;
  wallR: Float64Array;
  corners: Corner[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const SAMPLE_STEP = 1; // m between centerline samples
const DEG = Math.PI / 180;

interface Pose {
  x: number;
  y: number;
  h: number;
}

function advance(p: Pose, seg: Segment | ResolvedSegment, length: number): Pose {
  if (seg.type === "straight") {
    return { x: p.x + Math.cos(p.h) * length, y: p.y + Math.sin(p.h) * length, h: p.h };
  }
  const sign = seg.dir === "left" ? 1 : -1;
  const theta = seg.angle * DEG * sign;
  // center is on the side we turn towards
  const cx = p.x - Math.sin(p.h) * seg.radius * sign;
  const cy = p.y + Math.cos(p.h) * seg.radius * sign;
  const a0 = Math.atan2(p.y - cy, p.x - cx);
  const a1 = a0 + theta;
  return { x: cx + Math.cos(a1) * seg.radius, y: cy + Math.sin(a1) * seg.radius, h: p.h + theta };
}

/** Replace the two "auto" straights with lengths that close the loop. */
export function resolveSegments(def: TrackDef): ResolvedSegment[] {
  const autos = def.segments
    .map((s, i) => (s.type === "straight" && s.length === "auto" ? i : -1))
    .filter((i) => i >= 0);
  if (!def.closed) {
    if (autos.length) throw new Error(`${def.id}: open tracks can't use auto lengths`);
    return def.segments as ResolvedSegment[];
  }
  if (autos.length !== 2) throw new Error(`${def.id}: closed tracks need exactly two auto straights`);

  let p: Pose = { x: 0, y: 0, h: 0 };
  const dirs: [number, number][] = [];
  for (const seg of def.segments) {
    if (seg.type === "straight" && seg.length === "auto") {
      dirs.push([Math.cos(p.h), Math.sin(p.h)]);
      continue;
    }
    p = advance(p, seg, seg.type === "straight" ? (seg.length as number) : 0);
  }
  const turns = p.h / (2 * Math.PI);
  if (Math.abs(Math.abs(turns) - 1) > 1e-6) {
    throw new Error(`${def.id}: closed track turns ${(p.h / DEG).toFixed(1)}°, must be ±360°`);
  }
  // Arc end positions don't depend on where the straights are, only on heading, so the
  // gap is linear in the two unknown lengths: a·d1 + b·d2 = −p.
  const [d1, d2] = dirs;
  const det = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(det) < 1e-6) throw new Error(`${def.id}: auto straights are parallel`);
  const a = (-p.x * d2[1] + p.y * d2[0]) / det;
  const b = (-d1[0] * p.y + d1[1] * p.x) / det;
  if (a < 20 || b < 20) {
    throw new Error(`${def.id}: auto straights solved to ${a.toFixed(1)} / ${b.toFixed(1)} m`);
  }
  let k = 0;
  return def.segments.map((seg): ResolvedSegment =>
    seg.type === "straight" && seg.length === "auto" ? { type: "straight", length: k++ === 0 ? a : b } : (seg as ResolvedSegment),
  );
}

export function buildTrack(def: TrackDef): Track {
  const halfWidth = def.halfWidth ?? 6;
  const kerbWidth = def.kerbWidth ?? 1.2;
  const runoffWidth = def.runoffWidth ?? 18;
  const segments = resolveSegments(def);

  const xs: number[] = [0];
  const ys: number[] = [0];
  const hdg: number[] = [0];
  const curv: number[] = [0];
  const segOf: number[] = [0];
  const corners: Corner[] = [];

  let p: Pose = { x: 0, y: 0, h: 0 };
  segments.forEach((seg, si) => {
    if (seg.type === "straight") {
      const len = seg.length;
      const n = Math.max(1, Math.round(len / SAMPLE_STEP));
      for (let k = 1; k <= n; k++) {
        const q = advance(p, seg, (len * k) / n);
        xs.push(q.x);
        ys.push(q.y);
        hdg.push(q.h);
        curv.push(0);
        segOf.push(si);
      }
      p = advance(p, seg, len);
    } else {
      const sign = seg.dir === "left" ? 1 : -1;
      const arcLen = seg.radius * seg.angle * DEG;
      const n = Math.max(2, Math.ceil(arcLen / SAMPLE_STEP));
      corners.push({
        index: corners.length,
        dir: seg.dir,
        angle: seg.angle,
        radius: seg.radius,
        sStart: 0,
        sEnd: 0,
        maxKmh: msToKmh(maxCornerSpeed(seg.radius)),
        steerDeg: steerForRadius(seg.radius),
      });
      for (let k = 1; k <= n; k++) {
        const q = advance(p, { ...seg, angle: (seg.angle * k) / n }, 0);
        xs.push(q.x);
        ys.push(q.y);
        hdg.push(q.h);
        curv.push(sign / seg.radius);
        segOf.push(si);
      }
      p = advance(p, seg, 0);
    }
  });

  if (def.closed) {
    // last sample coincides with the first one
    xs.pop();
    ys.pop();
    hdg.pop();
    curv.pop();
    segOf.pop();
  }

  const n = xs.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  const length = def.closed ? s[n - 1] + Math.hypot(xs[0] - xs[n - 1], ys[0] - ys[n - 1]) : s[n - 1];

  // corner extents along s
  let ci = -1;
  let prevSeg = -1;
  for (let i = 0; i < n; i++) {
    const seg = segments[segOf[i]];
    if (seg.type === "arc") {
      if (segOf[i] !== prevSeg) {
        ci++;
        corners[ci].sStart = i > 0 ? s[i - 1] : 0;
      }
      corners[ci].sEnd = s[i];
    }
    prevSeg = segOf[i];
  }

  const kerb = new Uint8Array(n);
  const gravelL = new Uint8Array(n);
  const gravelR = new Uint8Array(n);
  const gravel = new Set(def.gravelCorners ?? []);
  const fullWall = halfWidth + kerbWidth + runoffWidth;
  const innerL = new Float64Array(n).fill(fullWall);
  const innerR = new Float64Array(n).fill(fullWall);

  const inRange = (si: number, a: number, b: number) => {
    if (si >= a && si <= b) return true;
    if (!def.closed) return false;
    return (si + length >= a && si + length <= b) || (si - length >= a && si - length <= b);
  };

  for (let i = 0; i < n; i++) {
    for (const c of corners) {
      if (inRange(s[i], c.sStart - 12, c.sEnd + 12)) kerb[i] = 1;
      if (gravel.has(c.index) && inRange(s[i], c.sStart - 10, c.sEnd + 50)) {
        if (c.dir === "right") gravelL[i] = 1;
        else gravelR[i] = 1;
      }
    }
    if (curv[i] !== 0) {
      const r = 1 / Math.abs(curv[i]);
      const lim = Math.min(fullWall, r * 0.85);
      if (curv[i] > 0) innerL[i] = lim;
      else innerR[i] = lim;
    }
  }

  // Smooth the inner walls so they don't step at corner entry/exit.
  const wallL = new Float64Array(n);
  const wallR = new Float64Array(n);
  const W = 15;
  for (let i = 0; i < n; i++) {
    let l = fullWall;
    let r = fullWall;
    for (let k = -W; k <= W; k++) {
      let j = i + k;
      if (def.closed) j = (j + n) % n;
      else if (j < 0 || j >= n) continue;
      l = Math.min(l, innerL[j]);
      r = Math.min(r, innerR[j]);
    }
    wallL[i] = l;
    wallR[i] = r;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]);
    maxY = Math.max(maxY, ys[i]);
  }

  return {
    def,
    closed: def.closed,
    length,
    finishDistance: def.closed ? length : (def.finishAt ?? length - 60),
    halfWidth,
    kerbWidth,
    runoffWidth,
    n,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    hdg: Float64Array.from(hdg),
    s,
    curv: Float64Array.from(curv),
    kerb,
    gravelL,
    gravelR,
    wallL,
    wallR,
    corners,
    bounds: { minX, maxX, minY, maxY },
  };
}

export interface Projection {
  i: number;
  /** Arc length of the projected point along the centerline. */
  s: number;
  /** Signed distance from the centerline (left positive). */
  lateral: number;
}

const SEARCH_WINDOW = 40;

/** Find the closest centerline sample. `hint` is the previous index (−1 = global search). */
export function project(track: Track, x: number, y: number, hint: number): Projection {
  const { n, xs, ys } = track;
  let best = -1;
  let bestD = Infinity;
  const check = (j: number) => {
    const dx = x - xs[j];
    const dy = y - ys[j];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  };
  if (hint < 0) {
    for (let j = 0; j < n; j++) check(j);
  } else {
    for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) {
      let j = hint + k;
      if (track.closed) j = (j + n) % n;
      else if (j < 0 || j >= n) continue;
      check(j);
    }
  }
  const h = track.hdg[best];
  const tx = Math.cos(h);
  const ty = Math.sin(h);
  const dx = x - xs[best];
  const dy = y - ys[best];
  const along = dx * tx + dy * ty;
  const lateral = -dx * ty + dy * tx;
  let s = track.s[best] + along;
  if (track.closed) s = ((s % track.length) + track.length) % track.length;
  return { i: best, s, lateral };
}

export function surfaceAt(track: Track, i: number, lateral: number): Surface {
  const a = Math.abs(lateral);
  if (a <= track.halfWidth) return "asphalt";
  if (a <= track.halfWidth + track.kerbWidth && track.kerb[i]) return "kerb";
  const gravel = lateral > 0 ? track.gravelL[i] : track.gravelR[i];
  return gravel ? "gravel" : "grass";
}

export function wallAt(track: Track, i: number, lateral: number): number {
  return lateral > 0 ? track.wallL[i] : track.wallR[i];
}

/** Corner nearest to an arc-length position (within 40 m), or null. */
export function cornerAt(track: Track, s: number): number | null {
  for (const c of track.corners) {
    if (s >= c.sStart - 40 && s <= c.sEnd + 40) return c.index;
  }
  return null;
}
