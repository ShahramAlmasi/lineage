"""JSONL recording and replay for simulation states."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from .simulation import Simulation


@dataclass
class RecordingFrame:
    tick: int
    data: dict


class RecordingWriter:
    """Writes simulation frames to a JSONL file."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._file = open(self.path, "w")
        self.frames_written = 0
        self._last_event_index = 0

    def write_frame(self, simulation: Simulation) -> None:
        stats = simulation.world.statistics()
        stats["world_width"] = simulation.world.config.width
        stats["world_height"] = simulation.world.config.height

        new_events = simulation.events[self._last_event_index:]
        self._last_event_index = len(simulation.events)

        frame = {
            "tick": simulation._tick,
            "organisms": [
                o.to_dict() for o in simulation.world.organisms if o.alive
            ],
            "food": [
                {"x": f.position.x, "y": f.position.y, "energy": f.energy}
                for f in simulation.world.food
            ],
            "stats": stats,
            "species": simulation.species_tracker.to_dict(),
            "events": [
                {"tick": e.tick, "message": e.message, "type": e.event_type}
                for e in new_events
            ],
        }
        self._file.write(json.dumps(frame) + "\n")
        self.frames_written += 1

    def close(self) -> None:
        self._file.close()

    def __enter__(self) -> RecordingWriter:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class RecordingReader:
    """Reads simulation frames from a JSONL file."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def __iter__(self) -> Iterator[RecordingFrame]:
        with open(self.path, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                data = json.loads(line)
                yield RecordingFrame(tick=data["tick"], data=data)

    def get_frame(self, tick: int) -> RecordingFrame | None:
        for frame in self:
            if frame.tick == tick:
                return frame
        return None

    def get_all_frames(self) -> list[RecordingFrame]:
        return list(self)

    def get_summary(self) -> dict:
        frames = self.get_all_frames()
        if not frames:
            return {}

        first = frames[0]
        last = frames[-1]

        populations = [f.data["stats"]["population"] for f in frames]
        species_counts = [
            len(
                [
                    s
                    for s in f.data["species"]["species"].values()
                    if s["extinct_at_tick"] is None
                ]
            )
            for f in frames
        ]

        seen_events: set[tuple[int, str]] = set()
        all_events = []
        for f in frames:
            for e in f.data.get("events", []):
                key = (e["tick"], e["message"])
                if key not in seen_events:
                    seen_events.add(key)
                    all_events.append(e)

        speciation_events = [e for e in all_events if e["type"] == "speciation"]
        extinctions = [
            e
            for e in all_events
            if "extinct" in e["message"].lower()
        ]

        return {
            "total_ticks": last.tick,
            "frames_recorded": len(frames),
            "initial_population": first.data["stats"]["population"],
            "final_population": last.data["stats"]["population"],
            "max_population": max(populations),
            "min_population": min(populations),
            "max_species": max(species_counts) if species_counts else 0,
            "speciation_events": len(speciation_events),
            "extinction_events": len(extinctions),
        }
