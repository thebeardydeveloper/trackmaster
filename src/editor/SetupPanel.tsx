"use client";

import { cornerLimitKmh, topSpeedKmh, WET_GRIP, WINGS } from "../sim/constants";
import type { Track } from "../sim/track";
import type { CarSetup, Conditions, WingLevel } from "../sim/types";
import { WeatherBadge } from "../ui/WeatherBadge";

export { WeatherBadge } from "../ui/WeatherBadge";
export { WindArrow, windScreenDeg } from "../ui/WindArrow";

/** Wind relative to the main straight (where it matters most). */
function windOnMainStraight(track: Track, c: Conditions): string {
  if (c.windKmh === 0) return "sin viento";
  const d = Math.cos(((c.windToDeg * Math.PI) / 180) - track.hdg[0]);
  if (d < -0.5) return "en contra en la recta principal";
  if (d > 0.5) return "a favor en la recta principal";
  return "cruzado en la recta principal";
}

const WING_ORDER: WingLevel[] = ["low", "medium", "high"];

/** Relative bar: the worst option fills 30%, the best 100%. */
function Meter({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const k = max > min ? (value - min) / (max - min) : 1;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full" style={{ width: `${30 + k * 70}%`, background: color }} />
    </span>
  );
}

export function SetupPanel({
  track,
  setup,
  conditions,
  onChange,
  disabled,
}: {
  track: Track;
  setup: CarSetup;
  conditions: Conditions;
  onChange: (s: CarSetup) => void;
  disabled: boolean;
}) {
  // reference corner to compare grip: the median corner radius of this track
  const radii = track.corners.map((c) => c.radius).sort((a, b) => a - b);
  const refRadius = radii[Math.floor(radii.length / 2)] ?? 60;
  const stats = WING_ORDER.map((w) => ({ w, top: topSpeedKmh(w), corner: cornerLimitKmh(refRadius, w, conditions) }));
  const tops = stats.map((s) => s.top);
  const corners = stats.map((s) => s.corner);

  return (
    <div className="space-y-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold uppercase tracking-widest text-white/50">Auto y clima</span>
        <WeatherBadge conditions={conditions} />
      </div>
      <p className="text-[11px] leading-snug text-white/50">
        {conditions.rain ? `Pista mojada: el agarre baja un ${Math.round((1 - WET_GRIP.asphalt) * 100)}%. ` : ""}
        Viento {windOnMainStraight(track, conditions)}. Con viento en contra el auto frena más solo y agarra más; a favor llega más rápido al final de la recta.
      </p>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Alerón">
        {stats.map(({ w, top, corner }) => {
          const on = setup.wing === w;
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange({ ...setup, wing: w })}
              className={`space-y-1.5 rounded-md border px-2 py-1.5 text-left transition disabled:opacity-50 ${
                on ? "border-amber-400/80 bg-amber-400/10" : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="block text-xs font-semibold">Alerón {WINGS[w].label.toLowerCase()}</span>
              <span className="block text-[10px] text-white/50">Punta ~{Math.round(top)}</span>
              <Meter value={top} min={Math.min(...tops)} max={Math.max(...tops)} color="#fbbf24" />
              <span className="block text-[10px] text-white/50">
                Curva de {refRadius} m ~{Math.round(corner)}
              </span>
              <Meter value={corner} min={Math.min(...corners)} max={Math.max(...corners)} color="#38bdf8" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
