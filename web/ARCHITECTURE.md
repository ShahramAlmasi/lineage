# Architecture

## Project Structure
```
src/
  simulation/     # Core simulation engine
    types.ts      # Domain types
    config.ts     # Presets and configuration
    genome.ts     # Genome system
    world.ts      # World system
    behavior.ts   # Behavior system
    spatial-hash.ts
    simulation.ts # Simulation loop
    speciation.ts # Speciation tracker
    recording.ts  # Recording engine
  components/
    World3D.tsx       # 3D scene
    CameraControls.tsx
    LODOrganisms.tsx
    OrganismMesh.tsx
    Environment.tsx
    PostProcessing.tsx
    HUD/              # UI components
      StatsPanel.tsx
      EventLog.tsx
      PlaybackControls.tsx
      ParameterPanel.tsx
      PhylogenyTree.tsx
      EducationalOverlay.tsx
      GenomeInspector.tsx
      ComparisonView.tsx
      RecordingLoader.tsx
      HelpPanel.tsx
  workers/
    simulation.worker.ts  # Web Worker
  store/
    SimulationContext.tsx # React context
  utils/
    math.ts       # Toroidal math
    prng.ts       # Seeded PRNG
```

## Key Decisions
- Ported from Python CLI for native browser performance
- Seeded PRNG matches Python's random.Random
- Web Worker runs simulation off main thread
- InstancedMesh for organism rendering (performance)
- LOD system for scaling to 500+ organisms
- React Context for state management (lightweight)
