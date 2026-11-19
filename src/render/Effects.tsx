"use client";

import { useFrame } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RaceResult } from "../sim/types";
import { toWorld } from "./geometry";
import type { PlaybackController } from "./playback";

export type ParticleKind = "smoke" | "dust" | "grass" | "spark" | "spray";

interface KindConfig {
  life: number;
  size: [number, number];
  color: string;
  spread: number;
  up: number;
  gravity: number;
}

const KINDS: Record<ParticleKind, KindConfig> = {
  smoke: { life: 1.8, size: [1.2, 5.5], color: "#e4e4e2", spread: 2, up: 1.6, gravity: 0 },
  dust: { life: 1.1, size: [0.9, 3.6], color: "#d2b98a", spread: 3, up: 2.2, gravity: -1 },
  grass: { life: 0.8, size: [0.6, 2.2], color: "#7c9a45", spread: 3, up: 2.5, gravity: -3 },
  spray: { life: 0.75, size: [1.0, 4.2], color: "#dfe7ee", spread: 2.5, up: 1.2, gravity: 0 },
  spark: { life: 0.4, size: [0.35, 0.05], color: "#ffc04d", spread: 14, up: 6, gravity: -30 },
};

export interface ParticlesHandle {
  emit: (kind: ParticleKind, pos: THREE.Vector3, count: number, vel?: THREE.Vector3) => void;
  clear: () => void;
}

interface P {
  alive: boolean;
  kind: ParticleKind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
}

/** Pooled low-poly particles. `glow` pools use an unlit material (sparks). */
export const Particles = forwardRef<ParticlesHandle, { max: number; glow?: boolean; drift?: [number, number, number] }>(function Particles(
  { max, glow, drift },
  ref,
) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<P[]>([]);
  const next = useRef(0);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }), []);

  useEffect(() => {
    pool.current = Array.from({ length: max }, () => ({ alive: false, kind: "smoke" as ParticleKind, pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0 }));
    const m = mesh.current;
    if (!m) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      m.setMatrixAt(i, zero);
      m.setColorAt(i, new THREE.Color("#ffffff"));
    }
    m.instanceMatrix.needsUpdate = true;
  }, [max]);

  useImperativeHandle(ref, () => ({
    emit(kind, pos, count, vel) {
      const cfg = KINDS[kind];
      for (let n = 0; n < count; n++) {
        const idx = next.current;
        const p = pool.current[idx];
        next.current = (idx + 1) % max;
        if (!p) return;
        p.alive = true;
        p.kind = kind;
        p.age = Math.random() * 0.1;
        p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.3, (Math.random() - 0.5) * 1.5));
        p.vel.set((Math.random() - 0.5) * cfg.spread, cfg.up * (0.5 + Math.random()), (Math.random() - 0.5) * cfg.spread);
        if (vel) p.vel.addScaledVector(vel, 0.35);
        if (mesh.current) mesh.current.setColorAt(idx, tmp.c.set(cfg.color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
      }
      if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    },
    clear() {
      for (const p of pool.current) p.alive = false;
    },
  }));

  useFrame((_, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(rawDt, 0.05);
    pool.current.forEach((p, i) => {
      if (!p.alive) return;
      const cfg = KINDS[p.kind];
      p.age += dt;
      if (p.age >= cfg.life) {
        p.alive = false;
        m.setMatrixAt(i, tmp.m.makeScale(0, 0, 0));
        return;
      }
      p.vel.y += cfg.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-dt * (p.kind === "spark" ? 0.5 : 1.6)));
      p.pos.addScaledVector(p.vel, dt);
      // smoke, dust and spray are carried by the wind
      if (drift && p.kind !== "spark") {
        p.pos.x += drift[0] * dt;
        p.pos.z += drift[2] * dt;
      }
      if (p.pos.y < 0.1) {
        p.pos.y = 0.1;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      const k = p.age / cfg.life;
      const size = (cfg.size[0] + (cfg.size[1] - cfg.size[0]) * k) * (1 - k * k * k);
      m.setMatrixAt(i, tmp.m.compose(p.pos, tmp.q, tmp.s.setScalar(Math.max(0.001, size))));
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, max]} frustumCulled={false}>
      <icosahedronGeometry args={[0.5, 0]} />
      {glow ? <meshBasicMaterial toneMapped={false} /> : <meshStandardMaterial flatShading transparent opacity={0.8} depthWrite={false} roughness={1} />}
    </instancedMesh>
  );
});

/** Rear wheel offsets (car scale 1.7): x behind the centre, ± z per side. */
const REAR_X = -2.72;
const REAR_Z = 1.43;

/** Dark tyre marks wherever the car slid on asphalt, revealed as the playback passes them. */
export function SkidMarks({ result, playback }: { result: RaceResult; playback: PlaybackController }) {
  const { geometry, times } = useMemo(() => {
    const pos: number[] = [];
    const times: number[] = [];
    const f = result.frames;
    const w = 0.28;
    const wheel = (fr: (typeof f)[number], side: number) => {
      const c = Math.cos(fr.heading);
      const s = Math.sin(fr.heading);
      // sim coords: forward (c, s), left (−s, c)
      return { x: fr.x + c * REAR_X - s * REAR_Z * side, y: fr.y + s * REAR_X + c * REAR_Z * side, c, s };
    };
    const marking = (fr: (typeof f)[number]) => (fr.slip > 0.35 || fr.spinning) && fr.speed > 3 && (fr.surface === "asphalt" || fr.surface === "kerb");
    for (let k = 1; k < f.length; k++) {
      if (!marking(f[k]) || !marking(f[k - 1])) continue;
      for (const side of [-1, 1]) {
        const a = wheel(f[k - 1], side);
        const b = wheel(f[k], side);
        const quad = [
          [a.x + a.s * w, a.y - a.c * w],
          [a.x - a.s * w, a.y + a.c * w],
          [b.x - b.s * w, b.y + b.c * w],
          [b.x + b.s * w, b.y - b.c * w],
        ].map(([x, y]) => [x, 0.06, -y]);
        pos.push(...quad[0], ...quad[1], ...quad[2], ...quad[0], ...quad[2], ...quad[3]);
        times.push(f[k].t);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setDrawRange(0, 0);
    return { geometry, times };
  }, [result]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    // reveal the quads whose time has passed (binary search)
    const t = playback.result === result ? playback.time : Infinity;
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    geometry.setDrawRange(0, lo * 6);
  });

  if (times.length === 0) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#141414" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Start-light gantry over the grid, synced with the playback light sequence. */
export function StartGantry({ x, y, heading, halfWidth, playback }: { x: number; y: number; heading: number; halfWidth: number; playback: PlaybackController }) {
  const lights = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    const on = playback.lightsOn;
    lights.current.forEach((m, k) => {
      if (!m) return;
      const lit = k < on;
      m.color.set(lit ? "#ff2a1a" : "#2a0d0b");
      m.emissive.set(lit ? "#ff2a1a" : "#000000");
      m.emissiveIntensity = lit ? 2.5 : 0;
    });
  });
  const span = halfWidth * 2 + 4;
  return (
    <group position={toWorld(x, y)} rotation={[0, heading, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 4, (span / 2) * s]} castShadow>
          <boxGeometry args={[0.5, 8, 0.5]} />
          <meshStandardMaterial color="#5b6168" />
        </mesh>
      ))}
      <mesh position={[0, 8.2, 0]} castShadow>
        <boxGeometry args={[0.8, 0.8, span]} />
        <meshStandardMaterial color="#2a2e33" />
      </mesh>
      <mesh position={[0.45, 7, 0]}>
        <boxGeometry args={[0.3, 1.6, 6.2]} />
        <meshStandardMaterial color="#111316" />
      </mesh>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} position={[0.65, 7, -2.4 + k * 1.2]}>
          <sphereGeometry args={[0.42, 12, 10]} />
          <meshStandardMaterial
            ref={(m) => {
              lights.current[k] = m;
            }}
            color="#2a0d0b"
          />
        </mesh>
      ))}
    </group>
  );
}
