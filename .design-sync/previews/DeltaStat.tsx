import { DeltaStat } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


export const ResultComparison = () => (
  <Dark>
  <div className="grid w-80 grid-cols-3 gap-2 text-xs">
    <DeltaStat label="vs. tu mejor" d={-0.412} />
    <DeltaStat label="vs. récord" d={2.873} />
    <DeltaStat label="vs. promedio" d={-18.5} />
  </div>
  </Dark>
);

export const States = () => (
  <Dark>
  <div className="grid w-80 grid-cols-3 gap-2 text-xs">
    <DeltaStat label="Más rápido" d={-1.204} />
    <DeltaStat label="Más lento" d={0.356} />
    <DeltaStat label="Sin referencia" d={null} />
  </div>
  </Dark>
);
