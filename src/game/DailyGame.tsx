"use client";

import { useMemo } from "react";
import { dailySession, localDateStr } from "./daily";
import { GameScreen } from "./GameScreen";
import { useMounted } from "./useMounted";

/** Today's challenge (the date comes from the player's clock, so client only). */
export function DailyGame() {
  const mounted = useMounted();
  const session = useMemo(() => (mounted ? dailySession(localDateStr()) : null), [mounted]);
  if (!session) return <div className="grid h-dvh place-items-center text-white/50">Cargando…</div>;
  return <GameScreen kind="session" session={session} />;
}
