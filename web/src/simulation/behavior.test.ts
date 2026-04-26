import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  decideAction,
  act,
  organismSpeed,
  canReproduce,
} from "./behavior";
import type { Perception, WorldContext } from "./behavior";
import {
  BehaviorAction,
  BehaviorNodeType,
} from "./types";
import type { BehaviorNode, Food, Genome, Organism } from "./types";
import { PRNG } from "../utils/prng";

// ── Fixtures ───────────────────────────────────────────────────────────

function makeGenome(overrides: Partial<Genome> = {}): Genome {
  return {
    size: 1.0,
    shape: 0 as any, // Shape.CIRCLE
    colorHue: 0,
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
    behaviorTree: [],
    speciesId: 0,
    generation: 0,
    parentIds: [],
    ...overrides,
  };
}

function makeOrganism(overrides: Partial<Organism> = {}): Organism {
  return {
    id: 1,
    genome: makeGenome(),
    position: { x: 50, y: 50 },
    energy: 80,
    age: 0,
    alive: true,
    generation: 0,
    ticksSinceReproduction: 100,
    ...overrides,
  };
}

function makePerception(overrides: Partial<Perception> = {}): Perception {
  return {
    foodNearby: false,
    food: null,
    foodDistance: Infinity,
    predatorNearby: false,
    predator: null,
    predatorDistance: Infinity,
    preyNearby: false,
    prey: null,
    preyDistance: Infinity,
    mateNearby: false,
    mate: null,
    mateDistance: Infinity,
    energy: 80,
    position: { x: 50, y: 50 },
    ...overrides,
  };
}

function makeWorld(overrides: Partial<WorldContext> = {}): WorldContext {
  return {
    width: 200,
    height: 200,
    food: [],
    organisms: [],
    speciationThreshold: 0.3,
    ...overrides,
  };
}

const defaultTree: readonly BehaviorNode[] = [
  {
    condition: BehaviorNodeType.PREDATOR_NEARBY,
    threshold: 0,
    ifTrue: BehaviorAction.FLEE,
    ifFalse: 1,
    isLeaf: false,
  },
  {
    condition: BehaviorNodeType.ENERGY_ABOVE,
    threshold: 60,
    ifTrue: BehaviorAction.REPRODUCE,
    ifFalse: 2,
    isLeaf: false,
  },
  {
    condition: BehaviorNodeType.FOOD_NEARBY,
    threshold: 0,
    ifTrue: BehaviorAction.MOVE_TOWARD_FOOD,
    ifFalse: BehaviorAction.WANDER,
    isLeaf: true,
  },
];

// ── evaluateCondition ──────────────────────────────────────────────────

describe("evaluateCondition", () => {
  it("ALWAYS returns true", () => {
    expect(evaluateCondition(BehaviorNodeType.ALWAYS, 0, makePerception())).toBe(true);
  });

  it("FOOD_NEARBY true when food nearby and within threshold+5", () => {
    const p = makePerception({ foodNearby: true, foodDistance: 3.0 });
    expect(evaluateCondition(BehaviorNodeType.FOOD_NEARBY, 0, p)).toBe(true);
    expect(evaluateCondition(BehaviorNodeType.FOOD_NEARBY, 5, p)).toBe(true);
  });

  it("FOOD_NEARBY false when food nearby but distance > threshold+5", () => {
    const p = makePerception({ foodNearby: true, foodDistance: 10.0 });
    expect(evaluateCondition(BehaviorNodeType.FOOD_NEARBY, 0, p)).toBe(false); // 10 > 0+5
    expect(evaluateCondition(BehaviorNodeType.FOOD_NEARBY, 5, p)).toBe(true);  // 10 <= 5+5
  });

  it("FOOD_NEARBY false when no food nearby", () => {
    const p = makePerception({ foodNearby: false, foodDistance: 3.0 });
    expect(evaluateCondition(BehaviorNodeType.FOOD_NEARBY, 0, p)).toBe(false);
  });

  it("PREDATOR_NEARBY true when predator nearby and within threshold+5", () => {
    const p = makePerception({ predatorNearby: true, predatorDistance: 4.0 });
    expect(evaluateCondition(BehaviorNodeType.PREDATOR_NEARBY, 0, p)).toBe(true);
  });

  it("PREDATOR_NEARBY false when distance > threshold+5", () => {
    const p = makePerception({ predatorNearby: true, predatorDistance: 10.0 });
    expect(evaluateCondition(BehaviorNodeType.PREDATOR_NEARBY, 0, p)).toBe(false);
  });

  it("MATE_NEARBY true when mate nearby and within threshold+5", () => {
    const p = makePerception({ mateNearby: true, mateDistance: 2.0 });
    expect(evaluateCondition(BehaviorNodeType.MATE_NEARBY, 0, p)).toBe(true);
  });

  it("MATE_NEARBY false when distance > threshold+5", () => {
    const p = makePerception({ mateNearby: true, mateDistance: 10.0 });
    expect(evaluateCondition(BehaviorNodeType.MATE_NEARBY, 0, p)).toBe(false);
  });

  it("ENERGY_ABOVE true when energy > threshold", () => {
    const p = makePerception({ energy: 70 });
    expect(evaluateCondition(BehaviorNodeType.ENERGY_ABOVE, 60, p)).toBe(true);
    expect(evaluateCondition(BehaviorNodeType.ENERGY_ABOVE, 70, p)).toBe(false);
    expect(evaluateCondition(BehaviorNodeType.ENERGY_ABOVE, 80, p)).toBe(false);
  });

  it("ENERGY_ABOVE boundary: exactly equal is false (strictly greater)", () => {
    const p = makePerception({ energy: 60 });
    expect(evaluateCondition(BehaviorNodeType.ENERGY_ABOVE, 60, p)).toBe(false);
  });
});

// ── decideAction ───────────────────────────────────────────────────────

describe("decideAction", () => {
  it("returns WANDER for empty tree", () => {
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: [] }) });
    expect(decideAction(org, makePerception())).toBe(BehaviorAction.WANDER);
  });

  it("default tree: predator → FLEE", () => {
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: defaultTree }) });
    const pred = makeOrganism({ id: 99, position: { x: 52, y: 50 } });
    const p = makePerception({
      predatorNearby: true,
      predatorDistance: 2.0,
      predator: pred,
    });
    expect(decideAction(org, p)).toBe(BehaviorAction.FLEE);
  });

  it("default tree: high energy → REPRODUCE (no predator)", () => {
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: defaultTree }) });
    const p = makePerception({ energy: 80 });
    expect(decideAction(org, p)).toBe(BehaviorAction.REPRODUCE);
  });

  it("default tree: food nearby → MOVE_TOWARD_FOOD (no predator, low energy)", () => {
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: defaultTree }) });
    const food: Food = { position: { x: 51, y: 50 }, energy: 10, age: 0 };
    const p = makePerception({
      energy: 40,
      foodNearby: true,
      foodDistance: 3.0,
      food,
    });
    expect(decideAction(org, p)).toBe(BehaviorAction.MOVE_TOWARD_FOOD);
  });

  it("default tree: nothing → WANDER", () => {
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: defaultTree }) });
    const p = makePerception({ energy: 40 });
    expect(decideAction(org, p)).toBe(BehaviorAction.WANDER);
  });

  it("follows branch jumps via if_false index", () => {
    const tree: readonly BehaviorNode[] = [
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.REST,
        ifFalse: 1,
        isLeaf: false,
      },
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.WANDER,
        ifFalse: BehaviorAction.REST,
        isLeaf: true,
      },
    ];
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: tree }) });
    // ALWAYS condition true → returns ifTrue of first node = REST
    expect(decideAction(org, makePerception())).toBe(BehaviorAction.REST);
  });

  it("out-of-range index returns WANDER", () => {
    const tree: readonly BehaviorNode[] = [
      {
        condition: BehaviorNodeType.FOOD_NEARBY,
        threshold: 0,
        ifTrue: BehaviorAction.MOVE_TOWARD_FOOD,
        ifFalse: 99, // out of range
        isLeaf: false,
      },
    ];
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: tree }) });
    const p = makePerception({ foodNearby: false });
    // Condition false → ifFalse is 99 (number) → nodeIdx=99 → >=len → WANDER
    expect(decideAction(org, p)).toBe(BehaviorAction.WANDER);
  });

  it("leaf node returns ifFalse action when condition false", () => {
    const tree: readonly BehaviorNode[] = [
      {
        condition: BehaviorNodeType.ENERGY_ABOVE,
        threshold: 100,
        ifTrue: BehaviorAction.REPRODUCE,
        ifFalse: BehaviorAction.FLEE,
        isLeaf: true,
      },
    ];
    const org = makeOrganism({ genome: makeGenome({ behaviorTree: tree }) });
    const p = makePerception({ energy: 50 });
    expect(decideAction(org, p)).toBe(BehaviorAction.FLEE);
  });
});

// ── organismSpeed ──────────────────────────────────────────────────────

describe("organismSpeed", () => {
  it("computes speed = movementSpeed / max(size*0.5, 0.5)", () => {
    // size=1.0 → max(0.5, 0.5) = 0.5 → speed = 1.0/0.5 = 2.0
    const org = makeOrganism({ genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }) });
    expect(organismSpeed(org)).toBeCloseTo(2.0);

    // size=2.0 → max(1.0, 0.5) = 1.0 → speed = 1.0/1.0 = 1.0
    const org2 = makeOrganism({ genome: makeGenome({ movementSpeed: 1.0, size: 2.0 }) });
    expect(organismSpeed(org2)).toBeCloseTo(1.0);

    // size=0.1 → max(0.05, 0.5) = 0.5 → speed = 2.0/0.5 = 4.0
    const org3 = makeOrganism({ genome: makeGenome({ movementSpeed: 2.0, size: 0.1 }) });
    expect(organismSpeed(org3)).toBeCloseTo(4.0);
  });
});

// ── canReproduce ───────────────────────────────────────────────────────

describe("canReproduce", () => {
  it("returns true when energy >= threshold and ticks > 50", () => {
    const org = makeOrganism({
      energy: 50,
      ticksSinceReproduction: 51,
      genome: makeGenome({ reproductionThreshold: 50 }),
    });
    expect(canReproduce(org)).toBe(true);
  });

  it("returns false when energy < threshold", () => {
    const org = makeOrganism({
      energy: 49,
      ticksSinceReproduction: 100,
      genome: makeGenome({ reproductionThreshold: 50 }),
    });
    expect(canReproduce(org)).toBe(false);
  });

  it("returns false when ticks_since_reproduction <= 50", () => {
    const org = makeOrganism({
      energy: 80,
      ticksSinceReproduction: 50,
      genome: makeGenome({ reproductionThreshold: 50 }),
    });
    expect(canReproduce(org)).toBe(false);
  });
});

// ── act ────────────────────────────────────────────────────────────────

describe("act", () => {
  const rng = () => new PRNG(42);
  const noReproduce = () => {};

  it("REST: no movement, no energy change", () => {
    const org = makeOrganism({ energy: 80, position: { x: 50, y: 50 } });
    const world = makeWorld();
    act(org, BehaviorAction.REST, makePerception(), world, rng(), noReproduce);
    expect(org.position.x).toBe(50);
    expect(org.position.y).toBe(50);
    expect(org.energy).toBe(80);
  });

  it("WANDER: moves and costs speed*0.05 energy", () => {
    const org = makeOrganism({
      energy: 100,
      position: { x: 100, y: 100 },
      genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }),
    });
    // speed = 1.0 / max(0.5, 0.5) = 2.0
    // cost = 2.0 * 0.05 = 0.1
    const energyBefore = org.energy;
    act(org, BehaviorAction.WANDER, makePerception(), makeWorld(), rng(), noReproduce);
    expect(org.energy).toBeCloseTo(energyBefore - 0.1);
    // Position should have changed
    expect(org.position.x !== 100 || org.position.y !== 100).toBe(true);
  });

  it("MOVE_TOWARD_FOOD: moves toward food and eats when close", () => {
    const food: Food = { position: { x: 50.5, y: 50 }, energy: 15, age: 0 };
    const org = makeOrganism({
      energy: 50,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }),
    });
    const world = makeWorld({ food: [food] });
    const p = makePerception({ food, foodNearby: true, foodDistance: 0.5 });

    // speed = 2.0, move 2.0 in x direction, so org moves to x=52.5
    // Then check distance: should be far from food
    act(org, BehaviorAction.MOVE_TOWARD_FOOD, p, world, rng(), noReproduce);
    // After moving 2.0 units toward food at 50.5, org is at 52.5
    // distance = 2.0, not < 1.0, so no eat
    expect(world.food.length).toBe(1);
    expect(org.energy).toBeCloseTo(50 - 2.0 * 0.05);
  });

  it("MOVE_TOWARD_FOOD: eats food when within 1.0 distance", () => {
    const food: Food = { position: { x: 50.1, y: 50 }, energy: 15, age: 0 };
    // speed=2.0, food at dist 0.1, org moves past food by 1.9
    // After move, distance should still be checked
    const org = makeOrganism({
      energy: 50,
      position: { x: 50, y: 50 },
      // Use low speed so we don't overshoot too far
      genome: makeGenome({ movementSpeed: 0.2, size: 1.0 }),
    });
    // speed = 0.2/0.5 = 0.4
    const world = makeWorld({ food: [food] });
    const p = makePerception({ food, foodNearby: true, foodDistance: 0.1 });

    // After move: pos.x = 50 + 0.4 * 1.0 = 50.4
    // distance from 50.4 to 50.1 = 0.3 < 1.0 → eat!
    act(org, BehaviorAction.MOVE_TOWARD_FOOD, p, world, rng(), noReproduce);
    expect(world.food.length).toBe(0);
    expect(org.energy).toBeCloseTo(50 + 15 - 0.4 * 0.05);
  });

  it("MOVE_TOWARD_FOOD: wanders when no food", () => {
    const org = makeOrganism({
      energy: 100,
      position: { x: 100, y: 100 },
    });
    const world = makeWorld();
    const p = makePerception({ food: null, foodNearby: false });
    const eBefore = org.energy;
    act(org, BehaviorAction.MOVE_TOWARD_FOOD, p, world, rng(), noReproduce);
    expect(org.energy).toBeLessThan(eBefore); // wander cost
  });

  it("FLEE: moves away from predator at 1.5x speed with 0.08 cost", () => {
    const predator = makeOrganism({ id: 99, position: { x: 52, y: 50 } });
    const org = makeOrganism({
      energy: 100,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }),
    });
    // speed = 2.0, flee_speed = 3.0, cost = 3.0 * 0.08 = 0.24
    const p = makePerception({
      predator,
      predatorNearby: true,
      predatorDistance: 2.0,
    });
    const world = makeWorld();
    const eBefore = org.energy;
    act(org, BehaviorAction.FLEE, p, world, rng(), noReproduce);
    // Should move AWAY from predator (negative dx)
    expect(org.position.x).toBeLessThan(50);
    expect(org.energy).toBeCloseTo(eBefore - 3.0 * 0.08);
  });

  it("FLEE: wanders when no predator", () => {
    const org = makeOrganism({
      energy: 100,
      position: { x: 100, y: 100 },
    });
    const world = makeWorld();
    const p = makePerception({ predator: null, predatorNearby: false });
    const eBefore = org.energy;
    act(org, BehaviorAction.FLEE, p, world, rng(), noReproduce);
    // Wander cost: speed * 0.05
    expect(org.energy).toBeCloseTo(eBefore - 2.0 * 0.05);
  });

  it("ATTACK: moves toward prey, deals damage, gains energy", () => {
    const prey = makeOrganism({
      id: 99,
      position: { x: 50.1, y: 50 },
      energy: 100,
      genome: makeGenome({ movementSpeed: 0.2, size: 1.0 }),
    });
    const org = makeOrganism({
      energy: 80,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 0.2, size: 2.0 }),
    });
    // org speed = 0.2 / max(1.0, 0.5) = 0.2
    // After move: pos.x = 50 + 0.2 * ~1.0 = ~50.2
    // distance ~0.1 < 1.5 → attack!
    // damage = 2.0 * 5.0 = 10.0
    // gain = 10.0 * 0.5 = 5.0
    // cost = 0.2 * 0.08 = 0.016
    const world = makeWorld();
    const p = makePerception({
      prey,
      preyNearby: true,
      preyDistance: 0.1,
    });
    act(org, BehaviorAction.ATTACK, p, world, rng(), noReproduce);
    expect(prey.energy).toBeCloseTo(100 - 10.0);
    expect(org.energy).toBeCloseTo(80 + 5.0 - 0.016);
  });

  it("ATTACK: kills prey when energy drops to 0", () => {
    const prey = makeOrganism({
      id: 99,
      position: { x: 50.1, y: 50 },
      energy: 5,
      alive: true,
      genome: makeGenome({ movementSpeed: 0.2, size: 0.5 }),
    });
    const org = makeOrganism({
      energy: 80,
      position: { x: 50, y: 50 },
      genome: makeGenome({ size: 4.0, movementSpeed: 0.2 }),
    });
    // speed = 0.2 / max(2.0, 0.5) = 0.1
    // damage = 4.0 * 5.0 = 20.0 > 5 → dead
    const world = makeWorld();
    const p = makePerception({ prey, preyNearby: true, preyDistance: 0.1 });
    act(org, BehaviorAction.ATTACK, p, world, rng(), noReproduce);
    expect(prey.alive).toBe(false);
  });

  it("ATTACK: no damage when out of range", () => {
    const prey = makeOrganism({
      id: 99,
      position: { x: 55, y: 50 },
      energy: 100,
    });
    const org = makeOrganism({
      energy: 80,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }),
    });
    // speed = 2.0, moves toward prey
    // After move: x=52, distance to 55 = 3.0 > 1.5 → no damage
    const world = makeWorld();
    const p = makePerception({ prey, preyNearby: true, preyDistance: 5.0 });
    act(org, BehaviorAction.ATTACK, p, world, rng(), noReproduce);
    expect(prey.energy).toBe(100);
    // Still costs energy: speed * 0.08 = 2.0 * 0.08 = 0.16
    expect(org.energy).toBeCloseTo(80 - 0.16);
  });

  it("MOVE_TOWARD_CENTER: moves toward world center", () => {
    const org = makeOrganism({
      energy: 100,
      position: { x: 10, y: 10 },
      genome: makeGenome({ movementSpeed: 1.0, size: 1.0 }),
    });
    // speed = 2.0, center = (100, 100)
    const world = makeWorld({ width: 200, height: 200 });
    act(org, BehaviorAction.MOVE_TOWARD_CENTER, makePerception(), world, rng(), noReproduce);
    // Should have moved closer to center
    expect(org.position.x).toBeGreaterThan(10);
    expect(org.position.y).toBeGreaterThan(10);
    expect(org.energy).toBeCloseTo(100 - 2.0 * 0.05);
  });

  it("energy is capped at 200.0 after action", () => {
    const food: Food = { position: { x: 50.05, y: 50 }, energy: 150, age: 0 };
    const org = makeOrganism({
      energy: 100,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 0.1, size: 1.0 }),
    });
    // speed = 0.1/0.5 = 0.2, after move dist ~ 0.15 - 0.2 = negative → wraps
    // Actually, move to 50.2, distance from 50.2 to 50.05 = 0.15 < 1.0
    // energy = 100 + 150 - 0.2*0.05 = 249.99 → capped at 200
    const world = makeWorld({ food: [food] });
    const p = makePerception({ food, foodNearby: true, foodDistance: 0.05 });
    act(org, BehaviorAction.MOVE_TOWARD_FOOD, p, world, rng(), noReproduce);
    expect(org.energy).toBe(200);
  });

  it("REPRODUCE: calls callback for sexual reproduction", () => {
    const mate = makeOrganism({ id: 99, position: { x: 50, y: 50 } });
    let called = false;
    const onRepro = (_a: Organism, _b?: Organism) => { called = true; };
    const org = makeOrganism({
      energy: 80,
      ticksSinceReproduction: 100,
      genome: makeGenome({
        sexualReproduction: true,
        mateDetectionRadius: 10,
        behaviorTree: [],
      }),
    });
    const world = makeWorld({ organisms: [org, mate] });
    act(org, BehaviorAction.REPRODUCE, makePerception(), world, rng(), onRepro);
    expect(called).toBe(true);
  });

  it("REPRODUCE: calls callback for asexual reproduction", () => {
    let called = false;
    let asexual = false;
    const onRepro = (_a: Organism, _b?: Organism) => {
      called = true;
      asexual = _b === undefined;
    };
    const org = makeOrganism({
      energy: 80,
      ticksSinceReproduction: 100,
      genome: makeGenome({
        sexualReproduction: false,
        behaviorTree: [],
      }),
    });
    const world = makeWorld({ organisms: [org] });
    act(org, BehaviorAction.REPRODUCE, makePerception(), world, rng(), onRepro);
    expect(called).toBe(true);
    expect(asexual).toBe(true);
  });

  it("REPRODUCE: wanders when can't reproduce", () => {
    let called = false;
    const onRepro = () => { called = true; };
    const org = makeOrganism({
      energy: 30, // below threshold of 50
      ticksSinceReproduction: 100,
      genome: makeGenome({ reproductionThreshold: 50, behaviorTree: [] }),
    });
    const world = makeWorld();
    const eBefore = org.energy;
    act(org, BehaviorAction.REPRODUCE, makePerception(), world, rng(), onRepro);
    expect(called).toBe(false);
    expect(org.energy).toBeLessThan(eBefore); // wander cost
  });

  it("MOVE_TOWARD_MATE: calls reproduction when close enough", () => {
    const mate = makeOrganism({ id: 99, position: { x: 50.05, y: 50 }, alive: true });
    let called = false;
    const onRepro = () => { called = true; };
    const org = makeOrganism({
      energy: 80,
      position: { x: 50, y: 50 },
      genome: makeGenome({ movementSpeed: 0.1, size: 1.0 }),
    });
    // speed = 0.2, move toward mate, dist after move ~0.15 → < 1.0
    const world = makeWorld();
    const p = makePerception({ mate, mateNearby: true, mateDistance: 0.05 });
    act(org, BehaviorAction.MOVE_TOWARD_MATE, p, world, rng(), onRepro);
    expect(called).toBe(true);
  });

  it("MOVE_TOWARD_MATE: wanders when mate dead", () => {
    const mate = makeOrganism({ id: 99, position: { x: 50, y: 50 }, alive: false });
    let called = false;
    const onRepro = () => { called = true; };
    const org = makeOrganism({
      energy: 100,
      position: { x: 100, y: 100 },
    });
    const world = makeWorld();
    const p = makePerception({ mate, mateNearby: true, mateDistance: 0 });
    const eBefore = org.energy;
    act(org, BehaviorAction.MOVE_TOWARD_MATE, p, world, rng(), onRepro);
    expect(called).toBe(false);
    expect(org.energy).toBeLessThan(eBefore);
  });
});
