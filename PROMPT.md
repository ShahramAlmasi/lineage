# 🧬 lineage — Evolutionary Simulator

Build a from-scratch evolutionary simulation where digital organisms compete, mutate, reproduce, and speciate inside a 2D world — rendered as a terminal animation in real time.

## The organism

Each creature is a genome: a list of genes that encode:
- **Morphology**: size, shape (circle/polygon), color (visible in the render)
- **Metabolism**: energy cost per tick (bigger = hungrier), photosynthesis ability, movement speed
- **Senses**: detection radius for food, predators, mates
- **Behavior tree**: a tiny decision graph encoded in the genome — `if(food_nearby → move_toward, else → wander, if(predator_nearby → flee, if(energy > threshold → reproduce)))`
- **Reproduction**: sexual (two parents, crossover + mutation) or asexual (clonal + mutation), determined by a gene

## The world

- 2D grid, toroidal (wraps around)
- Food spawns stochastically, more near fertile zones
- Each tick: every organism perceives, decides, acts (move, eat, attack, reproduce, rest)
- Energy is the currency: moving costs energy, eating gains energy, reproducing costs a lot
- Death when energy hits zero
- **Carrying capacity**: the world pushes back. Overpopulation → food scarcity → dieoffs → boom/bust cycles

## What to render

Terminal-rendered (curses or textual) with a live dashboard:
- **Main viewport**: colored dots/shapes for organisms, green patches for food, color-coded by species (auto-clustered by genetic distance)
- **Stats panel**: population count, species count, average fitness, age of oldest living organism, total births/deaths
- **Phylogenetic tree**: every N generations, snapshot the species tree and render it as ASCII art on the side
- **Event log**: "Species 7 went extinct (t=4,203)", "New species 12 diverged from species 3 (t=6,891)"

## The science

- **Speciation**: organisms that can still interbreed share a species tag. When genetic distance exceeds a threshold, they split. Track this properly.
- **Mutation rates** are themselves encoded in the genome — mutation rate evolves. Some lineages will go hypermutator, some will go conservative. Both strategies should be viable.
- **Emergent phenomena to watch for**: predator-prey arms races, mimicry, parasitism, symbiosis, extinction cascades, adaptive radiation after a dieoff

## CLI

```
lineage run --world 200x200 --population 200 --ticks 100000 --seed 42
lineage replay recording.json   # replay a simulation
lineage analyze recording.json  # post-hoc: species lifespans, fitness over time, extinction events
```

## Engineering bar

- Pure Python. No external deps for the simulation core (just `dataclasses`, `random`, `math`, `json`).
- Optional `rich` or `textual` for the live render
- Dump full state to JSONL every N ticks for replay/analysis
- `pyproject.toml`, typed throughout, tested (simulation logic is highly testable — fitness functions, crossover, speciation thresholds)
- Ship 3 preset world configs: "primordial soup" (small, fast, high mutation), "pangea" (large, sparse, stable), "pressure cooker" (scarce food, aggressive selection)

## Working directory

This project lives at `~/dev/lineage`. Initialize a git repo. Commit incrementally with meaningful messages as you build. Target something that feels like a real tool, not a demo.

## Execution notes

- Build incrementally: genome first, then world, then simulation loop, then renderer, then CLI, then analysis tools
- Make it run. A working simulation with ugly output is worth more than a beautiful design document
- Test as you go — genome crossover, mutation, speciation logic are all highly testable
- The simulation should be headless-first: the core must work without the renderer, the renderer is a view on top
- Don't over-abstract. Start concrete, refactor when patterns emerge
