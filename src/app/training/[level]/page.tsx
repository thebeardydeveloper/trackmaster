import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameScreen } from "@/game/GameScreen";
import { TRAINING_LEVELS } from "@/tracks/training";

export function generateStaticParams() {
  return TRAINING_LEVELS.map((l) => ({ level: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/training/[level]">) {
  const { level } = await params;
  const l = TRAINING_LEVELS.find((x) => x.id === level);
  return { title: l ? `Entrenamiento ${l.number}: ${l.title} · TrackMaster` : "TrackMaster" };
}

async function Level({ params }: { params: PageProps<"/training/[level]">["params"] }) {
  const { level } = await params;
  if (!TRAINING_LEVELS.some((l) => l.id === level)) notFound();
  return <GameScreen kind="training" id={level} />;
}

export default function TrainingPage({ params }: PageProps<"/training/[level]">) {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-white/50">Cargando…</div>}>
      <Level params={params} />
    </Suspense>
  );
}
