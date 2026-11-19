"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Track } from "../sim/track";
import { windVector } from "../sim/constants";
import { DRY_CALM, type Conditions, type RaceResult } from "../sim/types";
import { CarModel, type CarHandle } from "./CarModel";
import { Particles, SkidMarks, StartGantry, type ParticlesHandle } from "./Effects";
import { Rain, type RainView } from "./Rain";
import { indexAt, toWorld } from "./geometry";
import type { PlaybackController } from "./playback";
import { Scenery } from "./Scenery";
import { Trace } from "./Trace";
import { TrackMesh } from "./TrackMesh";

export type CameraMode = "overview" | "follow";

/** Isometric view direction: from the camera towards the target. */
const OFFSET = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(600);

/** State shared between the car driver and the camera (updated every frame). */
class Shared implements RainView {
  pos = new THREE.Vector3();
  heading = 0;
  kmh = 0;
  shake = 0;
  /** Where the camera looks and how many metres fit on screen (for the rain volume). */
  center = new THREE.Vector3();
  span = 100;
  get car() {
    return this.pos;
  }
  get carHeading() {
    return this.heading;
  }
  setView(center: THREE.Vector3, span: number) {
    this.center.copy(center);
    this.span = span;
  }
  constructor(pos: THREE.Vector3, heading: number) {
    this.pos.copy(pos);
    this.heading = heading;
  }
  setCar(pos: THREE.Vector3, heading: number, kmh: number) {
    this.pos.copy(pos);
    this.heading = heading;
    this.kmh = kmh;
  }
  bump(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }
  /** Decay the shake and return a random camera offset for this frame. */
  jitter(dt: number) {
    this.shake *= Math.exp(-dt * 7);
    return new THREE.Vector3((Math.random() - 0.5) * this.shake, 0, (Math.random() - 0.5) * this.shake);
  }
}

function CameraRig({ track, mode, shared, userZoom }: { track: Track; mode: CameraMode; shared: Shared; userZoom: React.RefObject<number> }) {
  const target = useRef<THREE.Vector3 | null>(null);
  const zoom = useRef<number | null>(null);
  const span = useRef(90);

  const { center, corners } = useMemo(() => {
    const b = track.bounds;
    const pad = track.halfWidth + track.kerbWidth + track.runoffWidth + 10;
    const corners = [
      toWorld(b.minX - pad, b.minY - pad),
      toWorld(b.maxX + pad, b.minY - pad),
      toWorld(b.minX - pad, b.maxY + pad),
      toWorld(b.maxX + pad, b.maxY + pad),
    ];
    return { center: toWorld((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2), corners };
  }, [track]);

  useFrame((state, dt) => {
    const cam = state.camera as THREE.OrthographicCamera;
    const size = state.size;
    const sh = shared;
    // orientation never changes, so measure the overview extent in camera space
    cam.position.copy(OFFSET);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    let ex = 0;
    let ey = 0;
    const inv = cam.matrixWorldInverse;
    const c = center.clone().applyMatrix4(inv);
    for (const p of corners) {
      const q = p.clone().applyMatrix4(inv);
      ex = Math.max(ex, Math.abs(q.x - c.x));
      ey = Math.max(ey, Math.abs(q.y - c.y));
    }
    const fit = Math.min(size.width / (ex * 2.1), size.height / (ey * 2.1));
    // follow: zoom out with speed, look ahead where the car is going
    span.current += (75 + sh.kmh * 0.3 - span.current) * (1 - Math.exp(-dt * 1.5));
    const follow = Math.min(size.width, size.height) / span.current;
    const ahead = sh.kmh * 0.1;
    const followTarget = sh.pos.clone().add(new THREE.Vector3(Math.cos(sh.heading) * ahead, 0, -Math.sin(sh.heading) * ahead));

    const wantTarget = mode === "follow" ? followTarget : center;
    const wantZoom = (mode === "follow" ? follow : fit) * (userZoom.current ?? 1);
    if (!target.current || zoom.current === null) {
      target.current = wantTarget.clone();
      zoom.current = wantZoom;
    }
    const k = 1 - Math.exp(-dt * (mode === "follow" ? 5 : 3));
    target.current.lerp(wantTarget, k);
    zoom.current += (wantZoom - zoom.current) * k;

    const jitter = sh.jitter(dt);
    cam.position.copy(target.current).add(OFFSET).add(jitter);
    cam.lookAt(target.current.clone().add(jitter));
    cam.zoom = zoom.current;
    cam.updateProjectionMatrix();
    sh.setView(target.current, Math.min(size.width, size.height) / zoom.current);
  });
  return null;
}

function Sun({ shared, rain }: { shared: Shared; rain: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const tgt = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!light.current) return;
    const p = shared.pos;
    tgt.position.copy(p);
    light.current.position.copy(p).add(new THREE.Vector3(-60, 120, 40));
    tgt.updateMatrixWorld();
  });
  return (
    <>
      <primitive object={tgt} />
      <directionalLight
        ref={light}
        target={tgt}
        intensity={rain ? 0.9 : 2.4}
        color={rain ? "#dfe6ee" : "#fff4e0"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0005}
      />
    </>
  );
}

const REAR = new THREE.Vector3(-2.7, 0, 0);

function CarDriver({
  track,
  playback,
  shared,
  puffs,
  sparks,
  rain,
}: {
  track: Track;
  rain: boolean;
  playback: PlaybackController;
  shared: Shared;
  puffs: React.RefObject<ParticlesHandle | null>;
  sparks: React.RefObject<ParticlesHandle | null>;
}) {
  const car = useRef<CarHandle>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const emitAcc = useRef(0);
  const wallCursor = useRef({ result: null as RaceResult | null, k: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    playback.advance(dt);
    const f = playback.frame;
    const x = f ? f.x : track.xs[0];
    const y = f ? f.y : track.ys[0];
    const heading = f ? f.heading : track.hdg[0];
    const rolled = last.current ? Math.hypot(x - last.current.x, y - last.current.y) : 0;
    last.current = { x, y };
    const pos = toWorld(x, y);
    const sh = shared;
    sh.setCar(pos, heading, f ? f.speed * 3.6 : 0);
    car.current?.update(pos, heading, f ? f.steer : 0, rolled);

    if (!f || playback.state !== "playing") return;

    // particles, throttled to ~30 emissions/s of game time
    emitAcc.current += dt * playback.speed;
    const vel = new THREE.Vector3(Math.cos(heading) * f.speed, 0, -Math.sin(heading) * f.speed);
    const rear = REAR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(pos);
    while (emitAcc.current > 1 / 30) {
      emitAcc.current -= 1 / 30;
      const off = f.surface === "grass" || f.surface === "gravel";
      if (off && f.speed > 4) puffs.current?.emit(f.surface === "gravel" ? "dust" : "grass", rear, f.surface === "gravel" ? 3 : 2, vel);
      else if ((f.spinning || f.slip > 0.4) && f.speed > 3) puffs.current?.emit("smoke", rear, f.spinning ? 3 : 1, vel);
      else if (rain && f.speed > 15) puffs.current?.emit("spray", rear, f.speed > 50 ? 2 : 1, vel);
    }

    // sparks + camera shake on wall hits
    const wc = wallCursor.current;
    if (wc.result !== playback.result) {
      wc.result = playback.result;
      wc.k = 0;
    }
    const events = playback.result?.events ?? [];
    while (wc.k < events.length && events[wc.k].t <= playback.time) {
      const e = events[wc.k++];
      if (e.type === "wall") {
        sparks.current?.emit("spark", toWorld(e.x, e.y, 0.5), 24, vel);
        sh.bump(Math.min(6, 1.5 + e.kmh / 40));
      } else if (e.type === "spin") {
        sh.bump(1.2);
      }
    }
  });
  return <CarModel ref={car} scale={1.7} />;
}

function GhostDriver({ playback }: { playback: PlaybackController }) {
  const car = useRef<CarHandle>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  useFrame(() => {
    const f = playback.ghostFrame;
    car.current?.setVisible(!!f);
    if (!f) {
      last.current = null;
      return;
    }
    const rolled = last.current ? Math.hypot(f.x - last.current.x, f.y - last.current.y) : 0;
    last.current = { x: f.x, y: f.y };
    car.current?.update(toWorld(f.x, f.y, 0.02), f.heading, f.steer, rolled);
  });
  return <CarModel ref={car} scale={1.7} ghost />;
}

export interface RaceSceneProps {
  track: Track;
  playback: PlaybackController;
  /** Run whose trace (path, ticks, events) is drawn. */
  trace: RaceResult | null;
  /** Run currently loaded in the playback (for skid marks). */
  run: RaceResult | null;
  mode: CameraMode;
  conditions?: Conditions;
}

export default function RaceScene({ track, playback, trace, run, mode, conditions = DRY_CALM }: RaceSceneProps) {
  const rain = conditions.rain;
  const [wx, wy] = windVector(conditions);
  const drift: [number, number, number] = [wx * 0.6, 0, -wy * 0.6];
  const shared = useMemo(() => new Shared(toWorld(track.xs[0], track.ys[0]), track.hdg[0]), [track]);
  const userZoom = useRef(1);
  const puffs = useRef<ParticlesHandle>(null);
  const sparks = useRef<ParticlesHandle>(null);
  const gantryAt = indexAt(track, track.closed ? 6 : 8);

  return (
    <div
      className="absolute inset-0"
      onWheel={(e) => {
        userZoom.current = Math.max(0.5, Math.min(4, userZoom.current * Math.exp(-e.deltaY * 0.0015)));
      }}
    >
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ position: OFFSET.toArray(), near: 1, far: 3000, zoom: 1 }} gl={{ antialias: true }}>
        <color attach="background" args={[rain ? "#8c99a5" : "#9fd3e8"]} />
        <hemisphereLight args={[rain ? "#c9d3dc" : "#dff3ff", rain ? "#3f5a33" : "#5a7d3a", rain ? 1.6 : 1.1]} />
        <Sun shared={shared} rain={rain} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[8000, 8000]} />
          <meshStandardMaterial color={rain ? "#4f8436" : "#5f9a3f"} roughness={1} />
        </mesh>
        <TrackMesh track={track} wet={rain} />
        <Scenery track={track} />
        <StartGantry x={track.xs[gantryAt]} y={track.ys[gantryAt]} heading={track.hdg[gantryAt]} halfWidth={track.halfWidth} playback={playback} />
        {run && <SkidMarks result={run} playback={playback} />}
        {trace && <Trace result={trace} labelEvery={track.closed ? 5 : 2} />}
        {/* CarDriver advances the playback, so it must update before the ghost reads it */}
        <CarDriver track={track} playback={playback} shared={shared} puffs={puffs} sparks={sparks} rain={rain} />
        <GhostDriver playback={playback} />
        <Particles ref={puffs} max={rain ? 800 : 500} drift={drift} />
        {rain && <Rain view={shared} wind={[wx, wy]} />}
        <Particles ref={sparks} max={160} glow />
        <CameraRig track={track} mode={mode} shared={shared} userZoom={userZoom} />
      </Canvas>
    </div>
  );
}
