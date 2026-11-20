/** Small right-aligned label/value pair for header stats (times, records). `accent` paints the value amber. */
export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-white/45">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${accent ? "text-amber-300" : "text-white/90"}`}>{value}</span>
    </div>
  );
}
