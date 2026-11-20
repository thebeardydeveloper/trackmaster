"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerTable } from "../editor/CornerTable";
import { NodeEditor } from "../editor/NodeEditor";
import { SetupPanel } from "../editor/SetupPanel";
import { DeltaStat, SectorChip, Stars, Stat, WeatherBadge, WindArrow } from "../ui";
import { Timeline } from "../editor/Timeline";
import { RaceAudio } from "../render/audio";
import { PlaybackController } from "../render/playback";
import type { CameraMode } from "../render/RaceScene";
import { bestSectors, lookupTime, progressTimeline, SECTOR_COUNT, sectorBounds, sectorColor, sectorTimes, type SectorColor } from "../sim/sectors";
import { cornerLimitKmh } from "../sim/constants";
import { basePlan } from "../sim/basePlan";
import { simulate, trackConditions } from "../sim/simulate";
import { DEFAULT_SETUP, type CarSetup, type Conditions, type Instruction, type RaceResult } from "../sim/types";
import { TRAINING_LEVELS } from "../tracks/training";
import { getRaceTrack, getTrainingTrack, starsFor, type RaceTrackInfo, type TrainingTrackInfo } from "./catalog";
import { formatDelta, formatTime } from "./format";
import { hintsFor, type Hint } from "./hints";
import { useMounted } from "./useMounted";
import { CHAMPIONSHIP_ROUNDS, classifyRound } from "./championship";
import type { RaceSession } from "./session";
import { attemptConfig, bestAttempt, MAX_ATTEMPTS, useGameStore, type GhostMode } from "../store/gameStore";

const RaceScene = dynamic(() => import("../render/RaceScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-white/50">Cargando pista…</div>,
});

type Phase = "edit" | "running" | "result";

interface RunCompare {
  ghost: RaceResult | null;
  ghostLabel: string;
  ghostLine: Float64Array | null;
  sectors: (number | null)[];
  personal: (number | null)[];
  overall: (number | null)[];
}

function chipColor(c: RunCompare, k: number): SectorColor | null {
  const t = c.sectors[k];
  return t === null ? null : sectorColor(t, c.personal[k], c.overall[k]);
}

const GHOST_LABEL: Record<GhostMode, string> = { best: "Fantasma: mi mejor", record: "Fantasma: récord", off: "Sin fantasma" };
type Tab = "nodes" | "track" | "guide";

export type GameScreenProps = { kind: "training"; id: string } | { kind: "session"; session: RaceSession };

export function GameScreen(props: GameScreenProps) {
  const mounted = useMounted();
  const session = props.kind === "session" ? props.session : null;
  const trainingId = props.kind === "training" ? props.id : null;
  const info = useMemo(
    () => (session ? getRaceTrack(session.trackId, session.conditions) : getTrainingTrack(trainingId!)),
    [session, trainingId],
  );
  if (!info) return <p className="p-8 text-white">Pista no encontrada.</p>;
  if (!mounted) return <div className="grid h-dvh place-items-center bg-[#0b0f14] text-white/50">Cargando…</div>;
  return <LevelGate info={info} session={session} />;
}

function LevelGate({ info, session }: { info: RaceTrackInfo | TrainingTrackInfo; session: RaceSession | null }) {
  const training = useGameStore((s) => s.training);
  if (info.kind === "training" && info.level.number > 1) {
    const prev = TRAINING_LEVELS.find((l) => l.number === info.level.number - 1)!;
    if (!training[prev.id]?.stars) {
      return (
        <div className="grid h-dvh place-items-center bg-[#0b0f14] p-6 text-center text-white">
          <div className="space-y-3">
            <p className="text-lg">🔒 Primero superá el nivel {prev.number}: «{prev.title}».</p>
            <Link href={`/training/${prev.id}`} className="inline-block rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black">
              Ir al nivel {prev.number}
            </Link>
          </div>
        </div>
      );
    }
  }
  return <Game info={info} session={session} />;
}


const HINT_STYLE: Record<Hint["tone"], string> = {
  good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  bad: "border-red-400/40 bg-red-400/10 text-red-100",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-100",
};

function Game({ info, session }: { info: RaceTrackInfo | TrainingTrackInfo; session: RaceSession | null }) {
  const track = info.track;
  const isRace = info.kind === "race";
  const level = info.kind === "training" ? info.level : null;
  /** Where this session's attempts are stored. */
  const storeKey = session?.key ?? info.id;
  const isChamp = session?.kind === "championship";

  const raceProgress = useGameStore((s) => s.race[storeKey]);
  const closeRace = useGameStore((s) => s.closeRace);
  const trainingProgress = useGameStore((s) => s.training[info.id]);
  const setRaceDraft = useGameStore((s) => s.setRaceDraft);
  const setTrainingDraft = useGameStore((s) => s.setTrainingDraft);
  const addRaceAttempt = useGameStore((s) => s.addRaceAttempt);
  const addTrainingRun = useGameStore((s) => s.addTrainingRun);

  const draft: Instruction[] = isRace
    ? (raceProgress?.draft ?? [])
    : (trainingProgress?.draft ?? (trainingProgress ? [] : (level?.starter ?? [])));
  const setDraft = (d: Instruction[]) => (isRace ? setRaceDraft(storeKey, d) : setTrainingDraft(info.id, d));

  const attempts = raceProgress?.attempts ?? [];
  const attemptsLeft = MAX_ATTEMPTS - attempts.length;
  const locked = isRace && (attemptsLeft <= 0 || !!raceProgress?.closed);
  const best = bestAttempt(raceProgress);

  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);

  // the reference driver's run: ghost "record" and benchmark for purple sectors
  const referenceRun = useMemo(() => simulate(track, info.reference, { setup: info.referenceSetup }), [track, info]);
  const conditions = trackConditions(track);
  const setup: CarSetup = (isRace ? raceProgress?.setup : null) ?? DEFAULT_SETUP;
  const setRaceSetup = useGameStore((s) => s.setRaceSetup);
  const bounds = useMemo(() => sectorBounds(track), [track]);

  // last run (re-simulated from the saved instructions so it survives reloads)
  const [current, setCurrent] = useState<RaceResult | null>(() => {
    if (isRace) {
      const last = attempts[attempts.length - 1];
      return last ? simulate(track, last.instructions, attemptConfig(last)) : null;
    }
    const prev = trainingProgress?.lastInstructions;
    return prev ? simulate(track, prev) : null;
  });
  /** Setup and weather the shown run was driven with (for hints and corner limits). */
  const [runCfg, setRunCfg] = useState<{ setup: CarSetup; conditions: Conditions }>(() => {
    const last = isRace ? attempts[attempts.length - 1] : undefined;
    return last ? attemptConfig(last) : { setup: DEFAULT_SETUP, conditions };
  });
  const [phase, setPhase] = useState<Phase>(current ? "result" : "edit");
  const [showResult, setShowResult] = useState(false);
  const [tab, setTab] = useState<Tab>(level ? "guide" : "nodes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CameraMode>("overview");
  const [speedX, setSpeedX] = useState(1);
  /** Best time before the attempt being shown (so "vs. tu mejor" isn't always ±0). */
  const [prevBest, setPrevBest] = useState<number | null>(null);
  /** Start lights: null = hidden, 1..5 lit, 0 = lights out. */
  const [lights, setLights] = useState<number | null>(null);
  const [finishFlash, setFinishFlash] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [cmp, setCmp] = useState<RunCompare | null>(null);
  const playback = useMemo(() => new PlaybackController(), []);
  const audio = useMemo(() => new RaceAudio(), []);

  const timerRef = useRef<HTMLSpanElement>(null);
  const kmhRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const steerRef = useRef<HTMLSpanElement>(null);
  const deltaRef = useRef<HTMLSpanElement>(null);
  const cmpRef = useRef<RunCompare | null>(null);
  const nextSector = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (current) playback.show(current);
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ts = timers.current;
    return () => {
      ts.forEach((t) => window.clearTimeout(t));
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => audio.setMuted(settings.muted), [audio, settings.muted]);

  useEffect(() => {
    playback.setSpeed(speedX);
  }, [playback, speedX]);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    playback.listen({
      onLights: (n) => {
        setLights(n);
        audio.beep(n === 0);
        if (n === 0) later(() => setLights(null), 900);
      },
      onTick: (f) => {
        if (timerRef.current) timerRef.current.textContent = formatTime(f.t);
        if (kmhRef.current) kmhRef.current.textContent = String(Math.round(f.speed * 3.6));
        if (barRef.current) barRef.current.style.width = `${Math.max(0, Math.min(100, (f.progress / track.finishDistance) * 100))}%`;
        if (steerRef.current) steerRef.current.textContent = `${f.steer >= 0 ? "◀" : "▶"} ${Math.abs(f.steer).toFixed(1)}°`;
        audio.update(f);
        const line = cmpRef.current?.ghostLine;
        if (deltaRef.current && line) {
          const gt = lookupTime(line, f.progress);
          const el = deltaRef.current;
          if (Number.isNaN(gt) || f.progress < 5) {
            el.textContent = "—";
            el.style.color = "";
          } else {
            const d = f.t - gt;
            el.textContent = formatDelta(d);
            el.style.color = d <= 0 ? "#6ee7b7" : "#fca5a5";
          }
        }
        while (nextSector.current < bounds.length - 1 && f.progress >= bounds[nextSector.current]) {
          nextSector.current++;
          setRevealed(nextSector.current);
        }
      },
      onEvent: (e) => {
        if (e.type === "wall") audio.impact(Math.min(1, 0.4 + e.kmh / 150));
      },
      onDone: () => {
        audio.stop();
        setPhase("result");
        const finished = playback.result?.finished ?? false;
        if (finished) setRevealed(SECTOR_COUNT);
        if (finished) {
          setFinishFlash(true);
          later(() => {
            setFinishFlash(false);
            setShowResult(true);
          }, 1800);
        } else {
          setShowResult(true);
        }
      },
    });
    return () => playback.listen({});
  }, [playback, track, audio, bounds]);

  /** Ghost choice + sector benchmarks for a run, given the runs that came before it. */
  const buildCompare = (result: RaceResult, previous: RaceResult[]): RunCompare => {
    const personal = bestSectors(previous.map((r) => sectorTimes(track, r)));
    const overall = bestSectors([personal, sectorTimes(track, referenceRun)]);
    const bestPrev = previous.filter((r) => r.finished).sort((x, y) => (x.time as number) - (y.time as number))[0] ?? null;
    let ghost: RaceResult | null = null;
    let ghostLabel = "";
    const refLabel = isRace ? "Récord" : "Referencia 3★";
    if (settings.ghost === "record" || (settings.ghost === "best" && !bestPrev)) {
      ghost = referenceRun;
      ghostLabel = refLabel;
    } else if (settings.ghost === "best") {
      ghost = bestPrev;
      ghostLabel = "Tu mejor";
    }
    return {
      ghost,
      ghostLabel,
      ghostLine: ghost ? progressTimeline(ghost, track.finishDistance) : null,
      sectors: sectorTimes(track, result),
      personal,
      overall,
    };
  };

  const startPlayback = (result: RaceResult, c: RunCompare) => {
    cmpRef.current = c;
    nextSector.current = 0;
    setCmp(c);
    setRevealed(0);
    setLights(null);
    setFinishFlash(false);
    setCurrent(result);
    setShowResult(false);
    setPhase("running");
    setMode("follow");
    if (deltaRef.current) deltaRef.current.textContent = "—";
    audio.unlock();
    audio.start();
    playback.start(result, c.ghost);
  };

  const previousRuns = (): RaceResult[] =>
    isRace
      ? attempts.map((a) => simulate(track, a.instructions, attemptConfig(a)))
      : trainingProgress?.bestInstructions
        ? [simulate(track, trainingProgress.bestInstructions)]
        : [];

  const run = () => {
    if (locked || phase === "running") return;
    const result = simulate(track, draft, { setup, conditions });
    setRunCfg({ setup, conditions });
    const snapshot = draft.map((n) => ({ ...n, action: { ...n.action } }));
    const c = buildCompare(result, previousRuns());
    setPrevBest(isRace ? (best?.time ?? null) : (trainingProgress?.bestTime ?? null));
    if (isRace) {
      addRaceAttempt(storeKey, { time: result.time, dnfReason: result.dnfReason, instructions: snapshot, at: Date.now(), setup, conditions });
    } else {
      addTrainingRun(info.id, {
        time: result.time,
        stars: starsFor(info as TrainingTrackInfo, result.time, result.finishKmh),
        instructions: snapshot,
      });
    }
    startPlayback(result, c);
  };

  const replay = (r: RaceResult) => {
    startPlayback(r, cmp && current === r ? cmp : buildCompare(r, previousRuns().filter((p) => p.time !== r.time)));
  };

  const backToEdit = () => {
    setShowResult(false);
    setPhase("edit");
    setMode("overview");
  };

  const hints = useMemo(
    () =>
      current
        ? hintsFor(track, current, {
            maxFinishKmh: level?.maxFinishKmh,
            threeStars: info.kind === "training" ? info.stars.three : undefined,
            cornerLimit: (i) => cornerLimitKmh(track.corners[i].radius, runCfg.setup.wing, runCfg.conditions),
            rain: runCfg.conditions.rain,
          })
        : [],
    [current, track, level, info, runCfg],
  );
  const currentStars = current && info.kind === "training" ? starsFor(info, current.time, current.finishKmh) : 0;
  const nextLevel = level ? TRAINING_LEVELS.find((l) => l.number === level.number + 1) : undefined;

  const editingDisabled = locked || phase === "running";

  // race circuits start with a base plan: cruise at 100 km/h + one order per corner
  const loadRaceBase = useGameStore((s) => s.loadRaceBase);
  const needsBase = isRace && !locked && attempts.length === 0 && draft.length === 0 && !raceProgress?.baseLoaded;
  const loadBase = () => loadRaceBase(storeKey, basePlan(track, setup, conditions));
  useEffect(() => {
    if (!needsBase) return;
    // let the "generating" message paint first: planning takes ~1 s
    const id = window.setTimeout(() => loadRaceBase(storeKey, basePlan(track, setup, conditions)), 60);
    return () => window.clearTimeout(id);
  }, [needsBase, loadRaceBase, storeKey, track, setup, conditions]);

  return (
    <div className="flex h-dvh flex-col bg-[#0b0f14] text-white">
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 px-4 py-2.5">
        <Link href={session?.backHref ?? "/"} className="text-sm text-white/60 hover:text-white">
          ← {isChamp ? "Campeonato" : "Menú"}
        </Link>
        <div className="flex items-baseline gap-3">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/70">
            {session ? session.label : `Entrenamiento ${level?.number}/4`}
          </span>
          <h1 className="text-lg font-semibold tracking-tight">{level ? level.title : track.def.name}</h1>
          {isRace && <WeatherBadge conditions={conditions} />}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-5 text-xs text-white/60">
          {info.kind === "race" ? (
            <>
              <Stat label="Tiempo promedio" value={formatTime(info.averageTime)} />
              <Stat label="Récord de la pista" value={formatTime(Math.min(info.recordTime, best?.time ?? Infinity))} accent />
              <Stat label="Tu mejor" value={formatTime(best?.time)} />
              <div className="flex items-center gap-1.5" title="Intentos">
                <span>Intentos</span>
                {Array.from({ length: MAX_ATTEMPTS }, (_, k) => (
                  <span key={k} className={`h-2.5 w-2.5 rounded-full ${k < attempts.length || locked ? "bg-white/15" : "bg-amber-400"}`} />
                ))}
              </div>
            </>
          ) : (
            <>
              <Stat label="3★" value={`≤ ${info.stars.three.toFixed(1)}`} />
              <Stat label="2★" value={`≤ ${info.stars.two.toFixed(1)}`} />
              <Stat label="Tu mejor" value={formatTime(trainingProgress?.bestTime)} />
              <Stars n={trainingProgress?.stars ?? 0} />
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left: 3D + timeline */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <RaceScene track={track} playback={playback} trace={phase === "running" ? null : current} run={current} mode={mode} conditions={conditions} />
            {conditions.windKmh > 0 && (
              <div className="pointer-events-none absolute bottom-6 left-4 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
                <WindArrow conditions={conditions} view="iso" className="text-lg text-sky-300" />
                <span>Viento {conditions.windKmh} km/h</span>
              </div>
            )}

            {/* HUD */}
            <div className={`pointer-events-none absolute left-4 top-4 flex gap-3 transition-opacity ${phase === "running" ? "opacity-100" : "opacity-0"}`}>
              <div className="rounded-xl bg-black/70 px-4 py-2 shadow-lg backdrop-blur">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Tiempo</div>
                <span ref={timerRef} className="font-mono text-3xl font-semibold tabular-nums">
                  0.000
                </span>
              </div>
              <div className="rounded-xl bg-black/70 px-4 py-2 shadow-lg backdrop-blur">
                <div className="text-[10px] uppercase tracking-widest text-white/50">km/h</div>
                <span ref={kmhRef} className="font-mono text-3xl font-semibold tabular-nums text-amber-300">
                  0
                </span>
              </div>
              <div className="rounded-xl bg-black/70 px-4 py-2 shadow-lg backdrop-blur">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Volante</div>
                <span ref={steerRef} className="font-mono text-xl tabular-nums text-sky-300">
                  0.0°
                </span>
              </div>
              {cmp?.ghost && (
                <div className="rounded-xl bg-black/70 px-4 py-2 shadow-lg backdrop-blur">
                  <div className="text-[10px] uppercase tracking-widest text-white/50">vs. {cmp.ghostLabel}</div>
                  <span ref={deltaRef} className="font-mono text-xl font-semibold tabular-nums">
                    —
                  </span>
                </div>
              )}
            </div>
            {cmp && (phase === "running" || finishFlash) && (
              <div className="pointer-events-none absolute left-4 top-[92px] flex gap-1.5">
                {Array.from({ length: SECTOR_COUNT }, (_, k) => (
                  <SectorChip key={k} index={k} time={cmp.sectors[k]} color={chipColor(cmp, k)} shown={k < revealed} />
                ))}
              </div>
            )}
            <div className={`pointer-events-none absolute inset-x-4 bottom-3 h-1.5 overflow-hidden rounded-full bg-black/40 ${phase === "running" ? "" : "hidden"}`}>
              <div ref={barRef} className="h-full w-0 bg-amber-400" />
            </div>

            {lights !== null && (
              <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
                <div className="flex gap-3 rounded-2xl bg-black/85 px-5 py-4 shadow-2xl ring-1 ring-white/10">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <div key={k} className="flex flex-col gap-2 rounded-lg bg-zinc-900 p-1.5">
                      {[0, 1].map((row) => (
                        <span
                          key={row}
                          className={`h-9 w-9 rounded-full transition-colors duration-75 ${
                            lights > 0 && k <= lights ? "bg-red-600 shadow-[0_0_24px_6px_rgba(239,68,68,0.7)]" : "bg-zinc-800"
                          }`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {lights === 0 && <span className="absolute top-28 animate-pulse text-4xl font-black italic tracking-tight text-white drop-shadow-lg">¡LARGARON!</span>}
              </div>
            )}

            {finishFlash && current?.finished && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div
                  className="animate-[flag_1.8s_ease-out] rounded-2xl px-10 py-6 text-center shadow-2xl"
                  style={{
                    backgroundImage: "repeating-conic-gradient(#111 0% 25%, #f4f4f4 0% 50%)",
                    backgroundSize: "36px 36px",
                  }}
                >
                  <div className="rounded-xl bg-black/85 px-6 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Bandera a cuadros</div>
                    <div className="font-mono text-5xl font-bold tabular-nums text-white">{formatTime(current.time)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* view controls */}
            <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
              <div className="flex overflow-hidden rounded-lg bg-black/60 text-xs backdrop-blur">
                {(["overview", "follow"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1.5 ${mode === m ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
                    {m === "overview" ? "Vista completa" : "Seguir auto"}
                  </button>
                ))}
              </div>
              {phase === "running" && (
                <div className="flex overflow-hidden rounded-lg bg-black/60 text-xs backdrop-blur">
                  {[1, 2, 4].map((s) => (
                    <button key={s} type="button" onClick={() => setSpeedX(s)} className={`px-2.5 py-1.5 ${speedX === s ? "bg-white/20" : "text-white/60 hover:text-white"}`}>
                      {s}×
                    </button>
                  ))}
                  <button type="button" onClick={() => playback.skip()} className="border-l border-white/10 px-3 py-1.5 text-white/80 hover:text-white">
                    Saltar ⏭
                  </button>
                </div>
              )}
              {phase === "result" && !showResult && current && (
                <button type="button" onClick={() => setShowResult(true)} className="rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur hover:text-white">
                  Ver resultado
                </button>
              )}
              <div className="flex overflow-hidden rounded-lg bg-black/60 text-xs backdrop-blur">
                <button
                  type="button"
                  onClick={() => setSettings({ muted: !settings.muted })}
                  className="px-3 py-1.5 text-white/80 hover:text-white"
                  title={settings.muted ? "Activar sonido" : "Silenciar"}
                >
                  {settings.muted ? "🔇" : "🔊"}
                </button>
                <select
                  aria-label="Fantasma"
                  value={settings.ghost}
                  onChange={(e) => setSettings({ ghost: e.target.value as GhostMode })}
                  className="border-l border-white/10 bg-transparent px-2 py-1.5 text-white/80 outline-none"
                >
                  {(Object.keys(GHOST_LABEL) as GhostMode[]).map((g) => (
                    <option key={g} value={g} className="bg-zinc-900">
                      {GHOST_LABEL[g]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-[10px] text-white/50 drop-shadow">Rueda del mouse: zoom</span>
            </div>

            {/* result card */}
            {phase === "result" && showResult && current && (
              <div className="absolute inset-0 grid place-items-center bg-black/35 p-4 backdrop-blur-[2px]">
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11161d]/95 p-5 shadow-2xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-white/50">
                        {current.finished ? (isRace ? "Tiempo de vuelta" : "Tiempo") : "Sin tiempo"}
                      </div>
                      <div className={`font-mono text-4xl font-semibold tabular-nums ${current.finished && (isRace || currentStars > 0) ? "text-white" : "text-red-400"}`}>
                        {current.finished ? formatTime(current.time) : current.dnfReason === "stopped" ? "Detenido" : "DNF"}
                      </div>
                    </div>
                    {!isRace && <Stars n={currentStars} size="text-3xl" />}
                  </div>
                  {info.kind === "race" && current.time !== null && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <DeltaStat label="vs. tu mejor" d={prevBest !== null ? current.time - prevBest : null} />
                      <DeltaStat label="vs. récord" d={current.time - info.recordTime} />
                      <DeltaStat label="vs. promedio" d={current.time - info.averageTime} />
                    </div>
                  )}
                  {cmp && (
                    <div className="mt-3 flex gap-1.5">
                      {Array.from({ length: SECTOR_COUNT }, (_, k) => (
                        <SectorChip key={k} index={k} time={cmp.sectors[k]} color={chipColor(cmp, k)} />
                      ))}
                    </div>
                  )}
                  {cmp?.ghost && current.time !== null && cmp.ghost.time !== null && (
                    <p className="mt-2 text-xs text-white/55">
                      vs. fantasma ({cmp.ghostLabel}):{" "}
                      <b className={`font-mono ${current.time <= cmp.ghost.time ? "text-emerald-300" : "text-red-300"}`}>{formatDelta(current.time - cmp.ghost.time)}</b>
                    </p>
                  )}
                  <ul className="mt-4 space-y-1.5">
                    {hints.map((h, k) => (
                      <li key={k} className={`rounded-lg border px-3 py-2 text-sm leading-snug ${HINT_STYLE[h.tone]}`}>
                        {h.text}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!locked && (
                      <button type="button" onClick={backToEdit} className="flex-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-300">
                        {isRace ? `Editar nodos (${attemptsLeft} ${attemptsLeft === 1 ? "intento" : "intentos"})` : "Editar nodos"}
                      </button>
                    )}
                    <button type="button" onClick={() => replay(current)} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                      Repetición
                    </button>
                    {nextLevel && currentStars > 0 && (
                      <Link href={`/training/${nextLevel.id}`} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400">
                        Nivel {nextLevel.number} →
                      </Link>
                    )}
                    {level && !nextLevel && currentStars > 0 && (
                      <Link href="/#carrera" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400">
                        ¡Listo! Ir a Carrera →
                      </Link>
                    )}
                    <button type="button" onClick={() => setShowResult(false)} className="rounded-lg px-3 py-2 text-sm text-white/60 hover:text-white">
                      Ver traza
                    </button>
                  </div>
                  {locked && !isChamp && (
                    <p className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-white/70">
                      {raceProgress?.closed ? "Cerraste la sesión" : `Usaste los ${MAX_ATTEMPTS} intentos`}. Tu tiempo queda en{" "}
                      <b className="font-mono text-white">{formatTime(best?.time)}</b>.
                    </p>
                  )}
                  {locked && isChamp && session?.season !== undefined && session.round !== undefined && (
                    <RoundClassification season={session.season} round={session.round} playerTime={best?.time ?? null} />
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-white/10 bg-[#0e1319] px-4 pb-2 pt-3">
            <Timeline track={track} nodes={draft} result={current} compare={cmp?.ghost ?? null} compareLabel={cmp?.ghostLabel} onChange={setDraft} disabled={editingDisabled} selectedId={selectedId} onSelect={(nid) => { setSelectedId(nid); setTab("nodes"); }} />
          </div>
        </main>

        {/* right: sidebar */}
        <aside className="flex w-[440px] shrink-0 flex-col border-l border-white/10 bg-[#0e1319]">
          <nav className="flex border-b border-white/10 text-sm">
            {(level ? (["guide", "nodes", "track"] as const) : (["nodes", "track"] as const)).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2.5 ${tab === t ? "border-b-2 border-amber-400 text-white" : "text-white/55 hover:text-white"}`}
              >
                {t === "nodes" ? `Órdenes (${draft.length})` : t === "track" ? "Curvas" : "Guía"}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            {tab === "nodes" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {isRace && (
                  <SetupPanel track={track} setup={setup} conditions={conditions} disabled={editingDisabled} onChange={(s) => setRaceSetup(storeKey, s)} />
                )}
                {isRace && !locked && (
                  <BasePlanBar generating={needsBase} hasNodes={draft.length > 0} disabled={editingDisabled} onLoad={loadBase} />
                )}
                <NodeEditor nodes={draft} onChange={setDraft} disabled={editingDisabled || needsBase} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
            )}
            {tab === "track" && (
              <div className="overflow-y-auto">
                <CornerTable track={track} result={current} setup={setup} conditions={conditions} />
              </div>
            )}
            {tab === "guide" && level && (
              <div className="space-y-4 overflow-y-auto text-sm leading-relaxed">
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Objetivo</div>
                  <p className="mt-1 text-white/90">{level.objective}</p>
                </div>
                <ol className="space-y-2.5">
                  {level.lessons.map((l, k) => (
                    <li key={k} className="flex gap-2.5 text-white/75">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] text-white/80">{k + 1}</span>
                      <span>{l}</span>
                    </li>
                  ))}
                </ol>
                {current && phase !== "running" && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Último intento</div>
                    {hints.map((h, k) => (
                      <p key={k} className={`rounded-lg border px-3 py-2 text-[13px] leading-snug ${HINT_STYLE[h.tone]}`}>
                        {h.text}
                      </p>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setTab("nodes")} className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15">
                  Ir a las órdenes →
                </button>
              </div>
            )}
          </div>
          <div className="border-t border-white/10 p-3">
            {locked ? (
              <div className="space-y-2">
                <p className="text-center text-sm text-white/60">
                  {isChamp ? "Ronda terminada" : "Circuito cerrado"} · mejor tiempo {formatTime(best?.time)}
                </p>
                {isChamp && session?.round !== undefined && (
                  <Link
                    href={session.round + 1 < CHAMPIONSHIP_ROUNDS.length ? `/championship/${session.round + 1}` : "/championship"}
                    className="block w-full rounded-xl bg-emerald-500 py-3 text-center text-sm font-semibold text-black hover:bg-emerald-400"
                  >
                    {session.round + 1 < CHAMPIONSHIP_ROUNDS.length ? `Ronda ${session.round + 2} →` : "Ver campeonato final →"}
                  </Link>
                )}
                {best && (
                  <button type="button" onClick={() => {
                      setRunCfg(attemptConfig(best));
                      replay(simulate(track, best.instructions, attemptConfig(best)));
                    }} className="w-full rounded-xl bg-white/10 py-3 text-sm font-semibold hover:bg-white/15">
                    Ver mi mejor vuelta
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={run}
                disabled={phase === "running" || draft.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-red-500 to-orange-500 py-3.5 text-base font-bold uppercase tracking-widest text-white shadow-lg shadow-red-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === "running" ? "En carrera…" : isRace ? `Largar · intento ${attempts.length + 1}/${MAX_ATTEMPTS}` : "Largar"}
              </button>
            )}
            {isChamp && !locked && attempts.length > 0 && phase !== "running" && (
              <CloseRoundButton onConfirm={() => closeRace(storeKey)} best={best?.time ?? null} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function BasePlanBar({ generating, hasNodes, disabled, onLoad }: { generating: boolean; hasNodes: boolean; disabled: boolean; onLoad: () => void }) {
  const [asking, setAsking] = useState(false);
  if (generating) {
    return <p className="animate-pulse rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">Armando un plan base que termina la vuelta a 100 km/h…</p>;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      {asking ? (
        <>
          <span className="flex-1">¿Reemplazar tus órdenes por el plan base?</span>
          <button
            type="button"
            onClick={() => {
              onLoad();
              setAsking(false);
            }}
            className="rounded-md bg-amber-400 px-2.5 py-1 font-semibold text-black"
          >
            Sí
          </button>
          <button type="button" onClick={() => setAsking(false)} className="px-2 py-1 hover:text-white">
            No
          </button>
        </>
      ) : (
        <>
          <span className="flex-1">Plan base: 100 km/h y una orden por curva (frena solo donde hace falta).</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => (hasNodes ? setAsking(true) : onLoad())}
            className="rounded-md border border-white/15 px-2.5 py-1 text-white/80 hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            Cargar plan base
          </button>
        </>
      )}
    </div>
  );
}

function CloseRoundButton({ onConfirm, best }: { onConfirm: () => void; best: number | null }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="mt-2 w-full rounded-lg py-2 text-xs text-white/60 hover:bg-white/5 hover:text-white">
        Terminar la ronda con mi mejor tiempo ({formatTime(best)})
      </button>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/5 p-2 text-xs">
      <span className="flex-1 text-white/70">¿Cerrar la ronda? No vas a poder usar los intentos que quedan.</span>
      <button type="button" onClick={onConfirm} className="rounded-md bg-amber-400 px-2.5 py-1 font-semibold text-black">
        Sí, cerrar
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-md px-2 py-1 text-white/60 hover:text-white">
        No
      </button>
    </div>
  );
}

function RoundClassification({ season, round, playerTime }: { season: number; round: number; playerTime: number | null }) {
  const rows = classifyRound(season, round, playerTime);
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/50">Clasificación de la ronda</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.isPlayer ? "bg-amber-400/15 font-semibold text-amber-100" : "text-white/80"}>
              <td className="w-7 py-1 pl-2 font-mono text-white/50">{r.position}</td>
              <td>{r.name}</td>
              <td className="text-right font-mono tabular-nums">{r.time === null ? "DNF" : formatTime(r.time)}</td>
              <td className="w-14 pr-2 text-right font-mono text-white/60">+{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


