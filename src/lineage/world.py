"""World model: Organisms, Food, and the 2D toroidal grid."""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .genome import Genome


@dataclass(slots=True)
class Position:
    x: float
    y: float

    def distance_to(self, other: Position, world_width: float, world_height: float) -> float:
        """Toroidal distance to another position."""
        dx = abs(self.x - other.x)
        dy = abs(self.y - other.y)
        dx = min(dx, world_width - dx)
        dy = min(dy, world_height - dy)
        return math.hypot(dx, dy)

    def direction_to(self, other: Position, world_width: float, world_height: float) -> tuple[float, float]:
        """Return normalized direction vector to another position (toroidal)."""
        dx = other.x - self.x
        dy = other.y - self.y

        if dx > world_width / 2:
            dx -= world_width
        elif dx < -world_width / 2:
            dx += world_width
        if dy > world_height / 2:
            dy -= world_height
        elif dy < -world_height / 2:
            dy += world_height

        dist = math.hypot(dx, dy)
        if dist == 0:
            return (0.0, 0.0)
        return (dx / dist, dy / dist)

    def move(self, dx: float, dy: float, world_width: float, world_height: float) -> None:
        """Move with toroidal wrapping."""
        self.x = (self.x + dx) % world_width
        self.y = (self.y + dy) % world_height


@dataclass(slots=True)
class Food:
    position: Position
    energy: float = 10.0
    age: int = 0


@dataclass(slots=True)
class Organism:
    """A living organism in the world."""

    id: int
    genome: Genome
    position: Position
    energy: float = 50.0
    age: int = 0
    alive: bool = True
    generation: int = 0
    ticks_since_reproduction: int = 0

    _energy_cost_per_tick: float = field(init=False)
    _effective_speed: float = field(init=False)

    def __post_init__(self) -> None:
        self._update_derived()

    def _update_derived(self) -> None:
        self._energy_cost_per_tick = (
            self.genome.base_metabolism * (1.0 + self.genome.size * 0.3)
        )
        self._effective_speed = self.genome.movement_speed / max(
            self.genome.size * 0.5, 0.5
        )

    def metabolism_cost(self) -> float:
        return self._energy_cost_per_tick

    def speed(self) -> float:
        return self._effective_speed

    def can_reproduce(self) -> bool:
        return (
            self.energy >= self.genome.reproduction_threshold
            and self.ticks_since_reproduction > 50
        )

    def reproduce_cost(self) -> float:
        return self.genome.reproduction_cost

    def photosynthesis_gain(self) -> float:
        return self.genome.photosynthesis_rate

    def mark_dead(self) -> None:
        self.alive = False

    def tick(self) -> None:
        """Age the organism by one tick."""
        self.age += 1
        self.ticks_since_reproduction += 1

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "genome": self.genome.to_dict(),
            "position": {"x": self.position.x, "y": self.position.y},
            "energy": self.energy,
            "age": self.age,
            "alive": self.alive,
            "generation": self.generation,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Organism:
        from .genome import Genome

        return cls(
            id=d["id"],
            genome=Genome.from_dict(d["genome"]),
            position=Position(d["position"]["x"], d["position"]["y"]),
            energy=d["energy"],
            age=d["age"],
            alive=d["alive"],
            generation=d["generation"],
        )


@dataclass
class WorldConfig:
    """Configuration for the world."""

    width: int = 200
    height: int = 200
    initial_population: int = 200
    max_population: int = 1000
    initial_food: int = 500
    food_spawn_rate: float = 0.1
    food_energy: float = 15.0
    food_cluster_size: float = 5.0
    fertile_zones: list[tuple[float, float, float]] = field(
        default_factory=lambda: [(0.5, 0.5, 0.3)]
    )
    carrying_capacity_pressure: float = 0.001
    seed: int | None = None
    speciation_threshold: float = 0.3
    max_ticks: int = 100_000
    record_every_n_ticks: int = 100


@dataclass
class SpatialHash:
    """Grid-based spatial hash for fast neighbor queries."""

    def __init__(self, cell_size: float, width: float, height: float) -> None:
        self.cell_size = cell_size
        self.width = width
        self.height = height
        self.cells: dict[tuple[int, int], list[object]] = {}

    def _cell(self, x: float, y: float) -> tuple[int, int]:
        return (int(x // self.cell_size), int(y // self.cell_size))

    def add(self, obj: object, x: float, y: float) -> None:
        cell = self._cell(x, y)
        self.cells.setdefault(cell, []).append(obj)

    def clear(self) -> None:
        self.cells.clear()

    def query(
        self, x: float, y: float, radius: float
    ) -> list[object]:
        results = []
        r_cells = int(radius // self.cell_size) + 1
        cx, cy = self._cell(x, y)
        for dx in range(-r_cells, r_cells + 1):
            for dy in range(-r_cells, r_cells + 1):
                cell = (cx + dx, cy + dy)
                if cell in self.cells:
                    results.extend(self.cells[cell])
        return results


@dataclass
class World:
    """The simulation world."""

    config: WorldConfig
    organisms: list[Organism] = field(default_factory=list)
    food: list[Food] = field(default_factory=list)
    next_organism_id: int = 1
    tick_count: int = 0
    total_births: int = 0
    total_deaths: int = 0
    rng: random.Random = field(init=False)
    _organism_hash: SpatialHash = field(init=False)
    _food_hash: SpatialHash = field(init=False)

    def __post_init__(self) -> None:
        self.rng = random.Random(self.config.seed)
        self._organism_hash = SpatialHash(10.0, self.width(), self.height())
        self._food_hash = SpatialHash(10.0, self.width(), self.height())

    def width(self) -> float:
        return float(self.config.width)

    def height(self) -> float:
        return float(self.config.height)

    def spawn_food(self, count: int | None = None) -> None:
        if count is None:
            current_pop = len(self.organisms)
            carrying_capacity = self.config.max_population
            pressure = current_pop / carrying_capacity
            target_food = int(
                self.config.initial_food * (1.0 - pressure * self.config.carrying_capacity_pressure * 10)
            )
            target_food = max(50, target_food)
            count = max(0, target_food - len(self.food))

        for _ in range(count):
            if self.config.fertile_zones and self.rng.random() < 0.7:
                zone = self.rng.choice(self.config.fertile_zones)
                zx, zy, zr = zone
                x = self.rng.gauss(zx * self.config.width, zr * self.config.width)
                y = self.rng.gauss(zy * self.config.height, zr * self.config.height)
            else:
                x = self.rng.uniform(0, self.config.width)
                y = self.rng.uniform(0, self.config.height)

            x = x % self.config.width
            y = y % self.config.height

            self.food.append(
                Food(
                    position=Position(x, y),
                    energy=self.config.food_energy * self.rng.uniform(0.5, 1.5),
                )
            )

    def spawn_organism(self, genome: Genome | None = None, position: Position | None = None) -> Organism:
        """Spawn a new organism."""
        if genome is None:
            from .genome import random_genome
            genome = random_genome()

        if position is None:
            x = self.rng.uniform(0, self.config.width)
            y = self.rng.uniform(0, self.config.height)
            position = Position(x, y)

        org = Organism(
            id=self.next_organism_id,
            genome=genome,
            position=position,
            energy=self.rng.uniform(30.0, 70.0),
            generation=genome.generation,
        )
        self.next_organism_id += 1
        self.organisms.append(org)
        self.total_births += 1
        return org

    def initialize(self) -> None:
        """Initialize the world with starting organisms and food."""
        self.spawn_food(self.config.initial_food)
        for _ in range(self.config.initial_population):
            self.spawn_organism()

    def rebuild_spatial_hash(self) -> None:
        self._organism_hash.clear()
        self._food_hash.clear()
        for o in self.organisms:
            if o.alive:
                self._organism_hash.add(o, o.position.x, o.position.y)
        for f in self.food:
            self._food_hash.add(f, f.position.x, f.position.y)

    def nearby_food(self, position: Position, radius: float) -> list[Food]:
        candidates = self._food_hash.query(position.x, position.y, radius)
        w, h = self.width(), self.height()
        return [
            c for c in candidates
            if isinstance(c, Food)
            and position.distance_to(c.position, w, h) <= radius
        ]

    def nearby_organisms(self, position: Position, radius: float, exclude_id: int | None = None) -> list[Organism]:
        candidates = self._organism_hash.query(position.x, position.y, radius)
        w, h = self.width(), self.height()
        return [
            c for c in candidates
            if isinstance(c, Organism) and c.alive
            and c.id != exclude_id
            and position.distance_to(c.position, w, h) <= radius
        ]

    def remove_dead(self) -> None:
        dead_count = sum(1 for o in self.organisms if not o.alive)
        self.total_deaths += dead_count
        self.organisms = [o for o in self.organisms if o.alive]
        self.food = [f for f in self.food if f.age < 5000]

    def statistics(self) -> dict[str, float | int]:
        """Get current world statistics."""
        alive = [o for o in self.organisms if o.alive]
        if not alive:
            return {
                "population": 0,
                "food_count": len(self.food),
                "average_energy": 0.0,
                "average_age": 0,
                "max_age": 0,
                "total_births": self.total_births,
                "total_deaths": self.total_deaths,
                "tick": self.tick_count,
            }

        energies = [o.energy for o in alive]
        ages = [o.age for o in alive]

        return {
            "population": len(alive),
            "food_count": len(self.food),
            "average_energy": sum(energies) / len(energies),
            "average_age": sum(ages) // len(ages),
            "max_age": max(ages),
            "total_births": self.total_births,
            "total_deaths": self.total_deaths,
            "tick": self.tick_count,
        }

    def to_dict(self) -> dict:
        return {
            "config": {
                "width": self.config.width,
                "height": self.config.height,
                "seed": self.config.seed,
            },
            "tick_count": self.tick_count,
            "total_births": self.total_births,
            "total_deaths": self.total_deaths,
            "organisms": [o.to_dict() for o in self.organisms if o.alive],
            "food": [
                {"x": f.position.x, "y": f.position.y, "energy": f.energy}
                for f in self.food
            ],
        }

    @classmethod
    def from_dict(cls, d: dict) -> World:
        config = WorldConfig(
            width=d["config"]["width"],
            height=d["config"]["height"],
            seed=d["config"]["seed"],
        )
        world = World(config=config)
        world.tick_count = d["tick_count"]
        world.total_births = d["total_births"]
        world.total_deaths = d["total_deaths"]
        for od in d["organisms"]:
            world.organisms.append(Organism.from_dict(od))
        for fd in d["food"]:
            world.food.append(Food(Position(fd["x"], fd["y"]), fd["energy"]))
        return world
