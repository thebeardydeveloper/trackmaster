"use client";

import { Billboard, Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Track } from "../sim/track";
import { bandGeometry, indexAt, toWorld, wallGeometry } from "./geometry";

const C = {
  asphalt: new THREE.Color("#3a3d42"),
  line: new THREE.Color("#e9e9e4"),
  kerbRed: new THREE.Color("#d8352a"),
  kerbWhite: new THREE.Color("#f2f2ee"),
  runoff: new THREE.Color("#6fae4a"),
  gravel: new THREE.Color("#d9c38f"),
  barrierA: new THREE.Color("#c9302c"),
  barrierB: new THREE.Color("#f4f4f0"),
  barrierBase: new THREE.Color("#2a2c30"),
};

function checkerTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cells = 8;
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#111" : "#fff";
      ctx.fillRect((x * size) / cells, (y * size) / cells, size / cells, size / cells);
    }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function LineAcross({ track, s, depth, checker }: { track: Track; s: number; depth: number; checker: boolean }) {
  const i = indexAt(track, s);
  const tex = useMemo(() => (checker ? checkerTexture() : null), [checker]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (tex) tex.repeat.set(depth / 1.5, (track.halfWidth * 2) / 1.5);
  const p = toWorld(track.xs[i], track.ys[i], 0.05);
  return (
    <mesh position={p} rotation={[-Math.PI / 2, 0, track.hdg[i]]} receiveShadow>
      <planeGeometry args={[depth, track.halfWidth * 2]} />
      <meshStandardMaterial color={checker ? "#ffffff" : "#f5f5f0"} map={tex} />
    </mesh>
  );
}

export function TrackMesh({ track, wet = false }: { track: Track; wet?: boolean }) {
  const geos = useMemo(() => {
    const hw = track.halfWidth;
    const kw = track.kerbWidth;
    const stripe = (i: number) => Math.floor(track.s[i] / 3) % 2 === 0;
    const block = (i: number) => Math.floor(track.s[i] / 5) % 2 === 0;
    return {
      runoff: bandGeometry(track, (i) => -track.wallR[i], (i) => track.wallL[i], 0.01, () => C.runoff),
      gravelL: bandGeometry(track, () => hw + kw, (i) => track.wallL[i], 0.02, (i) => (track.gravelL[i] ? C.gravel : null)),
      gravelR: bandGeometry(track, (i) => -track.wallR[i], () => -(hw + kw), 0.02, (i) => (track.gravelR[i] ? C.gravel : null)),
      asphalt: bandGeometry(track, () => -hw, () => hw, 0.03, () => C.asphalt),
      lineL: bandGeometry(track, () => hw - 0.5, () => hw - 0.25, 0.04, () => C.line),
      lineR: bandGeometry(track, () => -(hw - 0.25), () => -(hw - 0.5), 0.04, () => C.line),
      kerbL: bandGeometry(track, () => hw, () => hw + kw, 0.045, (i) => (track.kerb[i] ? (stripe(i) ? C.kerbRed : C.kerbWhite) : null)),
      kerbR: bandGeometry(track, () => -(hw + kw), () => -hw, 0.045, (i) => (track.kerb[i] ? (stripe(i) ? C.kerbRed : C.kerbWhite) : null)),
      wallL: wallGeometry(track, (i) => track.wallL[i], 0, 1.1, (i) => (block(i) ? C.barrierA : C.barrierB)),
      wallR: wallGeometry(track, (i) => -track.wallR[i], 0, 1.1, (i) => (block(i) ? C.barrierA : C.barrierB)),
    };
  }, [track]);

  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  return (
    <group>
      {(["runoff", "gravelL", "gravelR", "asphalt", "lineL", "lineR", "kerbL", "kerbR"] as const).map((k) => (
        <mesh key={k} geometry={geos[k]} receiveShadow>
          <meshStandardMaterial
            vertexColors
            side={THREE.DoubleSide}
            roughness={k === "asphalt" ? (wet ? 0.35 : 0.85) : wet ? 0.75 : 1}
            color="#ffffff"
          />
        </mesh>
      ))}
      {(["wallL", "wallR"] as const).map((k) => (
        <mesh key={k} geometry={geos[k]} castShadow receiveShadow>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
      ))}
      {track.closed ? (
        <LineAcross track={track} s={0} depth={2.5} checker />
      ) : (
        <>
          <LineAcross track={track} s={0.5} depth={0.6} checker={false} />
          <LineAcross track={track} s={track.finishDistance} depth={2.5} checker />
        </>
      )}
      {track.corners.map((c) => {
        const i = indexAt(track, (c.sStart + c.sEnd) / 2);
        const side = c.dir === "right" ? 1 : -1; // label on the outside
        const off = (track.halfWidth + track.kerbWidth + track.runoffWidth * 0.6) * side;
        const x = track.xs[i] - Math.sin(track.hdg[i]) * off;
        const y = track.ys[i] + Math.cos(track.hdg[i]) * off;
        return (
          <Billboard key={c.index} position={toWorld(x, y, track.closed ? 12 : 6)}>
            <Text fontSize={track.closed ? 16 : 8} color="#ffffff" outlineWidth={track.closed ? 1.4 : 0.7} outlineColor="#111418" anchorX="center" anchorY="middle">
              {`T${c.index + 1}`}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}
