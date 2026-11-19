"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Rain in the style of the three.js "compute particles rain" example, on WebGL:
 * stretched drops that fall until they hit a surface (ground or the car roof) and
 * leave an expanding ripple there, then respawn at the top. Updated on the CPU —
 * at ~1000 drops that's cheap.
 *
 * Everything is expressed in "view units" so the rain looks the same zoomed in on the
 * car or looking at the whole circuit: the volume follows the camera target and scales
 * with how many metres are on screen.
 */

export interface RainView {
  /** Point the camera looks at (world). */
  center: THREE.Vector3;
  /** Metres visible across the shortest screen side. */
  span: number;
  /** Car position/heading for roof collisions. */
  car: THREE.Vector3;
  carHeading: number;
}

const DROPS = 1000;
/** Size of the rain volume relative to the visible span (isometric views see a long strip). */
const AREA = 1.9;
/** Car roof footprint (car model scaled 1.7): half length / half width / height. */
const CAR_HALF_L = 4.6;
const CAR_HALF_W = 1.6;
const CAR_ROOF = 1.5;

const dropVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const dropFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // bright at the bottom (leading end), fading exponentially towards the tail
    float a = exp(-vUv.y * 3.0) * smoothstep(0.0, 0.08, vUv.y + 0.02);
    float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
    gl_FragColor = vec4(uColor, uOpacity * a * edge);
  }
`;
const rippleVertex = /* glsl */ `
  attribute float aAge;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    vUv = uv;
    vAge = aAge;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const rippleFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAge;
  void main() {
    if (vAge >= 1.0) discard;
    float d = length(vUv - 0.5) * 2.0;           // 0 centre .. 1 edge
    float r = vAge;                               // ring grows with age
    float ring = smoothstep(r - 0.18, r, d) * (1.0 - smoothstep(r, r + 0.06, d));
    float inner = smoothstep(r * 0.55 - 0.12, r * 0.55, d) * (1.0 - smoothstep(r * 0.55, r * 0.55 + 0.05, d)) * 0.5;
    float a = (ring + inner) * (1.0 - vAge) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/** Drop + ripple simulation (plain object so the render loop can update it freely). */
class RainSim {
  pos = new Float32Array(DROPS * 3);
  speed = new Float32Array(DROPS);
  ripplePos = new Float32Array(DROPS * 3);
  rippleScale = new Float32Array(DROPS);
  /** Ripple age 0..1 (1 = inactive); shared with the ripple geometry attribute. */
  age = new Float32Array(DROPS).fill(1);
  private ready = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private basis = new THREE.Matrix4();

  step(v: RainView, wind: [number, number], camera: THREE.Camera, dt: number, dm: THREE.InstancedMesh, rm: THREE.InstancedMesh) {
    const unit = Math.max(1, v.span / 100); // world metres per "view unit"
    const size = v.span * AREA;
    const half = size / 2;
    const height = 30 * unit;
    const { pos, speed, ripplePos, rippleScale, age } = this;

    const spawn = (i: number, anywhereInHeight: boolean) => {
      pos[i * 3] = v.center.x + (Math.random() - 0.5) * size;
      pos[i * 3 + 2] = v.center.z + (Math.random() - 0.5) * size;
      pos[i * 3 + 1] = anywhereInHeight ? Math.random() * height : height * (0.85 + Math.random() * 0.3);
      speed[i] = (0.9 + Math.random() * 0.35) * 42 * unit;
    };
    if (!this.ready) {
      for (let i = 0; i < DROPS; i++) spawn(i, true);
      this.ready = true;
    }

    // all drops share one orientation: long axis along the fall direction (wind slants it),
    // turned to face the camera around that axis
    const up = new THREE.Vector3(wind[0] * 0.9, -42 * unit, -wind[1] * 0.9).normalize().negate();
    const toCam = camera.getWorldDirection(new THREE.Vector3()).negate();
    const right = new THREE.Vector3().crossVectors(up, toCam).normalize();
    const normal = new THREE.Vector3().crossVectors(right, up).normalize();
    this.basis.makeBasis(right, up, normal);
    this.q.setFromRotationMatrix(this.basis);
    this.s.set(0.16 * unit, 2.8 * unit, 1);

    const cosH = Math.cos(v.carHeading);
    const sinH = Math.sin(v.carHeading);

    for (let i = 0; i < DROPS; i++) {
      const k = i * 3;
      // keep drops inside the volume that follows the camera (wrap, don't respawn: no gaps)
      pos[k] = v.center.x + ((((pos[k] - v.center.x + half) % size) + size) % size) - half;
      pos[k + 2] = v.center.z + ((((pos[k + 2] - v.center.z + half) % size) + size) % size) - half;

      const d = speed[i] * dt;
      pos[k] -= up.x * d;
      pos[k + 1] -= up.y * d;
      pos[k + 2] -= up.z * d;

      // surface under the drop: the car roof or the ground
      // (world z = −track y, so the car's forward axis is (cos h, −sin h))
      const dx = pos[k] - v.car.x;
      const dz = pos[k + 2] - v.car.z;
      const along = dx * cosH - dz * sinH;
      const across = dx * sinH + dz * cosH;
      const onCar = Math.abs(along) < CAR_HALF_L && Math.abs(across) < CAR_HALF_W;
      const floor = onCar ? CAR_ROOF : 0.02;

      if (pos[k + 1] <= floor) {
        ripplePos[k] = pos[k];
        ripplePos[k + 1] = floor + 0.03;
        ripplePos[k + 2] = pos[k + 2];
        rippleScale[i] = (onCar ? 0.9 : 2.2 + Math.random() * 0.8) * unit;
        age[i] = 0;
        spawn(i, false);
      }

      this.p.set(pos[k], pos[k + 1], pos[k + 2]);
      this.m.compose(this.p, this.q, this.s);
      dm.setMatrixAt(i, this.m);

      if (age[i] < 1) {
        age[i] = Math.min(1, age[i] + dt * 2.6);
        const r = rippleScale[i];
        this.m.makeScale(r, 1, r).setPosition(ripplePos[k], ripplePos[k + 1], ripplePos[k + 2]);
        rm.setMatrixAt(i, this.m);
      }
    }
    dm.instanceMatrix.needsUpdate = true;
    rm.instanceMatrix.needsUpdate = true;
    (rm.geometry.getAttribute("aAge") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

export function Rain({ view, wind }: { view: RainView; wind: [number, number] }) {
  const drops = useRef<THREE.InstancedMesh>(null);
  const ripples = useRef<THREE.InstancedMesh>(null);
  const sim = useMemo(() => new RainSim(), []);

  const dropMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dropVertex,
        fragmentShader: dropFragment,
        uniforms: { uColor: { value: new THREE.Color("#e6effa") }, uOpacity: { value: 0.8 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  const rippleMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: rippleVertex,
        fragmentShader: rippleFragment,
        uniforms: { uColor: { value: new THREE.Color("#e8f1fa") }, uOpacity: { value: 0.7 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  // 1 x 1 quad with its origin at the bottom, so a drop "lands" with its leading end
  const dropGeo = useMemo(() => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), []);
  const rippleGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.setAttribute("aAge", new THREE.InstancedBufferAttribute(sim.age, 1));
    return g;
  }, [sim]);

  useEffect(
    () => () => {
      dropMat.dispose();
      rippleMat.dispose();
      dropGeo.dispose();
      rippleGeo.dispose();
    },
    [dropMat, rippleMat, dropGeo, rippleGeo],
  );

  useLayoutEffect(() => {
    // hidden until the first frame places them
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < DROPS; i++) {
      drops.current?.setMatrixAt(i, zero);
      ripples.current?.setMatrixAt(i, zero);
    }
  }, []);

  useFrame((frame, rawDt) => {
    if (drops.current && ripples.current) sim.step(view, wind, frame.camera, Math.min(rawDt, 0.05), drops.current, ripples.current);
  });

  return (
    <group>
      <instancedMesh ref={ripples} args={[rippleGeo, rippleMat, DROPS]} frustumCulled={false} renderOrder={2} />
      <instancedMesh ref={drops} args={[dropGeo, dropMat, DROPS]} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
