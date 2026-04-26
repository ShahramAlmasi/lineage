import type { SimulationConfig } from "./types";

const DEFAULT_CONFIG: SimulationConfig = {
  worldWidth: 200,
  worldHeight: 200,
  initialPopulation: 200,
  maxPopulation: 1000,
  initialFood: 500,
  foodSpawnRate: 0.1,
  foodEnergy: 15.0,
  fertileZones: [[0.5, 0.5, 0.3]],
  carryingCapacityPressure: 0.001,
  speciationThreshold: 0.3,
  ticks: 100_000,
  recordEveryNTicks: 100,
  renderEveryNTicks: 10,
  seed: 42,
};

const PRIMORDIAL_SOUP: SimulationConfig = {
  worldWidth: 100,
  worldHeight: 100,
  initialPopulation: 100,
  maxPopulation: 500,
  initialFood: 300,
  foodSpawnRate: 0.15,
  foodEnergy: 20.0,
  fertileZones: [[0.5, 0.5, 0.4]],
  carryingCapacityPressure: 0.0005,
  speciationThreshold: 0.25,
  ticks: 50_000,
  recordEveryNTicks: 50,
  renderEveryNTicks: 10,
  seed: 42,
};

const PANGEA: SimulationConfig = {
  worldWidth: 300,
  worldHeight: 300,
  initialPopulation: 200,
  maxPopulation: 1500,
  initialFood: 800,
  foodSpawnRate: 0.08,
  foodEnergy: 15.0,
  fertileZones: [
    [0.3, 0.3, 0.2],
    [0.7, 0.7, 0.2],
  ],
  carryingCapacityPressure: 0.002,
  speciationThreshold: 0.35,
  ticks: 100_000,
  recordEveryNTicks: 100,
  renderEveryNTicks: 10,
  seed: 42,
};

const PRESSURE_COOKER: SimulationConfig = {
  worldWidth: 150,
  worldHeight: 150,
  initialPopulation: 150,
  maxPopulation: 400,
  initialFood: 200,
  foodSpawnRate: 0.05,
  foodEnergy: 10.0,
  fertileZones: [[0.5, 0.5, 0.15]],
  carryingCapacityPressure: 0.005,
  speciationThreshold: 0.3,
  ticks: 75_000,
  recordEveryNTicks: 75,
  renderEveryNTicks: 10,
  seed: 42,
};

const PRESETS: Record<string, SimulationConfig> = {
  primordial_soup: PRIMORDIAL_SOUP,
  pangea: PANGEA,
  pressure_cooker: PRESSURE_COOKER,
};

function getPreset(name: string): SimulationConfig {
  const preset = PRESETS[name];
  if (!preset) {
    const available = Object.keys(PRESETS).join(", ");
    throw new Error(`Unknown preset '${name}'. Available: ${available}`);
  }
  return preset;
}

export { DEFAULT_CONFIG, PRIMORDIAL_SOUP, PANGEA, PRESSURE_COOKER, PRESETS, getPreset };
