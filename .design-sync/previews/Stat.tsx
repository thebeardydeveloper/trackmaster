import { Stat } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


export const RaceHeader = () => (
  <Dark>
  <div className="flex items-center gap-5 rounded-xl bg-black/40 px-4 py-3">
    <Stat label="Tiempo promedio" value="1:31.240" />
    <Stat label="Récord de la pista" value="1:10.185" accent />
    <Stat label="Tu mejor" value="1:14.902" />
  </div>
  </Dark>
);

export const TrainingTargets = () => (
  <Dark>
  <div className="flex items-center gap-5 rounded-xl bg-black/40 px-4 py-3">
    <Stat label="3★" value="≤ 24.5" />
    <Stat label="2★" value="≤ 30.3" />
    <Stat label="Tu mejor" value="—" />
  </div>
  </Dark>
);

export const Accent = () => (
  <Dark>
  <div className="flex gap-6 p-4">
    <Stat label="Normal" value="58.731" />
    <Stat label="Destacado" value="58.731" accent />
  </div>
  </Dark>
);
