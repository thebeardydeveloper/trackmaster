"use client";

import { Billboard, Line, Text } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { RaceResult } from "../sim/types";
import { speedColor, toWorld } from "./geometry";

const EVENT_STYLE = {
  spin: { color: "#ff3b30", label: "Trompo" },
  offtrack: { color: "#ff9f0a", label: "Afuera" },
  wall: { color: "#b3261e", label: "Muro" },
} as const;

/** Path of a finished run, coloured by speed, with a tick every second and event markers. */
export function Trace({ result, labelEvery = 5 }: { result: RaceResult; labelEvery?: number }) {
  const { points, colors, ticks } = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const colors: THREE.Color[] = [];
    const ticks: { p: THREE.Vector3; t: number }[] = [];
    let nextTick = 1;
    result.frames.forEach((f, k) => {
      if (k % 3 === 0 || k === result.frames.length - 1) {
        points.push(toWorld(f.x, f.y, 0.25));
        colors.push(speedColor(f.speed * 3.6));
      }
      if (f.t >= nextTick) {
        ticks.push({ p: toWorld(f.x, f.y, 0.3), t: nextTick });
        nextTick++;
      }
    });
    return { points, colors, ticks };
  }, [result]);

  if (points.length < 2) return null;

  return (
    <group>
      <Line points={points} vertexColors={colors} lineWidth={4} />
      {ticks.map(({ p, t }) => (
        <group key={t} position={p}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[t % labelEvery === 0 ? 1.1 : 0.6, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {t % labelEvery === 0 && (
            <Billboard position={[0, 4, 0]}>
              <Text fontSize={3.2} color="#ffffff" outlineWidth={0.35} outlineColor="#0d1117" anchorX="center">
                {`${t}s`}
              </Text>
            </Billboard>
          )}
        </group>
      ))}
      {result.events.map((e, k) => {
        const st = EVENT_STYLE[e.type];
        return (
          <group key={k} position={toWorld(e.x, e.y, 0.35)}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2.2, 3, 20]} />
              <meshBasicMaterial color={st.color} />
            </mesh>
            <Billboard position={[0, 6.5, 0]}>
              <Text fontSize={3} color={st.color} outlineWidth={0.35} outlineColor="#0d1117" anchorX="center">
                {`${st.label} ${e.t.toFixed(1)}s`}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}
