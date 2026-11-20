"use client";

import Link from "next/link";
import { RACE_TRACKS } from "../tracks/race";
import { TRAINING_LEVELS } from "../tracks/training";
import { bestAttempt, MAX_ATTEMPTS, useGameStore } from "../store/gameStore";
import { MiniMap, Stars, WeatherBadge } from "../ui";
import { DRY_CALM } from "../sim/types";
import { getRaceTrack, getTrainingTrack } from "./catalog";
import { CHAMPIONSHIP_ROUNDS, roundDone, roundKey, standings } from "./championship";
import { dailyChallenge, dailyHistory, dailyKey, dailyStreak, formatDay, localDateStr } from "./daily";
import { formatTime } from "./format";
import { useMounted } from "./useMounted";

export function TrainingSection() {
  const mounted = useMounted();
  const training = useGameStore((s) => s.training);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Entrenamiento</h2>
          <p className="text-sm text-white/55">Cuatro niveles cortos para aprender cada orden. Intentos ilimitados.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRAINING_LEVELS.map((l, k) => {
          const info = getTrainingTrack(l.id)!;
          const p = mounted ? training[l.id] : undefined;
          const prev = k > 0 ? TRAINING_LEVELS[k - 1] : null;
          const unlocked = !prev || (mounted && (training[prev.id]?.stars ?? 0) > 0);
          const card = (
            <div
              className={`group flex h-full flex-col gap-3 rounded-2xl border p-4 transition ${
                unlocked ? "border-white/10 bg-white/[0.03] hover:border-amber-400/60 hover:bg-white/[0.06]" : "border-white/5 bg-white/[0.015] opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-white/45">NIVEL {l.number}</span>
                {unlocked ? <Stars n={p?.stars ?? 0} size="text-base" /> : <span className="text-sm">🔒</span>}
              </div>
              <MiniMap track={info.track} className="h-20 w-full text-white/70 transition group-hover:text-white" />
              <div>
                <h3 className="font-semibold">{l.title}</h3>
                <p className="text-sm leading-snug text-white/55">{l.summary}</p>
              </div>
              {p?.bestTime != null && <p className="mt-auto font-mono text-xs text-white/60">Mejor: {formatTime(p.bestTime)}</p>}
            </div>
          );
          return unlocked ? (
            <Link key={l.id} href={`/training/${l.id}`}>
              {card}
            </Link>
          ) : (
            <div key={l.id} title={`Superá el nivel ${prev?.number} para desbloquear`}>
              {card}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RaceSection() {
  const mounted = useMounted();
  const race = useGameStore((s) => s.race);
  return (
    <section id="carrera" className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Carrera libre</h2>
        <p className="text-sm text-white/55">Una vuelta, {MAX_ATTEMPTS} intentos. Entre intento e intento podés editar tus órdenes. Al final queda tu mejor tiempo.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {RACE_TRACKS.map((def) => {
          const info = getRaceTrack(def.id)!;
          const p = mounted ? race[def.id] : undefined;
          const used = p?.attempts.length ?? 0;
          const best = bestAttempt(p);
          const done = used >= MAX_ATTEMPTS;
          return (
            <Link
              key={def.id}
              href={`/track/${def.id}`}
              className="group grid grid-cols-[140px_1fr] gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-red-400/60 hover:bg-white/[0.06]"
            >
              <MiniMap track={info.track} className="h-[140px] w-[140px] text-white/70 transition group-hover:text-white" />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl font-semibold tracking-tight">{def.name}</h3>
                  <div className="flex gap-1 pt-2" title={`${MAX_ATTEMPTS - used} intentos restantes`}>
                    {Array.from({ length: MAX_ATTEMPTS }, (_, k) => (
                      <span key={k} className={`h-2 w-2 rounded-full ${k < used ? "bg-white/15" : "bg-amber-400"}`} />
                    ))}
                  </div>
                </div>
                <p className="text-sm leading-snug text-white/55">{def.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                  <span>
                    {(info.track.length / 1000).toFixed(2)} km · {info.track.corners.length} curvas
                  </span>
                  <WeatherBadge conditions={def.conditions ?? DRY_CALM} view="map" />
                </div>
                <dl className="mt-auto grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-white/45">Promedio</dt>
                    <dd className="font-mono tabular-nums">{formatTime(info.averageTime)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Récord</dt>
                    <dd className="font-mono tabular-nums text-amber-300">{formatTime(Math.min(info.recordTime, best?.time ?? Infinity))}</dd>
                  </div>
                  <div>
                    <dt className="text-white/45">Tu mejor</dt>
                    <dd className="font-mono tabular-nums">{formatTime(best?.time)}</dd>
                  </div>
                </dl>
                <span className={`mt-1 text-sm font-semibold ${done ? "text-white/50" : "text-red-400 group-hover:text-red-300"}`}>
                  {done ? "Cerrado · ver mi vuelta →" : used ? `Seguir (${MAX_ATTEMPTS - used} intentos) →` : "Correr →"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DailySection() {
  const mounted = useMounted();
  const race = useGameStore((s) => s.race);
  if (!mounted) return <section className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />;
  const today = localDateStr();
  const c = dailyChallenge(today);
  const info = getRaceTrack(c.trackId, c.conditions)!;
  const p = race[dailyKey(today)];
  const used = p?.attempts.length ?? 0;
  const best = bestAttempt(p)?.time ?? null;
  const streak = dailyStreak(race, today);
  const history = dailyHistory(race, today, 7).slice(1);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Desafío diario</h2>
        <p className="text-sm text-white/55">Un circuito y un clima nuevos cada día, iguales para todos. {MAX_ATTEMPTS} intentos.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Link
          href="/daily"
          className="group grid grid-cols-[120px_1fr] gap-5 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-transparent p-5 transition hover:border-amber-400/70"
        >
          <MiniMap track={info.track} className="h-[120px] w-[120px] text-white/70 transition group-hover:text-white" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="font-mono text-xs uppercase tracking-widest text-amber-300">Hoy · {formatDay(today)}</div>
            <h3 className="text-xl font-semibold tracking-tight">{info.track.def.name}</h3>
            <div>
              <WeatherBadge conditions={c.conditions} view="map" />
            </div>
            <dl className="mt-auto grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-white/45">Récord</dt>
                <dd className="font-mono tabular-nums text-amber-300">{formatTime(Math.min(info.recordTime, best ?? Infinity))}</dd>
              </div>
              <div>
                <dt className="text-white/45">Tu mejor</dt>
                <dd className="font-mono tabular-nums">{formatTime(best)}</dd>
              </div>
              <div>
                <dt className="text-white/45">Intentos</dt>
                <dd className="font-mono tabular-nums">{MAX_ATTEMPTS - used} / {MAX_ATTEMPTS}</dd>
              </div>
            </dl>
            <span className="text-sm font-semibold text-amber-300">{used >= MAX_ATTEMPTS ? "Ver mi vuelta de hoy →" : used ? "Seguir →" : "Jugar el desafío →"}</span>
          </div>
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-white/60">Racha</span>
            <span className="text-2xl font-black">🔥 {streak} {streak === 1 ? "día" : "días"}</span>
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {history.map((h) => (
              <li key={h.dateStr} className="flex items-center justify-between gap-2 text-white/60">
                <span className="w-20 capitalize">{formatDay(h.dateStr)}</span>
                <span className="flex-1 truncate">{RACE_TRACKS.find((t) => t.id === h.trackId)?.name}</span>
                <span className="font-mono tabular-nums">{h.best !== null ? formatTime(h.best) : h.played ? "DNF" : "—"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/35">Los desafíos de días anteriores ya no se pueden jugar.</p>
        </div>
      </div>
    </section>
  );
}

function ChampionshipSection() {
  const mounted = useMounted();
  const race = useGameStore((s) => s.race);
  const season = useGameStore((s) => s.championship.season);
  const done = mounted ? CHAMPIONSHIP_ROUNDS.filter((_, r) => roundDone(race[roundKey(season, r)])).length : 0;
  const table = mounted && done > 0 ? standings(season, race) : [];
  const pos = table.findIndex((r) => r.isPlayer) + 1;
  const pts = table.find((r) => r.isPlayer)?.total ?? 0;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Campeonato</h2>
        <p className="text-sm text-white/55">
          {CHAMPIONSHIP_ROUNDS.length} rondas seguidas contra 6 rivales, con puntos por posición. Cada circuito con su clima.
        </p>
      </div>
      <Link
        href="/championship"
        className="flex flex-wrap items-center gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-red-400/60 hover:bg-white/[0.06]"
      >
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-white/45">Temporada {season}</div>
          <div className="text-xl font-semibold">
            {done === 0 ? "Sin empezar" : done === CHAMPIONSHIP_ROUNDS.length ? `Terminada · ${pos}º` : `Ronda ${done + 1} de ${CHAMPIONSHIP_ROUNDS.length}`}
          </div>
        </div>
        <div className="flex gap-1.5">
          {CHAMPIONSHIP_ROUNDS.map((id, r) => (
            <span key={id} className={`h-2 w-10 rounded-full ${r < done ? "bg-amber-400" : "bg-white/15"}`} />
          ))}
        </div>
        {done > 0 && (
          <div className="text-sm text-white/70">
            Vas <b className="text-white">{pos}º</b> con <b className="text-white">{pts}</b> puntos
          </div>
        )}
        <span className="ml-auto text-sm font-semibold text-red-400">{done === 0 ? "Empezar →" : "Ver campeonato →"}</span>
      </Link>
    </section>
  );
}

export function HomeMenu() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-6 py-12">
      <header className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="h-8 w-1.5 -skew-x-12 bg-red-500" />
          <span className="h-8 w-1.5 -skew-x-12 bg-amber-400" />
          <h1 className="text-4xl font-black uppercase italic tracking-tight sm:text-5xl">TrackMaster</h1>
        </div>
        <p className="max-w-2xl text-lg text-white/70">
          No vas a manejar. Vas a <b className="text-white">programar la vuelta</b>: armá la lista de órdenes que tu monoplaza va a seguir segundo a segundo, largá y mirá si
          aguanta en la pista.
        </p>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Estudiá la pista", "Curvas, radios, velocidad máxima de cada una y dónde empiezan."],
            ["Armá tus órdenes", "«A los 7,4 s, frenar a 120 km/h». «A los 8,1 s, girar 4,6° a la derecha durante 1,8 s»."],
            ["Largá y ajustá", "Mirá la traza, corregí los nodos y volvé a intentar."],
          ].map(([t, d], k) => (
            <li key={t} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <span className="font-mono text-xs text-amber-300">0{k + 1}</span>
              <h3 className="mt-1 font-semibold">{t}</h3>
              <p className="mt-1 text-white/55">{d}</p>
            </li>
          ))}
        </ol>
      </header>
      <TrainingSection />
      <DailySection />
      <ChampionshipSection />
      <RaceSection />
      <footer className="border-t border-white/10 pt-6 text-xs text-white/35">
        Categoría «Open Wheel» ficticia. Circuitos inventados. Tus tiempos se guardan en este navegador.
      </footer>
    </div>
  );
}
