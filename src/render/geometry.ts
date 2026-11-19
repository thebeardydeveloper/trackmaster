import * as THREE from "three";
import { project, type Track } from "../sim/track";

/** Sim plane (x, y) → Three world (x, height, −y). Heading maps directly to rotation.y. */
export const toWorld = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Point at a lateral offset (left positive) from centerline sample i, in world coords. */
function offsetPoint(track: Track, i: number, lateral: number, h: number): [number, number, number] {
  const hd = track.hdg[i];
  const x = track.xs[i] - Math.sin(hd) * lateral;
  const y = track.ys[i] + Math.cos(hd) * lateral;
  return [x, h, -y];
}

type ColorFn = (i: number) => THREE.Color | null;

/**
 * Flat band between two lateral offsets, one quad per centerline sample.
 * Non-indexed so every quad can have its own colour (kerb stripes, gravel patches…).
 */
export function bandGeometry(
  track: Track,
  from: (i: number) => number,
  to: (i: number) => number,
  height: number,
  color: ColorFn,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const last = track.closed ? track.n : track.n - 1;
  for (let i = 0; i < last; i++) {
    const c = color(i);
    if (!c) continue;
    const j = (i + 1) % track.n;
    const a = offsetPoint(track, i, from(i), height);
    const b = offsetPoint(track, i, to(i), height);
    const cc = offsetPoint(track, j, to(j), height);
    const d = offsetPoint(track, j, from(j), height);
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Vertical band (barriers) at a lateral offset. */
export function wallGeometry(
  track: Track,
  offset: (i: number) => number,
  y0: number,
  y1: number,
  color: ColorFn,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const last = track.closed ? track.n : track.n - 1;
  for (let i = 0; i < last; i++) {
    const c = color(i);
    if (!c) continue;
    const j = (i + 1) % track.n;
    const a = offsetPoint(track, i, offset(i), y0);
    const b = offsetPoint(track, i, offset(i), y1);
    const cc = offsetPoint(track, j, offset(j), y1);
    const d = offsetPoint(track, j, offset(j), y0);
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
    for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export interface TreeSpot {
  x: number;
  z: number;
  scale: number;
  kind: 0 | 1;
  rot: number;
}

/** Deterministic tree placement around the track, away from the asphalt and barriers. */
export function placeTrees(track: Track): TreeSpot[] {
  const rnd = mulberry32(track.def.scenery.seed);
  const { minX, maxX, minY, maxY } = track.bounds;
  const pad = 120;
  const trees: TreeSpot[] = [];
  const wall = track.halfWidth + track.kerbWidth + track.runoffWidth;
  let tries = 0;
  while (trees.length < track.def.scenery.trees && tries < track.def.scenery.trees * 8) {
    tries++;
    const x = minX - pad + rnd() * (maxX - minX + pad * 2);
    const y = minY - pad + rnd() * (maxY - minY + pad * 2);
    const p = project(track, x, y, -1);
    const dist = Math.hypot(x - track.xs[p.i], y - track.ys[p.i]);
    if (dist < wall + 6) continue;
    // cluster trees a bit: skip some isolated candidates
    if (rnd() < 0.25) continue;
    trees.push({ x, z: -y, scale: 0.7 + rnd() * 0.9, kind: rnd() < 0.65 ? 0 : 1, rot: rnd() * Math.PI * 2 });
  }
  return trees;
}

/** Index of the first centerline sample at or after arc length s. */
export function indexAt(track: Track, s: number): number {
  let lo = 0;
  let hi = track.n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (track.s[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function speedColor(kmh: number, target = new THREE.Color()): THREE.Color {
  // slow → blue, mid → green/yellow, fast → red
  const t = Math.max(0, Math.min(1, kmh / 320));
  return target.setHSL(0.66 - t * 0.66, 0.85, 0.55);
}
