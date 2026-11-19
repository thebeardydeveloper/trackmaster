"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { WeatherBadge } from "../editor/SetupPanel";
import { DRY_CALM } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { RACE_TRACKS } from "../tracks/race";
import { CHAMPIONSHIP_ROUNDS, playerRoundTime, POINTS, roundDone, roundKey, roundSession, standings } from "./championship";
import { formatTime } from "./format";
import { GameScreen } from "./GameScreen";
import { useMounted } from "./useMounted";

const trackDef = (id: string) => RACE_TRACKS.find((t) => t.id === id)!;

function useSeason() {
  const season = useGameStore((s) => s.championship.season);
  const race = useGameStore((s) => s.race);
  return { season, race };
}

export function ChampionshipView() {
  const mounted = useMounted();
  const { season, race } = useSeason();
  const newSeason = useGameStore((s) => s.newSeason);
  const [confirming, setConfirming] = useState(false);
  const table = useMemo(() => (mounted ? standings(season, race) : []), [mounted, season, race]);
  if (!mounted) return <div className="grid min-h-dvh place-items-center text-white/50">Cargando…</div>;

  const done = CHAMPIONSHIP_ROUNDS.map((_, r) => roundDone(race[roundKey(season, r)]));
  const finished = done.every(Boolean);
  const nextRound = done.findIndex((d) => !d);
  const playerPos = table.findIndex((r) => r.isPlayer) + 1;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <Link href="/" className="text-sm text-white/60 hover:text-white">
        ← Menú
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-amber-300">Temporada {season}</div>
          <h1 className="text-3xl font-black uppercase italic tracking-tight">Campeonato</h1>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            {CHAMPIONSHIP_ROUNDS.length} rondas contra 6 rivales. En cada ronda tenés {3} intentos y cuenta tu mejor tiempo. Puntos: {POINTS.join(" · ")}.
          </p>
        </div>
        {finished && (
          <div className={`rounded-2xl px-5 py-3 text-center ${playerPos === 1 ? "bg-amber-400 text-black" : "bg-white/10"}`}>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-70">Temporada terminada</div>
            <div className="text-2xl font-black">{playerPos === 1 ? "🏆 ¡Campeón!" : `Terminaste ${playerPos}º`}</div>
          </div>
        )}
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {CHAMPIONSHIP_ROUNDS.map((id, r) => {
          const def = trackDef(id);
          const p = race[roundKey(season, r)];
          const open = r === 0 || done[r - 1];
          const t = playerRoundTime(p);
          const card = (
            <div
              className={`flex h-full flex-col gap-2 rounded-2xl border p-4 transition ${
                open ? "border-white/10 bg-white/[0.03] hover:border-amber-400/60" : "border-white/5 opacity-45"
              } ${r === nextRound ? "ring-1 ring-amber-400/60" : ""}`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-white/50">RONDA {r + 1}</span>
                <span>{done[r] ? "✅ Terminada" : open ? (p?.attempts.length ? `${3 - p.attempts.length} intentos` : "Abierta") : "🔒"}</span>
              </div>
              <h3 className="text-lg font-semibold">{def.name}</h3>
              <div>
                <WeatherBadge conditions={def.conditions ?? DRY_CALM} view="map" />
              </div>
              <p className="mt-auto font-mono text-sm text-white/70">Tu tiempo: {formatTime(t)}</p>
            </div>
          );
          return open ? (
            <Link key={id} href={`/championship/${r}`}>
              {card}
            </Link>
          ) : (
            <div key={id}>{card}</div>
          );
        })}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Tabla de posiciones</h2>
        <table className="w-full overflow-hidden rounded-xl text-sm">
          <thead className="bg-white/5 text-left text-xs text-white/50">
            <tr>
              <th className="py-2 pl-3 font-normal">#</th>
              <th className="font-normal">Piloto</th>
              {CHAMPIONSHIP_ROUNDS.map((id, r) => (
                <th key={id} className="text-center font-normal">
                  R{r + 1}
                </th>
              ))}
              <th className="pr-3 text-right font-normal">Puntos</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, k) => (
              <tr key={row.id} className={`border-t border-white/5 ${row.isPlayer ? "bg-amber-400/10 font-semibold text-amber-100" : "text-white/80"}`}>
                <td className="py-2 pl-3 font-mono text-white/50">{k + 1}</td>
                <td>{row.name}</td>
                {row.rounds.map((pts, r) => (
                  <td key={r} className="text-center font-mono text-white/60">
                    {pts === null ? "·" : pts}
                  </td>
                ))}
                <td className="pr-3 text-right font-mono text-base">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        {nextRound >= 0 && (
          <Link href={`/championship/${nextRound}`} className="rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 font-bold uppercase tracking-widest">
            {race[roundKey(season, nextRound)] ? "Seguir" : "Correr"} ronda {nextRound + 1} →
          </Link>
        )}
        {confirming ? (
          <span className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
            ¿Empezar la temporada {season + 1}? La actual queda guardada pero ya no se puede seguir.
            <button
              type="button"
              onClick={() => {
                newSeason();
                setConfirming(false);
              }}
              className="rounded-md bg-amber-400 px-2.5 py-1 font-semibold text-black"
            >
              Sí
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="px-2 text-white/60">
              No
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
            {finished ? "Nueva temporada" : "Abandonar y empezar otra temporada"}
          </button>
        )}
      </section>
    </div>
  );
}

export function ChampionshipRound({ round }: { round: number }) {
  const mounted = useMounted();
  const { season, race } = useSeason();
  const session = useMemo(() => roundSession(season, round), [season, round]);
  if (!mounted) return <div className="grid h-dvh place-items-center text-white/50">Cargando…</div>;
  if (round > 0 && !roundDone(race[roundKey(season, round - 1)])) {
    return (
      <div className="grid h-dvh place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-lg">🔒 Primero terminá la ronda {round}.</p>
          <Link href={`/championship/${round - 1}`} className="inline-block rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">
            Ir a la ronda {round}
          </Link>
        </div>
      </div>
    );
  }
  return <GameScreen kind="session" session={session} />;
}
