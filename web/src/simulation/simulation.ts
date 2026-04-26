/**
 * Simulation engine: tick loop, perception, actions, energy economy.
 * Port of Python src/lineage/simulation.py — matches behavior exactly.
 *
 * Tick processing order (CRITICAL — must not change):
 * 1. Increment tick count
 * 2. Rebuild spatial hash
 * 3. Spawn food (random chance based on food_spawn_rate)
 * 4. Process each organism (metabolism, photosynthesis, perception, decision, action)
 * 5. Remove dead organisms
 * 6. Update species (speciation / extinction events)
 * 7. Age food
 * 8. Apply carrying capacity pressure
 * 9. Return statistics
 */

import { World, Position } from "./world";
import { PRNG } from "../utils/prng";
import { crossover, mutate, canInterbreed } from "./genome";
import {
  decideAction,
  act,
  type Perception,
  type WorldContext,
} from "./behavior";
import type {
  SimulationConfig,
  WorldStatistics,
  SimulationEvent,
  Organism as OrganismType,
  Food as FoodType,
} from "./types";
import { SpeciesTracker } from "./speciation";

const ENERGY_CAP = 200.0;

type WorldOrganism = ReturnType<World["spawnOrganism"]>;

export class Simulation {
  config: SimulationConfig;
  world: World;
  speciesTracker: SpeciesTracker;
  events: SimulationEvent[];
  rng: PRNG;
  private _tick: number;

  constructor(config: SimulationConfig) {
    this.config = config;
    this.world = new World(config);
    this.speciesTracker = new SpeciesTracker(config.speciationThreshold);
    this.events = [];
    this.rng = new PRNG(config.seed);
    this._tick = 0;
  }

  initialize(): void {
    this.world.initialize();
    for (const org of this.world.organisms) {
      this.speciesTracker.assignSpecies(org, 0);
    }
  }

  runTick(): WorldStatistics {
    this._tick += 1;
    this.world.tickCount = this._tick;

    this.world.rebuildSpatialHash();

    if (this.rng.random() < this.config.foodSpawnRate) {
      this.world.spawnFood();
    }

    const snapshot = [...this.world.organisms];
    for (const org of snapshot) {
      if (!org.alive) continue;
      this.processOrganism(org);
    }

    this.world.removeDead();

    const speciationMessages = this.speciesTracker.updateSpecies(
      this.world.organisms,
      this._tick,
    );
    for (const msg of speciationMessages) {
      const eventType = msg.toLowerCase().includes("extinct")
        ? "extinction"
        : "speciation";
      this.events.push({ tick: this._tick, message: msg, eventType });
    }

    for (const f of this.world.food) {
      f.age += 1;
    }

    this.applyCarryingCapacity();

    return this.world.statistics();
  }

  private processOrganism(org: WorldOrganism): void {
    org.tick();
    org.energy -= org.metabolismCost();
    org.energy += org.photosynthesisGain();

    if (org.energy <= 0) {
      org.markDead();
      return;
    }

    const perception = this.perceive(org);
    const action = decideAction(org as unknown as OrganismType, perception);

    const worldContext: WorldContext = {
      width: this.config.worldWidth,
      height: this.config.worldHeight,
      food: this.world.food as unknown as FoodType[],
      organisms: this.world.organisms as unknown as OrganismType[],
      speciationThreshold: this.config.speciationThreshold,
    };

    act(
      org as unknown as OrganismType,
      action,
      perception,
      worldContext,
      this.rng,
      (parentA, parentB) => {
        const a = parentA as unknown as WorldOrganism;
        if (parentB !== undefined) {
          this.attemptReproduction(a, parentB as unknown as WorldOrganism);
        } else {
          this.asexualReproduction(a);
        }
      },
    );

    org.energy = Math.min(org.energy, ENERGY_CAP);
  }

  private perceive(org: WorldOrganism): Perception {
    const pos = org.position;
    const width = this.config.worldWidth;
    const height = this.config.worldHeight;

    const nearbyFoodResult = this.world.nearbyFood(
      pos,
      org.genome.foodDetectionRadius,
    );
    const detectionRadius = Math.max(
      org.genome.predatorDetectionRadius,
      org.genome.mateDetectionRadius,
    );
    const nearbyOrganismsResult = this.world.nearbyOrganisms(
      pos,
      detectionRadius,
      org.id,
    );

    const predators = nearbyOrganismsResult.filter(
      (o) => o.genome.size > org.genome.size * 1.2,
    );
    const preyList = nearbyOrganismsResult.filter(
      (o) => o.genome.size < org.genome.size * 0.8 && o.id !== org.id,
    );
    const mates = nearbyOrganismsResult.filter((o) =>
      canInterbreed(o.genome, org.genome, this.config.speciationThreshold),
    );

    let closestFood: (typeof nearbyFoodResult)[number] | null = null;
    let closestFoodDist = Infinity;
    for (const f of nearbyFoodResult) {
      const d = pos.distanceTo(f.position, width, height);
      if (d < closestFoodDist) {
        closestFoodDist = d;
        closestFood = f;
      }
    }

    let closestPredator: (typeof nearbyOrganismsResult)[number] | null = null;
    let closestPredatorDist = Infinity;
    for (const p of predators) {
      const d = pos.distanceTo(p.position, width, height);
      if (d < closestPredatorDist) {
        closestPredatorDist = d;
        closestPredator = p;
      }
    }

    let closestPrey: (typeof nearbyOrganismsResult)[number] | null = null;
    let closestPreyDist = Infinity;
    for (const pr of preyList) {
      const d = pos.distanceTo(pr.position, width, height);
      if (d < closestPreyDist) {
        closestPreyDist = d;
        closestPrey = pr;
      }
    }

    let closestMate: (typeof nearbyOrganismsResult)[number] | null = null;
    let closestMateDist = Infinity;
    for (const m of mates) {
      const d = pos.distanceTo(m.position, width, height);
      if (d < closestMateDist) {
        closestMateDist = d;
        closestMate = m;
      }
    }

    return {
      foodNearby: closestFood !== null,
      food: closestFood as unknown as FoodType | null,
      foodDistance: closestFoodDist,
      predatorNearby: closestPredator !== null,
      predator: closestPredator as unknown as OrganismType | null,
      predatorDistance: closestPredatorDist,
      preyNearby: closestPrey !== null,
      prey: closestPrey as unknown as OrganismType | null,
      preyDistance: closestPreyDist,
      mateNearby: closestMate !== null,
      mate: closestMate as unknown as OrganismType | null,
      mateDistance: closestMateDist,
      energy: org.energy,
      position: { x: pos.x, y: pos.y },
    };
  }

  private attemptReproduction(
    parentA: WorldOrganism,
    parentB: WorldOrganism,
  ): void {
    if (!parentA.canReproduce() || !parentB.canReproduce()) return;
    if (
      !canInterbreed(
        parentA.genome,
        parentB.genome,
        this.config.speciationThreshold,
      )
    ) {
      return;
    }

    const childGenome = mutate(
      crossover(parentA.genome, parentB.genome, this.rng),
      this.rng,
    );

    parentA.energy -= parentA.reproduceCost();
    parentB.energy -= parentB.reproduceCost();
    parentA.ticksSinceReproduction = 0;
    parentB.ticksSinceReproduction = 0;

    const child = this.world.spawnOrganism(
      childGenome,
      new Position(parentA.position.x, parentA.position.y),
    );

    const [newSid, isNew] = this.speciesTracker.assignSpecies(
      child,
      this._tick,
    );
    if (isNew) {
      this.events.push({
        tick: this._tick,
        message: `New species ${newSid} born from parents ${parentA.genome.speciesId} and ${parentB.genome.speciesId}`,
        eventType: "speciation",
      });
    }
  }

  private asexualReproduction(parent: WorldOrganism): void {
    const childGenome = mutate(parent.genome, this.rng);

    parent.energy -= parent.reproduceCost();
    parent.ticksSinceReproduction = 0;

    const child = this.world.spawnOrganism(
      childGenome,
      new Position(parent.position.x, parent.position.y),
    );

    const [newSid, isNew] = this.speciesTracker.assignSpecies(
      child,
      this._tick,
    );
    if (isNew) {
      this.events.push({
        tick: this._tick,
        message: `New species ${newSid} diverged from species ${parent.genome.speciesId} (asexual)`,
        eventType: "speciation",
      });
    }
  }

  private applyCarryingCapacity(): void {
    const aliveCount = this.world.organisms.filter((o) => o.alive).length;
    const maxPop = this.config.maxPopulation;
    const ratio = aliveCount / maxPop;

    if (ratio > 0.7) {
      const pressure = (ratio - 0.7) / 0.3;
      for (const org of this.world.organisms) {
        if (!org.alive) continue;
        org.energy -= org.metabolismCost() * pressure * 2.0;
        if (this.rng.random() < pressure * 0.3) {
          org.energy -= 2.0;
        }
        if (org.energy <= 0) {
          org.markDead();
        }
      }
    }
  }

  run(maxTicks?: number): void {
    const limit = maxTicks ?? this.config.ticks;
    for (let i = 0; i < limit; i++) {
      if (this._tick >= limit) break;
      this.runTick();
    }
  }

  getEvents(): SimulationEvent[] {
    return this.events;
  }

  getState(): { tick: number; organisms: Array<{ id: number; x: number; y: number; energy: number; size: number; hue: number; shape: string; speciesId: number; alive: boolean }>; food: Array<{ x: number; y: number; energy: number }>; speciesCount: number } {
    return {
      tick: this._tick,
      organisms: this.world.organisms.map((o) => ({
        id: o.id,
        x: o.position.x,
        y: o.position.y,
        energy: o.energy,
        size: o.genome.size,
        hue: o.genome.colorHue,
        shape: o.genome.shape,
        speciesId: o.genome.speciesId,
        alive: o.alive,
      })),
      food: this.world.food.map((f) => ({
        x: f.position.x,
        y: f.position.y,
        energy: f.energy,
      })),
      speciesCount: this.speciesTracker.getSpeciesCount(),
    };
  }

  toDict(): Record<string, unknown> {
    return {
      tick: this._tick,
      world: this.world.toDict(),
      species: this.speciesTracker.toDict(),
      events: this.events.slice(-100).map((e) => ({
        tick: e.tick,
        message: e.message,
        type: e.eventType,
      })),
    };
  }
}
