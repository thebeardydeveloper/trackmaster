import type { Conditions } from "../sim/types";

/**
 * Screen rotation (deg, clockwise from "up") of a wind blowing towards `toDeg`.
 * `iso` = the isometric race view, `map` = top-down minimap (north up).
 */
export function windScreenDeg(toDeg: number, view: "iso" | "map"): number {
  const a = (toDeg * Math.PI) / 180;
  const wx = Math.cos(a);
  const wy = Math.sin(a);
  if (view === "map") return 90 - toDeg;
  // camera looks from (+x, +y, +z): screen right = (1,0,−1)/√2, screen up = (−1,0,−1)/√2 in world;
  // world z = −track y
  const sx = (wx + wy) / Math.SQRT2;
  const sy = (-wx + wy) / Math.SQRT2;
  return (Math.atan2(sx, sy) * 180) / Math.PI;
}

/** An ↑ rotated to where the wind blows, for the isometric race view or a north-up map. */
export function WindArrow({ conditions, view, className = "" }: { conditions: Conditions; view: "iso" | "map"; className?: string }) {
  return (
    <span className={`inline-block leading-none ${className}`} style={{ transform: `rotate(${windScreenDeg(conditions.windToDeg, view)}deg)` }} aria-hidden>
      ↑
    </span>
  );
}
