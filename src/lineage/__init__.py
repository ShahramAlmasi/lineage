"""Evolutionary simulator — digital organisms compete, mutate, and speciate."""

__version__ = "0.1.0"

from .config import SimulationConfig, get_preset
from .genome import Genome, crossover, mutate, random_genome
from .recording import RecordingReader, RecordingWriter
from .renderer import HeadlessRenderer, TerminalRenderer
from .simulation import Simulation
from .speciation import SpeciesTracker
from .world import Organism, Position, World, WorldConfig

__all__ = [
    "Genome",
    "crossover",
    "mutate",
    "random_genome",
    "Organism",
    "Position",
    "World",
    "WorldConfig",
    "SpeciesTracker",
    "Simulation",
    "SimulationConfig",
    "HeadlessRenderer",
    "TerminalRenderer",
    "RecordingWriter",
    "RecordingReader",
    "get_preset",
]
