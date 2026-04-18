"""Genome module: genes, crossover, mutation, and behavior trees."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Callable


class Shape(Enum):
    CIRCLE = auto()
    TRIANGLE = auto()
    SQUARE = auto()
    DIAMOND = auto()


class BehaviorNodeType(Enum):
    FOOD_NEARBY = auto()
    PREDATOR_NEARBY = auto()
    MATE_NEARBY = auto()
    ENERGY_ABOVE = auto()
    ALWAYS = auto()


class BehaviorAction(Enum):
    MOVE_TOWARD_FOOD = auto()
    MOVE_TOWARD_MATE = auto()
    FLEE = auto()
    WANDER = auto()
    REPRODUCE = auto()
    REST = auto()
    MOVE_TOWARD_CENTER = auto()


@dataclass(frozen=True, slots=True)
class BehaviorNode:
    """A node in the behavior decision tree.

    condition: what to check
    threshold: parameter for the condition (e.g., energy threshold)
    if_true: action to take if condition is true
    if_false: next node to evaluate, or action if leaf
    is_leaf: if true, if_false is an action; else it's another node index
    """

    condition: BehaviorNodeType
    threshold: float
    if_true: BehaviorAction
    if_false: BehaviorAction | int  # int = index of next node, BehaviorAction = leaf action
    is_leaf: bool = True


@dataclass(slots=True)
class Genome:
    """The complete genetic blueprint of an organism."""

    # Morphology
    size: float = 1.0  # affects visibility, energy cost, movement speed penalty
    shape: Shape = Shape.CIRCLE
    color_hue: float = 0.0  # 0-360
    color_sat: float = 0.8
    color_val: float = 0.8

    # Metabolism
    base_metabolism: float = 0.1  # energy cost per tick
    photosynthesis_rate: float = 0.0  # energy gained from light per tick
    movement_speed: float = 1.0  # cells per tick

    # Senses
    food_detection_radius: float = 5.0
    predator_detection_radius: float = 5.0
    mate_detection_radius: float = 5.0

    # Reproduction
    reproduction_threshold: float = 50.0  # energy needed to reproduce
    reproduction_cost: float = 30.0  # energy spent on reproduction
    sexual_reproduction: bool = True  # True = sexual, False = asexual
    crossover_preference: float = 0.5  # tendency to mix genes vs clone

    # Mutation (evolvable!)
    mutation_rate: float = 0.05  # probability of mutation per gene
    mutation_magnitude: float = 0.1  # std dev of Gaussian mutation

    # Behavior tree (list of nodes, evaluated in order)
    behavior_tree: list[BehaviorNode] = field(default_factory=list)

    # Speciation tracking
    species_id: int = 0
    generation: int = 0
    parent_ids: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if not self.behavior_tree:
            self.behavior_tree = _default_behavior_tree()

    def genetic_distance(self, other: Genome) -> float:
        """Calculate genetic distance between two genomes."""
        # Morphology distance
        morph_dist = (
            abs(self.size - other.size)
            + abs(self.color_hue - other.color_hue) / 360.0
            + abs(self.color_sat - other.color_sat)
            + abs(self.color_val - other.color_val)
        ) / 4.0

        # Metabolism distance
        meta_dist = (
            abs(self.base_metabolism - other.base_metabolism)
            + abs(self.photosynthesis_rate - other.photosynthesis_rate)
            + abs(self.movement_speed - other.movement_speed)
        ) / 3.0

        # Senses distance
        sense_dist = (
            abs(self.food_detection_radius - other.food_detection_radius)
            + abs(self.predator_detection_radius - other.predator_detection_radius)
            + abs(self.mate_detection_radius - other.mate_detection_radius)
        ) / 15.0  # normalize by typical values

        # Reproduction distance
        repro_dist = (
            abs(self.reproduction_threshold - other.reproduction_threshold) / 100.0
            + abs(self.reproduction_cost - other.reproduction_cost) / 100.0
            + (0.0 if self.sexual_reproduction == other.sexual_reproduction else 1.0)
        ) / 3.0

        # Mutation strategy distance
        mut_dist = (
            abs(self.mutation_rate - other.mutation_rate)
            + abs(self.mutation_magnitude - other.mutation_magnitude)
        ) / 2.0

        # Behavior tree distance (simplified - compare structure)
        bt_dist = _behavior_tree_distance(self.behavior_tree, other.behavior_tree)

        # Weighted average
        return (
            morph_dist * 0.2
            + meta_dist * 0.2
            + sense_dist * 0.15
            + repro_dist * 0.15
            + mut_dist * 0.15
            + bt_dist * 0.15
        )

    def can_interbreed(self, other: Genome, threshold: float = 0.3) -> bool:
        """Check if two organisms can reproduce sexually."""
        if not self.sexual_reproduction or not other.sexual_reproduction:
            return False
        return self.genetic_distance(other) < threshold

    def to_dict(self) -> dict:
        return {
            "size": self.size,
            "shape": self.shape.name,
            "color_hue": self.color_hue,
            "color_sat": self.color_sat,
            "color_val": self.color_val,
            "base_metabolism": self.base_metabolism,
            "photosynthesis_rate": self.photosynthesis_rate,
            "movement_speed": self.movement_speed,
            "food_detection_radius": self.food_detection_radius,
            "predator_detection_radius": self.predator_detection_radius,
            "mate_detection_radius": self.mate_detection_radius,
            "reproduction_threshold": self.reproduction_threshold,
            "reproduction_cost": self.reproduction_cost,
            "sexual_reproduction": self.sexual_reproduction,
            "crossover_preference": self.crossover_preference,
            "mutation_rate": self.mutation_rate,
            "mutation_magnitude": self.mutation_magnitude,
            "behavior_tree": [_node_to_dict(n) for n in self.behavior_tree],
            "species_id": self.species_id,
            "generation": self.generation,
            "parent_ids": list(self.parent_ids),
        }

    @classmethod
    def from_dict(cls, d: dict) -> Genome:
        return cls(
            size=d["size"],
            shape=Shape[d["shape"]],
            color_hue=d["color_hue"],
            color_sat=d["color_sat"],
            color_val=d["color_val"],
            base_metabolism=d["base_metabolism"],
            photosynthesis_rate=d["photosynthesis_rate"],
            movement_speed=d["movement_speed"],
            food_detection_radius=d["food_detection_radius"],
            predator_detection_radius=d["predator_detection_radius"],
            mate_detection_radius=d["mate_detection_radius"],
            reproduction_threshold=d["reproduction_threshold"],
            reproduction_cost=d["reproduction_cost"],
            sexual_reproduction=d["sexual_reproduction"],
            crossover_preference=d["crossover_preference"],
            mutation_rate=d["mutation_rate"],
            mutation_magnitude=d["mutation_magnitude"],
            behavior_tree=[_node_from_dict(n) for n in d["behavior_tree"]],
            species_id=d["species_id"],
            generation=d["generation"],
            parent_ids=tuple(d["parent_ids"]),
        )


def _default_behavior_tree() -> list[BehaviorNode]:
    """Create a default survival-focused behavior tree."""
    return [
        BehaviorNode(
            condition=BehaviorNodeType.PREDATOR_NEARBY,
            threshold=0.0,
            if_true=BehaviorAction.FLEE,
            if_false=1,  # index of next node
            is_leaf=False,
        ),
        BehaviorNode(
            condition=BehaviorNodeType.ENERGY_ABOVE,
            threshold=60.0,
            if_true=BehaviorAction.REPRODUCE,
            if_false=2,
            is_leaf=False,
        ),
        BehaviorNode(
            condition=BehaviorNodeType.FOOD_NEARBY,
            threshold=0.0,
            if_true=BehaviorAction.MOVE_TOWARD_FOOD,
            if_false=BehaviorAction.WANDER,
            is_leaf=True,
        ),
    ]


def _node_to_dict(node: BehaviorNode) -> dict:
    return {
        "condition": node.condition.name,
        "threshold": node.threshold,
        "if_true": node.if_true.name,
        "if_false": (
            node.if_false.name
            if isinstance(node.if_false, BehaviorAction)
            else node.if_false
        ),
        "is_leaf": node.is_leaf,
    }


def _node_from_dict(d: dict) -> BehaviorNode:
    if_true = BehaviorAction[d["if_true"]]
    if_false_raw = d["if_false"]
    if isinstance(if_false_raw, str):
        if_false: BehaviorAction | int = BehaviorAction[if_false_raw]
    else:
        if_false = int(if_false_raw)
    return BehaviorNode(
        condition=BehaviorNodeType[d["condition"]],
        threshold=d["threshold"],
        if_true=if_true,
        if_false=if_false,
        is_leaf=d["is_leaf"],
    )


def _behavior_tree_distance(
    tree_a: list[BehaviorNode], tree_b: list[BehaviorNode]
) -> float:
    """Simplified behavior tree distance."""
    max_len = max(len(tree_a), len(tree_b))
    if max_len == 0:
        return 0.0

    dist = 0.0
    for i in range(max_len):
        if i >= len(tree_a) or i >= len(tree_b):
            dist += 1.0
            continue
        a, b = tree_a[i], tree_b[i]
        if a.condition != b.condition:
            dist += 0.3
        dist += abs(a.threshold - b.threshold) / 100.0
        if a.if_true != b.if_true:
            dist += 0.3
        if a.is_leaf != b.is_leaf:
            dist += 0.2
        elif a.is_leaf and a.if_false != b.if_false:
            dist += 0.2
        elif not a.is_leaf and a.if_false != b.if_false:
            dist += 0.1

    return min(dist / max_len, 1.0)


def crossover(parent_a: Genome, parent_b: Genome) -> Genome:
    """Sexual reproduction: combine two parent genomes."""
    child = Genome(
        size=_blend(parent_a.size, parent_b.size),
        shape=random.choice([parent_a.shape, parent_b.shape]),
        color_hue=_blend_angle(parent_a.color_hue, parent_b.color_hue),
        color_sat=_blend(parent_a.color_sat, parent_b.color_sat),
        color_val=_blend(parent_a.color_val, parent_b.color_val),
        base_metabolism=_blend(
            parent_a.base_metabolism, parent_b.base_metabolism
        ),
        photosynthesis_rate=_blend(
            parent_a.photosynthesis_rate, parent_b.photosynthesis_rate
        ),
        movement_speed=_blend(
            parent_a.movement_speed, parent_b.movement_speed
        ),
        food_detection_radius=_blend(
            parent_a.food_detection_radius, parent_b.food_detection_radius
        ),
        predator_detection_radius=_blend(
            parent_a.predator_detection_radius,
            parent_b.predator_detection_radius,
        ),
        mate_detection_radius=_blend(
            parent_a.mate_detection_radius, parent_b.mate_detection_radius
        ),
        reproduction_threshold=_blend(
            parent_a.reproduction_threshold, parent_b.reproduction_threshold
        ),
        reproduction_cost=_blend(
            parent_a.reproduction_cost, parent_b.reproduction_cost
        ),
        sexual_reproduction=random.choice(
            [parent_a.sexual_reproduction, parent_b.sexual_reproduction]
        ),
        crossover_preference=_blend(
            parent_a.crossover_preference, parent_b.crossover_preference
        ),
        mutation_rate=_blend(
            parent_a.mutation_rate, parent_b.mutation_rate
        ),
        mutation_magnitude=_blend(
            parent_a.mutation_magnitude, parent_b.mutation_magnitude
        ),
        behavior_tree=_crossover_behavior_tree(
            parent_a.behavior_tree, parent_b.behavior_tree
        ),
        generation=max(parent_a.generation, parent_b.generation) + 1,
        parent_ids=(parent_a.species_id, parent_b.species_id),
    )
    return child


def _blend(a: float, b: float) -> float:
    """Blend two values with some randomness."""
    alpha = random.gauss(0.5, 0.15)
    alpha = max(0.0, min(1.0, alpha))
    return a * alpha + b * (1.0 - alpha)


def _blend_angle(a: float, b: float) -> float:
    """Blend two angles (0-360) correctly."""
    # Convert to radians, average as vectors, convert back
    ra, rb = math.radians(a), math.radians(b)
    x = math.cos(ra) + math.cos(rb)
    y = math.sin(ra) + math.sin(rb)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _crossover_behavior_tree(
    tree_a: list[BehaviorNode], tree_b: list[BehaviorNode]
) -> list[BehaviorNode]:
    """Combine two behavior trees."""
    if not tree_a:
        return list(tree_b)
    if not tree_b:
        return list(tree_a)

    # Take prefix from one, suffix from other, or interleave
    if random.random() < 0.5:
        split = random.randint(0, len(tree_a))
        result = tree_a[:split] + tree_b[split:]
    else:
        result = []
        for i in range(max(len(tree_a), len(tree_b))):
            if i < len(tree_a) and i < len(tree_b):
                result.append(random.choice([tree_a[i], tree_b[i]]))
            elif i < len(tree_a):
                result.append(tree_a[i])
            else:
                result.append(tree_b[i])

    # Fix node references
    return _fix_tree_references(result)


def _fix_tree_references(tree: list[BehaviorNode]) -> list[BehaviorNode]:
    """Ensure all node references point to valid indices."""
    result = []
    for i, node in enumerate(tree):
        if not node.is_leaf:
            ref = node.if_false
            if isinstance(ref, int) and ref >= len(tree):
                # Point to a safe leaf action
                new_node = BehaviorNode(
                    condition=node.condition,
                    threshold=node.threshold,
                    if_true=node.if_true,
                    if_false=BehaviorAction.WANDER,
                    is_leaf=True,
                )
                result.append(new_node)
            else:
                result.append(node)
        else:
            result.append(node)
    return result


MUTATION_BOUNDS: dict[str, tuple[float, float]] = {
    "size": (0.1, 5.0),
    "base_metabolism": (0.01, 1.0),
    "photosynthesis_rate": (0.0, 2.0),
    "movement_speed": (0.1, 5.0),
    "food_detection_radius": (0.5, 20.0),
    "predator_detection_radius": (0.5, 20.0),
    "mate_detection_radius": (0.5, 20.0),
    "reproduction_threshold": (10.0, 200.0),
    "reproduction_cost": (5.0, 100.0),
    "crossover_preference": (0.0, 1.0),
    "mutation_rate": (0.001, 0.5),
    "mutation_magnitude": (0.01, 1.0),
    "color_sat": (0.0, 1.0),
    "color_val": (0.0, 1.0),
}


def mutate(genome: Genome, global_mutation_rate: float | None = None) -> Genome:
    """Mutate a genome. Uses the genome's own mutation rate if available."""
    rate = global_mutation_rate if global_mutation_rate is not None else genome.mutation_rate
    magnitude = genome.mutation_magnitude

    g = Genome(
        size=_maybe_mutate(genome.size, rate, magnitude, "size"),
        shape=_maybe_mutate_enum(genome.shape, rate, list(Shape)),
        color_hue=(genome.color_hue + random.gauss(0, magnitude * 360)) % 360,
        color_sat=_maybe_mutate(genome.color_sat, rate, magnitude, "color_sat"),
        color_val=_maybe_mutate(genome.color_val, rate, magnitude, "color_val"),
        base_metabolism=_maybe_mutate(
            genome.base_metabolism, rate, magnitude, "base_metabolism"
        ),
        photosynthesis_rate=_maybe_mutate(
            genome.photosynthesis_rate, rate, magnitude, "photosynthesis_rate"
        ),
        movement_speed=_maybe_mutate(
            genome.movement_speed, rate, magnitude, "movement_speed"
        ),
        food_detection_radius=_maybe_mutate(
            genome.food_detection_radius, rate, magnitude, "food_detection_radius"
        ),
        predator_detection_radius=_maybe_mutate(
            genome.predator_detection_radius, rate, magnitude, "predator_detection_radius"
        ),
        mate_detection_radius=_maybe_mutate(
            genome.mate_detection_radius, rate, magnitude, "mate_detection_radius"
        ),
        reproduction_threshold=_maybe_mutate(
            genome.reproduction_threshold, rate, magnitude, "reproduction_threshold"
        ),
        reproduction_cost=_maybe_mutate(
            genome.reproduction_cost, rate, magnitude, "reproduction_cost"
        ),
        sexual_reproduction=genome.sexual_reproduction
        if random.random() > rate * 0.1
        else not genome.sexual_reproduction,
        crossover_preference=_maybe_mutate(
            genome.crossover_preference, rate, magnitude, "crossover_preference"
        ),
        mutation_rate=_maybe_mutate(
            genome.mutation_rate, rate, magnitude, "mutation_rate"
        ),
        mutation_magnitude=_maybe_mutate(
            genome.mutation_magnitude, rate, magnitude, "mutation_magnitude"
        ),
        behavior_tree=_mutate_behavior_tree(
            genome.behavior_tree, rate, magnitude
        ),
        species_id=genome.species_id,
        generation=genome.generation,
        parent_ids=genome.parent_ids,
    )
    return g


def _maybe_mutate(
    value: float, rate: float, magnitude: float, key: str
) -> float:
    if random.random() > rate:
        return value
    delta = random.gauss(0, magnitude)
    new_val = value + delta
    if key in MUTATION_BOUNDS:
        low, high = MUTATION_BOUNDS[key]
        new_val = max(low, min(high, new_val))
    return new_val


def _maybe_mutate_enum[T](value: T, rate: float, choices: list[T]) -> T:
    if random.random() > rate * 0.3:
        return value
    return random.choice(choices)


def _mutate_behavior_tree(
    tree: list[BehaviorNode], rate: float, magnitude: float
) -> list[BehaviorNode]:
    if not tree:
        return tree

    new_tree = []
    for node in tree:
        if random.random() < rate * 0.2:
            continue

        new_node = node
        if random.random() < rate:
            new_node = BehaviorNode(
                condition=node.condition,
                threshold=max(0, node.threshold + random.gauss(0, magnitude * 50)),
                if_true=node.if_true,
                if_false=node.if_false,
                is_leaf=node.is_leaf,
            )

        if random.random() < rate * 0.3:
            new_node = BehaviorNode(
                condition=new_node.condition,
                threshold=new_node.threshold,
                if_true=random.choice(list(BehaviorAction)),
                if_false=new_node.if_false,
                is_leaf=new_node.is_leaf,
            )

        new_tree.append(new_node)

    if random.random() < rate * 0.1 and len(new_tree) < 10:
        new_tree.append(
            BehaviorNode(
                condition=random.choice(list(BehaviorNodeType)),
                threshold=random.gauss(50, 20),
                if_true=random.choice(list(BehaviorAction)),
                if_false=random.choice(list(BehaviorAction)),
                is_leaf=True,
            )
        )

    return _fix_tree_references(new_tree)


def random_genome(seed: int | None = None) -> Genome:
    """Generate a completely random genome."""
    if seed is not None:
        random.seed(seed)

    return Genome(
        size=random.uniform(0.5, 2.0),
        shape=random.choice(list(Shape)),
        color_hue=random.uniform(0, 360),
        color_sat=random.uniform(0.3, 1.0),
        color_val=random.uniform(0.3, 1.0),
        base_metabolism=random.uniform(0.05, 0.3),
        photosynthesis_rate=random.uniform(0.0, 0.5),
        movement_speed=random.uniform(0.5, 2.0),
        food_detection_radius=random.uniform(2.0, 10.0),
        predator_detection_radius=random.uniform(2.0, 10.0),
        mate_detection_radius=random.uniform(2.0, 10.0),
        reproduction_threshold=random.uniform(30.0, 80.0),
        reproduction_cost=random.uniform(15.0, 40.0),
        sexual_reproduction=random.random() > 0.3,
        crossover_preference=random.uniform(0.3, 0.7),
        mutation_rate=random.uniform(0.01, 0.15),
        mutation_magnitude=random.uniform(0.05, 0.3),
        behavior_tree=_random_behavior_tree(),
        generation=0,
    )


def _random_behavior_tree() -> list[BehaviorNode]:
    """Generate a random behavior tree."""
    n_nodes = random.randint(2, 5)
    tree = []
    for i in range(n_nodes):
        is_leaf = i == n_nodes - 1 or random.random() > 0.5
        tree.append(
            BehaviorNode(
                condition=random.choice(list(BehaviorNodeType)),
                threshold=random.gauss(50, 20),
                if_true=random.choice(list(BehaviorAction)),
                if_false=random.choice(list(BehaviorAction))
                if is_leaf
                else random.randint(i + 1, n_nodes),
                is_leaf=is_leaf,
            )
        )
    return _fix_tree_references(tree)
