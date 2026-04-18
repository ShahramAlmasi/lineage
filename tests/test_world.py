"""Tests for world module."""
import pytest

from lineage.genome import random_genome
from lineage.world import Food, Organism, Position, World, WorldConfig


class TestPosition:
    def test_toroidal_distance(self):
        a = Position(1, 1)
        b = Position(199, 199)
        dist = a.distance_to(b, 200, 200)
        assert dist == pytest.approx(2.828, abs=0.01)

    def test_direction_toroidal(self):
        a = Position(10, 10)
        b = Position(190, 10)
        dx, dy = a.direction_to(b, 200, 200)
        assert dx < 0

    def test_move_wrap(self):
        p = Position(195, 195)
        p.move(10, 10, 200, 200)
        assert p.x == pytest.approx(5, abs=0.1)
        assert p.y == pytest.approx(5, abs=0.1)


class TestOrganism:
    def test_organism_creation(self):
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(10, 10))
        assert org.energy > 0
        assert org.alive

    def test_metabolism_cost(self):
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(0, 0))
        cost = org.metabolism_cost()
        assert cost > 0

    def test_can_reproduce(self):
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(0, 0))
        org.energy = 100
        org.ticks_since_reproduction = 100
        assert org.can_reproduce()

    def test_mark_dead(self):
        genome = random_genome(seed=42)
        org = Organism(id=1, genome=genome, position=Position(0, 0))
        org.mark_dead()
        assert not org.alive


class TestWorld:
    def test_world_initialization(self):
        config = WorldConfig(width=50, height=50, initial_population=10, initial_food=20, seed=42)
        world = World(config=config)
        world.initialize()
        assert len(world.organisms) == 10
        assert len(world.food) == 20

    def test_nearby_food(self):
        config = WorldConfig(width=100, height=100, seed=42)
        world = World(config=config)
        world.food = [Food(position=Position(10, 10), energy=10)]
        nearby = world.nearby_food(Position(10, 10), 5)
        assert len(nearby) == 1

    def test_nearby_organisms(self):
        config = WorldConfig(width=100, height=100, seed=42)
        world = World(config=config)
        genome = random_genome(seed=42)
        world.organisms = [
            Organism(id=1, genome=genome, position=Position(10, 10)),
            Organism(id=2, genome=genome, position=Position(12, 12)),
        ]
        nearby = world.nearby_organisms(Position(10, 10), 5, exclude_id=1)
        assert len(nearby) == 1

    def test_remove_dead(self):
        config = WorldConfig(width=50, height=50, seed=42)
        world = World(config=config)
        genome = random_genome(seed=42)
        world.organisms = [
            Organism(id=1, genome=genome, position=Position(0, 0)),
            Organism(id=2, genome=genome, position=Position(1, 1)),
        ]
        world.organisms[0].mark_dead()
        world.remove_dead()
        assert len(world.organisms) == 1
        assert world.total_deaths == 1

    def test_statistics(self):
        config = WorldConfig(width=50, height=50, seed=42)
        world = World(config=config)
        genome = random_genome(seed=42)
        world.organisms = [
            Organism(id=1, genome=genome, position=Position(0, 0), energy=50),
            Organism(id=2, genome=genome, position=Position(1, 1), energy=30),
        ]
        stats = world.statistics()
        assert stats["population"] == 2
        assert stats["average_energy"] == 40.0
