"""Tests for simulation module."""
import pytest

from lineage.config import SimulationConfig
from lineage.simulation import Simulation
from lineage.world import WorldConfig


class TestSimulation:
    def test_simulation_initialization(self):
        config = SimulationConfig(
            world=WorldConfig(width=50, height=50, initial_population=10, initial_food=20, seed=42),
            ticks=100,
            headless=True,
        )
        sim = Simulation(config)
        sim.initialize()
        assert len(sim.world.organisms) == 10
        assert sim.species_tracker.get_species_count() > 0

    def test_run_tick(self):
        config = SimulationConfig(
            world=WorldConfig(width=50, height=50, initial_population=10, initial_food=20, seed=42),
            ticks=100,
            headless=True,
        )
        sim = Simulation(config)
        sim.initialize()
        stats = sim.run_tick()
        assert "population" in stats
        assert stats["tick"] == 1

    def test_organism_lifecycle(self):
        config = SimulationConfig(
            world=WorldConfig(width=50, height=50, initial_population=5, initial_food=10, seed=42),
            ticks=50,
            headless=True,
        )
        sim = Simulation(config)
        sim.initialize()
        for _ in range(50):
            sim.run_tick()
        stats = sim.world.statistics()
        assert stats["total_births"] >= 5

    def test_carrying_capacity(self):
        config = SimulationConfig(
            world=WorldConfig(
                width=30, height=30, initial_population=50, max_population=60,
                initial_food=20, seed=42,
            ),
            ticks=100,
            headless=True,
        )
        sim = Simulation(config)
        sim.initialize()
        max_pop = 0
        for _ in range(100):
            stats = sim.run_tick()
            max_pop = max(max_pop, stats["population"])
        assert max_pop <= 70

    def test_reproduction(self):
        config = SimulationConfig(
            world=WorldConfig(
                width=50, height=50, initial_population=20, max_population=100,
                initial_food=150, food_spawn_rate=0.5, seed=42,
            ),
            ticks=300,
            headless=True,
        )
        sim = Simulation(config)
        sim.initialize()
        for _ in range(300):
            sim.run_tick()
        stats = sim.world.statistics()
        assert stats["total_births"] >= 20

    def test_seed_determinism(self):
        config1 = SimulationConfig(
            world=WorldConfig(width=50, height=50, initial_population=10, initial_food=20, seed=42),
            ticks=50,
            headless=True,
        )
        config2 = SimulationConfig(
            world=WorldConfig(width=50, height=50, initial_population=10, initial_food=20, seed=42),
            ticks=50,
            headless=True,
        )
        sim1 = Simulation(config1)
        sim1.initialize()
        sim2 = Simulation(config2)
        sim2.initialize()

        for _ in range(50):
            s1 = sim1.run_tick()
            s2 = sim2.run_tick()
            assert s1["population"] == s2["population"]
