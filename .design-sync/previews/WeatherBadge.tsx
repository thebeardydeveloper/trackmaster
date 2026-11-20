import { WeatherBadge } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


export const Conditions = () => (
  <Dark>
  <div className="flex flex-col items-start gap-2 p-4">
    <WeatherBadge conditions={{ rain: false, windKmh: 0, windToDeg: 0 }} />
    <WeatherBadge conditions={{ rain: false, windKmh: 30, windToDeg: 180 }} />
    <WeatherBadge conditions={{ rain: true, windKmh: 10, windToDeg: 60 }} />
  </div>
  </Dark>
);

export const MapView = () => (
  <Dark>
  <div className="flex flex-col items-start gap-2 p-4">
    <WeatherBadge conditions={{ rain: false, windKmh: 40, windToDeg: 300 }} view="map" />
    <WeatherBadge conditions={{ rain: true, windKmh: 25, windToDeg: 90 }} view="map" />
  </div>
  </Dark>
);

export const InHeader = () => (
  <Dark>
  <div className="flex w-96 items-center justify-between rounded-xl bg-black/40 px-4 py-3 text-white">
    <div>
      <div className="text-xs uppercase tracking-widest text-white/50">Desafío del día</div>
      <div className="font-semibold">Valle Hondo</div>
    </div>
    <WeatherBadge conditions={{ rain: true, windKmh: 10, windToDeg: 60 }} />
  </div>
  </Dark>
);
