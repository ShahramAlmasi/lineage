/**
 * Behavior system — condition evaluation, decision tree walking, and action execution.
 * Direct port of Python's simulation.py: _decide, _evaluate_condition, _act.
 */

import { BehaviorAction, BehaviorNodeType } from "./types";
import type { BehaviorNode, Food, Organism, Position } from "./types";
import { distanceTo, directionTo, move } from "../utils/math";
import { PRNG } from "../utils/prng";

// ── Types ──────────────────────────────────────────────────────────────

/** Perception data for one organism, produced by the perception step. */
export interface Perception {
  foodNearby: boolean;
  food: Food | null;
  foodDistance: number;
  predatorNearby: boolean;
  predator: Organism | null;
  predatorDistance: number;
  preyNearby: boolean;
  prey: Organism | null;
  preyDistance: number;
  mateNearby: boolean;
  mate: Organism | null;
  mateDistance: number;
  energy: number;
  position: Position;
}

/** World context needed by act() — injected to keep behavior stateless. */
export interface WorldContext {
  width: number;
  height: number;
  food: Food[];
  organisms: Organism[];
  speciationThreshold: number;
}

/** Callback for reproduction — the caller (Simulation) handles genome ops. */
export type ReproductionCallback = (
  parentA: Organism,
  parentB?: Organism,
) => void;

// ── Condition Evaluation ───────────────────────────────────────────────

/**
 * Evaluate a behavior-tree condition against perception data.
 * Matches Python simulation.py:_evaluate_condition exactly.
 */
export function evaluateCondition(
  condition: BehaviorNodeType,
  threshold: number,
  perception: Perception,
): boolean {
  switch (condition) {
    case BehaviorNodeType.ALWAYS:
      return true;

    case BehaviorNodeType.FOOD_NEARBY:
      return (
        perception.foodNearby && perception.foodDistance <= threshold + 5
      );

    case BehaviorNodeType.PREDATOR_NEARBY:
      return (
        perception.predatorNearby &&
        perception.predatorDistance <= threshold + 5
      );

    case BehaviorNodeType.MATE_NEARBY:
      return (
        perception.mateNearby && perception.mateDistance <= threshold + 5
      );

    case BehaviorNodeType.ENERGY_ABOVE:
      return perception.energy > threshold;

    default:
      return false;
  }
}

// ── Decision ───────────────────────────────────────────────────────────

/**
 * Walk the organism's behavior tree and return the selected action.
 * Matches Python simulation.py:_decide exactly.
 */
export function decideAction(
  organism: Organism,
  perception: Perception,
): BehaviorAction {
  const tree = organism.genome.behaviorTree;
  if (!tree || tree.length === 0) {
    return BehaviorAction.WANDER;
  }

  let nodeIdx = 0;
  for (;;) {
    if (nodeIdx >= tree.length) {
      return BehaviorAction.WANDER;
    }

    const node: BehaviorNode = tree[nodeIdx]!;
    const conditionMet = evaluateCondition(
      node.condition,
      node.threshold,
      perception,
    );

    if (conditionMet) {
      return node.ifTrue;
    }

    // condition not met
    if (node.isLeaf) {
      if (typeof node.ifFalse === "string") {
        // ifFalse is a BehaviorAction (const enum values are strings at runtime)
        return node.ifFalse as BehaviorAction;
      }
      return BehaviorAction.WANDER;
    }

    // branch node — ifFalse is an index (number) or fallback action
    if (typeof node.ifFalse === "number") {
      nodeIdx = node.ifFalse;
    } else {
      return node.ifFalse as BehaviorAction;
    }
  }
}

// ── Action Execution ───────────────────────────────────────────────────

const TWO_PI = 2.0 * Math.PI;

/** Normal movement energy cost multiplier. */
const MOVE_COST = 0.05;
/** Flee/attack energy cost multiplier. */
const FAST_COST = 0.08;
/** Flee speed multiplier. */
const FLEE_SPEED_MULT = 1.5;
/** Distance to pick up food. */
const FOOD_PICKUP_DIST = 1.0;
/** Distance for mate contact. */
const MATE_CONTACT_DIST = 1.0;
/** Attack range. */
const ATTACK_RANGE = 1.5;
/** Energy cap. */
const ENERGY_CAP = 200.0;

/**
 * Execute the chosen action, mutating organism state and world context.
 * Matches Python simulation.py:_act exactly.
 *
 * @param organism   The acting organism (mutated in place).
 * @param action     The action to execute.
 * @param perception Current perception data.
 * @param world      Mutable world context (food list, organism list).
 * @param rng        PRNG for wander angles and stochastic actions.
 * @param onReproduce  Callback for reproduction (sexual & asexual).
 */
export function act(
  organism: Organism,
  action: BehaviorAction,
  perception: Perception,
  world: WorldContext,
  rng: PRNG,
  onReproduce: ReproductionCallback,
): void {
  const w = world.width;
  const h = world.height;

  switch (action) {
    case BehaviorAction.REST:
      // No-op
      break;

    case BehaviorAction.WANDER: {
      const speed = organismSpeed(organism);
      const angle = rng.uniform(0, TWO_PI);
      move(organism.position, Math.cos(angle) * speed, Math.sin(angle) * speed, w, h);
      organism.energy -= speed * MOVE_COST;
      break;
    }

    case BehaviorAction.MOVE_TOWARD_FOOD: {
      const food = perception.food;
      if (food) {
        const { dx, dy } = directionTo(organism.position, food.position, w, h);
        const speed = organismSpeed(organism);
        move(organism.position, dx * speed, dy * speed, w, h);
        organism.energy -= speed * MOVE_COST;
        const dist = distanceTo(organism.position, food.position, w, h);
        if (dist < FOOD_PICKUP_DIST) {
          const idx = world.food.indexOf(food);
          if (idx !== -1) {
            organism.energy += food.energy;
            world.food.splice(idx, 1);
          }
        }
      } else {
        wanderFallback(organism, w, h, rng);
      }
      break;
    }

    case BehaviorAction.MOVE_TOWARD_MATE: {
      const mate = perception.mate;
      if (mate && mate.alive) {
        const { dx, dy } = directionTo(organism.position, mate.position, w, h);
        const speed = organismSpeed(organism);
        move(organism.position, dx * speed, dy * speed, w, h);
        organism.energy -= speed * MOVE_COST;
        const dist = distanceTo(organism.position, mate.position, w, h);
        if (dist < MATE_CONTACT_DIST) {
          onReproduce(organism, mate);
        }
      } else {
        wanderFallback(organism, w, h, rng);
      }
      break;
    }

    case BehaviorAction.FLEE: {
      const predator = perception.predator;
      if (predator) {
        const { dx, dy } = directionTo(organism.position, predator.position, w, h);
        const speed = organismSpeed(organism) * FLEE_SPEED_MULT;
        // Move AWAY from predator (negate direction)
        move(organism.position, -dx * speed, -dy * speed, w, h);
        organism.energy -= speed * FAST_COST;
      } else {
        wanderFallback(organism, w, h, rng);
      }
      break;
    }

    case BehaviorAction.REPRODUCE: {
      if (canReproduce(organism)) {
        if (organism.genome.sexualReproduction) {
          // Find nearby potential mates
          const mates = findNearbyMates(
            organism,
            world.organisms,
            world.speciationThreshold,
            w,
            h,
          );
          if (mates.length > 0) {
            onReproduce(organism, mates[0]);
          } else {
            wanderFallback(organism, w, h, rng);
          }
        } else {
          onReproduce(organism); // asexual
        }
      } else {
        wanderFallback(organism, w, h, rng);
      }
      break;
    }

    case BehaviorAction.ATTACK: {
      const target = perception.prey;
      if (target && target.alive) {
        const { dx, dy } = directionTo(organism.position, target.position, w, h);
        const speed = organismSpeed(organism);
        move(organism.position, dx * speed, dy * speed, w, h);
        organism.energy -= speed * FAST_COST;
        const dist = distanceTo(organism.position, target.position, w, h);
        if (dist < ATTACK_RANGE) {
          const damage = organism.genome.size * 5.0;
          target.energy -= damage;
          organism.energy += damage * 0.5;
          if (target.energy <= 0) {
            target.alive = false;
          }
        }
      } else {
        wanderFallback(organism, w, h, rng);
      }
      break;
    }

    case BehaviorAction.MOVE_TOWARD_CENTER: {
      const center: Position = { x: w / 2, y: h / 2 };
      const { dx, dy } = directionTo(organism.position, center, w, h);
      const speed = organismSpeed(organism);
      move(organism.position, dx * speed, dy * speed, w, h);
      organism.energy -= speed * MOVE_COST;
      break;
    }
  }

  // Energy cap (matches Python: org.energy = min(org.energy, 200.0))
  organism.energy = Math.min(organism.energy, ENERGY_CAP);
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Compute effective speed from organism genome.
 * Matches Python: _effective_speed = movement_speed / max(size * 0.5, 0.5)
 */
export function organismSpeed(organism: Organism): number {
  return organism.genome.movementSpeed / Math.max(organism.genome.size * 0.5, 0.5);
}

/**
 * Check if organism can reproduce.
 * Matches Python: energy >= reproduction_threshold AND ticks_since_reproduction > 50
 */
export function canReproduce(organism: Organism): boolean {
  return (
    organism.energy >= organism.genome.reproductionThreshold &&
    organism.ticksSinceReproduction > 50
  );
}

/**
 * Wander fallback when an action can't proceed (no target).
 * Matches Python: random angle, move at speed, cost speed * 0.05.
 */
function wanderFallback(
  organism: Organism,
  w: number,
  h: number,
  rng: PRNG,
): void {
  const speed = organismSpeed(organism);
  const angle = rng.uniform(0, TWO_PI);
  move(organism.position, Math.cos(angle) * speed, Math.sin(angle) * speed, w, h);
  organism.energy -= speed * MOVE_COST;
}

/**
 * Find nearby organisms that can interbreed with the given organism.
 * Simplified — just finds organisms within mate detection radius.
 * The actual canInterbreed check depends on Genome.geneticDistance
 * which will be implemented in genome.ts. For now we do a simple
 * distance + alive check, and the onReproduce callback handles
 * the full interbreed validation.
 */
function findNearbyMates(
  organism: Organism,
  allOrganisms: Organism[],
  _speciationThreshold: number,
  worldWidth: number,
  worldHeight: number,
): Organism[] {
  const radius = organism.genome.mateDetectionRadius;
  const result: Organism[] = [];

  for (const other of allOrganisms) {
    if (other.id === organism.id || !other.alive) continue;
    const dist = distanceTo(organism.position, other.position, worldWidth, worldHeight);
    if (dist <= radius) {
      result.push(other);
    }
  }

  return result;
}
