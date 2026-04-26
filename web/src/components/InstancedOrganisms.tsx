import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Shape, type Organism } from "../simulation/types";

const MAX_INSTANCES = 1000;

// Pre-create geometries to avoid per-frame allocation
const GEOMETRY_CIRCLE = new THREE.SphereGeometry(0.5, 16, 12);
const GEOMETRY_TRIANGLE = new THREE.ConeGeometry(0.5, 1, 3);
const GEOMETRY_SQUARE = new THREE.BoxGeometry(1, 1, 1);
const GEOMETRY_DIAMOND = new THREE.OctahedronGeometry(0.5);

const MATERIAL = new THREE.MeshStandardMaterial({
  roughness: 0.4,
  metalness: 0.1,
});

const SHAPES = [Shape.CIRCLE, Shape.TRIANGLE, Shape.SQUARE, Shape.DIAMOND];

/** Convert HSL to RGB. h: 0-360, s: 0-1, l: 0-1. Returns [r, g, b] in 0-1 range. */
export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
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

interface InstancedOrganismsProps {
  organisms: Organism[];
  worldWidth: number;
  worldHeight: number;
  isRunning: boolean;
}

// Reusable objects to avoid per-frame garbage collection
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();

/**
 * Update InstancedMesh buffers from simulation organisms.
 * Groups organisms by shape, computes matrices and colors, and updates GPU buffers.
 */
export function updateInstances(
  meshes: Record<string, THREE.InstancedMesh | null>,
  organisms: Organism[],
  worldWidth: number,
  worldHeight: number,
): void {
  const byShape: Record<string, Organism[]> = {
    [Shape.CIRCLE]: [],
    [Shape.TRIANGLE]: [],
    [Shape.SQUARE]: [],
    [Shape.DIAMOND]: [],
  };

  for (const org of organisms) {
    if (org.alive && byShape[org.genome.shape]) {
      byShape[org.genome.shape].push(org);
    }
  }

  for (const shape of SHAPES) {
    const mesh = meshes[shape];
    if (!mesh) continue;

    const shapeOrgs = byShape[shape];
    const count = Math.min(shapeOrgs.length, MAX_INSTANCES);

    for (let i = 0; i < count; i++) {
      const org = shapeOrgs[i];

      _position.set(
        org.position.x - worldWidth * 0.5,
        0,
        org.position.y - worldHeight * 0.5,
      );

      _quaternion.identity();

      const s = org.genome.size;
      _scale.set(s, s, s);

      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(i, _matrix);

      const [r, g, b] = hslToRgb(
        org.genome.colorHue,
        org.genome.colorSat,
        org.genome.colorVal,
      );
      _color.setRGB(r, g, b);
      mesh.setColorAt(i, _color);
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

/**
 * Render organisms as InstancedMeshes for high-performance GPU-instanced rendering.
 * One InstancedMesh per shape type. Supports up to 1000 instances per mesh.
 * Updates only when `isRunning` is true to avoid wasted work while paused.
 */
export default function InstancedOrganisms({
  organisms,
  worldWidth,
  worldHeight,
  isRunning,
}: InstancedOrganismsProps) {
  const circleRef = useRef<THREE.InstancedMesh>(null);
  const triangleRef = useRef<THREE.InstancedMesh>(null);
  const squareRef = useRef<THREE.InstancedMesh>(null);
  const diamondRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    if (!isRunning) return;

    const meshes: Record<string, THREE.InstancedMesh | null> = {
      [Shape.CIRCLE]: circleRef.current,
      [Shape.TRIANGLE]: triangleRef.current,
      [Shape.SQUARE]: squareRef.current,
      [Shape.DIAMOND]: diamondRef.current,
    };

    updateInstances(meshes, organisms, worldWidth, worldHeight);
  });

  return (
    <>
      <instancedMesh
        ref={circleRef}
        args={[GEOMETRY_CIRCLE, MATERIAL, MAX_INSTANCES]}
      />
      <instancedMesh
        ref={triangleRef}
        args={[GEOMETRY_TRIANGLE, MATERIAL, MAX_INSTANCES]}
      />
      <instancedMesh
        ref={squareRef}
        args={[GEOMETRY_SQUARE, MATERIAL, MAX_INSTANCES]}
      />
      <instancedMesh
        ref={diamondRef}
        args={[GEOMETRY_DIAMOND, MATERIAL, MAX_INSTANCES]}
      />
    </>
  );
}
