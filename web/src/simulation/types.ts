export interface Position {
  x: number;
  y: number;
}

export const enum Shape {
  CIRCLE = "CIRCLE",
  TRIANGLE = "TRIANGLE",
  SQUARE = "SQUARE",
  DIAMOND = "DIAMOND",
}

export const enum BehaviorNodeType {
  FOOD_NEARBY = "FOOD_NEARBY",
  PREDATOR_NEARBY = "PREDATOR_NEARBY",
  MATE_NEARBY = "MATE_NEARBY",
  ENERGY_ABOVE = "ENERGY_ABOVE",
  ALWAYS = "ALWAYS",
}

export const enum BehaviorAction {
  MOVE_TOWARD_FOOD = "MOVE_TOWARD_FOOD",
  MOVE_TOWARD_MATE = "MOVE_TOWARD_MATE",
  FLEE = "FLEE",
  WANDER = "WANDER",
  REPRODUCE = "REPRODUCE",
  REST = "REST",
  MOVE_TOWARD_CENTER = "MOVE_TOWARD_CENTER",
  ATTACK = "ATTACK",
}

export interface BehaviorNode {
  condition: BehaviorNodeType;
  threshold: number;
  ifTrue: BehaviorAction;
  ifFalse: BehaviorAction | number;
  isLeaf: boolean;
}

export interface Genome {
  size: number;
  shape: Shape;
  colorHue: number;
  colorSat: number;
  colorVal: number;
  baseMetabolism: number;
  photosynthesisRate: number;
  movementSpeed: number;
  foodDetectionRadius: number;
  predatorDetectionRadius: number;
  mateDetectionRadius: number;
  reproductionThreshold: number;
  reproductionCost: number;
  sexualReproduction: boolean;
  crossoverPreference: number;
  mutationRate: number;
  mutationMagnitude: number;
  behaviorTree: readonly BehaviorNode[];
  speciesId: number;
  generation: number;
  parentIds: readonly number[];
}

export interface Food {
  position: Position;
  energy: number;
  age: number;
}

export interface Organism {
  id: number;
  genome: Genome;
  position: Position;
  energy: number;
  age: number;
  alive: boolean;
  generation: number;
  ticksSinceReproduction: number;
}

export interface Species {
  id: number;
  representativeGenome: Genome;
  memberIds: Set<number>;
  createdAtTick: number;
  extinctAtTick: number | null;
  parentSpeciesId: number | null;
  generationSpawned: number;
}

export interface SpeciationEvent {
  tick: number;
  newSpeciesId: number;
  parentSpeciesId: number | null;
  reason: string;
}

export interface ExtinctionEvent {
  tick: number;
  speciesId: number;
  finalPopulation: number;
  lifespanTicks: number;
}

export interface SimulationEvent {
  tick: number;
  message: string;
  eventType: string;
}

export type FertileZone = readonly [number, number, number];

export interface SimulationConfig {
  worldWidth: number;
  worldHeight: number;
  initialPopulation: number;
  maxPopulation: number;
  initialFood: number;
  foodSpawnRate: number;
  foodEnergy: number;
  fertileZones: readonly FertileZone[];
  carryingCapacityPressure: number;
  speciationThreshold: number;
  ticks: number;
  recordEveryNTicks: number;
  renderEveryNTicks: number;
  seed: number | null;
}

export interface WorldStatistics {
  population: number;
  foodCount: number;
  averageEnergy: number;
  averageAge: number;
  maxAge: number;
  totalBirths: number;
  totalDeaths: number;
  tick: number;
  worldWidth: number;
  worldHeight: number;
}

export interface RecordingFrame {
  tick: number;
  data: Record<string, unknown>;
}

export interface RecordingHeader {
  totalTicks: number;
  framesRecorded: number;
  initialPopulation: number;
  finalPopulation: number;
  maxPopulation: number;
  minPopulation: number;
  maxSpecies: number;
  speciationEvents: number;
  extinctionEvents: number;
}
