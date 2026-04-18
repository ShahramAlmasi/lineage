# lineage

Evolutionary simulator — digital organisms compete, mutate, and speciate in a 2D toroidal world.

## Installation

```bash
pip install -e .
```

## Usage

```bash
# Run a simulation with defaults
lineage run --world 200x200 --population 200 --ticks 100000 --seed 42

# Use a preset
lineage run --preset primordial_soup
lineage run --preset pangea
lineage run --preset pressure_cooker

# Replay a recording
lineage replay recording.jsonl

# Analyze a recording
lineage analyze recording.jsonl
```

## Presets

- **primordial_soup**: Small, fast, high mutation
- **pangea**: Large, sparse, stable
- **pressure_cooker**: Scarce food, aggressive selection

## Development

```bash
python -m pytest tests/
```
