import { formatDelta } from "../game/format";

/** Time difference tile: green when `d` ≤ 0 (faster), red when slower, "—" when there's nothing to compare. */
export function DeltaStat({ label, d }: { label: string; /** Seconds; negative = faster. */ d: number | null }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-1.5">
      <div className="text-white/45">{label}</div>
      <div className={`font-mono tabular-nums ${d === null ? "text-white/40" : d <= 0 ? "text-emerald-300" : "text-red-300"}`}>{d === null ? "—" : formatDelta(d)}</div>
    </div>
  );
}
