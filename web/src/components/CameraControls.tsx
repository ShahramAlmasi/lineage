import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Organism } from "../simulation/types";

export interface CameraApi {
  reset: () => void;
  setPresetView: (view: "top" | "side" | "isometric") => void;
}

export interface CameraControlsProps {
  organisms: Organism[];
  selectedOrganismId: number | null;
  onSelectOrganism: (id: number | null) => void;
  followSmoothness?: number;
  onApiReady?: (api: CameraApi) => void;
}

export interface CameraUIProps {
  selectedOrganismId: number | null;
  cameraApi: CameraApi | null;
}

const DEFAULT_FOLLOW_SMOOTHNESS = 0.08;
const ANIMATION_DURATION_MS = 800;
const EASE_OUT_CUBIC = 3;

export function CameraControls({
  organisms,
  selectedOrganismId,
  onSelectOrganism,
  followSmoothness = DEFAULT_FOLLOW_SMOOTHNESS,
  onApiReady,
}: CameraControlsProps) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  const isFollowing =
    selectedOrganismId !== null &&
    organisms.some((o) => o.id === selectedOrganismId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedOrganismId !== null) {
        onSelectOrganism(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrganismId, onSelectOrganism]);

  useFrame(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    if (selectedOrganismId !== null) {
      const organism = organisms.find((o) => o.id === selectedOrganismId);
      if (organism) {
        const orgPos = new THREE.Vector3(
          organism.position.x,
          0,
          organism.position.y
        );
        targetRef.current.lerp(orgPos, followSmoothness);
        controls.target.copy(targetRef.current);
      }
    }

    if (camera.position.y < 1) {
      camera.position.y = 1;
    }

    if (controls.target.y < 0) {
      controls.target.y = 0;
    }

    controls.update();
  });

  const animateTo = useCallback(
    (endPos: THREE.Vector3, endTarget: THREE.Vector3) => {
      if (!controlsRef.current) return;

      const controls = controlsRef.current;
      const startPos = camera.position.clone();
      const startTarget = controls.target.clone();
      const startTime = performance.now();

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
        const eased = 1 - Math.pow(1 - t, EASE_OUT_CUBIC);

        camera.position.lerpVectors(startPos, endPos, eased);
        controls.target.lerpVectors(startTarget, endTarget, eased);
        controls.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    },
    [camera]
  );

  const reset = useCallback(() => {
    onSelectOrganism(null);
    animateTo(
      new THREE.Vector3(200, 200, 200),
      new THREE.Vector3(0, 0, 0)
    );
  }, [animateTo, onSelectOrganism]);

  const setPresetView = useCallback(
    (view: "top" | "side" | "isometric") => {
      onSelectOrganism(null);

      let endPos: THREE.Vector3;
      switch (view) {
        case "top":
          endPos = new THREE.Vector3(0, 400, 0.01);
          break;
        case "side":
          endPos = new THREE.Vector3(400, 100, 0);
          break;
        case "isometric":
          endPos = new THREE.Vector3(250, 250, 250);
          break;
      }

      animateTo(endPos, new THREE.Vector3(0, 0, 0));
    },
    [animateTo, onSelectOrganism]
  );

  useEffect(() => {
    const api: CameraApi = { reset, setPresetView };
    onApiReady?.(api);
  }, [reset, setPresetView, onApiReady]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        minDistance={20}
        maxDistance={500}
        enablePan={!isFollowing}
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2 - 0.05}
      />

      {/*
        Invisible ground plane catches clicks on empty space so the user
        can deselect the current organism. Organism meshes should call
        `e.stopPropagation()` in their own onClick to avoid bubbling here.
      */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={() => onSelectOrganism(null)}
      >
        <planeGeometry args={[10000, 10000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}

export function CameraUI({ selectedOrganismId, cameraApi }: CameraUIProps) {
  const handleReset = useCallback(() => {
    cameraApi?.reset();
  }, [cameraApi]);

  const handlePreset = useCallback(
    (view: "top" | "side" | "isometric") => {
      cameraApi?.setPresetView(view);
    },
    [cameraApi]
  );

  return (
    <div style={uiContainerStyle}>
      {selectedOrganismId !== null && (
        <div style={indicatorStyle}>
          Following Organism #{selectedOrganismId}
        </div>
      )}
      <div style={buttonGroupStyle}>
        <CameraButton onClick={handleReset}>Reset</CameraButton>
        <CameraButton onClick={() => handlePreset("top")}>Top</CameraButton>
        <CameraButton onClick={() => handlePreset("side")}>Side</CameraButton>
        <CameraButton onClick={() => handlePreset("isometric")}>
          Isometric
        </CameraButton>
      </div>
    </div>
  );
}

const COLORS = {
  bgDark: "rgba(10, 10, 10, 0.85)",
  bgHover: "rgba(30, 30, 30, 0.9)",
  textPrimary: "#e0e0e0",
  textAccent: "#e8d5b7",
  border: "rgba(255, 255, 255, 0.15)",
  borderHover: "rgba(255, 255, 255, 0.3)",
} as const;

const FONT_FAMILY = "system-ui, -apple-system, sans-serif";

const uiContainerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "24px",
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
  zIndex: 100,
  pointerEvents: "none",
};

const indicatorStyle: React.CSSProperties = {
  background: COLORS.bgDark,
  color: COLORS.textAccent,
  padding: "10px 20px",
  borderRadius: "24px",
  fontSize: "14px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: `1px solid ${COLORS.border}`,
  pointerEvents: "auto",
  fontFamily: FONT_FAMILY,
};

const buttonGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  pointerEvents: "auto",
};

const buttonBaseStyle: React.CSSProperties = {
  background: COLORS.bgDark,
  color: COLORS.textPrimary,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "8px",
  padding: "8px 16px",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  transition: "all 0.2s ease",
  fontFamily: FONT_FAMILY,
};

interface CameraButtonProps {
  children: React.ReactNode;
  onClick: () => void;
}

function CameraButton({ children, onClick }: CameraButtonProps) {
  return (
    <button
      onClick={onClick}
      style={buttonBaseStyle}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = COLORS.bgHover;
        el.style.borderColor = COLORS.borderHover;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = COLORS.bgDark;
        el.style.borderColor = COLORS.border;
      }}
    >
      {children}
    </button>
  );
}
