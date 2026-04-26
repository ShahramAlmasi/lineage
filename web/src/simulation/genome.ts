/**
 * Genome module: genes, crossover, mutation, and behavior trees.
 * Port of Python src/lineage/genome.py — matches behavior exactly.
 */

import { PRNG } from "../utils/prng";
import { blendAngle } from "../utils/math";
import {
  type BehaviorNode,
  type Genome,
  Shape,
  BehaviorNodeType,
  BehaviorAction,
} from "./types";

// ── All-values arrays for choice() ───────────────────────────────────────

const ALL_SHAPES: readonly Shape[] = [
  Shape.CIRCLE,
  Shape.TRIANGLE,
  Shape.SQUARE,
  Shape.DIAMOND,
];

const ALL_BEHAVIOR_ACTIONS: readonly BehaviorAction[] = [
  BehaviorAction.MOVE_TOWARD_FOOD,
  BehaviorAction.MOVE_TOWARD_MATE,
  BehaviorAction.FLEE,
  BehaviorAction.WANDER,
  BehaviorAction.REPRODUCE,
  BehaviorAction.REST,
  BehaviorAction.MOVE_TOWARD_CENTER,
  BehaviorAction.ATTACK,
];

const ALL_BEHAVIOR_NODE_TYPES: readonly BehaviorNodeType[] = [
  BehaviorNodeType.FOOD_NEARBY,
  BehaviorNodeType.PREDATOR_NEARBY,
  BehaviorNodeType.MATE_NEARBY,
  BehaviorNodeType.ENERGY_ABOVE,
  BehaviorNodeType.ALWAYS,
];

// ── Mutation bounds (matches Python MUTATION_BOUNDS exactly) ─────────────

const MUTATION_BOUNDS: Readonly<
  Record<string, readonly [number, number]>
> = {
  size: [0.1, 5.0],
  base_metabolism: [0.01, 1.0],
  photosynthesis_rate: [0.0, 2.0],
  movement_speed: [0.1, 5.0],
  food_detection_radius: [0.5, 20.0],
  predator_detection_radius: [0.5, 20.0],
  mate_detection_radius: [0.5, 20.0],
  reproduction_threshold: [10.0, 200.0],
  reproduction_cost: [5.0, 100.0],
  crossover_preference: [0.0, 1.0],
  mutation_rate: [0.001, 0.5],
  mutation_magnitude: [0.01, 1.0],
  color_sat: [0.0, 1.0],
  color_val: [0.0, 1.0],
};

// ── Internal helpers ─────────────────────────────────────────────────────

/** Blend two float values with Gaussian-weighted alpha. Matches Python _blend. */
function blend(a: number, b: number, rng: PRNG): number {
  let alpha = rng.gauss(0.5, 0.15);
  alpha = Math.max(0.0, Math.min(1.0, alpha));
  return a * alpha + b * (1.0 - alpha);
}

/** Possibly mutate a float gene. Matches Python _maybe_mutate. */
function maybeMutate(
  value: number,
  rate: number,
  magnitude: number,
  key: string,
  rng: PRNG,
): number {
  if (rng.random() > rate) return value;
  const delta = rng.gauss(0, magnitude);
  let newVal = value + delta;
  const bounds = MUTATION_BOUNDS[key];
  if (bounds) {
    newVal = Math.max(bounds[0], Math.min(bounds[1], newVal));
  }
  return newVal;
}

/** Possibly mutate an enum value. Matches Python _maybe_mutate_enum. */
function maybeMutateEnum<T>(
  value: T,
  rate: number,
  choices: readonly T[],
  rng: PRNG,
): T {
  if (rng.random() > rate * 0.3) return value;
  return rng.choice(choices);
}

/**
 * Fix behavior tree references after crossover/mutation.
 * If a non-leaf node's ifFalse index >= tree length, convert to leaf with WANDER.
 */
function fixTreeReferences(tree: BehaviorNode[]): BehaviorNode[] {
  const result: BehaviorNode[] = [];
  for (const node of tree) {
    if (!node.isLeaf) {
      const ref = node.ifFalse;
      if (typeof ref === "number" && ref >= tree.length) {
        result.push({
          condition: node.condition,
          threshold: node.threshold,
          ifTrue: node.ifTrue,
          ifFalse: BehaviorAction.WANDER,
          isLeaf: true,
        });
      } else {
        result.push(node);
      }
    } else {
      result.push(node);
    }
  }
  return result;
}

// ── Default behavior tree ────────────────────────────────────────────────

function defaultBehaviorTree(): BehaviorNode[] {
  return [
    {
      condition: BehaviorNodeType.PREDATOR_NEARBY,
      threshold: 0.0,
      ifTrue: BehaviorAction.FLEE,
      ifFalse: 1,
      isLeaf: false,
    },
    {
      condition: BehaviorNodeType.ENERGY_ABOVE,
      threshold: 60.0,
      ifTrue: BehaviorAction.REPRODUCE,
      ifFalse: 2,
      isLeaf: false,
    },
    {
      condition: BehaviorNodeType.FOOD_NEARBY,
      threshold: 0.0,
      ifTrue: BehaviorAction.MOVE_TOWARD_FOOD,
      ifFalse: BehaviorAction.WANDER,
      isLeaf: true,
    },
  ];
}

// ── Random behavior tree ─────────────────────────────────────────────────

function randomBehaviorTree(rng: PRNG): BehaviorNode[] {
  const nNodes = rng.randint(2, 5);
  const tree: BehaviorNode[] = [];
  for (let i = 0; i < nNodes; i++) {
    const isLeaf = i === nNodes - 1 || rng.random() > 0.5;
    tree.push({
      condition: rng.choice(ALL_BEHAVIOR_NODE_TYPES),
      threshold: rng.gauss(50, 20),
      ifTrue: rng.choice(ALL_BEHAVIOR_ACTIONS),
      ifFalse: isLeaf
        ? rng.choice(ALL_BEHAVIOR_ACTIONS)
        : rng.randint(i + 1, nNodes),
      isLeaf,
    });
  }
  return fixTreeReferences(tree);
}

// ── Behavior tree crossover ──────────────────────────────────────────────

function crossoverBehaviorTree(
  treeA: readonly BehaviorNode[],
  treeB: readonly BehaviorNode[],
  rng: PRNG,
): BehaviorNode[] {
  if (treeA.length === 0) return treeB.map((n) => ({ ...n }));
  if (treeB.length === 0) return treeA.map((n) => ({ ...n }));

  let result: BehaviorNode[];
  if (rng.random() < 0.5) {
    // Split crossover
    const split = rng.randint(0, treeA.length);
    result = [
      ...treeA.slice(0, split),
      ...treeB.slice(split),
    ];
  } else {
    // Uniform crossover
    result = [];
    const maxLen = Math.max(treeA.length, treeB.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < treeA.length && i < treeB.length) {
        result.push(rng.choice([treeA[i]!, treeB[i]!]));
      } else if (i < treeA.length) {
        result.push(treeA[i]!);
      } else {
        result.push(treeB[i]!);
      }
    }
  }

  return fixTreeReferences(result);
}

// ── Behavior tree mutation ───────────────────────────────────────────────

function mutateBehaviorTree(
  tree: readonly BehaviorNode[],
  rate: number,
  magnitude: number,
  rng: PRNG,
): BehaviorNode[] {
  if (tree.length === 0) return [];

  const newTree: BehaviorNode[] = [];
  for (const node of tree) {
    // Chance to delete node
    if (rng.random() < rate * 0.2) continue;

    let newNode = node;
    // Threshold mutation
    if (rng.random() < rate) {
      newNode = {
        condition: node.condition,
        threshold: Math.max(0, node.threshold + rng.gauss(0, magnitude * 50)),
        ifTrue: node.ifTrue,
        ifFalse: node.ifFalse,
        isLeaf: node.isLeaf,
      };
    }

    // if_true action mutation
    if (rng.random() < rate * 0.3) {
      newNode = {
        condition: newNode.condition,
        threshold: newNode.threshold,
        ifTrue: rng.choice(ALL_BEHAVIOR_ACTIONS),
        ifFalse: newNode.ifFalse,
        isLeaf: newNode.isLeaf,
      };
    }

    newTree.push(newNode);
  }

  // Chance to append new node
  if (rng.random() < rate * 0.1 && newTree.length < 10) {
    newTree.push({
      condition: rng.choice(ALL_BEHAVIOR_NODE_TYPES),
      threshold: rng.gauss(50, 20),
      ifTrue: rng.choice(ALL_BEHAVIOR_ACTIONS),
      ifFalse: rng.choice(ALL_BEHAVIOR_ACTIONS),
      isLeaf: true,
    });
  }

  return fixTreeReferences(newTree);
}

// ── Behavior tree distance ───────────────────────────────────────────────

function behaviorTreeDistance(
  treeA: readonly BehaviorNode[],
  treeB: readonly BehaviorNode[],
): number {
  const maxLen = Math.max(treeA.length, treeB.length);
  if (maxLen === 0) return 0.0;

  let dist = 0.0;
  for (let i = 0; i < maxLen; i++) {
    if (i >= treeA.length || i >= treeB.length) {
      dist += 1.0;
      continue;
    }
    const a = treeA[i]!;
    const b = treeB[i]!;
    if (a.condition !== b.condition) dist += 0.3;
    dist += Math.abs(a.threshold - b.threshold) / 100.0;
    if (a.ifTrue !== b.ifTrue) dist += 0.3;
    if (a.isLeaf !== b.isLeaf) {
      dist += 0.2;
    } else if (a.isLeaf && a.ifFalse !== b.ifFalse) {
      dist += 0.2;
    } else if (!a.isLeaf && a.ifFalse !== b.ifFalse) {
      dist += 0.1;
    }
  }

  return Math.min(dist / maxLen, 1.0);
}

// ── Serialization helpers ────────────────────────────────────────────────

function nodeToDict(node: BehaviorNode): Record<string, unknown> {
  return {
    condition: node.condition as string,
    threshold: node.threshold,
    if_true: node.ifTrue as string,
    if_false:
      typeof node.ifFalse === "number"
        ? node.ifFalse
        : (node.ifFalse as string),
    is_leaf: node.isLeaf,
  };
}

function nodeFromDict(d: Record<string, unknown>): BehaviorNode {
  const ifTrue = d["if_true"] as BehaviorAction;
  const ifFalseRaw = d["if_false"];
  const ifFalse: BehaviorAction | number =
    typeof ifFalseRaw === "string"
      ? (ifFalseRaw as BehaviorAction)
      : Number(ifFalseRaw);
  return {
    condition: d["condition"] as BehaviorNodeType,
    threshold: d["threshold"] as number,
    ifTrue,
    ifFalse,
    isLeaf: d["is_leaf"] as boolean,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Generate a random genome. Matches Python random_genome exactly.
 * All values generated using the provided PRNG for deterministic output.
 */
export function randomGenome(rng: PRNG): Genome {
  return {
    size: rng.uniform(0.5, 2.0),
    shape: rng.choice(ALL_SHAPES),
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
    generation: 0,
    speciesId: 0,
    parentIds: [],
  };
}

/**
 * Sexual reproduction crossover. Matches Python crossover exactly.
 * Blends all float genes, picks shapes/booleans from parents,
 * crosses behavior trees, and increments generation.
 */
export function crossover(
  parentA: Genome,
  parentB: Genome,
  rng: PRNG,
): Genome {
  return {
    size: blend(parentA.size, parentB.size, rng),
    shape: rng.choice([parentA.shape, parentB.shape]),
    colorHue: blendAngle(parentA.colorHue, parentB.colorHue),
    colorSat: blend(parentA.colorSat, parentB.colorSat, rng),
    colorVal: blend(parentA.colorVal, parentB.colorVal, rng),
    baseMetabolism: blend(
      parentA.baseMetabolism,
      parentB.baseMetabolism,
      rng,
    ),
    photosynthesisRate: blend(
      parentA.photosynthesisRate,
      parentB.photosynthesisRate,
      rng,
    ),
    movementSpeed: blend(
      parentA.movementSpeed,
      parentB.movementSpeed,
      rng,
    ),
    foodDetectionRadius: blend(
      parentA.foodDetectionRadius,
      parentB.foodDetectionRadius,
      rng,
    ),
    predatorDetectionRadius: blend(
      parentA.predatorDetectionRadius,
      parentB.predatorDetectionRadius,
      rng,
    ),
    mateDetectionRadius: blend(
      parentA.mateDetectionRadius,
      parentB.mateDetectionRadius,
      rng,
    ),
    reproductionThreshold: blend(
      parentA.reproductionThreshold,
      parentB.reproductionThreshold,
      rng,
    ),
    reproductionCost: blend(
      parentA.reproductionCost,
      parentB.reproductionCost,
      rng,
    ),
    sexualReproduction: rng.choice([
      parentA.sexualReproduction,
      parentB.sexualReproduction,
    ]),
    crossoverPreference: blend(
      parentA.crossoverPreference,
      parentB.crossoverPreference,
      rng,
    ),
    mutationRate: blend(parentA.mutationRate, parentB.mutationRate, rng),
    mutationMagnitude: blend(
      parentA.mutationMagnitude,
      parentB.mutationMagnitude,
      rng,
    ),
    behaviorTree: crossoverBehaviorTree(
      parentA.behaviorTree,
      parentB.behaviorTree,
      rng,
    ),
    generation: Math.max(parentA.generation, parentB.generation) + 1,
    speciesId: 0,
    parentIds: [parentA.speciesId, parentB.speciesId],
  };
}

/**
 * Mutate a genome. Matches Python mutate exactly.
 * Uses globalMutationRate if provided, else genome's own mutationRate.
 * Preserves speciesId, generation, and parentIds unchanged.
 */
export function mutate(
  genome: Genome,
  rng: PRNG,
  globalMutationRate?: number,
): Genome {
  const rate =
    globalMutationRate !== undefined
      ? globalMutationRate
      : genome.mutationRate;
  const magnitude = genome.mutationMagnitude;

  return {
    size: maybeMutate(genome.size, rate, magnitude, "size", rng),
    shape: maybeMutateEnum(genome.shape, rate, ALL_SHAPES, rng),
    colorHue:
      ((maybeMutate(
        genome.colorHue,
        rate,
        magnitude * 360,
        "color_hue",
        rng,
      ) % 360) +
        360) %
      360,
    colorSat: maybeMutate(genome.colorSat, rate, magnitude, "color_sat", rng),
    colorVal: maybeMutate(genome.colorVal, rate, magnitude, "color_val", rng),
    baseMetabolism: maybeMutate(
      genome.baseMetabolism,
      rate,
      magnitude,
      "base_metabolism",
      rng,
    ),
    photosynthesisRate: maybeMutate(
      genome.photosynthesisRate,
      rate,
      magnitude,
      "photosynthesis_rate",
      rng,
    ),
    movementSpeed: maybeMutate(
      genome.movementSpeed,
      rate,
      magnitude,
      "movement_speed",
      rng,
    ),
    foodDetectionRadius: maybeMutate(
      genome.foodDetectionRadius,
      rate,
      magnitude,
      "food_detection_radius",
      rng,
    ),
    predatorDetectionRadius: maybeMutate(
      genome.predatorDetectionRadius,
      rate,
      magnitude,
      "predator_detection_radius",
      rng,
    ),
    mateDetectionRadius: maybeMutate(
      genome.mateDetectionRadius,
      rate,
      magnitude,
      "mate_detection_radius",
      rng,
    ),
    reproductionThreshold: maybeMutate(
      genome.reproductionThreshold,
      rate,
      magnitude,
      "reproduction_threshold",
      rng,
    ),
    reproductionCost: maybeMutate(
      genome.reproductionCost,
      rate,
      magnitude,
      "reproduction_cost",
      rng,
    ),
    sexualReproduction:
      rng.random() > rate * 0.1
        ? genome.sexualReproduction
        : !genome.sexualReproduction,
    crossoverPreference: maybeMutate(
      genome.crossoverPreference,
      rate,
      magnitude,
      "crossover_preference",
      rng,
    ),
    mutationRate: maybeMutate(
      genome.mutationRate,
      rate,
      magnitude,
      "mutation_rate",
      rng,
    ),
    mutationMagnitude: maybeMutate(
      genome.mutationMagnitude,
      rate,
      magnitude,
      "mutation_magnitude",
      rng,
    ),
    behaviorTree: mutateBehaviorTree(genome.behaviorTree, rate, magnitude, rng),
    speciesId: genome.speciesId,
    generation: genome.generation,
    parentIds: genome.parentIds,
  };
}

/**
 * Calculate genetic distance between two genomes. Matches Python genetic_distance exactly.
 * Weighted average of 6 components: morphology, metabolism, senses,
 * reproduction, mutation strategy, and behavior tree.
 */
export function geneticDistance(a: Genome, b: Genome): number {
  // Morphology distance
  const morphDist =
    (Math.abs(a.size - b.size) +
      Math.abs(a.colorHue - b.colorHue) / 360.0 +
      Math.abs(a.colorSat - b.colorSat) +
      Math.abs(a.colorVal - b.colorVal)) /
    4.0;

  // Metabolism distance
  const metaDist =
    (Math.abs(a.baseMetabolism - b.baseMetabolism) +
      Math.abs(a.photosynthesisRate - b.photosynthesisRate) +
      Math.abs(a.movementSpeed - b.movementSpeed)) /
    3.0;

  // Senses distance (normalized by 15.0, NOT 3.0 — matches Python)
  const senseDist =
    (Math.abs(a.foodDetectionRadius - b.foodDetectionRadius) +
      Math.abs(a.predatorDetectionRadius - b.predatorDetectionRadius) +
      Math.abs(a.mateDetectionRadius - b.mateDetectionRadius)) /
    15.0;

  // Reproduction distance
  const reproDist =
    (Math.abs(a.reproductionThreshold - b.reproductionThreshold) / 100.0 +
      Math.abs(a.reproductionCost - b.reproductionCost) / 100.0 +
      (a.sexualReproduction === b.sexualReproduction ? 0.0 : 1.0)) /
    3.0;

  // Mutation strategy distance
  const mutDist =
    (Math.abs(a.mutationRate - b.mutationRate) +
      Math.abs(a.mutationMagnitude - b.mutationMagnitude)) /
    2.0;

  // Behavior tree distance
  const btDist = behaviorTreeDistance(a.behaviorTree, b.behaviorTree);

  // Weighted average
  return (
    morphDist * 0.2 +
    metaDist * 0.2 +
    senseDist * 0.15 +
    reproDist * 0.15 +
    mutDist * 0.15 +
    btDist * 0.15
  );
}

/**
 * Check if two organisms can reproduce sexually. Matches Python can_interbreed exactly.
 * Returns false if either genome has sexualReproduction=false.
 * Uses strict < threshold comparison (not <=).
 */
export function canInterbreed(
  a: Genome,
  b: Genome,
  threshold: number = 0.3,
): boolean {
  if (!a.sexualReproduction || !b.sexualReproduction) return false;
  return geneticDistance(a, b) < threshold;
}

/**
 * Serialize a Genome to a plain dict matching Python's to_dict format.
 * Uses snake_case keys for Python compatibility.
 */
export function toDict(genome: Genome): Record<string, unknown> {
  return {
    size: genome.size,
    shape: genome.shape as string,
    color_hue: genome.colorHue,
    color_sat: genome.colorSat,
    color_val: genome.colorVal,
    base_metabolism: genome.baseMetabolism,
    photosynthesis_rate: genome.photosynthesisRate,
    movement_speed: genome.movementSpeed,
    food_detection_radius: genome.foodDetectionRadius,
    predator_detection_radius: genome.predatorDetectionRadius,
    mate_detection_radius: genome.mateDetectionRadius,
    reproduction_threshold: genome.reproductionThreshold,
    reproduction_cost: genome.reproductionCost,
    sexual_reproduction: genome.sexualReproduction,
    crossover_preference: genome.crossoverPreference,
    mutation_rate: genome.mutationRate,
    mutation_magnitude: genome.mutationMagnitude,
    behavior_tree: genome.behaviorTree.map(nodeToDict),
    species_id: genome.speciesId,
    generation: genome.generation,
    parent_ids: [...genome.parentIds],
  };
}

/**
 * Deserialize a Genome from a dict matching Python's from_dict format.
 * Accepts snake_case keys as produced by Python or by toDict.
 */
export function fromDict(d: Record<string, unknown>): Genome {
  return {
    size: d["size"] as number,
    shape: d["shape"] as Shape,
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
      nodeFromDict,
    ),
    speciesId: d["species_id"] as number,
    generation: d["generation"] as number,
    parentIds: [...(d["parent_ids"] as number[])],
  };
}

/**
 * Create a default behavior tree (survival-focused).
 * Used when a genome's behavior tree is empty.
 */
export { defaultBehaviorTree };

/**
 * Re-export fixTreeReferences for behavior.ts.
 */
export { fixTreeReferences };
