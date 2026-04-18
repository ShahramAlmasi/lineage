"""CLI entry point for lineage."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import SimulationConfig, get_preset
from .recording import RecordingReader, RecordingWriter
from .renderer import HeadlessRenderer, RichRenderer, TerminalRenderer
from .simulation import Simulation
from .world import WorldConfig


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="lineage",
        description="Evolutionary simulator - digital organisms compete, mutate, and speciate",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Run a simulation")
    run_parser.add_argument(
        "--world", type=str, default="200x200", help="World size (WxH)"
    )
    run_parser.add_argument(
        "--population", type=int, default=200, help="Initial population"
    )
    run_parser.add_argument(
        "--ticks", type=int, default=100_000, help="Number of ticks to run"
    )
    run_parser.add_argument(
        "--seed", type=int, default=None, help="Random seed"
    )
    run_parser.add_argument(
        "--preset", type=str, default=None, help="Use a preset config"
    )
    run_parser.add_argument(
        "--headless", action="store_true", help="Run without rendering"
    )
    run_parser.add_argument(
        "--output", type=str, default="recording.jsonl", help="Output file"
    )
    run_parser.add_argument(
        "--record-every", type=int, default=100, help="Record every N ticks"
    )
    run_parser.add_argument(
        "--render-every", type=int, default=10, help="Render every N ticks"
    )

    replay_parser = subparsers.add_parser("replay", help="Replay a recording")
    replay_parser.add_argument("recording", type=str, help="Recording file")
    replay_parser.add_argument(
        "--speed", type=float, default=1.0, help="Replay speed multiplier"
    )

    analyze_parser = subparsers.add_parser("analyze", help="Analyze a recording")
    analyze_parser.add_argument("recording", type=str, help="Recording file")

    args = parser.parse_args()

    if args.command == "run":
        return cmd_run(args)
    elif args.command == "replay":
        return cmd_replay(args)
    elif args.command == "analyze":
        return cmd_analyze(args)

    return 0


def cmd_run(args: argparse.Namespace) -> int:
    if args.preset:
        sim_config = get_preset(args.preset)
        if args.seed is not None:
            sim_config.seed = args.seed
        if args.output:
            sim_config.output_file = args.output
    else:
        world_parts = args.world.split("x")
        if len(world_parts) != 2:
            print("Error: --world must be in format WxH (e.g., 200x200)", file=sys.stderr)
            return 1

        width, height = int(world_parts[0]), int(world_parts[1])
        sim_config = SimulationConfig(
            world=WorldConfig(
                width=width,
                height=height,
                initial_population=args.population,
                max_population=args.population * 5,
                initial_food=args.population * 2,
                food_spawn_rate=0.1,
                food_energy=15.0,
                fertile_zones=[(0.5, 0.5, 0.3)],
                carrying_capacity_pressure=0.001,
                speciation_threshold=0.3,
                seed=args.seed,
            ),
            ticks=args.ticks,
            record_every_n_ticks=args.record_every,
            render_every_n_ticks=args.render_every,
            headless=args.headless,
            seed=args.seed,
            output_file=args.output,
        )

    simulation = Simulation(config=sim_config)
    simulation.initialize()

    renderer: HeadlessRenderer | TerminalRenderer | RichRenderer
    if args.headless:
        renderer = HeadlessRenderer()
    else:
        try:
            renderer = RichRenderer()
            renderer.start()
        except Exception:
            renderer = TerminalRenderer()

    writer: RecordingWriter | None = None
    if sim_config.output_file:
        writer = RecordingWriter(sim_config.output_file)

    try:
        for tick in range(1, sim_config.ticks + 1):
            stats = simulation.run_tick()

            if writer and tick % sim_config.record_every_n_ticks == 0:
                writer.write_frame(simulation)

            if renderer.should_render(tick, sim_config.render_every_n_ticks):
                renderer.render(simulation)

            if stats["population"] == 0:
                print(f"\nAll organisms extinct at tick {tick}")
                break

    except KeyboardInterrupt:
        print("\nSimulation interrupted by user")
    finally:
        if writer:
            writer.close()
        if isinstance(renderer, RichRenderer):
            renderer.stop()

    final_stats = simulation.world.statistics()
    print(f"\nSimulation complete!")
    print(f"Final tick: {final_stats['tick']}")
    print(f"Final population: {final_stats['population']}")
    print(f"Species count: {simulation.species_tracker.get_species_count()}")
    print(f"Total births: {final_stats['total_births']}")
    print(f"Total deaths: {final_stats['total_deaths']}")
    if sim_config.output_file:
        print(f"Recording saved to: {sim_config.output_file}")

    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    path = Path(args.recording)
    if not path.exists():
        print(f"Error: Recording file not found: {path}", file=sys.stderr)
        return 1

    reader = RecordingReader(path)
    frames = reader.get_all_frames()
    if not frames:
        print("Error: No frames in recording", file=sys.stderr)
        return 1

    renderer = TerminalRenderer()

    import time

    for i, frame in enumerate(frames):
        renderer._clear_screen()
        print(f"REPLAY — Tick {frame.tick} ({i+1}/{len(frames)})")
        print("=" * 50)

        stats = frame.data["stats"]
        print(f"Population: {stats['population']}")
        print(f"Species: {len([s for s in frame.data['species']['species'].values() if s.get('extinct_at_tick') is None])}")
        print(f"Food: {stats['food_count']}")
        print(f"Avg Energy: {stats['average_energy']:.1f}")

        organisms = frame.data.get("organisms", [])
        food_items = frame.data.get("food", [])

        scale_x = max(1, stats.get("world_width", 200)) / 80
        scale_y = max(1, stats.get("world_height", 200)) / 40

        grid = [[" " for _ in range(80)] for _ in range(40)]
        for f in food_items:
            gx = int(f["x"] / scale_x)
            gy = int(f["y"] / scale_y)
            if 0 <= gx < 80 and 0 <= gy < 40:
                grid[gy][gx] = "."

        for o in organisms:
            gx = int(o["position"]["x"] / scale_x)
            gy = int(o["position"]["y"] / scale_y)
            if 0 <= gx < 80 and 0 <= gy < 40:
                grid[gy][gx] = "o"

        for row in grid:
            print("".join(row))

        time.sleep(0.1 / args.speed)

    return 0


def cmd_analyze(args: argparse.Namespace) -> int:
    path = Path(args.recording)
    if not path.exists():
        print(f"Error: Recording file not found: {path}", file=sys.stderr)
        return 1

    reader = RecordingReader(path)
    summary = reader.get_summary()

    if not summary:
        print("Error: Could not analyze recording", file=sys.stderr)
        return 1

    print("=" * 50)
    print("ANALYSIS REPORT")
    print("=" * 50)
    print(f"Total ticks:        {summary['total_ticks']}")
    print(f"Frames recorded:    {summary['frames_recorded']}")
    print(f"Initial population: {summary['initial_population']}")
    print(f"Final population:   {summary['final_population']}")
    print(f"Max population:     {summary['max_population']}")
    print(f"Min population:     {summary['min_population']}")
    print(f"Max species:        {summary['max_species']}")
    print(f"Speciation events:  {summary['speciation_events']}")
    print(f"Extinction events:  {summary['extinction_events']}")

    frames = reader.get_all_frames()
    if frames:
        last = frames[-1]
        print("\nPhylogenetic Tree:")
        print("-" * 50)
        species_data = last.data.get("species", {})
        for sid, s in species_data.get("species", {}).items():
            status = "EXTINCT" if s.get("extinct_at_tick") else "ALIVE"
            parent = s.get("parent_species_id", "none")
            print(f"  Species {sid}: {status}, parent={parent}, "
                  f"born at t={s.get('created_at_tick', '?')}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
