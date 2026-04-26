import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SimulationConfig, WorldStatistics } from "../simulation/types";

interface EnvironmentProps {
  config: SimulationConfig;
  food: Array<{ x: number; y: number; energy: number }>;
  stats: WorldStatistics | null;
}

const FERTILE_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FERTILE_FRAGMENT = `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform vec2 uCenter;
  uniform float uRadius;
  varying vec2 vUv;

  void main() {
    float dist = length(vUv - uCenter);
    float glow = exp(-(dist * dist) / (2.0 * uRadius * uRadius));
    glow *= 0.9 + 0.1 * sin(uTime * 1.5);
    float alpha = glow * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const AMBIENT_VERTEX = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    pos.x += sin(uTime * aSpeed + aPhase) * 0.3;
    pos.y += cos(uTime * aSpeed * 0.7 + aPhase) * 0.2;
    pos.z += sin(uTime * aSpeed * 0.5 + aPhase * 2.0) * 0.15;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (80.0 / -mv.z);
    vAlpha = 0.4 + 0.3 * sin(uTime * 0.5 + aPhase);
  }
`;

const AMBIENT_FRAGMENT = `
  precision mediump float;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.7, 0.85, 0.6, (1.0 - d * 2.0) * vAlpha);
  }
`;

const FOOD_COUNT = 2000;
const AMBIENT_COUNT = 800;

function FertileZoneCircle({
  center,
  radius,
  color,
  opacity,
}: {
  center: [number, number];
  radius: number;
  color: string;
  opacity: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(center[0], center[1]) },
      uRadius: { value: radius },
    }),
    [center, radius, color, opacity],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.5, 0.01, 0.5]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={FERTILE_VERTEX}
        fragmentShader={FERTILE_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function FoodParticles({
  food,
  worldWidth,
  worldHeight,
}: {
  food: Array<{ x: number; y: number; energy: number }>;
  worldWidth: number;
  worldHeight: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorLow = useMemo(() => new THREE.Color("#88cc44"), []);
  const colorHigh = useMemo(() => new THREE.Color("#ffdd44"), []);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const count = Math.min(food.length, FOOD_COUNT);

    for (let i = 0; i < count; i++) {
      const f = food[i]!;
      const nx = f.x / worldWidth;
      const ny = f.y / worldHeight;
      const bob = Math.sin(t * 2.0 + i * 0.7) * 0.008;

      dummy.position.set(nx - 0.5, 0.015 + bob, ny - 0.5);
      dummy.scale.setScalar(0.006 + (f.energy / 30) * 0.004);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      tempColor.lerpColors(colorLow, colorHigh, Math.min(f.energy / 25, 1.0));
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.count = count;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, FOOD_COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial transparent opacity={0.85} depthWrite={false} />
    </instancedMesh>
  );
}

function AmbientParticles(_props: {
  worldWidth: number;
  worldHeight: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { positions, sizes, phases, speeds } = useMemo(() => {
    const positions = new Float32Array(AMBIENT_COUNT * 3);
    const sizes = new Float32Array(AMBIENT_COUNT);
    const phases = new Float32Array(AMBIENT_COUNT);
    const speeds = new Float32Array(AMBIENT_COUNT);

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      positions[i * 3] = Math.random() - 0.5;
      positions[i * 3 + 1] = Math.random() * 0.3;
      positions[i * 3 + 2] = Math.random() - 0.5;
      sizes[i] = 1.5 + Math.random() * 2.5;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.2 + Math.random() * 0.5;
    }

    return { positions, sizes, phases, speeds };
  }, []);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }),
    [],
  );

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={AMBIENT_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={AMBIENT_COUNT}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aPhase"
          count={AMBIENT_COUNT}
          array={phases}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aSpeed"
          count={AMBIENT_COUNT}
          array={speeds}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={AMBIENT_VERTEX}
        fragmentShader={AMBIENT_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function AtmosphereOverlay({ stats }: { stats: WorldStatistics | null }) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    if (!materialRef.current || !stats) return;

    const maxPop = stats.worldWidth * stats.worldHeight * 0.025;
    const popRatio = Math.min(stats.population / maxPop, 1.0);

    const target = new THREE.Color();
    if (popRatio > 0.5) {
      target.setRGB(0.1, 0.25, 0.08);
    } else if (popRatio < 0.1) {
      target.setRGB(0.2, 0.05, 0.03);
    } else {
      target.setRGB(0.05, 0.12, 0.1);
    }

    materialRef.current.color.lerp(target, 0.05);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#0a1a0a"
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  );
}

export function Environment({ config, food, stats }: EnvironmentProps) {
  return (
    <group>
      {config.fertileZones.map((zone, idx) => {
        const [cxRatio, cyRatio, rRatio] = zone;
        return (
          <FertileZoneCircle
            key={`fertile-${idx}`}
            center={[cxRatio, cyRatio]}
            radius={rRatio}
            color="#3d7a3d"
            opacity={0.35}
          />
        );
      })}
      <FoodParticles
        food={food}
        worldWidth={config.worldWidth}
        worldHeight={config.worldHeight}
      />
      <AmbientParticles
        worldWidth={config.worldWidth}
        worldHeight={config.worldHeight}
      />
      <AtmosphereOverlay stats={stats} />
    </group>
  );
}

export default Environment;
