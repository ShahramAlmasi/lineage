import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Stars } from "@react-three/drei";
import * as THREE from "three";

import { useSimulationWorker } from "../../hooks/useSimulationWorker";
import type { SimulationConfig, WorldStatistics } from "../../simulation/types";
import type { SimState } from "../../workers/simulation.worker";
import { DEFAULT_CONFIG } from "../../simulation/config";
import { LineChart } from "./StatsGraph";

type SyncMode = "synced" | "independent";

const TOKENS = {
  bg: "#0a0a0a",
  bgAlpha: "rgba(10, 10, 10, 0.88)",
  glass: "rgba(10, 10, 10, 0.75)",
  border: "rgba(232, 213, 183, 0.15)",
  borderFaint: "rgba(232, 213, 183, 0.08)",
  text: "#e0e0e0",
  textDim: "rgba(224, 224, 224, 0.6)",
  textFaint: "rgba(224, 224, 224, 0.4)",
  accent: "#e8d5b7",
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
  pink: "#f472b6",
  yellow: "#fbbf24",
  purple: "#a78bfa",
  divider: "rgba(232, 213, 183, 0.25)",
} as const;

const WORLD_COLORS = { left: "#60a5fa", right: "#f472b6" } as const;

const WORLD_LABELS = ["World A", "World B"] as const;

interface HistoryPoint {
  tick: number;
  population: number;
  speciesCount: number;
  averageEnergy: number;
}

export default memo(ComparisonView);

const MAX_HISTORY = 200;

export interface ComparisonViewProps {
  leftConfig?: SimulationConfig;
  rightConfig?: SimulationConfig;
  active?: boolean;
}

function MiniScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[80, 120, 40]} intensity={0.9} />
      <hemisphereLight args={["#87CEEB", "#2F4F2F", 0.5]} position={[0, 80, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#1a2a1a" roughness={0.9} metalness={0.1} />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[600, 600]}
        cellSize={20}
        cellThickness={0.5}
        cellColor="#3a4a3a"
        sectionSize={100}
        sectionThickness={1}
        sectionColor="#4a5a4a"
        fadeDistance={300}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Stars radius={200} depth={40} count={400} factor={3} saturation={0} fade speed={0.3} />
    </>
  );
}

function SceneSetup() {
  const { scene, camera } = useThree();
  const applied = useRef(false);
  if (!applied.current) {
    scene.fog = new THREE.Fog("#0d1a0d", 150, 350);
    scene.background = new THREE.Color("#0d1a0d");
    camera.lookAt(0, 0, 0);
    applied.current = true;
  }
  return null;
}

interface SimPanelProps {
  config: SimulationConfig;
  label: string;
  accentColor: string;
  isRunning: boolean;
  speed: number;
  syncMode: SyncMode;
  onStatsUpdate: (stats: WorldStatistics | null, state: SimState | null) => void;
}

function SimPanel({
  config,
  label,
  accentColor,
  isRunning,
  speed,
  syncMode: _syncMode,
  onStatsUpdate,
}: SimPanelProps) {
  const worker = useSimulationWorker();

  useEffect(() => {
    onStatsUpdate(worker.stats, worker.state);
  }, [worker.stats, worker.state, onStatsUpdate]);

  useEffect(() => {
    if (!worker.isInitialized) {
      worker.initialize(config);
    }
  }, [config, worker.isInitialized, worker.initialize]);

  useEffect(() => {
    if (!worker.isInitialized) return;
    if (isRunning && !worker.isRunning) {
      worker.run(100_000, Math.max(4, Math.round(16 / speed)));
    } else if (!isRunning && worker.isRunning) {
      worker.pause();
    }
  }, [isRunning, speed, worker]);

  if (worker.error) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: TOKENS.red,
        fontFamily: "system-ui, sans-serif",
        padding: 20,
      }}>
        <div>
          <strong>{label}</strong>: {worker.error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        background: TOKENS.glass,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 6,
        color: accentColor,
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isRunning ? TOKENS.green : TOKENS.red,
          boxShadow: isRunning
            ? `0 0 6px rgba(74,222,128,0.5)`
            : `0 0 6px rgba(248,113,113,0.5)`,
        }} />
        {label}
        {worker.stats && (
          <span style={{
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: 10,
            color: TOKENS.textFaint,
            fontWeight: 400,
          }}>
            tick {worker.stats.tick.toLocaleString()}
          </span>
        )}
      </div>

      {worker.stats && (
        <div style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          zIndex: 10,
          padding: "4px 10px",
          background: TOKENS.glass,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: `1px solid ${TOKENS.borderFaint}`,
          borderRadius: 4,
          color: TOKENS.textDim,
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
        }}>
          Pop: {worker.stats.population.toLocaleString()} · Species: {worker.state?.speciesCount ?? 0}
        </div>
      )}

      <Canvas
        camera={{ position: [0, 80, 160], fov: 55, near: 0.1, far: 800 }}
        shadows
        gl={{ antialias: true, powerPreference: "high-performance" }}
        frameloop={isRunning ? "always" : "demand"}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <SceneSetup />
        <MiniScene />
      </Canvas>
    </div>
  );
}

interface ComparisonStatsProps {
  leftStats: WorldStatistics | null;
  rightStats: WorldStatistics | null;
  leftState: SimState | null;
  rightState: SimState | null;
  leftHistory: HistoryPoint[];
  rightHistory: HistoryPoint[];
}

function ComparisonStats({
  leftStats,
  rightStats,
  leftState,
  rightState,
  leftHistory,
  rightHistory,
}: ComparisonStatsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const popDiff = useMemo(() => {
    if (!leftStats || !rightStats) return null;
    return leftStats.population - rightStats.population;
  }, [leftStats, rightStats]);

  const speciesDiff = useMemo(() => {
    if (!leftState || !rightState) return null;
    return leftState.speciesCount - rightState.speciesCount;
  }, [leftState, rightState]);

  const diversityWinner = useMemo(() => {
    if (!leftState || !rightState) return null;
    if (leftState.speciesCount > rightState.speciesCount) return "left" as const;
    if (rightState.speciesCount > leftState.speciesCount) return "right" as const;
    return "tie" as const;
  }, [leftState, rightState]);

  const energyDiff = useMemo(() => {
    if (!leftStats || !rightStats) return null;
    return leftStats.averageEnergy - rightStats.averageEnergy;
  }, [leftStats, rightStats]);

  const popHistoryDiff = useMemo(() => {
    const len = Math.min(leftHistory.length, rightHistory.length);
    if (len < 2) return [];
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < len; i++) {
      result.push({
        x: leftHistory[i].tick,
        y: leftHistory[i].population - rightHistory[i].population,
      });
    }
    return result;
  }, [leftHistory, rightHistory]);

  if (!leftStats && !rightStats) return null;

  const containerStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 260,
    background: TOKENS.bgAlpha,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${TOKENS.border}`,
    borderRadius: 8,
    color: TOKENS.text,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 12,
    zIndex: 20,
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    pointerEvents: "auto",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: collapsed ? "none" : `1px solid ${TOKENS.borderFaint}`,
  };

  const diffColor = (val: number | null) => {
    if (val === null) return TOKENS.textDim;
    if (val > 0) return WORLD_COLORS.left;
    if (val < 0) return WORLD_COLORS.right;
    return TOKENS.textDim;
  };

  const diffLabel = (val: number | null, prefix = "Δ") => {
    if (val === null) return "—";
    const sign = val > 0 ? "+" : "";
    return `${prefix} ${sign}${val.toLocaleString()}`;
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle} onClick={() => setCollapsed(c => !c)}>
        <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: "0.04em" }}>
          Comparison
        </span>
        <span style={{
          display: "inline-block",
          transition: "transform 0.2s ease",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          color: TOKENS.textFaint,
          fontSize: 10,
        }}>▼</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "8px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textDim }}>
              Population
            </span>
            <span style={{
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
              color: diffColor(popDiff),
              fontWeight: 600,
            }}>
              {diffLabel(popDiff)}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textDim }}>
              Species
            </span>
            <span style={{
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
              color: diffColor(speciesDiff),
              fontWeight: 600,
            }}>
              {diffLabel(speciesDiff)}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textDim }}>
              Avg Energy
            </span>
            <span style={{
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
              color: diffColor(energyDiff),
              fontWeight: 600,
            }}>
              {energyDiff !== null ? `${energyDiff > 0 ? "+" : ""}${energyDiff.toFixed(1)}` : "—"}
            </span>
          </div>

          <div style={{
            padding: "6px 10px",
            background: "rgba(232,213,183,0.04)",
            borderRadius: 4,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textDim }}>
              Higher Diversity
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: diversityWinner === "left" ? WORLD_COLORS.left
                : diversityWinner === "right" ? WORLD_COLORS.right
                : TOKENS.textDim,
            }}>
              {diversityWinner === "left" ? WORLD_LABELS[0]
                : diversityWinner === "right" ? WORLD_LABELS[1]
                : "Tie"}
            </span>
          </div>

          {leftHistory.length > 1 && rightHistory.length > 1 && (
            <div style={{ marginTop: 4 }}>
              <div style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: TOKENS.textFaint,
                marginBottom: 4,
              }}>
                Population Delta Over Time
              </div>
              <LineChart
                data={popHistoryDiff}
                width={232}
                height={64}
                color={TOKENS.accent}
                strokeWidth={1.5}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparisonView({
  leftConfig,
  rightConfig,
  active: _active = true,
}: ComparisonViewProps) {
  const [syncMode, setSyncMode] = useState<SyncMode>("synced");
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showStats, setShowStats] = useState(true);

  const [leftStats, setLeftStats] = useState<WorldStatistics | null>(null);
  const [rightStats, setRightStats] = useState<WorldStatistics | null>(null);
  const [leftState, setLeftState] = useState<SimState | null>(null);
  const [rightState, setRightState] = useState<SimState | null>(null);

  const leftHistoryRef = useRef<HistoryPoint[]>([]);
  const rightHistoryRef = useRef<HistoryPoint[]>([]);
  const [leftHistory, setLeftHistory] = useState<HistoryPoint[]>([]);
  const [rightHistory, setRightHistory] = useState<HistoryPoint[]>([]);
  const historyTickRef = useRef(0);

  const resolvedLeftConfig = useMemo(
    () => leftConfig ?? DEFAULT_CONFIG,
    [leftConfig],
  );
  const resolvedRightConfig = useMemo(
    () => rightConfig ?? { ...DEFAULT_CONFIG, seed: 42 },
    [rightConfig],
  );

  useEffect(() => {
    if (leftStats && leftState) {
      const point: HistoryPoint = {
        tick: leftStats.tick,
        population: leftStats.population,
        speciesCount: leftState.speciesCount,
        averageEnergy: leftStats.averageEnergy,
      };
      const next = [...leftHistoryRef.current, point];
      if (next.length > MAX_HISTORY) next.shift();
      leftHistoryRef.current = next;
    }
  }, [leftStats, leftState]);

  useEffect(() => {
    if (rightStats && rightState) {
      const point: HistoryPoint = {
        tick: rightStats.tick,
        population: rightStats.population,
        speciesCount: rightState.speciesCount,
        averageEnergy: rightStats.averageEnergy,
      };
      const next = [...rightHistoryRef.current, point];
      if (next.length > MAX_HISTORY) next.shift();
      rightHistoryRef.current = next;
    }
  }, [rightStats, rightState]);

  useEffect(() => {
    historyTickRef.current++;
    if (historyTickRef.current % 3 === 0 || !isRunning) {
      setLeftHistory([...leftHistoryRef.current]);
      setRightHistory([...rightHistoryRef.current]);
    }
  }, [leftStats, rightStats, isRunning]);

  const handleLeftStats = useCallback(
    (stats: WorldStatistics | null, state: SimState | null) => {
      if (stats) setLeftStats(stats);
      if (state) setLeftState(state);
    },
    [],
  );
  const handleRightStats = useCallback(
    (stats: WorldStatistics | null, state: SimState | null) => {
      if (stats) setRightStats(stats);
      if (state) setRightState(state);
    },
    [],
  );

  const togglePlay = useCallback(() => setIsRunning(r => !r), []);
  const toggleStats = useCallback(() => setShowStats(s => !s), []);
  const cycleSync = useCallback(() => {
    setSyncMode(m => m === "synced" ? "independent" : "synced");
  }, []);

  const SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;

  const containerStyle: CSSProperties = {
    width: "100vw",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    display: "flex",
    background: TOKENS.bg,
    color: TOKENS.text,
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflow: "hidden",
  };

  return (
    <div style={containerStyle}>
      <SimPanel
        config={resolvedLeftConfig}
        label={WORLD_LABELS[0]}
        accentColor={WORLD_COLORS.left}
        isRunning={isRunning}
        speed={speed}
        syncMode={syncMode}
        onStatsUpdate={handleLeftStats}
      />

      <div style={{
        width: 2,
        background: TOKENS.divider,
        flexShrink: 0,
        position: "relative",
        zIndex: 15,
      }} />

      <SimPanel
        config={resolvedRightConfig}
        label={WORLD_LABELS[1]}
        accentColor={WORLD_COLORS.right}
        isRunning={isRunning}
        speed={speed}
        syncMode={syncMode}
        onStatsUpdate={handleRightStats}
      />

      {showStats && (
        <ComparisonStats
          leftStats={leftStats}
          rightStats={rightStats}
          leftState={leftState}
          rightState={rightState}
          leftHistory={leftHistory}
          rightHistory={rightHistory}
        />
      )}

      <div style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: TOKENS.glass,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 8,
        userSelect: "none",
        fontSize: 12,
      }}>
        <button
          onClick={togglePlay}
          style={{
            background: isRunning ? "rgba(248,113,113,0.15)" : "rgba(74,222,128,0.15)",
            border: `1px solid ${isRunning ? TOKENS.red : TOKENS.green}`,
            borderRadius: 4,
            color: isRunning ? TOKENS.red : TOKENS.green,
            padding: "4px 12px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 12,
            transition: "all 0.15s ease",
          }}
        >
          {isRunning ? "⏸ Pause" : "▶ Play"}
        </button>

        <div style={{ display: "flex", gap: 3 }}>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                background: speed === s ? "rgba(232,213,183,0.15)" : "transparent",
                border: `1px solid ${speed === s ? TOKENS.accent : TOKENS.borderFaint}`,
                borderRadius: 3,
                color: speed === s ? TOKENS.accent : TOKENS.textDim,
                padding: "3px 7px",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: speed === s ? 600 : 400,
                transition: "all 0.15s ease",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        <button
          onClick={cycleSync}
          style={{
            background: syncMode === "synced" ? "rgba(96,165,250,0.15)" : "rgba(232,213,183,0.08)",
            border: `1px solid ${syncMode === "synced" ? TOKENS.blue : TOKENS.borderFaint}`,
            borderRadius: 4,
            color: syncMode === "synced" ? TOKENS.blue : TOKENS.textDim,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          {syncMode === "synced" ? "⏱ Synced" : "🔓 Independent"}
        </button>

        <button
          onClick={toggleStats}
          style={{
            background: showStats ? "rgba(232,213,183,0.12)" : "transparent",
            border: `1px solid ${TOKENS.borderFaint}`,
            borderRadius: 4,
            color: showStats ? TOKENS.accent : TOKENS.textDim,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 11,
            transition: "all 0.15s ease",
          }}
        >
          📊 Stats
        </button>
      </div>
    </div>
  );
}
