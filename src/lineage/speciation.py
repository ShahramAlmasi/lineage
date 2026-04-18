"""Speciation tracking: species assignment, divergence, extinction events."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .genome import Genome
    from .world import Organism


@dataclass
class Species:
    """A species is a group of genetically compatible organisms."""

    id: int
    representative_genome: Genome
    member_ids: set[int] = field(default_factory=set)
    created_at_tick: int = 0
    extinct_at_tick: int | None = None
    parent_species_id: int | None = None
    generation_spawned: int = 0

    @property
    def is_extinct(self) -> bool:
        return self.extinct_at_tick is not None

    @property
    def population(self) -> int:
        return len(self.member_ids)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "member_count": len(self.member_ids),
            "created_at_tick": self.created_at_tick,
            "extinct_at_tick": self.extinct_at_tick,
            "parent_species_id": self.parent_species_id,
            "generation_spawned": self.generation_spawned,
        }


@dataclass
class SpeciationEvent:
    """Record of a speciation event."""

    tick: int
    new_species_id: int
    parent_species_id: int | None
    reason: str


@dataclass
class ExtinctionEvent:
    """Record of an extinction event."""

    tick: int
    species_id: int
    final_population: int
    lifespan_ticks: int


class SpeciesTracker:
    """Tracks species assignments, speciation, and extinction."""

    def __init__(self, threshold: float = 0.3) -> None:
        self.threshold = threshold
        self.species: dict[int, Species] = {}
        self.next_species_id = 1
        self.speciation_events: list[SpeciationEvent] = []
        self.extinction_events: list[ExtinctionEvent] = []
        self.phylogeny: dict[int, int | None] = {}

    def assign_species(self, organism: Organism, tick: int) -> int:
        """Assign a species to an organism. Returns the species ID."""
        genome = organism.genome

        best_species_id: int | None = None
        best_distance = float("inf")

        for species_id, species in self.species.items():
            if species.is_extinct:
                continue
            dist = genome.genetic_distance(species.representative_genome)
            if dist < self.threshold and dist < best_distance:
                best_distance = dist
                best_species_id = species_id

        if best_species_id is not None:
            self.species[best_species_id].member_ids.add(organism.id)
            organism.genome.species_id = best_species_id
            return best_species_id

        new_id = self._create_new_species(genome, tick, None)
        self.species[new_id].member_ids.add(organism.id)
        organism.genome.species_id = new_id
        return new_id

    def _create_new_species(
        self, genome: Genome, tick: int, parent_id: int | None
    ) -> int:
        species_id = self.next_species_id
        self.next_species_id += 1

        species = Species(
            id=species_id,
            representative_genome=genome,
            created_at_tick=tick,
            parent_species_id=parent_id,
            generation_spawned=genome.generation,
        )
        self.species[species_id] = species
        self.phylogeny[species_id] = parent_id

        self.speciation_events.append(
            SpeciationEvent(
                tick=tick,
                new_species_id=species_id,
                parent_species_id=parent_id,
                reason="genetic_divergence",
            )
        )
        return species_id

    def update_species(self, organisms: list[Organism], tick: int) -> list[str]:
        """Update species membership, detect extinctions and new splits.

        Returns list of event messages.
        """
        events: list[str] = []
        alive_ids = {o.id for o in organisms if o.alive}

        for species in self.species.values():
            if species.is_extinct:
                continue

            old_members = species.member_ids
            new_members = old_members & alive_ids

            if not new_members:
                species.extinct_at_tick = tick
                lifespan = tick - species.created_at_tick
                self.extinction_events.append(
                    ExtinctionEvent(
                        tick=tick,
                        species_id=species.id,
                        final_population=0,
                        lifespan_ticks=lifespan,
                    )
                )
                events.append(
                    f"Species {species.id} went extinct (t={tick}, "
                    f"lifespan={lifespan})"
                )
            else:
                species.member_ids = new_members

        species_organisms: dict[int, list[Organism]] = {}
        for org in organisms:
            if org.alive:
                sid = org.genome.species_id
                species_organisms.setdefault(sid, []).append(org)

        for species_id, members in species_organisms.items():
            if species_id not in self.species:
                continue
            if self.species[species_id].is_extinct:
                continue

            if len(members) < 2:
                continue

            rep = self.species[species_id].representative_genome
            diverged: list[Organism] = []
            for org in members:
                dist = org.genome.genetic_distance(rep)
                if dist >= self.threshold * 1.5:
                    diverged.append(org)

            if diverged and len(diverged) < len(members):
                new_id = self._create_new_species(
                    diverged[0].genome, tick, species_id
                )
                for org in diverged:
                    self.species[species_id].member_ids.discard(org.id)
                    self.species[new_id].member_ids.add(org.id)
                    org.genome.species_id = new_id

                events.append(
                    f"New species {new_id} diverged from species {species_id} "
                    f"(t={tick}, {len(diverged)} members)"
                )

        return events

    def get_species_count(self) -> int:
        return sum(1 for s in self.species.values() if not s.is_extinct)

    def get_species_populations(self) -> dict[int, int]:
        return {
            s.id: s.population
            for s in self.species.values()
            if not s.is_extinct
        }

    def get_phylogenetic_tree_ascii(self, max_depth: int = 5) -> str:
        """Generate ASCII art phylogenetic tree."""
        lines: list[str] = []
        lines.append("Phylogenetic Tree")
        lines.append("=" * 30)

        roots = [
            sid for sid, parent in self.phylogeny.items() if parent is None
        ]

        def render_node(sid: int, depth: int, prefix: str) -> None:
            if depth > max_depth:
                return
            species = self.species.get(sid)
            if not species:
                return
            status = "EXTINCT" if species.is_extinct else f"pop={species.population}"
            lines.append(f"{prefix}Species {sid} [{status}]")
            children = [
                child for child, parent in self.phylogeny.items() if parent == sid
            ]
            for i, child in enumerate(children):
                is_last = i == len(children) - 1
                child_prefix = prefix + ("    " if is_last else "│   ")
                branch = "└── " if is_last else "├── "
                render_node(child, depth + 1, child_prefix[:-4] + branch)

        for root in roots:
            render_node(root, 0, "")
            lines.append("")

        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "threshold": self.threshold,
            "species": {
                sid: s.to_dict() for sid, s in self.species.items()
            },
            "speciation_events": [
                {
                    "tick": e.tick,
                    "new_species_id": e.new_species_id,
                    "parent_species_id": e.parent_species_id,
                    "reason": e.reason,
                }
                for e in self.speciation_events
            ],
            "extinction_events": [
                {
                    "tick": e.tick,
                    "species_id": e.species_id,
                    "final_population": e.final_population,
                    "lifespan_ticks": e.lifespan_ticks,
                }
                for e in self.extinction_events
            ],
            "phylogeny": self.phylogeny,
        }
