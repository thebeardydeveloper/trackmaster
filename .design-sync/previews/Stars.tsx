import { Stars } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


export const Ratings = () => (
  <Dark>
  <div className="flex flex-col gap-2 p-4 text-white">
    {[0, 1, 2, 3].map((n) => (
      <div key={n} className="flex items-center gap-3">
        <Stars n={n} />
        <span className="text-xs text-white/50">{n} de 3</span>
      </div>
    ))}
  </div>
  </Dark>
);

export const Sizes = () => (
  <Dark>
  <div className="flex items-end gap-6 p-4">
    <Stars n={2} size="text-base" />
    <Stars n={2} />
    <Stars n={3} size="text-3xl" />
  </div>
  </Dark>
);

export const LevelCard = () => (
  <Dark>
  <div className="w-64 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Nivel 2</span>
      <Stars n={2} size="text-base" />
    </div>
    <div className="font-semibold">Una curva</div>
    <p className="text-xs text-white/55">Frená antes de doblar y usá el volante con duración.</p>
  </div>
  </Dark>
);
