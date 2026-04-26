import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Shape, type Organism } from "../simulation/types";
import { hslToRgb } from "./InstancedOrganisms";

// ── Types ──────────────────────────────────────────────────────────────

type AnimState =
  | "idle"
  | "moving"
  | "feeding"
  | "fleeing"
  | "resting"
  | "reproducing"
  | "dying"
  | "dead";

interface OrganismAnimState {
  id: number;
  prevX: number;
  prevZ: number;
  currX: number;
  currZ: number;
  displayX: number;
  displayY: number;
  displayZ: number;
  prevEnergy: number;
  state: AnimState;
  stateTime: number;
  birthScale: number;
  deathProgress: number;
  feedPulse: number;
  rotation: number;
  restPhase: number;
  fleeWobble: number;
  shape: Shape;
  size: number;
  hue: number;
  sat: number;
  val: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

export interface OrganismAnimationProps {
  organisms: Organism[];
  worldWidth: number;
  worldHeight: number;
  isRunning: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_PARTICLES = 800;
const PARTICLES_PER_DEATH = 12;
const LERP_SPEED = 14;
const BIRTH_SPEED = 2.5;
const DEATH_SPEED = 1.5;
const FEED_DECAY = 4;
const FEED_BUMP = 0.25;
const BOB_FREQ_MOVE = 6;
const BOB_AMP_MOVE = 0.12;
const BOB_FREQ_FLEE = 12;
const BOB_AMP_FLEE = 0.2;
const BOB_FREQ_REST = 1.5;
const BOB_AMP_REST = 0.04;
const WOB_FREQ_FLEE = 15;
const WOB_AMP_FLEE = 0.15;
const ROT_SPEED = 10;
const REST_BREATH = 0.03;

// ── Geometry Cache ─────────────────────────────────────────────────────

const GEOMETRIES: Record<Shape, THREE.BufferGeometry> = {
  [Shape.CIRCLE]: new THREE.SphereGeometry(0.5, 16, 12),
  [Shape.TRIANGLE]: (() => {
    const g = new THREE.ConeGeometry(0.5, 1, 3);
    g.rotateX(-Math.PI / 2);
    return g;
  })(),
  [Shape.SQUARE]: new THREE.BoxGeometry(1, 1, 1),
  [Shape.DIAMOND]: new THREE.OctahedronGeometry(0.5),
};

// ── Helpers ────────────────────────────────────────────────────────────

function lerpAngle(a: number, b: number, t: number): number {
  const diff = b - a;
  const wrapped = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + wrapped * t;
}

function createAnimState(
  org: Organism,
  worldWidth: number,
  worldHeight: number,
): OrganismAnimState {
  const x = org.position.x - worldWidth * 0.5;
  const z = org.position.y - worldHeight * 0.5;
  return {
    id: org.id,
    prevX: x,
    prevZ: z,
    currX: x,
    currZ: z,
    displayX: x,
    displayY: 0,
    displayZ: z,
    prevEnergy: org.energy,
    state: "reproducing",
    stateTime: 0,
    birthScale: 0,
    deathProgress: 0,
    feedPulse: 0,
    rotation: 0,
    restPhase: Math.random() * Math.PI * 2,
    fleeWobble: 0,
    shape: org.genome.shape,
    size: org.genome.size,
    hue: org.genome.colorHue,
    sat: org.genome.colorSat,
    val: org.genome.colorVal,
  };
}

function spawnParticles(
  particles: Particle[],
  x: number,
  y: number,
  z: number,
  hue: number,
  sat: number,
  val: number,
  count: number,
): void {
  const [r, g, b] = hslToRgb(hue, sat, val);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x,
      y,
      z,
      vx: Math.cos(angle) * speed,
      vy: 1 + Math.random() * 2,
      vz: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      r,
      g,
      b,
    });
  }
}

// ── Component ──────────────────────────────────────────────────────────

export default function OrganismAnimation({
  organisms,
  worldWidth,
  worldHeight,
}: OrganismAnimationProps) {
  const animStates = useRef<Map<number, OrganismAnimState>>(new Map());
  const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const [renderList, setRenderList] = useState<OrganismAnimState[]>([]);

  const particlesData = useRef<Particle[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const posArray = useRef(new Float32Array(MAX_PARTICLES * 3));
  const colArray = useRef(new Float32Array(MAX_PARTICLES * 3));

  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray.current, 3),
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(colArray.current, 3),
    );
    return geo;
  }, []);

  // Sync incoming simulation state to animation state machine
  useEffect(() => {
    const currentIds = new Set(organisms.map((o) => o.id));

    for (const org of organisms) {
      let anim = animStates.current.get(org.id);
      if (!anim) {
        anim = createAnimState(org, worldWidth, worldHeight);
        animStates.current.set(org.id, anim);
      } else {
        // Shift current targets to previous for velocity calculation
        anim.prevX = anim.currX;
        anim.prevZ = anim.currZ;
        anim.currX = org.position.x - worldWidth * 0.5;
        anim.currZ = org.position.y - worldHeight * 0.5;

        // Detect feeding (energy jumped up)
        if (org.energy > anim.prevEnergy + 0.5) {
          anim.feedPulse = 1;
          anim.state = "feeding";
          anim.stateTime = 0;
        }

        anim.prevEnergy = org.energy;
      }
    }

    // Organisms gone from simulation → trigger death animation
    for (const [id, anim] of animStates.current) {
      if (!currentIds.has(id) && anim.state !== "dying" && anim.state !== "dead") {
        anim.state = "dying";
        anim.stateTime = 0;
        spawnParticles(
          particlesData.current,
          anim.displayX,
          anim.displayY,
          anim.displayZ,
          anim.hue,
          anim.sat,
          anim.val,
          PARTICLES_PER_DEATH,
        );
      }
    }

    // Remove fully-dead entries to prevent memory growth
    const toDelete: number[] = [];
    for (const [id, anim] of animStates.current) {
      if (anim.state === "dead") {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      animStates.current.delete(id);
      meshRefs.current.delete(id);
      groupRefs.current.delete(id);
    }

    // Update React render list only when visible set changes
    const newList = Array.from(animStates.current.values());
    setRenderList(newList);
  }, [organisms, worldWidth, worldHeight]);

  // Imperative animation loop — runs every frame, purely visual
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;

    // ── Organism animations ────────────────────────────────────────────
    for (const [, anim] of animStates.current) {
      const group = groupRefs.current.get(anim.id);
      if (!group) continue;

      // Smooth position interpolation (exponential decay lerp)
      const lerpFactor = 1 - Math.exp(-dt * LERP_SPEED);
      anim.displayX += (anim.currX - anim.displayX) * lerpFactor;
      anim.displayZ += (anim.currZ - anim.displayZ) * lerpFactor;

      // Velocity vector for state inference & rotation
      const dx = anim.currX - anim.prevX;
      const dz = anim.currZ - anim.prevZ;
      const moveSpeed = Math.sqrt(dx * dx + dz * dz);

      // State machine inference (don't override transient states)
      if (
        anim.state !== "feeding" &&
        anim.state !== "dying" &&
        anim.state !== "reproducing"
      ) {
        if (moveSpeed > 0.8) {
          anim.state = "fleeing";
        } else if (moveSpeed > 0.05) {
          anim.state = "moving";
        } else {
          anim.state = "resting";
        }
      }

      anim.stateTime += dt;

      // Transient state timeouts
      if (anim.state === "feeding" && anim.stateTime > 0.4) {
        anim.state = moveSpeed > 0.05 ? "moving" : "resting";
        anim.stateTime = 0;
      }
      if (anim.state === "reproducing" && anim.birthScale >= 1) {
        anim.state = moveSpeed > 0.05 ? "moving" : "resting";
        anim.stateTime = 0;
      }

      // Y-axis bobbing based on state
      if (anim.state === "moving") {
        anim.displayY =
          Math.sin(now * BOB_FREQ_MOVE + anim.id * 0.5) * BOB_AMP_MOVE;
      } else if (anim.state === "fleeing") {
        anim.displayY =
          Math.sin(now * BOB_FREQ_FLEE + anim.id) * BOB_AMP_FLEE;
        anim.fleeWobble += dt * WOB_FREQ_FLEE;
      } else if (anim.state === "resting") {
        anim.displayY =
          Math.sin(now * BOB_FREQ_REST + anim.restPhase) * BOB_AMP_REST;
      } else {
        // Smoothly return to ground level
        anim.displayY += (0 - anim.displayY) * (1 - Math.exp(-dt * 8));
      }

      // Rotation toward movement direction
      if (moveSpeed > 0.01) {
        const targetRot = Math.atan2(dx, dz);
        anim.rotation = lerpAngle(anim.rotation, targetRot, dt * ROT_SPEED);
      }

      // ── Scale computation ──────────────────────────────────────────
      let scale = anim.size;

      // Birth / reproduction: scale 0 → full
      if (anim.birthScale < 1) {
        anim.birthScale = Math.min(anim.birthScale + dt * BIRTH_SPEED, 1);
        scale *= anim.birthScale;
      }

      // Feeding: brief scale pulse
      if (anim.feedPulse > 0) {
        scale *= 1 + anim.feedPulse * FEED_BUMP;
        anim.feedPulse = Math.max(0, anim.feedPulse - dt * FEED_DECAY);
      }

      // Resting: subtle breathing
      if (anim.state === "resting") {
        scale *= 1 + Math.sin(now * 2 + anim.restPhase) * REST_BREATH;
      }

      // Fleeing: erratic roll wobble
      let rotZ = 0;
      if (anim.state === "fleeing") {
        rotZ = Math.sin(anim.fleeWobble) * WOB_AMP_FLEE;
      }

      // Dying: shrink + fade
      let opacity = 1;
      if (anim.state === "dying") {
        anim.deathProgress += dt * DEATH_SPEED;
        const deathScale = Math.max(0, 1 - anim.deathProgress);
        scale *= deathScale;
        opacity = deathScale;

        if (anim.deathProgress >= 1) {
          anim.state = "dead";
        }
      }

      // Apply transforms
      group.position.set(anim.displayX, anim.displayY, anim.displayZ);
      group.rotation.set(0, anim.rotation, rotZ);
      group.scale.setScalar(scale);

      // Update material color / opacity
      const mesh = meshRefs.current.get(anim.id);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const [r, g, b] = hslToRgb(anim.hue, anim.sat, anim.val);
        mat.color.setRGB(r, g, b);
        mat.transparent = anim.state === "dying";
        mat.opacity = opacity;
      }
    }

    // ── Particle system ──────────────────────────────────────────────
    const particles = particlesData.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 4 * dt; // gravity
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    const count = Math.min(particles.length, MAX_PARTICLES);
    for (let i = 0; i < count; i++) {
      const p = particles[i]!;
      const idx = i * 3;
      posArray.current[idx] = p.x;
      posArray.current[idx + 1] = p.y;
      posArray.current[idx + 2] = p.z;
      const lifeRatio = Math.max(0, p.life / p.maxLife);
      colArray.current[idx] = p.r * lifeRatio;
      colArray.current[idx + 1] = p.g * lifeRatio;
      colArray.current[idx + 2] = p.b * lifeRatio;
    }
    // Zero out unused slots
    for (let i = count * 3; i < MAX_PARTICLES * 3; i++) {
      posArray.current[i] = 0;
      colArray.current[i] = 0;
    }

    particleGeo.setDrawRange(0, count);
    const posAttr = particleGeo.attributes.position;
    if (posAttr) posAttr.needsUpdate = true;
    const colAttr = particleGeo.attributes.color;
    if (colAttr) colAttr.needsUpdate = true;
  });

  return (
    <>
      {renderList.map((anim) => (
        <group
          key={anim.id}
          ref={(el) => {
            if (el) groupRefs.current.set(anim.id, el);
          }}
        >
          <mesh
            ref={(el) => {
              if (el) meshRefs.current.set(anim.id, el);
            }}
            geometry={GEOMETRIES[anim.shape]}
            castShadow
          >
            <meshStandardMaterial roughness={0.4} metalness={0.1} />
          </mesh>
        </group>
      ))}

      <points ref={pointsRef} geometry={particleGeo}>
        <pointsMaterial
          size={0.25}
          transparent
          vertexColors
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </>
  );
}
