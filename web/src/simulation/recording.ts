/**
 * Recording system for Lineage simulation — JSONL format.
 * Compatible with Python recording.py: TS RecordingReader parses
 * Python-generated .jsonl, and TS RecordingWriter output is
 * parseable by Python RecordingReader.
 *
 * Format: one JSON object per line. Each line is a frame snapshot.
 * No header, no trailer — pure JSONL frames only.
 */

export interface RecordedOrganism {
  id: number;
  genome: RecordedGenome;
  position: { x: number; y: number };
  energy: number;
  age: number;
  alive: boolean;
  generation: number;
}

export interface RecordedGenome {
  size: number;
  shape: string;
  color_hue: number;
  color_sat: number;
  color_val: number;
  base_metabolism: number;
  photosynthesis_rate: number;
  movement_speed: number;
  food_detection_radius: number;
  predator_detection_radius: number;
  mate_detection_radius: number;
  reproduction_threshold: number;
  reproduction_cost: number;
  sexual_reproduction: boolean;
  crossover_preference: number;
  mutation_rate: number;
  mutation_magnitude: number;
  behavior_tree: RecordedBehaviorNode[];
  species_id: number;
  generation: number;
  parent_ids: number[];
}

export interface RecordedBehaviorNode {
  condition: string;
  threshold: number;
  if_true: string;
  if_false: string | number;
  is_leaf: boolean;
}

export interface RecordedFood {
  x: number;
  y: number;
  energy: number;
}

/**
 * Python has field variations: some recordings use `stats.food`, some `stats.food_count`.
 * Both accepted on read; writer always emits `food_count`.
 */
export interface RecordedStats {
  population: number;
  food_count: number;
  food?: number;
  average_energy: number;
  average_age: number;
  max_age: number;
  total_births: number;
  total_deaths: number;
  tick: number;
  world_width: number;
  world_height: number;
}

/**
 * Serialized species — Python's Species.to_dict() uses `member_count` (int),
 * NOT `member_ids`. Does NOT include `representative_genome`.
 */
export interface RecordedSpecies {
  id: number;
  member_count: number;
  created_at_tick: number;
  extinct_at_tick: number | null;
  parent_species_id: number | null;
  generation_spawned: number;
}

export interface RecordedSpeciationEvent {
  tick: number;
  new_species_id: number;
  parent_species_id: number | null;
  reason: string;
}

export interface RecordedExtinctionEvent {
  tick: number;
  species_id: number;
  final_population: number;
  lifespan_ticks: number;
}

export interface RecordedSpeciesData {
  threshold: number;
  species: Record<string, RecordedSpecies>;
  speciation_events: RecordedSpeciationEvent[];
  extinction_events: RecordedExtinctionEvent[];
  phylogeny: Record<string, number | null>;
}

/**
 * Events in recordings use key `"type"` (Python maps `event_type` attr → `"type"` in JSON).
 */
export interface RecordedEvent {
  tick: number;
  message: string;
  type: string;
}

export interface RecordingFrame {
  tick: number;
  organisms: RecordedOrganism[];
  food: RecordedFood[];
  stats: RecordedStats;
  species: RecordedSpeciesData;
  events: RecordedEvent[];
}

export interface RecordingSummary {
  total_ticks: number;
  frames_recorded: number;
  initial_population: number;
  final_population: number;
  max_population: number;
  min_population: number;
  max_species: number;
  speciation_events: number;
  extinction_events: number;
}

export function getFoodCount(stats: RecordedStats): number {
  return stats.food_count ?? stats.food ?? 0;
}

/**
 * Input types for building a frame from simulation state.
 * Uses camelCase TS types; writer converts to snake_case JSON.
 */
export interface WorldState {
  tick: number;
  organisms: Array<{
    id: number;
    genome: {
      toDict: () => RecordedGenome;
    };
    position: { x: number; y: number };
    energy: number;
    age: number;
    alive: boolean;
    generation: number;
  }>;
  food: Array<{
    position: { x: number; y: number };
    energy: number;
  }>;
  statistics: () => {
    population: number;
    food_count: number;
    average_energy: number;
    average_age: number;
    max_age: number;
    total_births: number;
    total_deaths: number;
    tick: number;
  };
  config: { width: number; height: number };
}

export interface SpeciesTrackerState {
  toDict: () => RecordedSpeciesData;
}

export class RecordingWriter {
  private _lines: string[] = [];
  private _lastEventIndex = 0;

  constructor(private _path?: string) {}

  writeFrame(frame: RecordingFrame): void {
    this._lines.push(JSON.stringify(frame));
  }

  /**
   * Build a RecordingFrame from simulation world state objects.
   * Mirrors Python's RecordingWriter.write_frame(simulation).
   * Handles incremental events: only new events since last writeFrameFromWorld call are included.
   */
  writeFrameFromWorld(
    world: WorldState,
    allEvents: RecordedEvent[],
    speciesTracker: SpeciesTrackerState,
  ): void {
    const stats = world.statistics();
    const newEvents = allEvents.slice(this._lastEventIndex);
    this._lastEventIndex = allEvents.length;

    const frame = RecordingWriter.buildFrame({
      tick: world.tick,
      organisms: world.organisms
        .filter((o) => o.alive)
        .map((o) => ({
          id: o.id,
          genome: o.genome.toDict(),
          position: { x: o.position.x, y: o.position.y },
          energy: o.energy,
          age: o.age,
          alive: o.alive,
          generation: o.generation,
        })),
      food: world.food.map((f) => ({
        x: f.position.x,
        y: f.position.y,
        energy: f.energy,
      })),
      stats: {
        ...stats,
        world_width: world.config.width,
        world_height: world.config.height,
      },
      species: speciesTracker.toDict(),
      events: newEvents,
    });

    this.writeFrame(frame);
  }

  static buildFrame(opts: {
    tick: number;
    organisms: RecordedOrganism[];
    food: RecordedFood[];
    stats: RecordedStats;
    species: RecordedSpeciesData;
    events: RecordedEvent[];
  }): RecordingFrame {
    return { ...opts };
  }

  toString(): string {
    return this._lines.join("\n") + (this._lines.length > 0 ? "\n" : "");
  }

  getLines(): string[] {
    return [...this._lines];
  }

  get frameCount(): number {
    return this._lines.length;
  }

  toBlob(): Blob {
    return new Blob([this.toString()], { type: "application/x-jsonlines" });
  }

  async save(path?: string): Promise<void> {
    const target = path ?? this._path;
    if (!target) throw new Error("No path specified for save()");

    if (typeof window === "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = await import(/* webpackIgnore: true */ "node:fs/promises" as unknown as string);
      const nodeFs = fs.default ?? fs;
      const dir = target.substring(0, target.lastIndexOf("/"));
      if (dir) await nodeFs.mkdir(dir, { recursive: true });
      await nodeFs.writeFile(target, this.toString(), "utf-8");
    } else {
      const blob = this.toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = target.split("/").pop() ?? "recording.jsonl";
      a.click();
      URL.revokeObjectURL(url);
    }
  }
}

export class RecordingReader {
  private _frames: RecordingFrame[] = [];
  private _loaded = false;

  constructor(private _path?: string) {}

  private _reset(): void {
    this._frames = [];
    this._loaded = false;
  }

  loadFromString(text: string): void {
    this._reset();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        this._frames.push(JSON.parse(trimmed) as RecordingFrame);
      } catch (err) {
        console.warn(`RecordingReader: skipping malformed line: ${trimmed}`, err);
      }
    }
    this._loaded = true;
  }

  async loadFromFile(file: File): Promise<void> {
    const text = await file.text();
    this.loadFromString(text);
  }

  async load(path?: string): Promise<void> {
    const target = path ?? this._path;
    if (!target) throw new Error("No path specified for load()");

    if (typeof window === "undefined") {
      const fs = await import(/* webpackIgnore: true */ "node:fs/promises" as unknown as string);
      const nodeFs = fs.default ?? fs;
      const text = await nodeFs.readFile(target, "utf-8");
      this.loadFromString(text);
    } else {
      const resp = await fetch(target);
      this.loadFromString(await resp.text());
    }
  }

  getAllFrames(): RecordingFrame[] {
    this._ensureLoaded();
    return [...this._frames];
  }

  getFrame(tick: number): RecordingFrame | undefined {
    this._ensureLoaded();
    return this._frames.find((f) => f.tick === tick);
  }

  getNearestFrame(tick: number): RecordingFrame | undefined {
    this._ensureLoaded();
    let best: RecordingFrame | undefined;
    for (const f of this._frames) {
      if (f.tick <= tick) best = f;
      else break;
    }
    return best;
  }

  get frameCount(): number {
    return this._frames.length;
  }

  /** Matches Python RecordingReader.get_summary() logic exactly. */
  getSummary(): RecordingSummary {
    this._ensureLoaded();

    if (this._frames.length === 0) {
      return {
        total_ticks: 0,
        frames_recorded: 0,
        initial_population: 0,
        final_population: 0,
        max_population: 0,
        min_population: 0,
        max_species: 0,
        speciation_events: 0,
        extinction_events: 0,
      };
    }

    let maxPop = 0;
    let minPop = Infinity;
    let maxSpecies = 0;
    const seenEvents = new Set<string>();
    let totalSpeciation = 0;
    let totalExtinction = 0;

    for (const frame of this._frames) {
      const pop = frame.stats.population;
      if (pop > maxPop) maxPop = pop;
      if (pop < minPop) minPop = pop;

      const livingSpecies = Object.values(frame.species.species).filter(
        (s) => s.extinct_at_tick === null || s.extinct_at_tick === undefined
      ).length;
      if (livingSpecies > maxSpecies) maxSpecies = livingSpecies;

      for (const ev of frame.events) {
        const key = `${ev.tick}:${ev.message}`;
        if (seenEvents.has(key)) continue;
        seenEvents.add(key);
        if (ev.type === "speciation") totalSpeciation++;
        if (ev.message.toLowerCase().includes("extinct")) totalExtinction++;
      }
    }

    return {
      total_ticks: this._frames[this._frames.length - 1].tick,
      frames_recorded: this._frames.length,
      initial_population: this._frames[0].stats.population,
      final_population: this._frames[this._frames.length - 1].stats.population,
      max_population: maxPop,
      min_population: minPop === Infinity ? 0 : minPop,
      max_species: maxSpecies,
      speciation_events: totalSpeciation,
      extinction_events: totalExtinction,
    };
  }

  [Symbol.iterator](): Iterator<RecordingFrame> {
    this._ensureLoaded();
    return this._frames[Symbol.iterator]();
  }

  private _ensureLoaded(): void {
    if (!this._loaded) {
      throw new Error("RecordingReader: not loaded. Call load() or loadFromString() first.");
    }
  }
}
