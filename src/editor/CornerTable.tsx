"use client";

import { cornerLimitKmh, WINGS } from "../sim/constants";
import type { Track } from "../sim/track";
import { DEFAULT_SETUP, DRY_CALM, type CarSetup, type Conditions, type RaceResult } from "../sim/types";

/** Planning data: where each corner is, how tight, and how fast you can take it. */
export function CornerTable({
  track,
  result,
  setup = DEFAULT_SETUP,
  conditions = DRY_CALM,
}: {
  track: Track;
  result: RaceResult | null;
  setup?: CarSetup;
  conditions?: Conditions;
}) {
  const limit = (radius: number) => cornerLimitKmh(radius, setup.wing, conditions);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs text-white/60">
        <span>
          Largo: <b className="font-mono text-white/90">{Math.round(track.finishDistance)} m</b>
        </span>
        <span>Ancho de pista: {track.halfWidth * 2} m</span>
      </div>
      {track.corners.length === 0 ? (
        <p className="text-sm text-white/50">Sin curvas: es todo recta.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-white/45">
            <tr>
              <th className="py-1 font-normal">Curva</th>
              <th className="font-normal">Empieza</th>
              <th className="font-normal">Giro</th>
              <th className="font-normal">Radio</th>
              <th className="font-normal">Largo</th>
              <th className="font-normal" title="Ángulo de ruedas que sigue exactamente el radio de la curva">
                Volante
              </th>
              <th className="font-normal">Vel. máx</th>
              {result && <th className="font-normal">Entraste</th>}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums text-white/85">
            {track.corners.map((c) => {
              const entry = result?.cornerEntryKmh[c.index] ?? null;
              const over = entry !== null && entry > limit(c.radius);
              return (
                <tr key={c.index} className="border-t border-white/5">
                  <td className="py-1 font-sans font-semibold">T{c.index + 1}</td>
                  <td>{Math.round(c.sStart)} m</td>
                  <td>
                    {c.dir === "left" ? "◀" : "▶"} {c.angle}°
                  </td>
                  <td>{c.radius} m</td>
                  <td>{Math.round(c.sEnd - c.sStart)} m</td>
                  <td>{c.steerDeg.toFixed(1)}°</td>
                  <td>~{Math.round(limit(c.radius))}</td>
                  {result && <td className={over ? "text-red-400" : "text-emerald-300"}>{entry ?? "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[11px] leading-snug text-white/40">
        Vel. máx con alerón {WINGS[setup.wing].label.toLowerCase()}
        {conditions.rain ? " y pista mojada" : ""}. Tiempo en la curva ≈ largo ÷ velocidad (en m/s = km/h ÷ 3,6). Con el ángulo de «Volante» el auto sigue el radio exacto de la curva.
      </p>
    </div>
  );
}
