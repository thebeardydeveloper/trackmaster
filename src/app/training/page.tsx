import Link from "next/link";
import { TrainingSection } from "@/game/HomeMenu";

export const metadata = { title: "Entrenamiento · TrackMaster" };

export default function TrainingIndex() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <Link href="/" className="text-sm text-white/60 hover:text-white">
        ← Menú
      </Link>
      <TrainingSection />
    </div>
  );
}
