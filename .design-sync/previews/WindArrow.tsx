import { WindArrow } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


const DIRS = [0, 90, 180, 270];
const NAME: Record<number, string> = { 0: "Este", 90: "Norte", 180: "Oeste", 270: "Sur" };

export const MapDirections = () => (
  <Dark>
  <div className="flex gap-5 p-4 text-white">
    {DIRS.map((d) => (
      <div key={d} className="flex flex-col items-center gap-1">
        <WindArrow conditions={{ rain: false, windKmh: 20, windToDeg: d }} view="map" className="text-2xl text-sky-300" />
        <span className="text-[10px] text-white/50">{NAME[d]}</span>
      </div>
    ))}
  </div>
  </Dark>
);

export const IsoView = () => (
  <Dark>
  <div className="flex gap-5 p-4 text-white">
    {DIRS.map((d) => (
      <div key={d} className="flex flex-col items-center gap-1">
        <WindArrow conditions={{ rain: false, windKmh: 20, windToDeg: d }} view="iso" className="text-2xl text-sky-300" />
        <span className="text-[10px] text-white/50">{NAME[d]}</span>
      </div>
    ))}
  </div>
  </Dark>
);

export const Inline = () => (
  <Dark>
  <p className="p-4 text-sm text-white/70">
    Viento <WindArrow conditions={{ rain: false, windKmh: 30, windToDeg: 180 }} view="map" className="text-sky-300" /> 30 km/h en contra en la recta principal.
  </p>
  </Dark>
);
