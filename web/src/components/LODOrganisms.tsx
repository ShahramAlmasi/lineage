import { memo, useRef, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Shape, type Organism } from "../simulation/types";
import { hslToRgb } from "./InstancedOrganisms";

const MAX_INSTANCES = 1000;

/** Distance below which organisms render with full detail. */
const DIST_CLOSE = 30;

/** Distance above which organisms render as billboard sprites. */
const DIST_MEDIUM = 80;

/**
 * Buffer around each LOD boundary. An organism must travel this far past
 * a threshold before its LOD level actually changes, preventing flicker.
 */
const HYSTERESIS = 8;

/** Recompute LOD assignments every N frames to save CPU. */
const LOD_UPDATE_INTERVAL = 5;

const LOD_CLOSE = 0;
const LOD_MEDIUM = 1;
const LOD_FAR = 2;

const SHAPES = [Shape.CIRCLE, Shape.TRIANGLE, Shape.SQUARE, Shape.DIAMOND];

const GEO_CLOSE: Record<Shape, THREE.BufferGeometry> = {
  [Shape.CIRCLE]: new THREE.SphereGeometry(0.5, 16, 12),
  [Shape.TRIANGLE]: new THREE.ConeGeometry(0.5, 1, 3),
  [Shape.SQUARE]: new THREE.BoxGeometry(1, 1, 1),
  [Shape.DIAMOND]: new THREE.OctahedronGeometry(0.5),
};

const GEO_MEDIUM: Record<Shape, THREE.BufferGeometry> = {
  [Shape.CIRCLE]: new THREE.SphereGeometry(0.5, 8, 6),
  [Shape.TRIANGLE]: new THREE.ConeGeometry(0.5, 1, 3),
  [Shape.SQUARE]: new THREE.BoxGeometry(1, 1, 1),
  [Shape.DIAMOND]: new THREE.OctahedronGeometry(0.5),
};

const GEO_FAR = new THREE.PlaneGeometry(1, 1);

const MAT_CLOSE = new THREE.MeshPhysicalMaterial({
  roughness: 0.35,
  metalness: 0.08,
  clearcoat: 0.4,
  clearcoatRoughness: 0.25,
  sheen: 0.3,
  sheenColor: new THREE.Color(1.0, 1.0, 1.0),
  sheenRoughness: 0.5,
});

const MAT_MEDIUM = new THREE.MeshStandardMaterial({
  roughness: 0.5,
  metalness: 0.05,
});

const textureCache: Record<Shape, THREE.CanvasTexture | null> = {
  [Shape.CIRCLE]: null,
  [Shape.TRIANGLE]: null,
  [Shape.SQUARE]: null,
  [Shape.DIAMOND]: null,
};

/**
 * Render a white silhouette of the given shape to a canvas and wrap it
 * in a CanvasTexture.  The white base lets per-instance vertex colours
 * tint the sprite to match each organism's genome.
 */
function getBillboardTexture(shape: Shape): THREE.CanvasTexture {
  if (textureCache[shape]) return textureCache[shape]!;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  switch (shape) {
    case Shape.CIRCLE:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case Shape.TRIANGLE:
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx - r * 0.866, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.866, cy + r * 0.5);
      ctx.closePath();
      break;
    case Shape.SQUARE:
      ctx.rect(cx - r * 0.707, cy - r * 0.707, r * 1.414, r * 1.414);
      break;
    case Shape.DIAMOND:
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
  }

  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  textureCache[shape] = tex;
  return tex;
}

function createFarMaterial(shape: Shape): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: getBillboardTexture(shape),
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function bucketKey(shape: Shape, lod: number): string {
  return `${shape}_${lod}`;
}

/**
 * Pick the LOD level for an organism based on its distance from the
 * camera and its *previous* LOD level.  Hysteresis creates a dead-zone
 * around each boundary so organisms do not flip-flop when hovering near
 * a threshold.
 */
function chooseLod(dist: number, prevLod: number): number {
  if (prevLod === LOD_CLOSE) {
    if (dist > DIST_CLOSE + HYSTERESIS) return LOD_MEDIUM;
    return LOD_CLOSE;
  }
  if (prevLod === LOD_MEDIUM) {
    if (dist < DIST_CLOSE - HYSTERESIS) return LOD_CLOSE;
    if (dist > DIST_MEDIUM + HYSTERESIS) return LOD_FAR;
    return LOD_MEDIUM;
  }
  if (dist < DIST_MEDIUM - HYSTERESIS) return LOD_MEDIUM;
  return LOD_FAR;
}

const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _dummy = new THREE.Object3D();

export interface LODOrganismsProps {
  organisms: Organism[];
  worldWidth: number;
  worldHeight: number;
  isRunning: boolean;
}

/**
 * Distance-based Level-of-Detail renderer for organisms.
 *
 * Three LOD bands:
 *   Close  (< 30 units) : full detailed mesh  (MeshStandardMaterial)
 *   Medium (30–80 units): simplified mesh      (MeshBasicMaterial)
 *   Far    (> 80 units) : billboard sprite     (CanvasTexture plane)
 *
 * LOD assignments are recomputed only every {@link LOD_UPDATE_INTERVAL}
 * frames to avoid flickering and reduce CPU cost.  Hysteresis adds a
 * dead-zone around each boundary so organisms do not flip-flop.
 *
 * Internally organisms are grouped into 12 buckets
 * (4 shapes × 3 LOD levels) and rendered with `InstancedMesh`.
 */
function LODOrganisms({
  organisms,
  worldWidth,
  worldHeight,
  isRunning,
}: LODOrganismsProps) {
  const { camera } = useThree();

  const meshRefs = useRef<Record<string, THREE.InstancedMesh | null>>({});

  const setMeshRef = useCallback(
    (shape: Shape, lod: number) => (el: THREE.InstancedMesh | null) => {
      meshRefs.current[bucketKey(shape, lod)] = el;
    },
    []
  );

  const lodMap = useRef<Map<number, number>>(new Map());

  const bucketsRef = useRef<Record<string, Organism[]> | null>(null);
  if (bucketsRef.current === null) {
    bucketsRef.current = {};
    for (const shape of SHAPES) {
      for (let lod = 0; lod < 3; lod++) {
        bucketsRef.current[bucketKey(shape, lod)] = [];
      }
    }
  }
  const buckets = bucketsRef.current;

  const farMaterialsRef = useRef<Record<Shape, THREE.MeshBasicMaterial> | null>(null);
  if (farMaterialsRef.current === null) {
    farMaterialsRef.current = {} as Record<Shape, THREE.MeshBasicMaterial>;
    for (const shape of SHAPES) {
      farMaterialsRef.current[shape] = createFarMaterial(shape);
    }
  }
  const farMaterials = farMaterialsRef.current;

  const frameCount = useRef(0);
  const aliveIdsRef = useRef<Set<number>>(new Set());

  useFrame(() => {
    if (!isRunning) return;

    const shouldUpdateLod = frameCount.current % LOD_UPDATE_INTERVAL === 0;
    frameCount.current++;

    if (shouldUpdateLod) {
      for (const shape of SHAPES) {
        for (let lod = 0; lod < 3; lod++) {
          buckets[bucketKey(shape, lod)].length = 0;
        }
      }

      const camPos = camera.position;
      const aliveIds = aliveIdsRef.current;
      aliveIds.clear();

      for (const org of organisms) {
        if (!org.alive) continue;
        aliveIds.add(org.id);

        const worldX = org.position.x - worldWidth * 0.5;
        const worldZ = org.position.y - worldHeight * 0.5;

        const dx = worldX - camPos.x;
        const dy = -camPos.y;
        const dz = worldZ - camPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const prevLod = lodMap.current.get(org.id) ?? LOD_MEDIUM;
        const newLod = chooseLod(dist, prevLod);
        lodMap.current.set(org.id, newLod);

        buckets[bucketKey(org.genome.shape, newLod)].push(org);
      }

      for (const id of lodMap.current.keys()) {
        if (!aliveIds.has(id)) {
          lodMap.current.delete(id);
        }
      }
    }

    for (const shape of SHAPES) {
      for (let lod = 0; lod < 3; lod++) {
        const mesh = meshRefs.current[bucketKey(shape, lod)];
        if (!mesh) continue;

        const bucket = buckets[bucketKey(shape, lod)];
        const count = Math.min(bucket.length, MAX_INSTANCES);

        for (let i = 0; i < count; i++) {
          const org = bucket[i]!;

          _position.set(
            org.position.x - worldWidth * 0.5,
            0,
            org.position.y - worldHeight * 0.5
          );

          const s = org.genome.size;

          if (lod === LOD_FAR) {
            _dummy.position.copy(_position);
            _dummy.lookAt(camera.position);
            _quaternion.copy(_dummy.quaternion);
            _scale.set(s * 2.5, s * 2.5, s * 2.5);
          } else {
            _quaternion.identity();
            _scale.set(s, s, s);
          }

          _matrix.compose(_position, _quaternion, _scale);
          mesh.setMatrixAt(i, _matrix);

          const [r, g, b] = hslToRgb(
            org.genome.colorHue,
            org.genome.colorSat,
            org.genome.colorVal
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
  });

  return (
    <>
      {SHAPES.map((shape) => (
        <group key={shape}>
          <instancedMesh
            ref={setMeshRef(shape, LOD_CLOSE)}
            args={[GEO_CLOSE[shape], MAT_CLOSE, MAX_INSTANCES]}
          />
          <instancedMesh
            ref={setMeshRef(shape, LOD_MEDIUM)}
            args={[GEO_MEDIUM[shape], MAT_MEDIUM, MAX_INSTANCES]}
          />
          <instancedMesh
            ref={setMeshRef(shape, LOD_FAR)}
            args={[GEO_FAR, farMaterials[shape], MAX_INSTANCES]}
          />
        </group>
      ))}
    </>
  );
}

export default memo(LODOrganisms);
