import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSimulationWorker } from "../hooks/useSimulationWorker";
import { DEFAULT_CONFIG } from "../simulation/config";
import { Shape, type Food, type Organism, type SimulationConfig, type SimulationEvent, type Species, type WorldStatistics } from "../simulation/types";
import type { SimState } from "../workers/simulation.worker";

type ComparisonMode = boolean;
type RecordingMode = "off" | "loader" | "playback";

export interface SimulationContextValue {
  state: SimState | null;
  stats: WorldStatistics | null;
  events: SimulationEvent[];
  error: string | null;
  isRunning: boolean;
  isInitialized: boolean;
  selectedOrganismId: number | null;
  currentConfig: SimulationConfig;
  playbackSpeed: number;
  comparisonMode: ComparisonMode;
  recordingMode: RecordingMode;
  organisms: Organism[];
  food: Food[];
  species: Map<number, { species: Species; parentSpeciesId: number | null }>;
  selectedOrganism: Organism | null;
  currentTick: number;
  initialize: (config?: SimulationConfig) => void;
  tick: () => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
  selectOrganism: (id: number | null) => void;
  setSpeed: (speed: number) => void;
  setConfig: (config: SimulationConfig) => void;
  toggleComparison: () => void;
  setRecordingMode: (mode: RecordingMode) => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

const shapeValues = [Shape.CIRCLE, Shape.TRIANGLE, Shape.SQUARE, Shape.DIAMOND] as const;

function organismFromWorker(o: SimState["organisms"][number]): Organism {
  const shape = shapeValues.includes(o.shape as Shape) ? (o.shape as Shape) : Shape.CIRCLE;
  return {
    id: o.id,
    genome: {
      size: o.size,
      shape,
      colorHue: o.hue,
      colorSat: 0.8,
      colorVal: 0.8,
      baseMetabolism: 0.1,
      photosynthesisRate: 0,
      movementSpeed: 1,
      foodDetectionRadius: 5,
      predatorDetectionRadius: 5,
      mateDetectionRadius: 5,
      reproductionThreshold: 50,
      reproductionCost: 30,
      sexualReproduction: true,
      crossoverPreference: 0.5,
      mutationRate: 0.05,
      mutationMagnitude: 0.1,
      behaviorTree: [],
      speciesId: o.speciesId,
      generation: 0,
      parentIds: [],
    },
    position: { x: o.x, y: o.y },
    energy: o.energy,
    age: 0,
    alive: o.alive,
    generation: 0,
    ticksSinceReproduction: 0,
  };
}

function foodFromWorker(f: SimState["food"][number]): Food {
  return { position: { x: f.x, y: f.y }, energy: f.energy, age: 0 };
}

function buildSpeciesTree(organisms: Organism[], currentTick: number) {
  const bySpecies = new Map<number, { representative: Organism; memberIds: Set<number> }>();
  for (const organism of organisms) {
    const id = organism.genome.speciesId;
    const entry = bySpecies.get(id);
    if (entry) {
      entry.memberIds.add(organism.id);
    } else {
      bySpecies.set(id, { representative: organism, memberIds: new Set([organism.id]) });
    }
  }

  const tree = new Map<number, { species: Species; parentSpeciesId: number | null }>();
  for (const [id, { representative: organism, memberIds }] of bySpecies) {
    const species: Species = {
      id,
      representativeGenome: organism.genome,
      memberIds,
      createdAtTick: 0,
      extinctAtTick: null,
      parentSpeciesId: null,
      generationSpawned: organism.generation,
    };
    tree.set(id, { species, parentSpeciesId: null });
  }

  if (tree.size === 0 && currentTick > 0) return new Map<number, { species: Species; parentSpeciesId: number | null }>();
  return tree;
}

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const worker = useSimulationWorker();
  const [currentConfig, setCurrentConfig] = useState<SimulationConfig>(DEFAULT_CONFIG);
  const [selectedOrganismId, setSelectedOrganismId] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [recordingMode, setRecordingModeState] = useState<RecordingMode>("off");

  const organisms = useMemo(() => worker.state?.organisms.map(organismFromWorker) ?? [], [worker.state]);
  const food = useMemo(() => worker.state?.food.map(foodFromWorker) ?? [], [worker.state]);
  const currentTick = worker.state?.tick ?? worker.stats?.tick ?? 0;
  const species = useMemo(() => buildSpeciesTree(organisms, currentTick), [organisms, currentTick]);
  const selectedOrganism = useMemo(
    () => organisms.find((o) => o.id === selectedOrganismId) ?? null,
    [organisms, selectedOrganismId],
  );

  const initialize = useCallback((config: SimulationConfig = currentConfig) => {
    setCurrentConfig(config);
    setSelectedOrganismId(null);
    worker.initialize(config);
  }, [currentConfig, worker]);

  const run = useCallback(() => {
    if (!worker.isInitialized) {
      worker.initialize(currentConfig);
    }
    const remainingTicks = Math.max(currentConfig.ticks - currentTick, 1);
    worker.run(remainingTicks, Math.max(1, Math.round(16 / playbackSpeed)));
  }, [currentConfig, currentTick, playbackSpeed, worker]);

  const reset = useCallback(() => {
    worker.pause();
    setSelectedOrganismId(null);
    worker.initialize(currentConfig);
  }, [currentConfig, worker]);

  const setConfig = useCallback((config: SimulationConfig) => {
    setCurrentConfig(config);
    setSelectedOrganismId(null);
    worker.initialize(config);
  }, [worker]);

  const toggleComparison = useCallback(() => {
    worker.pause();
    setComparisonMode((value) => !value);
  }, [worker]);

  const setRecordingMode = useCallback((mode: RecordingMode) => {
    worker.pause();
    setRecordingModeState(mode);
  }, [worker]);

  useEffect(() => {
    worker.initialize(DEFAULT_CONFIG);
  }, []);

  useEffect(() => {
    if (selectedOrganismId !== null && !organisms.some((o) => o.id === selectedOrganismId)) {
      setSelectedOrganismId(null);
    }
  }, [organisms, selectedOrganismId]);

  const tick = worker.tick;
  const pause = worker.pause;
  const selectOrganism = setSelectedOrganismId;
  const setSpeed = setPlaybackSpeed;

  const value = useMemo<SimulationContextValue>(() => ({
    state: worker.state,
    stats: worker.stats,
    events: worker.events,
    error: worker.error,
    isRunning: worker.isRunning,
    isInitialized: worker.isInitialized,
    selectedOrganismId,
    currentConfig,
    playbackSpeed,
    comparisonMode,
    recordingMode,
    organisms,
    food,
    species,
    selectedOrganism,
    currentTick,
    initialize,
    tick,
    run,
    pause,
    reset,
    selectOrganism,
    setSpeed,
    setConfig,
    toggleComparison,
    setRecordingMode,
  }), [worker.state, worker.stats, worker.events, worker.error, worker.isRunning, worker.isInitialized, selectedOrganismId, currentConfig, playbackSpeed, comparisonMode, recordingMode, organisms, food, species, selectedOrganism, currentTick, initialize, tick, run, pause, reset, selectOrganism, setSpeed, setConfig, toggleComparison, setRecordingMode]);

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function useSimulationContext(): SimulationContextValue {
  const context = useContext(SimulationContext);
  if (!context) throw new Error("useSimulationContext must be used within SimulationProvider");
  return context;
}

export { SimulationContext };
