"""Configuration and presets for world simulation."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .world import WorldConfig


@dataclass
class SimulationConfig:
    """Configuration for a simulation run."""

    world: WorldConfig
    ticks: int = 100_000
    record_every_n_ticks: int = 100
    headless: bool = False
    render_every_n_ticks: int = 10
    seed: int | None = None
    output_file: str | None = None


PRIMORDIAL_SOUP = SimulationConfig(
    world=WorldConfig(
        width=100,
        height=100,
        initial_population=100,
        max_population=500,
        initial_food=300,
        food_spawn_rate=0.15,
        food_energy=20.0,
        fertile_zones=[(0.5, 0.5, 0.4)],
        carrying_capacity_pressure=0.0005,
        speciation_threshold=0.25,
    ),
    ticks=50_000,
    record_every_n_ticks=50,
)

PANGEA = SimulationConfig(
    world=WorldConfig(
        width=300,
        height=300,
        initial_population=200,
        max_population=1500,
        initial_food=800,
        food_spawn_rate=0.08,
        food_energy=15.0,
        fertile_zones=[
            (0.3, 0.3, 0.2),
            (0.7, 0.7, 0.2),
        ],
        carrying_capacity_pressure=0.002,
        speciation_threshold=0.35,
    ),
    ticks=100_000,
    record_every_n_ticks=100,
)

PRESSURE_COOKER = SimulationConfig(
    world=WorldConfig(
        width=150,
        height=150,
        initial_population=150,
        max_population=400,
        initial_food=200,
        food_spawn_rate=0.05,
        food_energy=10.0,
        fertile_zones=[(0.5, 0.5, 0.15)],
        carrying_capacity_pressure=0.005,
        speciation_threshold=0.3,
    ),
    ticks=75_000,
    record_every_n_ticks=75,
)

PRESETS: dict[str, SimulationConfig] = {
    "primordial_soup": PRIMORDIAL_SOUP,
    "pangea": PANGEA,
    "pressure_cooker": PRESSURE_COOKER,
}


def get_preset(name: str) -> SimulationConfig:
    if name not in PRESETS:
        available = ", ".join(PRESETS.keys())
        raise ValueError(f"Unknown preset '{name}'. Available: {available}")
    return PRESETS[name]
