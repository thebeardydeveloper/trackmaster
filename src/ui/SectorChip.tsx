import type { SectorColor } from "../sim/sectors";

const SECTOR_STYLE: Record<SectorColor, string> = {
  purple: "bg-fuchsia-600 text-white",
  green: "bg-emerald-500 text-black",
  yellow: "bg-amber-300 text-black",
};

/**
 * Sector split time, colored like a timing screen: purple = best overall, green = personal best,
 * yellow = slower. Hidden (`shown=false`) it shows a placeholder until the car reaches the sector.
 */
export function SectorChip({
  index,
  time,
  color,
  shown = true,
}: {
  /** Zero-based sector index (shown as "Sector index+1"). */
  index: number;
  /** Sector time in seconds, `null` when the car never finished the sector. */
  time: number | null;
  color: SectorColor | null;
  shown?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[92px] flex-col rounded-lg px-2.5 py-1 shadow transition-all duration-300 ${
        shown && color ? SECTOR_STYLE[color] : shown ? "bg-zinc-700 text-white/70" : "bg-black/50 text-white/30"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Sector {index + 1}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{shown ? (time === null ? "—" : time.toFixed(3)) : "··.···"}</span>
    </div>
  );
}
