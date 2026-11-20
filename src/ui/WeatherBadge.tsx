import type { Conditions } from "../sim/types";
import { WindArrow } from "./WindArrow";

/** Weather pill: 🌧️ Lluvia / ☀️ Seco, plus a sky-blue wind arrow and speed when there's wind. */
export function WeatherBadge({ conditions, view = "iso" }: { conditions: Conditions; view?: "iso" | "map" }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2 py-0.5 text-xs text-white/80">
      <span>{conditions.rain ? "🌧️ Lluvia" : "☀️ Seco"}</span>
      {conditions.windKmh > 0 && (
        <span className="inline-flex items-center gap-1 text-white/65" title="Hacia dónde sopla el viento">
          <WindArrow conditions={conditions} view={view} className="text-sky-300" />
          {conditions.windKmh} km/h
        </span>
      )}
    </span>
  );
}
