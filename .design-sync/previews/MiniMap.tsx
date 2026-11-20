import { MiniMap } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


/** Builds a track outline (centerline points in metres) from straight/arc pieces, like the game's circuits. */
function outline(pieces: Array<["s", number] | ["a", number, number]>, closed: boolean) {
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0, y = 0, h = 0;
  const push = () => { xs.push(x); ys.push(y); };
  push();
  for (const p of pieces) {
    if (p[0] === "s") {
      for (let i = 0; i < p[1]; i += 5) { x += 5 * Math.cos(h); y += 5 * Math.sin(h); push(); }
    } else {
      const [, r, deg] = p;
      const steps = Math.max(4, Math.round((Math.abs(deg) * Math.PI * r) / 180 / 5));
      const dh = ((deg * Math.PI) / 180) / steps;
      const len = (Math.abs(deg) * Math.PI * r) / 180 / steps;
      for (let i = 0; i < steps; i++) { h += dh / 2; x += len * Math.cos(h); y += len * Math.sin(h); h += dh / 2; push(); }
    }
  }
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { xs, ys, n: xs.length, closed, bounds };
}

const oval = outline([["s", 600], ["a", 120, 180], ["s", 600], ["a", 120, 180]], true);
/** A closed, irregular circuit (polar wobble around a 400 m radius). */
function loop() {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const r = 400 * (1 + 0.28 * Math.cos(2 * t) + 0.12 * Math.sin(3 * t + 0.6));
    xs.push(r * Math.cos(t) * 1.3);
    ys.push(r * Math.sin(t));
  }
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  return { xs, ys, n: xs.length, closed: true, bounds };
}
const circuit = loop();
const hairpin = outline([["s", 400], ["a", 35, 180], ["s", 300]], false);

export const Circuits = () => (
  <Dark>
  <div className="flex gap-4 p-4">
    <MiniMap track={oval} className="h-28 w-28 text-white/70" />
    <MiniMap track={circuit} className="h-28 w-28 text-white/70" />
    <MiniMap track={hairpin} className="h-28 w-28 text-white/70" />
  </div>
  </Dark>
);

export const TrackCard = () => (
  <Dark>
  <div className="flex w-80 items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white">
    <MiniMap track={circuit} className="h-[120px] w-[120px] shrink-0 text-white/70" />
    <div className="space-y-1">
      <div className="font-semibold">Anillo del Sur</div>
      <div className="text-xs text-white/50">2.6 km · 6 curvas</div>
      <div className="font-mono text-xs text-amber-300">Récord 1:10.185</div>
    </div>
  </div>
  </Dark>
);

export const Colors = () => (
  <Dark>
  <div className="flex gap-4 p-4">
    <MiniMap track={oval} className="h-20 w-20 text-white/40" />
    <MiniMap track={oval} className="h-20 w-20 text-white" />
    <MiniMap track={oval} className="h-20 w-20 text-sky-300" />
  </div>
  </Dark>
);
