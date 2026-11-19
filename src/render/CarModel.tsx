"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export interface CarHandle {
  /** Place the car (world coords), heading (rad), front wheel angle (°) and wheel spin delta (m). */
  update: (pos: THREE.Vector3, heading: number, steerDeg: number, rolled: number) => void;
  setVisible: (v: boolean) => void;
}

const GHOST = "#9fdcff";

const LIVERY = { main: "#12b5a6", accent: "#f4f4f0", dark: "#16191d", tyre: "#141414", rim: "#c9ced4" };
const WHEEL_R = 0.36;

function Wheel({ width, ref, ghost }: { width: number; ref: React.Ref<THREE.Group>; ghost?: boolean }) {
  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, width, 18]} />
        {ghost ? <meshStandardMaterial color={GHOST} transparent opacity={0.35} depthWrite={false} /> : <meshStandardMaterial color={LIVERY.tyre} roughness={0.9} />}
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[WHEEL_R * 0.55, WHEEL_R * 0.55, width + 0.02, 6]} />
        {ghost ? <meshStandardMaterial color={GHOST} transparent opacity={0.35} depthWrite={false} /> : <meshStandardMaterial color={LIVERY.rim} metalness={0.6} roughness={0.3} flatShading />}
      </mesh>
    </group>
  );
}

/** Low-poly open-wheel race car built from primitives. Forward is +x, 5.4 m long. */
export const CarModel = forwardRef<CarHandle, { scale?: number; ghost?: boolean }>(function CarModel({ scale = 1, ghost = false }, ref) {
  const root = useRef<THREE.Group>(null);
  const steerL = useRef<THREE.Group>(null);
  const steerR = useRef<THREE.Group>(null);
  const w0 = useRef<THREE.Group>(null);
  const w1 = useRef<THREE.Group>(null);
  const w2 = useRef<THREE.Group>(null);
  const w3 = useRef<THREE.Group>(null);

  useImperativeHandle(ref, () => ({
    update(pos, heading, steerDeg, rolled) {
      if (!root.current) return;
      root.current.position.copy(pos);
      root.current.rotation.y = heading;
      const st = (steerDeg * Math.PI) / 180;
      if (steerL.current) steerL.current.rotation.y = st;
      if (steerR.current) steerR.current.rotation.y = st;
      for (const w of [w0, w1, w2, w3]) if (w.current) w.current.rotation.z -= rolled / WHEEL_R;
    },
    setVisible(v) {
      if (root.current) root.current.visible = v;
    },
  }));

  useEffect(() => {
    // ghosts don't cast shadows
    if (ghost) root.current?.traverse((o) => (o.castShadow = false));
  }, [ghost]);

  const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    ghost ? (
      <meshStandardMaterial color={GHOST} transparent opacity={0.4} depthWrite={false} emissive={GHOST} emissiveIntensity={0.25} />
    ) : (
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.15} {...extra} />
    );

  return (
    <group ref={root} scale={scale}>
      {/* floor / plank */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[3.8, 0.06, 1.4]} />
        {mat(LIVERY.dark)}
      </mesh>
      {/* monocoque */}
      <mesh position={[0.2, 0.38, 0]} castShadow>
        <boxGeometry args={[2.6, 0.42, 0.8]} />
        {mat(LIVERY.main)}
      </mesh>
      {/* nose cone */}
      <mesh position={[2.15, 0.3, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.1, 0.3, 1.5, 4]} />
        {mat(LIVERY.main)}
      </mesh>
      {/* sidepods */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.2, 0.33, s * 0.62]} castShadow>
          <boxGeometry args={[1.9, 0.36, 0.48]} />
          {mat(LIVERY.main)}
        </mesh>
      ))}
      {/* engine cover + airbox */}
      <mesh position={[-0.9, 0.62, 0]} castShadow>
        <boxGeometry args={[1.8, 0.42, 0.55]} />
        {mat(LIVERY.accent)}
      </mesh>
      <mesh position={[-0.25, 0.92, 0]} castShadow>
        <boxGeometry args={[0.45, 0.35, 0.32]} />
        {mat(LIVERY.dark)}
      </mesh>
      {/* cockpit, helmet and halo */}
      <mesh position={[0.45, 0.6, 0]}>
        <boxGeometry args={[0.75, 0.05, 0.5]} />
        {mat(LIVERY.dark)}
      </mesh>
      <mesh position={[0.35, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 10]} />
        {mat("#ffd23f", { metalness: 0.3 })}
      </mesh>
      <mesh position={[0.45, 0.82, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
        <torusGeometry args={[0.32, 0.035, 6, 16, Math.PI]} />
        {mat(LIVERY.dark)}
      </mesh>
      {/* front wing */}
      <mesh position={[2.75, 0.14, 0]} castShadow>
        <boxGeometry args={[0.45, 0.05, 1.95]} />
        {mat(LIVERY.dark)}
      </mesh>
      <mesh position={[2.65, 0.2, 0]}>
        <boxGeometry args={[0.25, 0.04, 1.85]} />
        {mat(LIVERY.main)}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[2.75, 0.22, s * 0.98]}>
          <boxGeometry args={[0.5, 0.22, 0.03]} />
          {mat(LIVERY.accent)}
        </mesh>
      ))}
      {/* rear wing */}
      <mesh position={[-2.35, 0.98, 0]} castShadow>
        <boxGeometry args={[0.42, 0.06, 1.05]} />
        {mat(LIVERY.dark)}
      </mesh>
      <mesh position={[-2.25, 1.08, 0]}>
        <boxGeometry args={[0.2, 0.05, 1.05]} />
        {mat(LIVERY.main)}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-2.35, 0.82, s * 0.53]}>
          <boxGeometry args={[0.6, 0.45, 0.03]} />
          {mat(LIVERY.main)}
        </mesh>
      ))}
      <mesh position={[-2.05, 0.6, 0]}>
        <boxGeometry args={[0.1, 0.5, 0.08]} />
        {mat(LIVERY.dark)}
      </mesh>
      {/* wheels: front ones steer */}
      <group ref={steerL} position={[1.75, WHEEL_R, 0.86]}>
        <Wheel width={0.34} ref={w0} ghost={ghost} />
      </group>
      <group ref={steerR} position={[1.75, WHEEL_R, -0.86]}>
        <Wheel width={0.34} ref={w1} ghost={ghost} />
      </group>
      <group position={[-1.6, WHEEL_R, 0.84]}>
        <Wheel width={0.44} ref={w2} ghost={ghost} />
      </group>
      <group position={[-1.6, WHEEL_R, -0.84]}>
        <Wheel width={0.44} ref={w3} ghost={ghost} />
      </group>
      {/* suspension arms */}
      {[1.75, -1.6].map((x) =>
        [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} position={[x, 0.36, s * 0.55]}>
            <boxGeometry args={[0.06, 0.04, 0.55]} />
            {mat(LIVERY.dark)}
          </mesh>
        )),
      )}
    </group>
  );
});
