import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Organism data as received from simulation state (matches SimState.organisms). */
interface VisualOrganism {
  id: number;
  x: number;
  y: number;
  energy: number;
  size: number;
  hue: number;
  alive: boolean;
}

interface VisualEffectsProps {
  organisms: VisualOrganism[];
  worldWidth: number;
  worldHeight: number;
  isRunning: boolean;
}

const MAX_PARTICLES = 5000;
const MAX_TRAIL_SEGMENTS = 5000;
const MAX_GLOWS = 1000;
const TRAIL_MAX_POINTS = 10;
const GLOW_ENERGY_THRESHOLD = 60;

const PARTICLE_VERTEX = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (80.0 / -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

const PARTICLE_FRAGMENT = `
  precision mediump float;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float falloff = 1.0 - d * 2.0;
    gl_FragColor = vec4(vColor, falloff * falloff * vAlpha);
  }
`;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  size: number;
  life: number;
  maxLife: number;
}

class OrganismTrail {
  points: Float32Array;
  count = 0;
  head = 0;

  constructor() {
    this.points = new Float32Array(TRAIL_MAX_POINTS * 3);
  }

  push(x: number, y: number, z: number): void {
    const idx = this.head * 3;
    this.points[idx] = x;
    this.points[idx + 1] = y;
    this.points[idx + 2] = z;
    this.head = (this.head + 1) % TRAIL_MAX_POINTS;
    if (this.count < TRAIL_MAX_POINTS) this.count++;
  }

  forEach(fn: (x: number, y: number, z: number, i: number) => void): void {
    const start = this.count < TRAIL_MAX_POINTS
      ? 0
      : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = ((start + i) % TRAIL_MAX_POINTS) * 3;
      fn(this.points[idx], this.points[idx + 1], this.points[idx + 2], i);
    }
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  h /= 360;

  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

export default function VisualEffects({
  organisms,
  worldWidth,
  worldHeight,
  isRunning,
}: VisualEffectsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const trailsRef = useRef<THREE.LineSegments>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);

  const prevMap = useRef<Map<number, VisualOrganism>>(new Map());
  const particles = useRef<Particle[]>([]);
  const trailMap = useRef<Map<number, OrganismTrail>>(new Map());

  const _dummy = useMemo(() => new THREE.Object3D(), []);
  const _color = useMemo(() => new THREE.Color(), []);

  const particleGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3),
    );
    geom.setAttribute(
      "aColor",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3),
    );
    geom.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1),
    );
    geom.setAttribute(
      "aSize",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1),
    );
    geom.setDrawRange(0, 0);
    return geom;
  }, []);

  const particleUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#ffffff") },
    }),
    [],
  );
  const trailGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_SEGMENTS * 6), 3),
    );
    geom.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_SEGMENTS * 6), 3),
    );
    geom.setDrawRange(0, 0);
    return geom;
  }, []);
  const glowGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), []);
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const spawnParticles = (
    count: number,
    ox: number,
    oy: number,
    oz: number,
    rgb: [number, number, number],
    speed: number,
    life: number,
  ): void => {
    for (let i = 0; i < count; i++) {
      if (particles.current.length >= MAX_PARTICLES) break;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.4 + Math.random() * 0.6);
      particles.current.push({
        x: ox,
        y: oy,
        z: oz,
        vx: Math.sin(phi) * Math.cos(theta) * spd,
        vy: Math.cos(phi) * spd + speed * 0.3,
        vz: Math.sin(phi) * Math.sin(theta) * spd,
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
        size: 0.4 + Math.random() * 0.8,
        life,
        maxLife: life,
      });
    }
  };

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    const currentMap = new Map<number, VisualOrganism>();

    for (const org of organisms) {
      currentMap.set(org.id, org);

      const prev = prevMap.current.get(org.id);
      const wx = org.x - worldWidth * 0.5;
      const wz = org.y - worldHeight * 0.5;

      if (isRunning) {
        if (!prev && org.alive) {
          const [r, g, b] = hslToRgb(org.hue, 0.9, 0.75);
          spawnParticles(12, wx, 0.3, wz, [r, g, b], 3.5, 0.7);
        }

        if (prev && org.energy - prev.energy > 8) {
          spawnParticles(8, wx, 0.25, wz, [0.4, 0.95, 0.25], 2.5, 0.45);
        }

        if (prev && prev.energy - org.energy > 8 && org.alive) {
          spawnParticles(10, wx, 0.25, wz, [0.95, 0.15, 0.1], 3.0, 0.55);
        }
      }
    }

    if (isRunning) {
      for (const [id, prevOrg] of prevMap.current) {
        const curr = currentMap.get(id);
        if ((!curr || !curr.alive) && prevOrg.alive) {
          const wx = prevOrg.x - worldWidth * 0.5;
          const wz = prevOrg.y - worldHeight * 0.5;
          const [r, g, b] = hslToRgb(prevOrg.hue, 0.7, 0.6);
          spawnParticles(18, wx, 0.3, wz, [r, g, b], 2.0, 1.0);
        }
      }
    }

    prevMap.current = currentMap;

    const alive: Particle[] = [];
    for (const p of particles.current) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 3.0 * dt;
      p.life -= dt;
      if (p.life > 0 && p.y > -1.0) {
        alive.push(p);
      }
    }
    particles.current = alive;

    const pCount = Math.min(alive.length, MAX_PARTICLES);
    const pPos = particleGeom.attributes.position.array as Float32Array;
    const pCol = particleGeom.attributes.aColor.array as Float32Array;
    const pAlp = particleGeom.attributes.aAlpha.array as Float32Array;
    const pSiz = particleGeom.attributes.aSize.array as Float32Array;

    for (let i = 0; i < pCount; i++) {
      const pt = alive[i]!;
      const a = pt.life / pt.maxLife;
      const i3 = i * 3;
      pPos[i3] = pt.x;
      pPos[i3 + 1] = pt.y;
      pPos[i3 + 2] = pt.z;
      pCol[i3] = pt.r;
      pCol[i3 + 1] = pt.g;
      pCol[i3 + 2] = pt.b;
      pAlp[i] = a;
      pSiz[i] = pt.size * (0.5 + a * 0.5);
    }

    particleGeom.setDrawRange(0, pCount);
    particleGeom.attributes.position.needsUpdate = true;
    particleGeom.attributes.aColor.needsUpdate = true;
    particleGeom.attributes.aAlpha.needsUpdate = true;
    particleGeom.attributes.aSize.needsUpdate = true;

    for (const [id] of trailMap.current) {
      if (!currentMap.has(id)) {
        trailMap.current.delete(id);
      }
    }

    let segCount = 0;
    const tPos = trailGeom.attributes.position.array as Float32Array;
    const tCol = trailGeom.attributes.color.array as Float32Array;

    for (const org of organisms) {
      if (!org.alive) continue;

      const wx = org.x - worldWidth * 0.5;
      const wz = org.y - worldHeight * 0.5;

      let trail = trailMap.current.get(org.id);
      if (!trail) {
        trail = new OrganismTrail();
        trailMap.current.set(org.id, trail);
      }
      trail.push(wx, 0.08, wz);

      if (trail.count < 2) continue;

      const newestIdx = ((trail.head - 1 + TRAIL_MAX_POINTS) % TRAIL_MAX_POINTS) * 3;
      const prevIdx = ((trail.head - 2 + TRAIL_MAX_POINTS) % TRAIL_MAX_POINTS) * 3;
      const dx = trail.points[newestIdx] - trail.points[prevIdx];
      const dz = trail.points[newestIdx + 2] - trail.points[prevIdx + 2];
      const speed = Math.sqrt(dx * dx + dz * dz);
      if (speed < 0.15) continue;

      const [br, bg, bb] = hslToRgb(org.hue, 0.6, 0.55);

      let px = 0, py = 0, pz = 0;
      trail.forEach((cx, cy, cz, idx) => {
        if (idx === 0) {
          px = cx; py = cy; pz = cz;
          return;
        }
        if (segCount >= MAX_TRAIL_SEGMENTS) return;

        const fade = idx / trail.count;
        const base = segCount * 6;
        tPos[base] = px;
        tPos[base + 1] = py;
        tPos[base + 2] = pz;
        tPos[base + 3] = cx;
        tPos[base + 4] = cy;
        tPos[base + 5] = cz;

        tCol[base] = br * fade;
        tCol[base + 1] = bg * fade;
        tCol[base + 2] = bb * fade;
        tCol[base + 3] = br * fade;
        tCol[base + 4] = bg * fade;
        tCol[base + 5] = bb * fade;

        px = cx; py = cy; pz = cz;
        segCount++;
      });
    }

    trailGeom.setDrawRange(0, segCount * 2);
    trailGeom.attributes.position.needsUpdate = true;
    trailGeom.attributes.color.needsUpdate = true;

    if (glowRef.current) {
      let gCount = 0;
      for (const org of organisms) {
        if (!org.alive) continue;
        if (org.energy < GLOW_ENERGY_THRESHOLD) continue;

        const wx = org.x - worldWidth * 0.5;
        const wz = org.y - worldHeight * 0.5;
        const intensity = Math.min((org.energy - GLOW_ENERGY_THRESHOLD) / 100, 1.0);
        const scale = org.size * (1.2 + intensity * 1.8);

        _dummy.position.set(wx, 0.06, wz);
        _dummy.scale.setScalar(scale);
        _dummy.updateMatrix();
        glowRef.current.setMatrixAt(gCount, _dummy.matrix);

        const [gr, gg, gb] = hslToRgb(org.hue, 0.45, 0.45 + intensity * 0.25);
        _color.setRGB(gr, gg, gb);
        glowRef.current.setColorAt(gCount, _color);

        gCount++;
        if (gCount >= MAX_GLOWS) break;
      }

      glowRef.current.count = gCount;
      glowRef.current.instanceMatrix.needsUpdate = true;
      if (glowRef.current.instanceColor) {
        glowRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <points ref={pointsRef} geometry={particleGeom} frustumCulled={false}>
        <shaderMaterial
          vertexShader={PARTICLE_VERTEX}
          fragmentShader={PARTICLE_FRAGMENT}
          uniforms={particleUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <lineSegments ref={trailsRef} geometry={trailGeom} frustumCulled={false}>
        <lineBasicMaterial vertexColors transparent opacity={0.5} depthWrite={false} />
      </lineSegments>

      <instancedMesh
        ref={glowRef}
        args={[glowGeometry, glowMaterial, MAX_GLOWS]}
        frustumCulled={false}
      />
    </group>
  );
}
