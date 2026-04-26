import { describe, it, expect } from "vitest";
import { Position, Food, Organism, World, createRandomGenome } from "./world";
import type { Genome, BehaviorNode, BehaviorAction } from "./types";
import { PRNG } from "../utils/prng";

function testGenome(overrides?: Partial<Genome>): Genome {
  return {
    size: 1.0,
    shape: "CIRCLE" as unknown as Genome["shape"],
    colorHue: 180,
    colorSat: 0.8,
    colorVal: 0.8,
    baseMetabolism: 0.1,
    photosynthesisRate: 0.0,
    movementSpeed: 1.0,
    foodDetectionRadius: 5.0,
    predatorDetectionRadius: 5.0,
    mateDetectionRadius: 5.0,
    reproductionThreshold: 50.0,
    reproductionCost: 30.0,
    sexualReproduction: true,
    crossoverPreference: 0.5,
    mutationRate: 0.05,
    mutationMagnitude: 0.1,
    behaviorTree: [
      {
        condition: "FOOD_NEARBY" as unknown as BehaviorNode["condition"],
        threshold: 0,
        ifTrue: "MOVE_TOWARD_FOOD" as unknown as BehaviorAction,
        ifFalse: "WANDER" as unknown as BehaviorAction,
        isLeaf: true,
      },
    ],
    speciesId: 0,
    generation: 0,
    parentIds: [],
    ...overrides,
  };
}

function testConfig(overrides?: Record<string, unknown>) {
  return {
    worldWidth: 200,
    worldHeight: 200,
    initialPopulation: 10,
    maxPopulation: 100,
    initialFood: 50,
    foodSpawnRate: 0.1,
    foodEnergy: 15.0,
    fertileZones: [[0.5, 0.5, 0.3]] as const,
    carryingCapacityPressure: 0.001,
    speciationThreshold: 0.3,
    ticks: 1000,
    recordEveryNTicks: 100,
    renderEveryNTicks: 10,
    seed: 42,
    ...overrides,
  };
}

describe("Position", () => {
  const W = 200;
  const H = 200;

  it("distance 0 to itself", () => {
    const p = new Position(10, 20);
    expect(p.distanceTo(p, W, H)).toBe(0);
  });

  it("direct (non-wrapping) distance", () => {
    const a = new Position(10, 10);
    const b = new Position(13, 14);
    expect(a.distanceTo(b, W, H)).toBeCloseTo(5, 10);
  });

  it("toroidal wrapping — shorter path across boundary", () => {
    const a = new Position(5, 100);
    const b = new Position(195, 100);
    // Direct dx = 190, wrapped dx = 10
    expect(a.distanceTo(b, W, H)).toBeCloseTo(10, 10);
  });

  it("toroidal wrapping — both axes", () => {
    const a = new Position(2, 3);
    const b = new Position(198, 197);
    // dx wrap = 4, dy wrap = 6
    expect(a.distanceTo(b, W, H)).toBeCloseTo(Math.hypot(4, 6), 10);
  });

  it("directionTo same position returns (0, 0)", () => {
    const p = new Position(50, 50);
    const d = p.directionTo(p, W, H);
    expect(d.dx).toBe(0);
    expect(d.dy).toBe(0);
  });

  it("directionTo normalizes to unit vector", () => {
    const a = new Position(0, 0);
    const b = new Position(3, 4);
    const d = a.directionTo(b, W, H);
    expect(d.dx).toBeCloseTo(0.6, 10);
    expect(d.dy).toBeCloseTo(0.8, 10);
  });

  it("directionTo wraps across boundary", () => {
    const a = new Position(5, 100);
    const b = new Position(195, 100);
    const d = a.directionTo(b, W, H);
    // Shortest path: dx = -10 (go left across boundary)
    expect(d.dx).toBeCloseTo(-1, 10);
    expect(d.dy).toBeCloseTo(0, 10);
  });

  it("move wraps with toroidal modulo", () => {
    const p = new Position(195, 195);
    p.move(10, 10, W, H);
    expect(p.x).toBeCloseTo(5, 10);
    expect(p.y).toBeCloseTo(5, 10);
  });

  it("move handles negative wrap", () => {
    const p = new Position(5, 5);
    p.move(-10, -10, W, H);
    expect(p.x).toBeCloseTo(195, 10);
    expect(p.y).toBeCloseTo(195, 10);
  });
});

describe("Food", () => {
  it("default values", () => {
    const f = new Food(new Position(1, 2));
    expect(f.energy).toBe(10.0);
    expect(f.age).toBe(0);
  });

  it("custom values", () => {
    const f = new Food(new Position(10, 20), 25.0, 100);
    expect(f.position.x).toBe(10);
    expect(f.energy).toBe(25.0);
    expect(f.age).toBe(100);
  });
});

describe("Organism", () => {
  it("constructor defaults", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome(),
      position: new Position(50, 50),
    });
    expect(org.energy).toBe(50.0);
    expect(org.age).toBe(0);
    expect(org.alive).toBe(true);
    expect(org.generation).toBe(0);
    expect(org.ticksSinceReproduction).toBe(0);
  });

  it("metabolismCost = baseMetabolism * (1 + size * 0.3)", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ baseMetabolism: 0.2, size: 2.0 }),
      position: new Position(0, 0),
    });
    expect(org.metabolismCost()).toBeCloseTo(0.2 * (1.0 + 2.0 * 0.3), 10);
  });

  it("speed = movementSpeed / max(size * 0.5, 0.5)", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ movementSpeed: 2.0, size: 2.0 }),
      position: new Position(0, 0),
    });
    expect(org.speed()).toBeCloseTo(2.0 / 1.0, 10);
  });

  it("speed clamped when size is tiny", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ movementSpeed: 1.0, size: 0.1 }),
      position: new Position(0, 0),
    });
    // max(0.1 * 0.5, 0.5) = 0.5
    expect(org.speed()).toBeCloseTo(1.0 / 0.5, 10);
  });

  it("canReproduce requires energy >= threshold AND ticksSinceReproduction > 50", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ reproductionThreshold: 50.0 }),
      position: new Position(0, 0),
      energy: 60.0,
      ticksSinceReproduction: 51,
    });
    expect(org.canReproduce()).toBe(true);

    org.energy = 40.0;
    expect(org.canReproduce()).toBe(false);

    org.energy = 60.0;
    org.ticksSinceReproduction = 50;
    expect(org.canReproduce()).toBe(false);
  });

  it("reproduceCost returns genome value", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ reproductionCost: 25.0 }),
      position: new Position(0, 0),
    });
    expect(org.reproduceCost()).toBe(25.0);
  });

  it("photosynthesisGain returns genome value", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome({ photosynthesisRate: 0.5 }),
      position: new Position(0, 0),
    });
    expect(org.photosynthesisGain()).toBe(0.5);
  });

  it("markDead sets alive to false", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome(),
      position: new Position(0, 0),
    });
    expect(org.alive).toBe(true);
    org.markDead();
    expect(org.alive).toBe(false);
  });

  it("tick increments age and ticksSinceReproduction", () => {
    const org = new Organism({
      id: 1,
      genome: testGenome(),
      position: new Position(0, 0),
    });
    org.tick();
    org.tick();
    expect(org.age).toBe(2);
    expect(org.ticksSinceReproduction).toBe(2);
  });

  it("toDict/fromDict roundtrip", () => {
    const org = new Organism({
      id: 42,
      genome: testGenome({ size: 1.5, colorHue: 120 }),
      position: new Position(33, 77),
      energy: 88.5,
      age: 10,
      alive: true,
      generation: 3,
    });
    const dict = org.toDict();
    const restored = Organism.fromDict(dict);

    expect(restored.id).toBe(42);
    expect(restored.genome.size).toBe(1.5);
    expect(restored.genome.colorHue).toBe(120);
    expect(restored.position.x).toBe(33);
    expect(restored.position.y).toBe(77);
    expect(restored.energy).toBe(88.5);
    expect(restored.age).toBe(10);
    expect(restored.alive).toBe(true);
    expect(restored.generation).toBe(3);
    // ticksSinceReproduction NOT serialised — resets to 0
    expect(restored.ticksSinceReproduction).toBe(0);
  });
});

describe("World", () => {
  it("initialize creates correct number of organisms and food", () => {
    const world = new World(testConfig({ initialPopulation: 20, initialFood: 100 }));
    world.initialize();

    expect(world.organisms.length).toBe(20);
    expect(world.food.length).toBe(100);
    expect(world.totalBirths).toBe(20);
  });

  it("initialize assigns sequential IDs starting from 1", () => {
    const world = new World(testConfig({ initialPopulation: 5 }));
    world.initialize();

    const ids = world.organisms.map((o) => o.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
    expect(world.nextOrganismId).toBe(6);
  });

  it("organisms have valid genomes and positions after initialize", () => {
    const world = new World(testConfig());
    world.initialize();

    for (const org of world.organisms) {
      expect(org.alive).toBe(true);
      expect(org.energy).toBeGreaterThanOrEqual(30.0);
      expect(org.energy).toBeLessThanOrEqual(70.0);
      expect(org.position.x).toBeGreaterThanOrEqual(0);
      expect(org.position.x).toBeLessThan(200);
      expect(org.position.y).toBeGreaterThanOrEqual(0);
      expect(org.position.y).toBeLessThan(200);
      expect(org.genome.size).toBeGreaterThan(0);
    }
  });

  it("deterministic with same seed", () => {
    const cfg = testConfig({ seed: 123 });
    const world1 = new World(cfg);
    world1.initialize();
    const world2 = new World(cfg);
    world2.initialize();

    expect(world1.organisms.length).toBe(world2.organisms.length);
    expect(world1.food.length).toBe(world2.food.length);

    for (let i = 0; i < world1.organisms.length; i++) {
      const a = world1.organisms[i]!;
      const b = world2.organisms[i]!;
      expect(a.position.x).toBeCloseTo(b.position.x, 10);
      expect(a.position.y).toBeCloseTo(b.position.y, 10);
      expect(a.energy).toBeCloseTo(b.energy, 10);
      expect(a.genome.size).toBeCloseTo(b.genome.size, 10);
    }
  });

  it("spawnFood with explicit count", () => {
    const world = new World(testConfig());
    world.spawnFood(10);
    expect(world.food.length).toBe(10);

    world.spawnFood(5);
    expect(world.food.length).toBe(15);
  });

  it("spawnFood with dynamic count respects carrying capacity", () => {
    const cfg = testConfig({
      initialFood: 500,
      maxPopulation: 100,
      carryingCapacityPressure: 0.001,
      initialPopulation: 0,
    });
    const world = new World(cfg);

    // No organisms — pressure = 0, targetFood = 500
    world.spawnFood();
    expect(world.food.length).toBe(500);

    // Already have 500 — should spawn 0
    world.spawnFood();
    expect(world.food.length).toBe(500);
  });

  it("spawnFood dynamic count clamps to minimum 50", () => {
    const cfg = testConfig({
      initialFood: 500,
      maxPopulation: 100,
      carryingCapacityPressure: 0.001,
      initialPopulation: 0,
    });
    const world = new World(cfg);
    // Spawn initial food
    world.spawnFood();

    // Add organisms to create high pressure
    for (let i = 0; i < 100; i++) {
      world.organisms.push(
        new Organism({
          id: i + 1,
          genome: testGenome(),
          position: new Position(0, 0),
        }),
      );
    }

    // Clear food and spawn with pressure
    world.food = [];
    world.spawnFood();
    // pressure = 100/100 = 1.0, targetFood = 500*(1 - 1*0.001*10) = 500*0.99 = 495
    // But min is 50
    expect(world.food.length).toBe(495);
  });

  it("spawnFood places food within world bounds", () => {
    const world = new World(testConfig());
    world.spawnFood(100);

    for (const f of world.food) {
      expect(f.position.x).toBeGreaterThanOrEqual(0);
      expect(f.position.x).toBeLessThan(200);
      expect(f.position.y).toBeGreaterThanOrEqual(0);
      expect(f.position.y).toBeLessThan(200);
    }
  });

  it("spawnFood energy range is foodEnergy * [0.5, 1.5]", () => {
    const world = new World(testConfig({ foodEnergy: 20.0 }));
    world.spawnFood(200);

    for (const f of world.food) {
      expect(f.energy).toBeGreaterThanOrEqual(20.0 * 0.5);
      expect(f.energy).toBeLessThanOrEqual(20.0 * 1.5);
    }
  });

  it("spawnOrganism with explicit genome and position", () => {
    const world = new World(testConfig());
    const genome = testGenome({ size: 2.5 });
    const pos = new Position(42, 84);
    const org = world.spawnOrganism(genome, pos);

    expect(org.genome.size).toBe(2.5);
    expect(org.position.x).toBe(42);
    expect(org.position.y).toBe(84);
    expect(org.id).toBe(1);
    expect(world.totalBirths).toBe(1);
  });

  it("spawnOrganism uses genome.generation for organism generation", () => {
    const world = new World(testConfig());
    const genome = testGenome({ generation: 5 });
    const org = world.spawnOrganism(genome);
    expect(org.generation).toBe(5);
  });

  it("rebuildSpatialHash + nearbyFood", () => {
    const world = new World(testConfig());
    const food1 = new Food(new Position(50, 50), 10);
    const food2 = new Food(new Position(55, 55), 10);
    const food3 = new Food(new Position(150, 150), 10);
    world.food = [food1, food2, food3];
    world.rebuildSpatialHash();

    const nearby = world.nearbyFood(new Position(52, 52), 10);
    expect(nearby.length).toBe(2);
    expect(nearby).toContain(food1);
    expect(nearby).toContain(food2);
    expect(nearby).not.toContain(food3);
  });

  it("nearbyOrganisms excludes dead and excluded ID", () => {
    const world = new World(testConfig());
    const alive1 = new Organism({
      id: 1,
      genome: testGenome(),
      position: new Position(50, 50),
    });
    const alive2 = new Organism({
      id: 2,
      genome: testGenome(),
      position: new Position(52, 52),
    });
    const dead = new Organism({
      id: 3,
      genome: testGenome(),
      position: new Position(51, 51),
      alive: false,
    });
    world.organisms = [alive1, alive2, dead];
    world.rebuildSpatialHash();

    const nearby = world.nearbyOrganisms(new Position(51, 51), 5);
    expect(nearby.length).toBe(2);
    const nearbyIds = nearby.map((o) => o.id).sort();
    expect(nearbyIds).toEqual([1, 2]);

    const nearby2 = world.nearbyOrganisms(new Position(51, 51), 5, 2);
    expect(nearby2.length).toBe(1);
    expect(nearby2[0]!.id).toBe(1);
  });

  it("removeDead counts dead and filters", () => {
    const world = new World(testConfig());
    const org1 = new Organism({
      id: 1,
      genome: testGenome(),
      position: new Position(0, 0),
    });
    const org2 = new Organism({
      id: 2,
      genome: testGenome(),
      position: new Position(0, 0),
      alive: false,
    });
    world.organisms = [org1, org2];
    world.removeDead();

    expect(world.organisms.length).toBe(1);
    expect(world.organisms[0]!.id).toBe(1);
    expect(world.totalDeaths).toBe(1);
  });

  it("removeDead filters food older than 5000 ticks", () => {
    const world = new World(testConfig());
    world.food = [
      new Food(new Position(0, 0), 10, 100),
      new Food(new Position(0, 0), 10, 4999),
      new Food(new Position(0, 0), 10, 5000),
      new Food(new Position(0, 0), 10, 5001),
    ];
    world.removeDead();

    expect(world.food.length).toBe(2);
    expect(world.food[0]!.age).toBe(100);
    expect(world.food[1]!.age).toBe(4999);
  });

  it("statistics returns correct values", () => {
    const world = new World(testConfig());
    world.tickCount = 100;
    world.totalBirths = 50;
    world.totalDeaths = 10;

    world.organisms = [
      new Organism({
        id: 1,
        genome: testGenome(),
        position: new Position(0, 0),
        energy: 60,
        age: 20,
      }),
      new Organism({
        id: 2,
        genome: testGenome(),
        position: new Position(0, 0),
        energy: 40,
        age: 30,
      }),
      new Organism({
        id: 3,
        genome: testGenome(),
        position: new Position(0, 0),
        energy: 50,
        age: 40,
        alive: false,
      }),
    ];

    world.food = [
      new Food(new Position(0, 0)),
      new Food(new Position(0, 0)),
      new Food(new Position(0, 0)),
    ];

    const stats = world.statistics();
    expect(stats.population).toBe(2);
    expect(stats.foodCount).toBe(3);
    expect(stats.averageEnergy).toBeCloseTo(50.0, 10);
    expect(stats.averageAge).toBe(25); // (20 + 30) / 2 = 25 (integer)
    expect(stats.maxAge).toBe(30);
    expect(stats.totalBirths).toBe(50);
    expect(stats.totalDeaths).toBe(10);
    expect(stats.tick).toBe(100);
  });

  it("statistics average_age uses INTEGER division", () => {
    const world = new World(testConfig());
    world.organisms = [
      new Organism({
        id: 1,
        genome: testGenome(),
        position: new Position(0, 0),
        age: 10,
      }),
      new Organism({
        id: 2,
        genome: testGenome(),
        position: new Position(0, 0),
        age: 11,
      }),
      new Organism({
        id: 3,
        genome: testGenome(),
        position: new Position(0, 0),
        age: 12,
      }),
    ];

    const stats = world.statistics();
    // (10 + 11 + 12) / 3 = 33 / 3 = 11.0 → integer division = 11
    expect(stats.averageAge).toBe(11);
  });

  it("statistics with no alive organisms", () => {
    const world = new World(testConfig());
    world.organisms = [
      new Organism({
        id: 1,
        genome: testGenome(),
        position: new Position(0, 0),
        alive: false,
      }),
    ];
    world.food = [new Food(new Position(0, 0))];

    const stats = world.statistics();
    expect(stats.population).toBe(0);
    expect(stats.averageEnergy).toBe(0);
    expect(stats.averageAge).toBe(0);
    expect(stats.maxAge).toBe(0);
  });

  it("toDict/fromDict roundtrip", () => {
    const world = new World(testConfig({ seed: 42 }));
    world.initialize();
    world.tickCount = 50;
    world.totalBirths = 30;
    world.totalDeaths = 5;

    world.organisms[0]!.markDead();
    const dict = world.toDict();
    const restored = World.fromDict(dict);

    expect(restored.config.worldWidth).toBe(200);
    expect(restored.config.worldHeight).toBe(200);
    expect(restored.config.seed).toBe(42);
    expect(restored.tickCount).toBe(50);
    expect(restored.totalBirths).toBe(30);
    expect(restored.totalDeaths).toBe(5);

    expect(restored.organisms.length).toBe(world.organisms.filter((o) => o.alive).length);
    expect(restored.food.length).toBe(world.food.length);

    const origAlive = world.organisms.filter((o) => o.alive);
    if (origAlive.length > 0) {
      expect(restored.organisms[0]!.id).toBe(origAlive[0]!.id);
      expect(restored.organisms[0]!.energy).toBeCloseTo(origAlive[0]!.energy, 10);
      expect(restored.organisms[0]!.genome.size).toBeCloseTo(origAlive[0]!.genome.size, 10);
    }
  });
});

describe("createRandomGenome", () => {
  it("produces valid genome with correct field ranges", () => {
    const rng = new PRNG(42);
    for (let i = 0; i < 20; i++) {
      const g = createRandomGenome(rng);
      expect(g.size).toBeGreaterThanOrEqual(0.5);
      expect(g.size).toBeLessThanOrEqual(2.0);
      expect(g.colorHue).toBeGreaterThanOrEqual(0);
      expect(g.colorHue).toBeLessThanOrEqual(360);
      expect(g.baseMetabolism).toBeGreaterThanOrEqual(0.05);
      expect(g.baseMetabolism).toBeLessThanOrEqual(0.3);
      expect(g.movementSpeed).toBeGreaterThanOrEqual(0.5);
      expect(g.movementSpeed).toBeLessThanOrEqual(2.0);
      expect(g.behaviorTree.length).toBeGreaterThanOrEqual(2);
      expect(g.behaviorTree.length).toBeLessThanOrEqual(5);
    }
  });

  it("is deterministic for same seed", () => {
    const g1 = createRandomGenome(new PRNG(99));
    const g2 = createRandomGenome(new PRNG(99));
    expect(g1.size).toBeCloseTo(g2.size, 10);
    expect(g1.colorHue).toBeCloseTo(g2.colorHue, 10);
    expect(g1.behaviorTree.length).toBe(g2.behaviorTree.length);
  });
});
