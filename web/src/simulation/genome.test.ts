import { describe, it, expect } from "vitest";
import { PRNG } from "../utils/prng";
import {
  randomGenome,
  crossover,
  mutate,
  canInterbreed,
  geneticDistance,
  toDict,
  fromDict,
  defaultBehaviorTree,
  fixTreeReferences,
} from "./genome";
import {
  Shape,
  BehaviorAction,
  BehaviorNodeType,
  type Genome,
  type BehaviorNode,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeGenome(overrides: Partial<Genome> = {}): Genome {
  return {
    size: 1.0,
    shape: Shape.CIRCLE,
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
    behaviorTree: defaultBehaviorTree(),
    speciesId: 0,
    generation: 0,
    parentIds: [],
    ...overrides,
  };
}

// ── randomGenome ─────────────────────────────────────────────────────────

describe("randomGenome", () => {
  it("produces deterministic output for same seed", () => {
    const g1 = randomGenome(new PRNG(42));
    const g2 = randomGenome(new PRNG(42));
    expect(g1).toEqual(g2);
  });

  it("produces different output for different seeds", () => {
    const g1 = randomGenome(new PRNG(42));
    const g2 = randomGenome(new PRNG(99));
    expect(g1).not.toEqual(g2);
  });

  it("generates values within expected ranges", () => {
    const g = randomGenome(new PRNG(42));
    expect(g.size).toBeGreaterThanOrEqual(0.5);
    expect(g.size).toBeLessThanOrEqual(2.0);
    expect(g.colorHue).toBeGreaterThanOrEqual(0);
    expect(g.colorHue).toBeLessThanOrEqual(360);
    expect(g.colorSat).toBeGreaterThanOrEqual(0.3);
    expect(g.colorSat).toBeLessThanOrEqual(1.0);
    expect(g.colorVal).toBeGreaterThanOrEqual(0.3);
    expect(g.colorVal).toBeLessThanOrEqual(1.0);
    expect(g.baseMetabolism).toBeGreaterThanOrEqual(0.05);
    expect(g.baseMetabolism).toBeLessThanOrEqual(0.3);
    expect(g.photosynthesisRate).toBeGreaterThanOrEqual(0.0);
    expect(g.photosynthesisRate).toBeLessThanOrEqual(0.5);
    expect(g.movementSpeed).toBeGreaterThanOrEqual(0.5);
    expect(g.movementSpeed).toBeLessThanOrEqual(2.0);
    expect(g.foodDetectionRadius).toBeGreaterThanOrEqual(2.0);
    expect(g.foodDetectionRadius).toBeLessThanOrEqual(10.0);
    expect(g.predatorDetectionRadius).toBeGreaterThanOrEqual(2.0);
    expect(g.predatorDetectionRadius).toBeLessThanOrEqual(10.0);
    expect(g.mateDetectionRadius).toBeGreaterThanOrEqual(2.0);
    expect(g.mateDetectionRadius).toBeLessThanOrEqual(10.0);
    expect(g.reproductionThreshold).toBeGreaterThanOrEqual(30.0);
    expect(g.reproductionThreshold).toBeLessThanOrEqual(80.0);
    expect(g.reproductionCost).toBeGreaterThanOrEqual(15.0);
    expect(g.reproductionCost).toBeLessThanOrEqual(40.0);
    expect(g.crossoverPreference).toBeGreaterThanOrEqual(0.3);
    expect(g.crossoverPreference).toBeLessThanOrEqual(0.7);
    expect(g.mutationRate).toBeGreaterThanOrEqual(0.01);
    expect(g.mutationRate).toBeLessThanOrEqual(0.15);
    expect(g.mutationMagnitude).toBeGreaterThanOrEqual(0.05);
    expect(g.mutationMagnitude).toBeLessThanOrEqual(0.3);
  });

  it("creates a valid behavior tree (2-5 nodes)", () => {
    const g = randomGenome(new PRNG(42));
    expect(g.behaviorTree.length).toBeGreaterThanOrEqual(2);
    expect(g.behaviorTree.length).toBeLessThanOrEqual(5);
  });

  it("last node in tree is always a leaf", () => {
    for (let seed = 0; seed < 10; seed++) {
      const g = randomGenome(new PRNG(seed));
      const lastNode = g.behaviorTree[g.behaviorTree.length - 1];
      expect(lastNode!.isLeaf).toBe(true);
    }
  });

  it("non-leaf node references are within tree bounds", () => {
    const g = randomGenome(new PRNG(42));
    for (const node of g.behaviorTree) {
      if (!node.isLeaf) {
        const ref = node.ifFalse;
        expect(typeof ref).toBe("number");
        expect(ref as number).toBeLessThan(g.behaviorTree.length);
      }
    }
  });

  it("initializes tracking fields to defaults", () => {
    const g = randomGenome(new PRNG(42));
    expect(g.generation).toBe(0);
    expect(g.speciesId).toBe(0);
    expect(g.parentIds).toEqual([]);
  });

  it("has a valid shape", () => {
    const validShapes = new Set<string>([
      Shape.CIRCLE,
      Shape.TRIANGLE,
      Shape.SQUARE,
      Shape.DIAMOND,
    ]);
    for (let seed = 0; seed < 20; seed++) {
      const g = randomGenome(new PRNG(seed));
      expect(validShapes.has(g.shape)).toBe(true);
    }
  });
});

// ── crossover ────────────────────────────────────────────────────────────

describe("crossover", () => {
  it("produces deterministic output for same seed", () => {
    const parentA = randomGenome(new PRNG(1));
    const parentB = randomGenome(new PRNG(2));
    const child1 = crossover(parentA, parentB, new PRNG(42));
    const child2 = crossover(parentA, parentB, new PRNG(42));
    expect(child1).toEqual(child2);
  });

  it("sets generation to max(parents) + 1", () => {
    const parentA = makeGenome({ generation: 5 });
    const parentB = makeGenome({ generation: 3 });
    const child = crossover(parentA, parentB, new PRNG(42));
    expect(child.generation).toBe(6);
  });

  it("sets parentIds to parents species IDs", () => {
    const parentA = makeGenome({ speciesId: 10 });
    const parentB = makeGenome({ speciesId: 20 });
    const child = crossover(parentA, parentB, new PRNG(42));
    expect(child.parentIds).toEqual([10, 20]);
  });

  it("resets speciesId to 0", () => {
    const parentA = makeGenome({ speciesId: 5 });
    const parentB = makeGenome({ speciesId: 7 });
    const child = crossover(parentA, parentB, new PRNG(42));
    expect(child.speciesId).toBe(0);
  });

  it("blends hue using circular mean (deterministic)", () => {
    const parentA = makeGenome({ colorHue: 10 });
    const parentB = makeGenome({ colorHue: 350 });
    const child = crossover(parentA, parentB, new PRNG(42));
    // Circular mean of 10 and 350 should be near 0/360
    expect(child.colorHue).toBeCloseTo(0, 0);
  });

  it("produces a child with valid behavior tree", () => {
    const parentA = randomGenome(new PRNG(1));
    const parentB = randomGenome(new PRNG(2));
    const child = crossover(parentA, parentB, new PRNG(42));
    expect(child.behaviorTree.length).toBeGreaterThan(0);
    for (const node of child.behaviorTree) {
      if (!node.isLeaf) {
        const ref = node.ifFalse;
        expect(typeof ref).toBe("number");
        expect(ref as number).toBeLessThan(child.behaviorTree.length);
      }
    }
  });
});

// ── mutate ───────────────────────────────────────────────────────────────

describe("mutate", () => {
  it("produces deterministic output for same seed", () => {
    const g = randomGenome(new PRNG(1));
    const m1 = mutate(g, new PRNG(42));
    const m2 = mutate(g, new PRNG(42));
    expect(m1).toEqual(m2);
  });

  it("preserves speciesId, generation, parentIds", () => {
    const g = makeGenome({
      speciesId: 42,
      generation: 10,
      parentIds: [1, 2],
    });
    const m = mutate(g, new PRNG(42));
    expect(m.speciesId).toBe(42);
    expect(m.generation).toBe(10);
    expect(m.parentIds).toEqual([1, 2]);
  });

  it("can actually mutate values at high rate", () => {
    const g = makeGenome({ mutationRate: 1.0, mutationMagnitude: 1.0 });
    let anyDifferent = false;
    for (let seed = 0; seed < 10; seed++) {
      const m = mutate(g, new PRNG(seed));
      if (m.size !== g.size) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });

  it("does not mutate at zero rate", () => {
    const g = makeGenome({ mutationRate: 0, mutationMagnitude: 0.1 });
    const m = mutate(g, new PRNG(42), 0);
    // With rate=0, no gene should change (except possibly sexual_reproduction at rate*0.1=0)
    expect(m.size).toBe(g.size);
    expect(m.baseMetabolism).toBe(g.baseMetabolism);
    expect(m.movementSpeed).toBe(g.movementSpeed);
    expect(m.sexualReproduction).toBe(g.sexualReproduction);
  });

  it("uses globalMutationRate when provided", () => {
    const g = makeGenome({ mutationRate: 0.0, mutationMagnitude: 1.0 });
    const m = mutate(g, new PRNG(42), 1.0);
    // With global rate=1.0, genes should almost certainly mutate
    expect(m.size).not.toBe(g.size);
  });

  it("clamps mutated values to bounds", () => {
    const g = makeGenome({
      size: 0.1,
      mutationRate: 1.0,
      mutationMagnitude: 10.0,
    });
    for (let seed = 0; seed < 20; seed++) {
      const m = mutate(g, new PRNG(seed));
      expect(m.size).toBeGreaterThanOrEqual(0.1);
      expect(m.size).toBeLessThanOrEqual(5.0);
    }
  });

  it("wraps color_hue into [0, 360)", () => {
    const g = makeGenome({
      colorHue: 350,
      mutationRate: 1.0,
      mutationMagnitude: 1.0,
    });
    for (let seed = 0; seed < 20; seed++) {
      const m = mutate(g, new PRNG(seed));
      expect(m.colorHue).toBeGreaterThanOrEqual(0);
      expect(m.colorHue).toBeLessThan(360);
    }
  });

  it("can flip sexual_reproduction", () => {
    const g = makeGenome({
      sexualReproduction: true,
      mutationRate: 1.0,
      mutationMagnitude: 0.1,
    });
    let flipped = false;
    for (let seed = 0; seed < 50; seed++) {
      const m = mutate(g, new PRNG(seed));
      if (!m.sexualReproduction) flipped = true;
    }
    expect(flipped).toBe(true);
  });

  it("produces a child with valid behavior tree references", () => {
    const g = randomGenome(new PRNG(1));
    for (let seed = 0; seed < 10; seed++) {
      const m = mutate(g, new PRNG(seed));
      for (const node of m.behaviorTree) {
        if (!node.isLeaf) {
          const ref = node.ifFalse;
          expect(typeof ref).toBe("number");
          expect(ref as number).toBeLessThan(m.behaviorTree.length);
        }
      }
    }
  });
});

// ── geneticDistance ──────────────────────────────────────────────────────

describe("geneticDistance", () => {
  it("returns 0 for identical genomes", () => {
    const g = randomGenome(new PRNG(42));
    expect(geneticDistance(g, g)).toBe(0);
  });

  it("is symmetric", () => {
    const a = randomGenome(new PRNG(1));
    const b = randomGenome(new PRNG(2));
    expect(geneticDistance(a, b)).toBeCloseTo(geneticDistance(b, a), 10);
  });

  it("returns larger distance for more different genomes", () => {
    const base = makeGenome();
    const similar = makeGenome({ size: 1.05 });
    const different = makeGenome({
      size: 4.0,
      movementSpeed: 4.0,
      foodDetectionRadius: 18.0,
      colorHue: 300,
    });
    const dSimilar = geneticDistance(base, similar);
    const dDifferent = geneticDistance(base, different);
    expect(dDifferent).toBeGreaterThan(dSimilar);
  });

  it("returns value in [0, 1]", () => {
    const a = randomGenome(new PRNG(1));
    const b = randomGenome(new PRNG(2));
    const dist = geneticDistance(a, b);
    expect(dist).toBeGreaterThanOrEqual(0);
    expect(dist).toBeLessThanOrEqual(1);
  });

  it("accounts for sexual_reproduction difference", () => {
    const sexual = makeGenome({ sexualReproduction: true });
    const asexual = makeGenome({ sexualReproduction: false });
    const distDiff = geneticDistance(sexual, asexual);
    const distSame = geneticDistance(sexual, sexual);
    expect(distDiff).toBeGreaterThan(distSame);
  });
});

// ── canInterbreed ────────────────────────────────────────────────────────

describe("canInterbreed", () => {
  it("returns false when either organism is asexual", () => {
    const sexual = makeGenome({ sexualReproduction: true });
    const asexual = makeGenome({ sexualReproduction: false });
    expect(canInterbreed(sexual, asexual, 0.3)).toBe(false);
    expect(canInterbreed(asexual, sexual, 0.3)).toBe(false);
    expect(canInterbreed(asexual, asexual, 0.3)).toBe(false);
  });

  it("returns true for identical sexual genomes", () => {
    const g = makeGenome({ sexualReproduction: true });
    expect(canInterbreed(g, g, 0.3)).toBe(true);
  });

  it("returns false for very different genomes", () => {
    const a = makeGenome({
      sexualReproduction: true,
      size: 0.5,
      movementSpeed: 0.5,
      foodDetectionRadius: 20.0,
    });
    const b = makeGenome({
      sexualReproduction: true,
      size: 4.5,
      movementSpeed: 4.5,
      foodDetectionRadius: 1.0,
    });
    expect(canInterbreed(a, b, 0.1)).toBe(false);
  });

  it("uses strict < threshold (not <=)", () => {
    // Create genomes where distance is exactly at the boundary
    // This is hard to construct precisely, so we test the semantics
    // by checking that genomes just barely within threshold can interbreed
    const g = makeGenome({ sexualReproduction: true });
    expect(canInterbreed(g, g, 0.0)).toBe(false); // distance=0, threshold=0, 0 < 0 is false
  });

  it("uses default threshold of 0.3", () => {
    const g = makeGenome({ sexualReproduction: true });
    // Identical genomes should always interbreed at default threshold
    expect(canInterbreed(g, g)).toBe(true);
  });
});

// ── toDict / fromDict round-trip ─────────────────────────────────────────

describe("serialization round-trip", () => {
  it("preserves all fields through toDict → fromDict", () => {
    const original = randomGenome(new PRNG(42));
    const dict = toDict(original);
    const restored = fromDict(dict);
    expect(restored).toEqual(original);
  });

  it("preserves all fields for a manually constructed genome", () => {
    const original = makeGenome({
      size: 2.5,
      shape: Shape.DIAMOND,
      colorHue: 270,
      colorSat: 0.5,
      colorVal: 0.9,
      baseMetabolism: 0.2,
      photosynthesisRate: 0.3,
      movementSpeed: 1.8,
      foodDetectionRadius: 12.0,
      predatorDetectionRadius: 8.0,
      mateDetectionRadius: 6.0,
      reproductionThreshold: 75.0,
      reproductionCost: 25.0,
      sexualReproduction: false,
      crossoverPreference: 0.6,
      mutationRate: 0.08,
      mutationMagnitude: 0.15,
      speciesId: 7,
      generation: 15,
      parentIds: [3, 5],
    });
    const dict = toDict(original);
    const restored = fromDict(dict);
    expect(restored).toEqual(original);
  });

  it("produces snake_case keys matching Python format", () => {
    const g = makeGenome();
    const dict = toDict(g);
    expect(dict).toHaveProperty("color_hue");
    expect(dict).toHaveProperty("base_metabolism");
    expect(dict).toHaveProperty("movement_speed");
    expect(dict).toHaveProperty("food_detection_radius");
    expect(dict).toHaveProperty("reproduction_threshold");
    expect(dict).toHaveProperty("sexual_reproduction");
    expect(dict).toHaveProperty("crossover_preference");
    expect(dict).toHaveProperty("mutation_rate");
    expect(dict).toHaveProperty("mutation_magnitude");
    expect(dict).toHaveProperty("behavior_tree");
    expect(dict).toHaveProperty("species_id");
    expect(dict).toHaveProperty("parent_ids");
  });

  it("serializes behavior tree nodes correctly", () => {
    const g = makeGenome();
    const dict = toDict(g);
    const bt = dict["behavior_tree"] as Record<string, unknown>[];
    expect(bt.length).toBe(3);

    // First node: PREDATOR_NEARBY, non-leaf
    const node0 = bt[0]!;
    expect(node0["condition"]).toBe("PREDATOR_NEARBY");
    expect(node0["is_leaf"]).toBe(false);
    expect(typeof node0["if_false"]).toBe("number");

    // Last node: FOOD_NEARBY, leaf
    const node2 = bt[2]!;
    expect(node2["condition"]).toBe("FOOD_NEARBY");
    expect(node2["is_leaf"]).toBe(true);
    expect(typeof node2["if_false"]).toBe("string");
  });

  it("round-trips crossover + mutate chain", () => {
    const parentA = randomGenome(new PRNG(1));
    const parentB = randomGenome(new PRNG(2));
    const child = crossover(parentA, parentB, new PRNG(42));
    const mutated = mutate(child, new PRNG(43));
    const dict = toDict(mutated);
    const restored = fromDict(dict);
    expect(restored).toEqual(mutated);
  });
});

// ── fixTreeReferences ────────────────────────────────────────────────────

describe("fixTreeReferences", () => {
  it("converts out-of-range non-leaf nodes to leaves", () => {
    const tree: BehaviorNode[] = [
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.WANDER,
        ifFalse: 5, // out of range for 1-node tree
        isLeaf: false,
      },
    ];
    const fixed = fixTreeReferences(tree);
    expect(fixed[0]!.isLeaf).toBe(true);
    expect(fixed[0]!.ifFalse).toBe(BehaviorAction.WANDER);
  });

  it("preserves valid non-leaf references", () => {
    const tree: BehaviorNode[] = [
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.WANDER,
        ifFalse: 1,
        isLeaf: false,
      },
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.REST,
        ifFalse: BehaviorAction.FLEE,
        isLeaf: true,
      },
    ];
    const fixed = fixTreeReferences(tree);
    expect(fixed[0]!.isLeaf).toBe(false);
    expect(fixed[0]!.ifFalse).toBe(1);
  });

  it("preserves leaf nodes unchanged", () => {
    const tree: BehaviorNode[] = [
      {
        condition: BehaviorNodeType.ALWAYS,
        threshold: 0,
        ifTrue: BehaviorAction.WANDER,
        ifFalse: BehaviorAction.REST,
        isLeaf: true,
      },
    ];
    const fixed = fixTreeReferences(tree);
    expect(fixed).toEqual(tree);
  });
});

// ── defaultBehaviorTree ──────────────────────────────────────────────────

describe("defaultBehaviorTree", () => {
  it("has exactly 3 nodes", () => {
    const tree = defaultBehaviorTree();
    expect(tree).toHaveLength(3);
  });

  it("matches Python default structure", () => {
    const tree = defaultBehaviorTree();

    expect(tree[0]!.condition).toBe(BehaviorNodeType.PREDATOR_NEARBY);
    expect(tree[0]!.threshold).toBe(0);
    expect(tree[0]!.ifTrue).toBe(BehaviorAction.FLEE);
    expect(tree[0]!.ifFalse).toBe(1);
    expect(tree[0]!.isLeaf).toBe(false);

    expect(tree[1]!.condition).toBe(BehaviorNodeType.ENERGY_ABOVE);
    expect(tree[1]!.threshold).toBe(60);
    expect(tree[1]!.ifTrue).toBe(BehaviorAction.REPRODUCE);
    expect(tree[1]!.ifFalse).toBe(2);
    expect(tree[1]!.isLeaf).toBe(false);

    expect(tree[2]!.condition).toBe(BehaviorNodeType.FOOD_NEARBY);
    expect(tree[2]!.threshold).toBe(0);
    expect(tree[2]!.ifTrue).toBe(BehaviorAction.MOVE_TOWARD_FOOD);
    expect(tree[2]!.ifFalse).toBe(BehaviorAction.WANDER);
    expect(tree[2]!.isLeaf).toBe(true);
  });
});
