import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameScreen } from "@/game/GameScreen";
import { freeRaceSession } from "@/game/session";
import { RACE_TRACKS } from "@/tracks/race";

export function generateStaticParams() {
  return RACE_TRACKS.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: PageProps<"/track/[id]">) {
  const { id } = await params;
  const t = RACE_TRACKS.find((x) => x.id === id);
  return { title: t ? `${t.name} · TrackMaster` : "TrackMaster" };
}

async function Track({ params }: { params: PageProps<"/track/[id]">["params"] }) {
  const { id } = await params;
  if (!RACE_TRACKS.some((t) => t.id === id)) notFound();
  return <GameScreen kind="session" session={freeRaceSession(id)} />;
}

export default function TrackPage({ params }: PageProps<"/track/[id]">) {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-white/50">Cargando…</div>}>
      <Track params={params} />
    </Suspense>
  );
}
