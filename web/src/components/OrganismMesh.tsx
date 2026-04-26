import { useRef, useMemo, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { Shape, type Organism } from "../simulation/types";
import { createOrganismMaterial, updateOrganismUniforms } from "../utils/organism-shaders";
import { hslToRgb } from "./InstancedOrganisms";

interface OrganismMeshProps {
  organism: Organism;
  worldWidth: number;
  worldHeight: number;
  onClick?: (organism: Organism) => void;
}

function getGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case Shape.CIRCLE:
      return new THREE.SphereGeometry(0.5, 32, 24);
    case Shape.TRIANGLE:
      return new THREE.ConeGeometry(0.5, 1.0, 3, 8);
    case Shape.SQUARE:
      return new THREE.BoxGeometry(1.0, 1.0, 1.0, 4, 4, 4);
    case Shape.DIAMOND:
      return new THREE.OctahedronGeometry(0.5, 2);
    default:
      return new THREE.SphereGeometry(0.5, 32, 24);
  }
}

function getEyePositions(shape: Shape, size: number): [number, number, number][] {
  const s = size * 0.5;
  switch (shape) {
    case Shape.CIRCLE:
      return [
        [s * 0.35, s * 0.25, s * 0.35],
        [-s * 0.35, s * 0.25, s * 0.35],
      ];
    case Shape.TRIANGLE:
      return [
        [s * 0.3, s * 0.15, s * 0.3],
        [-s * 0.3, s * 0.15, s * 0.3],
      ];
    case Shape.SQUARE:
      return [
        [s * 0.25, s * 0.2, s * 0.45],
        [-s * 0.25, s * 0.2, s * 0.45],
      ];
    case Shape.DIAMOND:
      return [
        [s * 0.3, s * 0.2, s * 0.35],
        [-s * 0.3, s * 0.2, s * 0.35],
      ];
    default:
      return [
        [s * 0.35, s * 0.25, s * 0.35],
        [-s * 0.35, s * 0.25, s * 0.35],
      ];
  }
}

export default function OrganismMesh({
  organism,
  worldWidth,
  worldHeight,
  onClick,
}: OrganismMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startTime = useMemo(() => Date.now() / 1000, []);

  const [r, g, b] = hslToRgb(
    organism.genome.colorHue,
    organism.genome.colorSat,
    organism.genome.colorVal,
  );
  const baseColor = useMemo(() => new THREE.Color(r, g, b), [r, g, b]);

  const material = useMemo(() => {
    return createOrganismMaterial(baseColor, organism.energy);
  }, [baseColor, organism.energy]);

  const geometry = useMemo(() => {
    return getGeometry(organism.genome.shape);
  }, [organism.genome.shape]);

  const position = useMemo(() => {
    return new THREE.Vector3(
      organism.position.x - worldWidth * 0.5,
      organism.genome.size * 0.5,
      organism.position.y - worldHeight * 0.5,
    );
  }, [organism.position, organism.genome.size, worldWidth, worldHeight]);

  const scale = useMemo(() => {
    return new THREE.Vector3(
      organism.genome.size,
      organism.genome.size,
      organism.genome.size,
    );
  }, [organism.genome.size]);

  const eyePositions = useMemo(() => {
    return getEyePositions(organism.genome.shape, organism.genome.size);
  }, [organism.genome.shape, organism.genome.size]);

  useFrame(() => {
    const elapsed = Date.now() / 1000 - startTime;
    updateOrganismUniforms(material, {
      time: elapsed,
      energy: organism.energy,
    });
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.(organism);
    },
    [onClick, organism],
  );

  return (
    <group position={position} scale={scale}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        onClick={handleClick}
        castShadow
        receiveShadow
      />
      {eyePositions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh>
            <sphereGeometry args={[0.12, 8, 6]} />
            <meshStandardMaterial color="#111111" roughness={0.2} />
          </mesh>
          <mesh position={[0.03, 0.03, 0.06]}>
            <sphereGeometry args={[0.04, 6, 4]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
