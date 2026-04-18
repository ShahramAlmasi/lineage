"""Terminal renderer with live dashboard."""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .simulation import Simulation


class Renderer:
    """Base renderer interface."""

    def render(self, simulation: Simulation) -> None:
        raise NotImplementedError

    def should_render(self, tick: int, every_n: int) -> bool:
        return tick % every_n == 0


class HeadlessRenderer(Renderer):
    """No-op renderer for headless runs."""

    def render(self, simulation: Simulation) -> None:
        pass


class TerminalRenderer(Renderer):
    """Simple terminal renderer using ANSI escape codes."""

    def __init__(
        self,
        viewport_width: int = 80,
        viewport_height: int = 40,
        show_stats: bool = True,
        show_events: bool = True,
    ) -> None:
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        self.show_stats = show_stats
        self.show_events = show_events
        self._first_frame = True

    def render(self, simulation: Simulation) -> None:
        if not self._first_frame:
            self._clear_screen()
        self._first_frame = False

        lines = []
        lines.extend(self._render_viewport(simulation))

        if self.show_stats:
            lines.extend(self._render_stats(simulation))

        if self.show_events:
            lines.extend(self._render_events(simulation))

        lines.extend(self._render_phylogeny(simulation))

        sys.stdout.write("\n".join(lines))
        sys.stdout.write("\n")
        sys.stdout.flush()

    def _render_phylogeny(self, simulation: Simulation) -> list[str]:
        tree = simulation.species_tracker.get_phylogenetic_tree_ascii(max_depth=3)
        lines = tree.split("\n")
        if len(lines) > 15:
            lines = lines[:15]
        return [""] + lines

    def _clear_screen(self) -> None:
        sys.stdout.write("\033[2J\033[H")

    def _render_viewport(self, simulation: Simulation) -> list[str]:
        world = simulation.world
        w, h = world.width(), world.height()

        scale_x = w / self.viewport_width
        scale_y = h / self.viewport_height

        grid: list[list[str]] = [
            [" " for _ in range(self.viewport_width)]
            for _ in range(self.viewport_height)
        ]

        for f in world.food:
            gx = int(f.position.x / scale_x)
            gy = int(f.position.y / scale_y)
            if 0 <= gx < self.viewport_width and 0 <= gy < self.viewport_height:
                grid[gy][gx] = "\033[32m.\033[0m"

        for org in world.organisms:
            if not org.alive:
                continue
            gx = int(org.position.x / scale_x)
            gy = int(org.position.y / scale_y)
            if 0 <= gx < self.viewport_width and 0 <= gy < self.viewport_height:
                char = self._organism_char(org)
                color = self._species_color(org.genome.species_id)
                grid[gy][gx] = f"{color}{char}\033[0m"

        border = "+" + "-" * self.viewport_width + "+"
        lines = [border]
        for row in grid:
            lines.append("|" + "".join(row) + "|")
        lines.append(border)
        return lines

    def _organism_char(self, org) -> str:
        from .genome import Shape

        shape_map = {
            Shape.CIRCLE: "o",
            Shape.TRIANGLE: "^",
            Shape.SQUARE: "#",
            Shape.DIAMOND: "+",
        }
        return shape_map.get(org.genome.shape, "o")

    def _species_color(self, species_id: int) -> str:
        colors = [
            "\033[31m",
            "\033[33m",
            "\033[34m",
            "\033[35m",
            "\033[36m",
            "\033[91m",
            "\033[92m",
            "\033[93m",
            "\033[94m",
            "\033[95m",
            "\033[96m",
        ]
        return colors[species_id % len(colors)]

    def _render_stats(self, simulation: Simulation) -> list[str]:
        stats = simulation.world.statistics()
        species_count = simulation.species_tracker.get_species_count()
        species_pops = simulation.species_tracker.get_species_populations()

        alive = [o for o in simulation.world.organisms if o.alive]
        avg_fitness = 0.0
        if alive:
            fitnesses = [o.energy * (1 + o.age / 100.0) for o in alive]
            avg_fitness = sum(fitnesses) / len(fitnesses)

        lines = [
            "",
            "─" * 40,
            "STATS",
            "─" * 40,
            f"Tick:           {stats['tick']}",
            f"Population:     {stats['population']}",
            f"Species:        {species_count}",
            f"Food:           {stats['food_count']}",
            f"Avg Energy:     {stats['average_energy']:.1f}",
            f"Avg Fitness:    {avg_fitness:.1f}",
            f"Avg Age:        {stats['average_age']}",
            f"Max Age:        {stats['max_age']}",
            f"Total Births:   {stats['total_births']}",
            f"Total Deaths:   {stats['total_deaths']}",
        ]

        if species_pops:
            lines.append("Species populations:")
            for sid, pop in sorted(species_pops.items())[:10]:
                lines.append(f"  Species {sid}: {pop}")

        return lines

    def _render_events(self, simulation: Simulation) -> list[str]:
        events = simulation.get_events()[-10:]
        if not events:
            return []

        lines = [
            "",
            "─" * 40,
            "EVENTS",
            "─" * 40,
        ]
        for e in events:
            lines.append(f"[t={e.tick}] {e.message}")
        return lines


class RichRenderer(Renderer):
    """Rich-based terminal renderer (requires rich package)."""

    def __init__(self, viewport_width: int = 100, viewport_height: int = 50) -> None:
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        try:
            from rich.console import Console
            from rich.live import Live
            from rich.table import Table
            from rich.text import Text

            self.console = Console()
            self.live: Live | None = None
            self._has_rich = True
        except ImportError:
            self._has_rich = False
            self._fallback = TerminalRenderer(viewport_width, viewport_height)

    def start(self) -> None:
        if self._has_rich:
            from rich.live import Live
            self.live = Live(console=self.console, refresh_per_second=10)
            self.live.start()

    def stop(self) -> None:
        if self.live:
            self.live.stop()
            self.live = None

    def render(self, simulation: Simulation) -> None:
        if not self._has_rich:
            self._fallback.render(simulation)
            return

        from rich.layout import Layout
        from rich.panel import Panel
        from rich.table import Table
        from rich.text import Text

        stats = simulation.world.statistics()
        species_count = simulation.species_tracker.get_species_count()

        alive = [o for o in simulation.world.organisms if o.alive]
        avg_fitness = 0.0
        if alive:
            fitnesses = [o.energy * (1 + o.age / 100.0) for o in alive]
            avg_fitness = sum(fitnesses) / len(fitnesses)

        table = Table(title=f"Lineage — Tick {stats['tick']}")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="magenta")

        table.add_row("Population", str(stats["population"]))
        table.add_row("Species", str(species_count))
        table.add_row("Food", str(stats["food_count"]))
        table.add_row("Avg Energy", f"{stats['average_energy']:.1f}")
        table.add_row("Avg Fitness", f"{avg_fitness:.1f}")
        table.add_row("Avg Age", str(stats["average_age"]))
        table.add_row("Max Age", str(stats["max_age"]))
        table.add_row("Births", str(stats["total_births"]))
        table.add_row("Deaths", str(stats["total_deaths"]))

        events = simulation.get_events()[-10:]
        event_text = "\n".join(
            [f"[t={e.tick}] {e.message}" for e in events]
        ) if events else "No recent events"

        tree_text = simulation.species_tracker.get_phylogenetic_tree_ascii(max_depth=3)

        layout = Layout()
        layout.split_column(
            Layout(table, name="stats", size=14),
            Layout(name="lower"),
        )
        layout["lower"].split_row(
            Layout(Panel(event_text, title="Events"), name="events"),
            Layout(Panel(tree_text, title="Phylogeny"), name="phylogeny"),
        )

        if self.live:
            self.live.update(layout)
        else:
            self.console.print(layout)
