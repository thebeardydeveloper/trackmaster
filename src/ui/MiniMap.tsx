import { useMemo } from "react";

/** The parts of a track outline the map needs (a built `Track` fits as-is). */
export interface MiniMapShape {
  /** Centerline points, track coordinates in metres (y up). */
  xs: ArrayLike<number>;
  ys: ArrayLike<number>;
  n: number;
  closed: boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Top-down circuit outline in `currentColor` with an amber dot at the start line. Size it with classes (`h-20 w-20`). */
export function MiniMap({ track, className = "" }: { track: MiniMapShape; className?: string }) {
  const { d, view, start } = useMemo(() => {
    const b = track.bounds;
    const pad = 40;
    const pts: string[] = [];
    for (let i = 0; i < track.n; i += 4) pts.push(`${track.xs[i].toFixed(1)},${(-track.ys[i]).toFixed(1)}`);
    pts.push(`${track.xs[track.closed ? 0 : track.n - 1].toFixed(1)},${(-track.ys[track.closed ? 0 : track.n - 1]).toFixed(1)}`);
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    const size = Math.max(w, h);
    const cx = (b.minX + b.maxX) / 2;
    const cy = -(b.minY + b.maxY) / 2;
    return { d: `M${pts.join("L")}${track.closed ? "Z" : ""}`, view: `${cx - size / 2} ${cy - size / 2} ${size} ${size}`, start: [track.xs[0], -track.ys[0]] };
  }, [track]);
  return (
    <svg viewBox={view} className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={Math.max(8, (track.bounds.maxX - track.bounds.minX) / 45)} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={start[0]} cy={start[1]} r={Math.max(10, (track.bounds.maxX - track.bounds.minX) / 30)} fill="#fbbf24" />
    </svg>
  );
}
