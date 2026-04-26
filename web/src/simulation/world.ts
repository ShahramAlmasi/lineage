/**
 * World model: Position, Food, Organism, SpatialHash, and World classes.
 * Ported from Python src/lineage/world.py — must match behaviour exactly.
 */

import { PRNG } from "../utils/prng";
import {
  distanceTo,
  directionTo,
  move as moveUtil,
} from "../utils/math";
import type {
  Genome,
  BehaviorNode,
  BehaviorAction,
  SimulationConfig,
  WorldStatistics,
} from "./types";

export class Position {
  constructor(public x: number, public y: number) {}

  distanceTo(other: Position, worldWidth: number, worldHeight: number): number {
    return distanceTo(this, other, worldWidth, worldHeight);
  }

  directionTo(
    other: Position,
    worldWidth: number,
    worldHeight: number,
  ): { dx: number; dy: number } {
    return directionTo(this, other, worldWidth, worldHeight);
  }

  move(dx: number, dy: number, worldWidth: number, worldHeight: number): void {
    moveUtil(this, dx, dy, worldWidth, worldHeight);
  }
}

export class Food {
  constructor(
    public position: Position,
    public energy: number = 10.0,
    public age: number = 0,
  ) {}
}

export class Organism {
  readonly id: number;
  genome: Genome;
  position: Position;
  energy: number;
  age: number;
  alive: boolean;
  generation: number;
  ticksSinceReproduction: number;

  private readonly _energyCostPerTick: number;
  private readonly _effectiveSpeed: number;

  constructor(opts: {
    id: number;
    genome: Genome;
    position: Position;
    energy?: number;
    age?: number;
    alive?: boolean;
    generation?: number;
    ticksSinceReproduction?: number;
  }) {
    this.id = opts.id;
    this.genome = opts.genome;
    this.position = opts.position;
    this.energy = opts.energy ?? 50.0;
    this.age = opts.age ?? 0;
    this.alive = opts.alive ?? true;
    this.generation = opts.generation ?? 0;
    this.ticksSinceReproduction = opts.ticksSinceReproduction ?? 0;

    // Derived fields — Python's __post_init__ / _update_derived
    this._energyCostPerTick =
      this.genome.baseMetabolism * (1.0 + this.genome.size * 0.3);
    this._effectiveSpeed =
      this.genome.movementSpeed / Math.max(this.genome.size * 0.5, 0.5);
  }

  metabolismCost(): number {
    return this._energyCostPerTick;
  }

  speed(): number {
    return this._effectiveSpeed;
  }

  canReproduce(): boolean {
    return (
      this.energy >= this.genome.reproductionThreshold &&
      this.ticksSinceReproduction > 50
    );
  }

  reproduceCost(): number {
    return this.genome.reproductionCost;
  }

  photosynthesisGain(): number {
    return this.genome.photosynthesisRate;
  }

  markDead(): void {
    this.alive = false;
  }

  tick(): void {
    this.age++;
    this.ticksSinceReproduction++;
  }

  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      genome: serializeGenome(this.genome),
      position: { x: this.position.x, y: this.position.y },
      energy: this.energy,
      age: this.age,
      alive: this.alive,
      generation: this.generation,
    };
  }

  static fromDict(d: Record<string, unknown>): Organism {
    const pos = d["position"] as { x: number; y: number };
    return new Organism({
      id: d["id"] as number,
      genome: deserializeGenome(d["genome"] as Record<string, unknown>),
      position: new Position(pos.x, pos.y),
      energy: d["energy"] as number,
      age: d["age"] as number,
      alive: d["alive"] as boolean,
      generation: d["generation"] as number,
    });
  }
}

function serializeGenome(g: Genome): Record<string, unknown> {
  return {
    size: g.size,
    shape: g.shape,
    color_hue: g.colorHue,
    color_sat: g.colorSat,
    color_val: g.colorVal,
    base_metabolism: g.baseMetabolism,
    photosynthesis_rate: g.photosynthesisRate,
    movement_speed: g.movementSpeed,
    food_detection_radius: g.foodDetectionRadius,
    predator_detection_radius: g.predatorDetectionRadius,
    mate_detection_radius: g.mateDetectionRadius,
    reproduction_threshold: g.reproductionThreshold,
    reproduction_cost: g.reproductionCost,
    sexual_reproduction: g.sexualReproduction,
    crossover_preference: g.crossoverPreference,
    mutation_rate: g.mutationRate,
    mutation_magnitude: g.mutationMagnitude,
    behavior_tree: g.behaviorTree.map(serializeNode),
    species_id: g.speciesId,
    generation: g.generation,
    parent_ids: [...g.parentIds],
  };
}

function serializeNode(n: BehaviorNode): Record<string, unknown> {
  return {
    condition: n.condition,
    threshold: n.threshold,
    if_true: n.ifTrue,
    if_false: n.ifFalse,
    is_leaf: n.isLeaf,
  };
}

function deserializeGenome(d: Record<string, unknown>): Genome {
  return {
    size: d["size"] as number,
    shape: d["shape"] as Genome["shape"],
    colorHue: d["color_hue"] as number,
    colorSat: d["color_sat"] as number,
    colorVal: d["color_val"] as number,
    baseMetabolism: d["base_metabolism"] as number,
    photosynthesisRate: d["photosynthesis_rate"] as number,
    movementSpeed: d["movement_speed"] as number,
    foodDetectionRadius: d["food_detection_radius"] as number,
    predatorDetectionRadius: d["predator_detection_radius"] as number,
    mateDetectionRadius: d["mate_detection_radius"] as number,
    reproductionThreshold: d["reproduction_threshold"] as number,
    reproductionCost: d["reproduction_cost"] as number,
    sexualReproduction: d["sexual_reproduction"] as boolean,
    crossoverPreference: d["crossover_preference"] as number,
    mutationRate: d["mutation_rate"] as number,
    mutationMagnitude: d["mutation_magnitude"] as number,
    behaviorTree: (d["behavior_tree"] as Record<string, unknown>[]).map(
      deserializeNode,
    ),
    speciesId: d["species_id"] as number,
    generation: d["generation"] as number,
    parentIds: [...(d["parent_ids"] as number[])],
  };
}

function deserializeNode(d: Record<string, unknown>): BehaviorNode {
  const ifFalseRaw = d["if_false"];
  const ifFalse: BehaviorAction | number =
    typeof ifFalseRaw === "number" ? ifFalseRaw : (ifFalseRaw as BehaviorAction);

  return {
    condition: d["condition"] as BehaviorNode["condition"],
    threshold: d["threshold"] as number,
    ifTrue: d["if_true"] as BehaviorAction,
    ifFalse,
    isLeaf: d["is_leaf"] as boolean,
  };
}

const SHAPES = ["CIRCLE", "TRIANGLE", "SQUARE", "DIAMOND"] as const;

const BEHAVIOR_CONDITIONS = [
  "FOOD_NEARBY",
  "PREDATOR_NEARBY",
  "MATE_NEARBY",
  "ENERGY_ABOVE",
  "ALWAYS",
] as const;

const BEHAVIOR_ACTIONS = [
  "MOVE_TOWARD_FOOD",
  "MOVE_TOWARD_MATE",
  "FLEE",
  "WANDER",
  "REPRODUCE",
  "REST",
  "MOVE_TOWARD_CENTER",
  "ATTACK",
] as const;

function randomBehaviorTree(rng: PRNG): BehaviorNode[] {
  const nNodes = rng.randint(2, 5);
  const tree: BehaviorNode[] = [];

  for (let i = 0; i < nNodes; i++) {
    const isLast = i === nNodes - 1;
    const isLeaf = isLast || rng.random() > 0.5;
    const condition = rng.choice(BEHAVIOR_CONDITIONS);
    const threshold = rng.gauss(50, 20);
    const ifTrue = rng.choice(BEHAVIOR_ACTIONS);
    const ifFalse: BehaviorAction | number = isLeaf
      ? (rng.choice(BEHAVIOR_ACTIONS) as BehaviorAction)
      : rng.randint(i + 1, nNodes);

    tree.push({
      condition: condition as BehaviorNode["condition"],
      threshold,
      ifTrue: ifTrue as BehaviorAction,
      ifFalse,
      isLeaf,
    });
  }

  // Fix references — Python's _fix_tree_references
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]!;
    if (
      !node.isLeaf &&
      typeof node.ifFalse === "number" &&
      node.ifFalse >= tree.length
    ) {
      tree[i] = {
        condition: node.condition,
        threshold: node.threshold,
        ifTrue: node.ifTrue,
        ifFalse: "WANDER" as BehaviorAction,
        isLeaf: true,
      };
    }
  }

  return tree;
}

export function createRandomGenome(rng: PRNG): Genome {
  return {
    size: rng.uniform(0.5, 2.0),
    shape: rng.choice(SHAPES) as Genome["shape"],
    colorHue: rng.uniform(0, 360),
    colorSat: rng.uniform(0.3, 1.0),
    colorVal: rng.uniform(0.3, 1.0),
    baseMetabolism: rng.uniform(0.05, 0.3),
    photosynthesisRate: rng.uniform(0.0, 0.5),
    movementSpeed: rng.uniform(0.5, 2.0),
    foodDetectionRadius: rng.uniform(2.0, 10.0),
    predatorDetectionRadius: rng.uniform(2.0, 10.0),
    mateDetectionRadius: rng.uniform(2.0, 10.0),
    reproductionThreshold: rng.uniform(30.0, 80.0),
    reproductionCost: rng.uniform(15.0, 40.0),
    sexualReproduction: rng.random() > 0.3,
    crossoverPreference: rng.uniform(0.3, 0.7),
    mutationRate: rng.uniform(0.01, 0.15),
    mutationMagnitude: rng.uniform(0.05, 0.3),
    behaviorTree: randomBehaviorTree(rng),
    speciesId: 0,
    generation: 0,
    parentIds: [],
  };
}

class SpatialHash {
  private cellSize: number;
  private cells: Map<string, unknown[]>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  add(obj: unknown, x: number, y: number): void {
    const k = this.key(x, y);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = [];
      this.cells.set(k, cell);
    }
    cell.push(obj);
  }

  clear(): void {
    this.cells.clear();
  }

  query(x: number, y: number, radius: number): unknown[] {
    const results: unknown[] = [];
    const rCells = Math.floor(radius / this.cellSize) + 1;
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);

    for (let dx = -rCells; dx <= rCells; dx++) {
      for (let dy = -rCells; dy <= rCells; dy++) {
        const k = `${cx + dx},${cy + dy}`;
        const cell = this.cells.get(k);
        if (cell) {
          for (const obj of cell) {
            results.push(obj);
          }
        }
      }
    }
    return results;
  }
}

export class World {
  config: SimulationConfig;
  organisms: Organism[];
  food: Food[];
  nextOrganismId: number;
  tickCount: number;
  totalBirths: number;
  totalDeaths: number;
  rng: PRNG;

  private organismHash: SpatialHash;
  private foodHash: SpatialHash;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.organisms = [];
    this.food = [];
    this.nextOrganismId = 1;
    this.tickCount = 0;
    this.totalBirths = 0;
    this.totalDeaths = 0;
    this.rng = new PRNG(config.seed);
    this.organismHash = new SpatialHash(10.0);
    this.foodHash = new SpatialHash(10.0);
  }

  private w(): number {
    return this.config.worldWidth;
  }

  private h(): number {
    return this.config.worldHeight;
  }

  spawnFood(count?: number): void {
    if (count === undefined) {
      const currentPop = this.organisms.length;
      const carryingCapacity = this.config.maxPopulation;
      const pressure = currentPop / carryingCapacity;
      let targetFood = Math.floor(
        this.config.initialFood *
          (1.0 - pressure * this.config.carryingCapacityPressure * 10),
      );
      targetFood = Math.max(50, targetFood);
      count = Math.max(0, targetFood - this.food.length);
    }

    const width = this.config.worldWidth;
    const height = this.config.worldHeight;

    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;

      if (this.config.fertileZones.length > 0 && this.rng.random() < 0.7) {
        const zone = this.rng.choice(this.config.fertileZones);
        const zx = zone[0];
        const zy = zone[1];
        const zr = zone[2];
        x = this.rng.gauss(zx * width, zr * width);
        y = this.rng.gauss(zy * height, zr * height);
      } else {
        x = this.rng.uniform(0, width);
        y = this.rng.uniform(0, height);
      }

      // Wrap coordinates (handles negative gauss values)
      x = ((x % width) + width) % width;
      y = ((y % height) + height) % height;

      this.food.push(
        new Food(
          new Position(x, y),
          this.config.foodEnergy * this.rng.uniform(0.5, 1.5),
        ),
      );
    }
  }

  spawnOrganism(genome?: Genome, position?: Position): Organism {
    if (genome === undefined) {
      genome = createRandomGenome(this.rng);
    }

    if (position === undefined) {
      position = new Position(
        this.rng.uniform(0, this.config.worldWidth),
        this.rng.uniform(0, this.config.worldHeight),
      );
    }

    const org = new Organism({
      id: this.nextOrganismId,
      genome,
      position,
      energy: this.rng.uniform(30.0, 70.0),
      generation: genome.generation,
    });
    this.nextOrganismId++;
    this.organisms.push(org);
    this.totalBirths++;
    return org;
  }

  initialize(): void {
    this.spawnFood(this.config.initialFood);
    for (let i = 0; i < this.config.initialPopulation; i++) {
      this.spawnOrganism();
    }
  }

  rebuildSpatialHash(): void {
    this.organismHash.clear();
    this.foodHash.clear();
    for (const o of this.organisms) {
      if (o.alive) {
        this.organismHash.add(o, o.position.x, o.position.y);
      }
    }
    for (const f of this.food) {
      this.foodHash.add(f, f.position.x, f.position.y);
    }
  }

  nearbyFood(position: Position, radius: number): Food[] {
    const candidates = this.foodHash.query(position.x, position.y, radius);
    const w = this.w();
    const h = this.h();
    const result: Food[] = [];
    for (const c of candidates) {
      if (
        c instanceof Food &&
        position.distanceTo(c.position, w, h) <= radius
      ) {
        result.push(c);
      }
    }
    return result;
  }

  nearbyOrganisms(
    position: Position,
    radius: number,
    excludeId?: number,
  ): Organism[] {
    const candidates = this.organismHash.query(
      position.x,
      position.y,
      radius,
    );
    const w = this.w();
    const h = this.h();
    const result: Organism[] = [];
    for (const c of candidates) {
      const org = c as Organism;
      if (
        org instanceof Organism &&
        org.alive &&
        org.id !== excludeId &&
        position.distanceTo(org.position, w, h) <= radius
      ) {
        result.push(org);
      }
    }
    return result;
  }

  removeDead(): void {
    let deadCount = 0;
    for (const o of this.organisms) {
      if (!o.alive) deadCount++;
    }
    this.totalDeaths += deadCount;
    this.organisms = this.organisms.filter((o) => o.alive);
    this.food = this.food.filter((f) => f.age < 5000);
  }

  statistics(): WorldStatistics {
    const alive = this.organisms.filter((o) => o.alive);

    if (alive.length === 0) {
      return {
        population: 0,
        foodCount: this.food.length,
        averageEnergy: 0.0,
        averageAge: 0,
        maxAge: 0,
        totalBirths: this.totalBirths,
        totalDeaths: this.totalDeaths,
        tick: this.tickCount,
        worldWidth: this.config.worldWidth,
        worldHeight: this.config.worldHeight,
      };
    }

    let totalEnergy = 0;
    let totalAge = 0;
    let maxAge = 0;
    for (const o of alive) {
      totalEnergy += o.energy;
      totalAge += o.age;
      if (o.age > maxAge) maxAge = o.age;
    }

    return {
      population: alive.length,
      foodCount: this.food.length,
      averageEnergy: totalEnergy / alive.length,
      averageAge: Math.floor(totalAge / alive.length), // INTEGER DIVISION — matches Python //
      maxAge,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      tick: this.tickCount,
      worldWidth: this.config.worldWidth,
      worldHeight: this.config.worldHeight,
    };
  }

  toDict(): Record<string, unknown> {
    return {
      config: {
        width: this.config.worldWidth,
        height: this.config.worldHeight,
        seed: this.config.seed,
      },
      tick_count: this.tickCount,
      total_births: this.totalBirths,
      total_deaths: this.totalDeaths,
      organisms: this.organisms.filter((o) => o.alive).map((o) => o.toDict()),
      food: this.food.map((f) => ({
        x: f.position.x,
        y: f.position.y,
        energy: f.energy,
      })),
    };
  }

  static fromDict(d: Record<string, unknown>): World {
    const cfg = d["config"] as { width: number; height: number; seed: number | null };
    const config: SimulationConfig = {
      worldWidth: cfg.width,
      worldHeight: cfg.height,
      seed: cfg.seed,
      // Defaults for fields not stored in serialisation
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
    };

    const world = new World(config);
    world.tickCount = d["tick_count"] as number;
    world.totalBirths = d["total_births"] as number;
    world.totalDeaths = d["total_deaths"] as number;

    const organisms = d["organisms"] as Record<string, unknown>[];
    for (const od of organisms) {
      world.organisms.push(Organism.fromDict(od));
    }

    const foods = d["food"] as { x: number; y: number; energy: number }[];
    for (const fd of foods) {
      world.food.push(new Food(new Position(fd.x, fd.y), fd.energy));
    }

    return world;
  }
}
