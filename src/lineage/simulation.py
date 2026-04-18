"""Simulation engine: tick loop, perception, actions, energy economy."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .genome import BehaviorAction, BehaviorNodeType, Genome, crossover, mutate
from .speciation import SpeciesTracker
from .world import Food, Organism, Position, World, WorldConfig

if TYPE_CHECKING:
    from .config import SimulationConfig


@dataclass
class SimulationEvent:
    tick: int
    message: str
    event_type: str = "info"


class Simulation:
    """Main simulation loop."""

    def __init__(self, config: SimulationConfig) -> None:
        self.config = config
        self.world = World(config=config.world)
        self.species_tracker = SpeciesTracker(
            threshold=config.world.speciation_threshold
        )
        self.events: list[SimulationEvent] = []
        self.rng = random.Random(config.seed)
        self._tick = 0

    def initialize(self) -> None:
        self.world.initialize()
        for org in self.world.organisms:
            self.species_tracker.assign_species(org, tick=0)

    def run_tick(self) -> dict[str, float | int]:
        self._tick += 1
        self.world.tick_count = self._tick

        self.world.rebuild_spatial_hash()

        if self.rng.random() < self.world.config.food_spawn_rate:
            self.world.spawn_food()

        for org in list(self.world.organisms):
            if not org.alive:
                continue

            self._process_organism(org)

        self.world.remove_dead()

        speciation_events = self.species_tracker.update_species(
            self.world.organisms, self._tick
        )
        for msg in speciation_events:
            self.events.append(
                SimulationEvent(self._tick, msg, "speciation")
            )

        for f in self.world.food:
            f.age += 1

        self._apply_carrying_capacity()

        return self.world.statistics()

    def _process_organism(self, org: Organism) -> None:
        """Process a single organism for one tick."""
        org.tick()

        org.energy -= org.metabolism_cost()
        org.energy += org.photosynthesis_gain()

        if org.energy <= 0:
            org.mark_dead()
            return

        perception = self._perceive(org)
        action = self._decide(org, perception)
        self._act(org, action, perception)

        org.energy = min(org.energy, 200.0)

    def _perceive(self, org: Organism) -> dict[str, Any]:
        """Gather sensory information for an organism."""
        pos = org.position
        width, height = self.world.width(), self.world.height()

        nearby_food = self.world.nearby_food(
            pos, org.genome.food_detection_radius
        )
        nearby_organisms = self.world.nearby_organisms(
            pos, max(
                org.genome.predator_detection_radius,
                org.genome.mate_detection_radius,
            ),
            exclude_id=org.id,
        )

        predators = [
            o for o in nearby_organisms
            if o.genome.size > org.genome.size * 1.2
        ]
        mates = [
            o for o in nearby_organisms
            if o.genome.can_interbreed(
                org.genome, self.world.config.speciation_threshold
            )
        ]

        closest_food = None
        closest_food_dist = float("inf")
        for f in nearby_food:
            d = pos.distance_to(f.position, width, height)
            if d < closest_food_dist:
                closest_food_dist = d
                closest_food = f

        closest_predator = None
        closest_predator_dist = float("inf")
        for p in predators:
            d = pos.distance_to(p.position, width, height)
            if d < closest_predator_dist:
                closest_predator_dist = d
                closest_predator = p

        closest_mate = None
        closest_mate_dist = float("inf")
        for m in mates:
            d = pos.distance_to(m.position, width, height)
            if d < closest_mate_dist:
                closest_mate_dist = d
                closest_mate = m

        return {
            "food_nearby": closest_food is not None,
            "food": closest_food,
            "food_distance": closest_food_dist,
            "predator_nearby": closest_predator is not None,
            "predator": closest_predator,
            "predator_distance": closest_predator_dist,
            "mate_nearby": closest_mate is not None,
            "mate": closest_mate,
            "mate_distance": closest_mate_dist,
            "energy": org.energy,
            "position": pos,
        }

    def _decide(
        self, org: Organism, perception: dict[str, Any]
    ) -> BehaviorAction:
        """Evaluate behavior tree to decide action."""
        tree = org.genome.behavior_tree
        if not tree:
            return BehaviorAction.WANDER

        node_idx = 0
        while True:
            if node_idx >= len(tree):
                return BehaviorAction.WANDER

            node = tree[node_idx]
            condition_met = self._evaluate_condition(
                node.condition, node.threshold, perception
            )

            if condition_met:
                return node.if_true
            else:
                if node.is_leaf:
                    if isinstance(node.if_false, BehaviorAction):
                        return node.if_false
                    return BehaviorAction.WANDER
                else:
                    if isinstance(node.if_false, int):
                        node_idx = node.if_false
                    else:
                        return node.if_false

    def _evaluate_condition(
        self,
        condition: BehaviorNodeType,
        threshold: float,
        perception: dict[str, Any],
    ) -> bool:
        if condition == BehaviorNodeType.ALWAYS:
            return True
        if condition == BehaviorNodeType.FOOD_NEARBY:
            return perception["food_nearby"] and perception["food_distance"] <= threshold + 5
        if condition == BehaviorNodeType.PREDATOR_NEARBY:
            return perception["predator_nearby"] and perception["predator_distance"] <= threshold + 5
        if condition == BehaviorNodeType.MATE_NEARBY:
            return perception["mate_nearby"] and perception["mate_distance"] <= threshold + 5
        if condition == BehaviorNodeType.ENERGY_ABOVE:
            return perception["energy"] > threshold
        return False

    def _act(
        self,
        org: Organism,
        action: BehaviorAction,
        perception: dict[str, Any],
    ) -> None:
        width, height = self.world.width(), self.world.height()

        if action == BehaviorAction.REST:
            pass

        elif action == BehaviorAction.WANDER:
            angle = self.rng.uniform(0, 2 * math.pi)
            speed = org.speed()
            dx = math.cos(angle) * speed
            dy = math.sin(angle) * speed
            org.position.move(dx, dy, width, height)
            org.energy -= speed * 0.05

        elif action == BehaviorAction.MOVE_TOWARD_FOOD:
            food = perception.get("food")
            if food:
                dx, dy = org.position.direction_to(
                    food.position, width, height
                )
                speed = org.speed()
                org.position.move(dx * speed, dy * speed, width, height)
                org.energy -= speed * 0.05
                dist = org.position.distance_to(food.position, width, height)
                if dist < 1.0 and food in self.world.food:
                    org.energy += food.energy
                    self.world.food.remove(food)
            else:
                angle = self.rng.uniform(0, 2 * math.pi)
                speed = org.speed()
                org.position.move(
                    math.cos(angle) * speed,
                    math.sin(angle) * speed,
                    width,
                    height,
                )
                org.energy -= speed * 0.05

        elif action == BehaviorAction.MOVE_TOWARD_MATE:
            mate = perception.get("mate")
            if mate and mate.alive:
                dx, dy = org.position.direction_to(
                    mate.position, width, height
                )
                speed = org.speed()
                org.position.move(dx * speed, dy * speed, width, height)
                org.energy -= speed * 0.05
                dist = org.position.distance_to(mate.position, width, height)
                if dist < 1.0:
                    self._attempt_reproduction(org, mate)
            else:
                angle = self.rng.uniform(0, 2 * math.pi)
                speed = org.speed()
                org.position.move(
                    math.cos(angle) * speed,
                    math.sin(angle) * speed,
                    width,
                    height,
                )
                org.energy -= speed * 0.05

        elif action == BehaviorAction.FLEE:
            predator = perception.get("predator")
            if predator:
                dx, dy = org.position.direction_to(
                    predator.position, width, height
                )
                speed = org.speed() * 1.5
                org.position.move(-dx * speed, -dy * speed, width, height)
                org.energy -= speed * 0.08
            else:
                angle = self.rng.uniform(0, 2 * math.pi)
                speed = org.speed()
                org.position.move(
                    math.cos(angle) * speed,
                    math.sin(angle) * speed,
                    width,
                    height,
                )
                org.energy -= speed * 0.05

        elif action == BehaviorAction.REPRODUCE:
            if org.can_reproduce():
                self._asexual_reproduction(org)
            else:
                angle = self.rng.uniform(0, 2 * math.pi)
                speed = org.speed()
                org.position.move(
                    math.cos(angle) * speed,
                    math.sin(angle) * speed,
                    width,
                    height,
                )
                org.energy -= speed * 0.05

        elif action == BehaviorAction.MOVE_TOWARD_CENTER:
            cx, cy = width / 2, height / 2
            dx, dy = org.position.direction_to(
                Position(cx, cy), width, height
            )
            speed = org.speed()
            org.position.move(dx * speed, dy * speed, width, height)
            org.energy -= speed * 0.05

    def _attempt_reproduction(
        self, parent_a: Organism, parent_b: Organism
    ) -> None:
        """Attempt sexual reproduction between two organisms."""
        if not parent_a.can_reproduce() or not parent_b.can_reproduce():
            return
        if not parent_a.genome.can_interbreed(
            parent_b.genome, self.world.config.speciation_threshold
        ):
            return

        child_genome = crossover(parent_a.genome, parent_b.genome)
        child_genome = mutate(child_genome)

        parent_a.energy -= parent_a.reproduce_cost()
        parent_b.energy -= parent_b.reproduce_cost()
        parent_a.ticks_since_reproduction = 0
        parent_b.ticks_since_reproduction = 0

        child = self.world.spawn_organism(
            genome=child_genome,
            position=Position(parent_a.position.x, parent_a.position.y),
        )
        self.species_tracker.assign_species(child, self._tick)

    def _asexual_reproduction(self, parent: Organism) -> None:
        """Asexual reproduction: clone + mutate."""
        child_genome = mutate(parent.genome)
        parent.energy -= parent.reproduce_cost()
        parent.ticks_since_reproduction = 0

        child = self.world.spawn_organism(
            genome=child_genome,
            position=Position(parent.position.x, parent.position.y),
        )
        self.species_tracker.assign_species(child, self._tick)

    def _apply_carrying_capacity(self) -> None:
        current_pop = len([o for o in self.world.organisms if o.alive])
        max_pop = self.world.config.max_population
        ratio = current_pop / max_pop
        if ratio > 0.7:
            pressure = (ratio - 0.7) / 0.3
            for org in self.world.organisms:
                if org.alive:
                    org.energy -= org.metabolism_cost() * pressure * 2.0
                    if self.rng.random() < pressure * 0.3:
                        org.energy -= 2.0
                    if org.energy <= 0:
                        org.mark_dead()

    def run(self, max_ticks: int | None = None) -> None:
        """Run the simulation for the specified number of ticks."""
        if max_ticks is None:
            max_ticks = self.config.ticks

        for _ in range(max_ticks):
            if self._tick >= max_ticks:
                break
            self.run_tick()

    def get_events(self) -> list[SimulationEvent]:
        return self.events

    def to_dict(self) -> dict:
        return {
            "tick": self._tick,
            "world": self.world.to_dict(),
            "species": self.species_tracker.to_dict(),
            "events": [
                {"tick": e.tick, "message": e.message, "type": e.event_type}
                for e in self.events[-100:]
            ],
        }
