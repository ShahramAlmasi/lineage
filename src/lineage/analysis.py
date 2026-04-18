"""Post-hoc analysis of simulation recordings."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .recording import RecordingReader


@dataclass
class SpeciesLifespan:
    species_id: int
    born_tick: int
    extinct_tick: int | None
    peak_population: int
    parent_id: int | None


@dataclass
class FitnessTrajectory:
    tick: int
    average_fitness: float
    max_fitness: float
    min_fitness: float


class Analyzer:
    """Analyze a simulation recording."""

    def __init__(self, recording_path: str | Path) -> None:
        self.reader = RecordingReader(recording_path)
        self.frames = self.reader.get_all_frames()

    def species_lifespans(self) -> list[SpeciesLifespan]:
        """Calculate lifespan for each species."""
        species_data: dict[int, dict[str, Any]] = {}

        for frame in self.frames:
            tick = frame.tick
            sp = frame.data.get("species", {})
            for sid_str, s in sp.get("species", {}).items():
                sid = int(sid_str)
                if sid not in species_data:
                    species_data[sid] = {
                        "born": s["created_at_tick"],
                        "extinct": s.get("extinct_at_tick"),
                        "peak_pop": 0,
                        "parent": s.get("parent_species_id"),
                    }
                species_data[sid]["peak_pop"] = max(
                    species_data[sid]["peak_pop"],
                    s.get("member_count", 0),
                )
                if s.get("extinct_at_tick") is not None:
                    species_data[sid]["extinct"] = s["extinct_at_tick"]

        return [
            SpeciesLifespan(
                species_id=sid,
                born_tick=data["born"],
                extinct_tick=data.get("extinct"),
                peak_population=data["peak_pop"],
                parent_id=data["parent"],
            )
            for sid, data in sorted(species_data.items())
        ]

    def fitness_over_time(self) -> list[FitnessTrajectory]:
        """Track fitness metrics over time."""
        trajectories = []
        for frame in self.frames:
            organisms = frame.data.get("organisms", [])
            if not organisms:
                continue
            energies = [o["energy"] for o in organisms]
            ages = [o["age"] for o in organisms]
            fitnesses = [
                e * (1 + a / 100.0) for e, a in zip(energies, ages)
            ]
            trajectories.append(
                FitnessTrajectory(
                    tick=frame.tick,
                    average_fitness=sum(fitnesses) / len(fitnesses),
                    max_fitness=max(fitnesses),
                    min_fitness=min(fitnesses),
                )
            )
        return trajectories

    def extinction_events(self) -> list[dict]:
        """List all extinction events."""
        events = []
        for frame in self.frames:
            for e in frame.data.get("events", []):
                if "extinct" in e.get("message", "").lower():
                    events.append(
                        {
                            "tick": e["tick"],
                            "message": e["message"],
                        }
                    )
        return events

    def speciation_events(self) -> list[dict]:
        """List all speciation events."""
        events = []
        for frame in self.frames:
            for e in frame.data.get("events", []):
                msg = e.get("message", "")
                if "diverged" in msg.lower() or "new species" in msg.lower():
                    events.append(
                        {
                            "tick": e["tick"],
                            "message": e["message"],
                        }
                    )
        return events

    def diversity_metrics(self) -> dict:
        """Calculate diversity metrics."""
        if not self.frames:
            return {}

        first = self.frames[0]
        last = self.frames[-1]

        first_organisms = first.data.get("organisms", [])
        last_organisms = last.data.get("organisms", [])

        first_species = len(
            set(o["genome"]["species_id"] for o in first_organisms)
        )
        last_species = len(
            set(o["genome"]["species_id"] for o in last_organisms)
        )

        return {
            "initial_species": first_species,
            "final_species": last_species,
            "species_turnover": last_species - first_species,
            "total_frames": len(self.frames),
        }
