import { SectorChip } from "trackmaster";

/** The game UI is dark-only: every screen sits on the app background (#0b0f14). */
const Dark = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-block rounded-xl bg-[#0b0f14] p-4 font-sans text-zinc-100">{children}</div>
);


export const Colors = () => (
  <Dark>
  <div className="flex gap-2 p-3">
    <SectorChip index={0} time={21.347} color="purple" />
    <SectorChip index={1} time={24.902} color="green" />
    <SectorChip index={2} time={26.118} color="yellow" />
  </div>
  </Dark>
);

export const LiveTiming = () => (
  <Dark>
  <div className="flex gap-2 p-3">
    <SectorChip index={0} time={21.347} color="green" />
    <SectorChip index={1} time={24.902} color="purple" />
    <SectorChip index={2} time={null} color={null} shown={false} />
  </div>
  </Dark>
);

export const Incomplete = () => (
  <Dark>
  <div className="flex gap-2 p-3">
    <SectorChip index={0} time={22.004} color="yellow" />
    <SectorChip index={1} time={null} color={null} />
    <SectorChip index={2} time={null} color={null} />
  </div>
  </Dark>
);
