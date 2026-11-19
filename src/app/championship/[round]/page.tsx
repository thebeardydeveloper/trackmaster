import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChampionshipRound } from "@/game/ChampionshipView";
import { CHAMPIONSHIP_ROUNDS } from "@/game/championship";

export function generateStaticParams() {
  return CHAMPIONSHIP_ROUNDS.map((_, r) => ({ round: String(r) }));
}

export const metadata = { title: "Campeonato · TrackMaster" };

async function Round({ params }: { params: PageProps<"/championship/[round]">["params"] }) {
  const { round } = await params;
  const r = Number(round);
  if (!Number.isInteger(r) || r < 0 || r >= CHAMPIONSHIP_ROUNDS.length) notFound();
  return <ChampionshipRound round={r} />;
}

export default function ChampionshipRoundPage({ params }: PageProps<"/championship/[round]">) {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-white/50">Cargando…</div>}>
      <Round params={params} />
    </Suspense>
  );
}
