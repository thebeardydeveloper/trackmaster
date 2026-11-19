"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Track } from "../sim/track";
import { indexAt, mulberry32, placeTrees, toWorld } from "./geometry";

function Trees({ track }: { track: Track }) {
  const trees = useMemo(() => placeTrees(track), [track]);
  const pines = trees.filter((t) => t.kind === 0);
  const round = trees.filter((t) => t.kind === 1);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const pineTop = useRef<THREE.InstancedMesh>(null);
  const roundTop = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, k) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new THREE.Vector3(t.x, 1.5 * t.scale, t.z), q, new THREE.Vector3(t.scale, t.scale, t.scale));
      trunks.current?.setMatrixAt(k, m);
    });
    pines.forEach((t, k) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new THREE.Vector3(t.x, 6.5 * t.scale, t.z), q, new THREE.Vector3(t.scale, t.scale, t.scale));
      pineTop.current?.setMatrixAt(k, m);
    });
    round.forEach((t, k) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(new THREE.Vector3(t.x, 5.5 * t.scale, t.z), q, new THREE.Vector3(t.scale, t.scale * 0.9, t.scale));
      roundTop.current?.setMatrixAt(k, m);
    });
    for (const r of [trunks, pineTop, roundTop]) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [trees, pines, round]);

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 3, 6]} />
        <meshStandardMaterial color="#6b4a2f" flatShading />
      </instancedMesh>
      <instancedMesh ref={pineTop} args={[undefined, undefined, pines.length]} castShadow>
        <coneGeometry args={[3, 9, 7]} />
        <meshStandardMaterial color="#2f6b3a" flatShading />
      </instancedMesh>
      <instancedMesh ref={roundTop} args={[undefined, undefined, round.length]} castShadow>
        <icosahedronGeometry args={[3.6, 0]} />
        <meshStandardMaterial color="#4d8a3c" flatShading />
      </instancedMesh>
    </group>
  );
}

const SEAT_COLORS = ["#2c5ea8", "#e0e4ea", "#d8352a", "#f2b632"];

function Grandstand({ track, s, side, length }: { track: Track; s: number; side: "left" | "right"; length: number }) {
  const blocks = useMemo(() => {
    const out: { pos: THREE.Vector3; rot: number; color: string; seed: number }[] = [];
    const rnd = mulberry32(Math.round(s * 13));
    for (let d = 0; d < length; d += 22) {
      const i = indexAt(track, (s + d) % track.length);
      const sign = side === "left" ? 1 : -1;
      const wall = side === "left" ? track.wallL[i] : track.wallR[i];
      const off = (wall + 9) * sign;
      const x = track.xs[i] - Math.sin(track.hdg[i]) * off;
      const y = track.ys[i] + Math.cos(track.hdg[i]) * off;
      out.push({
        pos: toWorld(x, y),
        rot: track.hdg[i] + (side === "left" ? 0 : Math.PI),
        color: SEAT_COLORS[Math.floor(rnd() * SEAT_COLORS.length)],
        seed: rnd(),
      });
    }
    return out;
  }, [track, s, side, length]);

  return (
    <group>
      {blocks.map((b, k) => (
        // local +x along the track, local −z away from the track
        <group key={k} position={b.pos} rotation={[0, b.rot, 0]}>
          {[0, 1, 2, 3].map((tier) => (
            <mesh key={tier} position={[0, 1 + tier * 1.6, -2 - tier * 2.2]} castShadow receiveShadow>
              <boxGeometry args={[20, 2 + tier * 3.2, 2.4]} />
              <meshStandardMaterial color={tier % 2 ? "#cfd3d8" : b.color} />
            </mesh>
          ))}
          <mesh position={[0, 11, -6]} castShadow>
            <boxGeometry args={[21, 0.4, 11]} />
            <meshStandardMaterial color="#e9ecef" />
          </mesh>
          {[-9.5, 9.5].map((x) => (
            <mesh key={x} position={[x, 5.5, -10.5]} castShadow>
              <boxGeometry args={[0.5, 11, 0.5]} />
              <meshStandardMaterial color="#9aa1a9" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Pit building on the outside of the main straight (closed tracks only). */
function PitBuilding({ track }: { track: Track }) {
  const i = indexAt(track, Math.min(120, track.length * 0.05));
  const off = -(track.wallR[i] + 14);
  const x = track.xs[i] - Math.sin(track.hdg[i]) * off;
  const y = track.ys[i] + Math.cos(track.hdg[i]) * off;
  return (
    <group position={toWorld(x, y)} rotation={[0, track.hdg[i], 0]}>
      <mesh position={[0, 3, 0]} castShadow receiveShadow>
        <boxGeometry args={[140, 6, 14]} />
        <meshStandardMaterial color="#eef0f2" />
      </mesh>
      <mesh position={[0, 3.2, -7.05]}>
        <boxGeometry args={[136, 2.2, 0.1]} />
        <meshStandardMaterial color="#1d2a3a" metalness={0.4} roughness={0.2} />
      </mesh>
      <mesh position={[0, 7, 0]} castShadow>
        <boxGeometry args={[60, 2, 10]} />
        <meshStandardMaterial color="#ff5a36" />
      </mesh>
    </group>
  );
}

export function Scenery({ track }: { track: Track }) {
  return (
    <group>
      <Trees track={track} />
      {track.def.scenery.grandstands?.map((g, k) => <Grandstand key={k} track={track} {...g} />)}
      {track.closed && <PitBuilding track={track} />}
    </group>
  );
}
