import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  RecordingReader,
  RecordingWriter,
  getFoodCount,
  type RecordingFrame,
  type RecordedOrganism,
  type WorldState,
  type SpeciesTrackerState,
} from "../recording";

const __dirname = dirname(fileURLToPath(import.meta.url));
const recordingText = readFileSync(join(__dirname, "fixtures", "test-recording.jsonl"), "utf-8");

describe("RecordingReader parses Python-generated .jsonl", () => {
  it("loads all frames without errors", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    expect(reader.frameCount).toBe(10);
  });

  it("first frame has correct tick", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const frames = reader.getAllFrames();
    expect(frames[0].tick).toBe(100);
  });

  it("last frame has correct tick", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const frames = reader.getAllFrames();
    expect(frames[frames.length - 1].tick).toBe(1000);
  });

  it("all frame fields are accessible", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const frame = reader.getFrame(100)!;

    expect(frame.tick).toBe(100);
    expect(Array.isArray(frame.organisms)).toBe(true);
    expect(frame.organisms.length).toBeGreaterThan(0);
    expect(Array.isArray(frame.food)).toBe(true);
    expect(frame.food.length).toBeGreaterThan(0);
    expect(typeof frame.stats).toBe("object");
    expect(typeof frame.species).toBe("object");
    expect(Array.isArray(frame.events)).toBe(true);
  });

  it("organism fields match Python structure", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const org = reader.getAllFrames()[0].organisms[0];

    const keys = Object.keys(org) as (keyof RecordedOrganism)[];
    expect(keys).toContain("id");
    expect(keys).toContain("genome");
    expect(keys).toContain("position");
    expect(keys).toContain("energy");
    expect(keys).toContain("age");
    expect(keys).toContain("alive");
    expect(keys).toContain("generation");
  });

  it("stats include world_width and world_height", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const stats = reader.getFrame(100)!.stats;

    expect(stats.world_width).toBe(200);
    expect(stats.world_height).toBe(200);
    expect(stats.population).toBeGreaterThan(0);
    expect(stats.food_count).toBeGreaterThan(0);
  });

  it("species data has threshold and phylogeny", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const species = reader.getFrame(100)!.species;

    expect(typeof species.threshold).toBe("number");
    expect(typeof species.species).toBe("object");
    expect(Array.isArray(species.speciation_events)).toBe(true);
    expect(Array.isArray(species.extinction_events)).toBe(true);
    expect(typeof species.phylogeny).toBe("object");
  });

  it("species entries use member_count (not member_ids)", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const speciesMap = reader.getFrame(100)!.species.species;
    const firstSpecies = Object.values(speciesMap)[0];

    expect("member_count" in firstSpecies).toBe(true);
    expect("member_ids" in firstSpecies).toBe(false);
    expect("representative_genome" in firstSpecies).toBe(false);
  });

  it("events use 'type' key (not 'event_type')", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const allEvents = reader
      .getAllFrames()
      .flatMap((f) => f.events);

    for (const ev of allEvents) {
      expect("type" in ev).toBe(true);
      expect("event_type" in ev).toBe(false);
    }
  });

  it("getFrame returns correct frame for known ticks", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);

    expect(reader.getFrame(100)).toBeDefined();
    expect(reader.getFrame(500)).toBeDefined();
    expect(reader.getFrame(1000)).toBeDefined();
    expect(reader.getFrame(999)).toBeUndefined();
  });

  it("getNearestFrame finds closest frame", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);

    expect(reader.getNearestFrame(150)?.tick).toBe(100);
    expect(reader.getNearestFrame(500)?.tick).toBe(500);
    expect(reader.getNearestFrame(2000)?.tick).toBe(1000);
  });

  it("getSummary computes correct aggregates", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const summary = reader.getSummary();

    expect(summary.total_ticks).toBe(1000);
    expect(summary.frames_recorded).toBe(10);
    expect(summary.initial_population).toBeGreaterThan(0);
    expect(summary.final_population).toBeGreaterThan(0);
    expect(summary.max_population).toBeGreaterThanOrEqual(summary.min_population);
    expect(summary.max_species).toBeGreaterThan(0);
  });

  it("iterates frames via for..of", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);

    const ticks: number[] = [];
    for (const frame of reader) {
      ticks.push(frame.tick);
    }
    expect(ticks).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  });

  it("getFoodCount resolves food_count", () => {
    const reader = new RecordingReader();
    reader.loadFromString(recordingText);
    const stats = reader.getFrame(100)!.stats;

    expect(getFoodCount(stats)).toBe(stats.food_count);
  });
});

describe("RecordingWriter produces parseable output", () => {
  it("written frame can be read back by RecordingReader", () => {
    const writer = new RecordingWriter();
    const reader = new RecordingReader();

    const sampleFrame: RecordingFrame = {
      tick: 42,
      organisms: [
        {
          id: 1,
          genome: {
            size: 1.0,
            shape: "CIRCLE",
            color_hue: 180.0,
            color_sat: 0.8,
            color_val: 0.8,
            base_metabolism: 0.1,
            photosynthesis_rate: 0.0,
            movement_speed: 1.0,
            food_detection_radius: 5.0,
            predator_detection_radius: 5.0,
            mate_detection_radius: 5.0,
            reproduction_threshold: 50.0,
            reproduction_cost: 30.0,
            sexual_reproduction: true,
            crossover_preference: 0.5,
            mutation_rate: 0.05,
            mutation_magnitude: 0.1,
            behavior_tree: [],
            species_id: 1,
            generation: 0,
            parent_ids: [],
          },
          position: { x: 10.5, y: 20.3 },
          energy: 80.0,
          age: 15,
          alive: true,
          generation: 3,
        },
      ],
      food: [{ x: 5.0, y: 5.0, energy: 10.0 }],
      stats: {
        population: 1,
        food_count: 1,
        average_energy: 80.0,
        average_age: 15,
        max_age: 15,
        total_births: 1,
        total_deaths: 0,
        tick: 42,
        world_width: 200,
        world_height: 200,
      },
      species: {
        threshold: 0.3,
        species: {
          "1": {
            id: 1,
            member_count: 1,
            created_at_tick: 0,
            extinct_at_tick: null,
            parent_species_id: null,
            generation_spawned: 0,
          },
        },
        speciation_events: [],
        extinction_events: [],
        phylogeny: { "1": null },
      },
      events: [],
    };

    writer.writeFrame(sampleFrame);
    reader.loadFromString(writer.toString());

    expect(reader.frameCount).toBe(1);
    const parsed = reader.getFrame(42)!;
    expect(parsed.organisms[0].id).toBe(1);
    expect(parsed.stats.population).toBe(1);
    expect(parsed.species.threshold).toBe(0.3);
    expect(parsed.food[0].x).toBe(5.0);
  });

  it("multiple frames produce valid JSONL", () => {
    const writer = new RecordingWriter();

    for (let i = 1; i <= 3; i++) {
      writer.writeFrame(RecordingWriter.buildFrame({
        tick: i * 100,
        organisms: [],
        food: [],
        stats: {
          population: 0,
          food_count: 0,
          average_energy: 0,
          average_age: 0,
          max_age: 0,
          total_births: 0,
          total_deaths: 0,
          tick: i * 100,
          world_width: 200,
          world_height: 200,
        },
        species: {
          threshold: 0.3,
          species: {},
          speciation_events: [],
          extinction_events: [],
          phylogeny: {},
        },
        events: [],
      }));
    }

    const reader = new RecordingReader();
    reader.loadFromString(writer.toString());
    expect(reader.frameCount).toBe(3);
    expect(reader.getAllFrames().map((f) => f.tick)).toEqual([100, 200, 300]);
  });

  it("toBlob returns Blob with correct content", () => {
    const writer = new RecordingWriter();
    writer.writeFrame(RecordingWriter.buildFrame({
      tick: 1,
      organisms: [],
      food: [],
      stats: {
        population: 0,
        food_count: 0,
        average_energy: 0,
        average_age: 0,
        max_age: 0,
        total_births: 0,
        total_deaths: 0,
        tick: 1,
        world_width: 100,
        world_height: 100,
      },
      species: {
        threshold: 0.3,
        species: {},
        speciation_events: [],
        extinction_events: [],
        phylogeny: {},
      },
      events: [],
    }));

    const blob = writer.toBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/x-jsonlines");
    expect(blob.size).toBeGreaterThan(0);
  });
});

function makeWorldState(tick: number, overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick,
    organisms: [
      {
        id: 1,
        genome: {
          toDict: () => ({
            size: 1.0,
            shape: "CIRCLE",
            color_hue: 0,
            color_sat: 0.8,
            color_val: 0.8,
            base_metabolism: 0.1,
            photosynthesis_rate: 0,
            movement_speed: 1,
            food_detection_radius: 5,
            predator_detection_radius: 5,
            mate_detection_radius: 5,
            reproduction_threshold: 50,
            reproduction_cost: 30,
            sexual_reproduction: true,
            crossover_preference: 0.5,
            mutation_rate: 0.05,
            mutation_magnitude: 0.1,
            behavior_tree: [],
            species_id: 1,
            generation: 0,
            parent_ids: [],
          }),
        },
        position: { x: 50, y: 50 },
        energy: 80,
        age: tick,
        alive: true,
        generation: 0,
      },
    ],
    food: [{ position: { x: 10, y: 10 }, energy: 15 }],
    statistics: () => ({
      population: 1,
      food_count: 1,
      average_energy: 80,
      average_age: tick,
      max_age: tick,
      total_births: 1,
      total_deaths: 0,
      tick,
    }),
    config: { width: 200, height: 200 },
    ...overrides,
  };
}

function makeSpeciesTracker(): SpeciesTrackerState {
  return {
    toDict: () => ({
      threshold: 0.3,
      species: {
        "1": {
          id: 1,
          member_count: 1,
          created_at_tick: 0,
          extinct_at_tick: null,
          parent_species_id: null,
          generation_spawned: 0,
        },
      },
      speciation_events: [],
      extinction_events: [],
      phylogeny: { "1": null },
    }),
  };
}

describe("RecordingWriter.writeFrameFromWorld", () => {
  it("builds frame from world state objects", () => {
    const writer = new RecordingWriter();
    const world = makeWorldState(100);
    const speciesTracker = makeSpeciesTracker();

    writer.writeFrameFromWorld(world, [], speciesTracker);

    const reader = new RecordingReader();
    reader.loadFromString(writer.toString());
    expect(reader.frameCount).toBe(1);

    const frame = reader.getFrame(100)!;
    expect(frame.tick).toBe(100);
    expect(frame.organisms).toHaveLength(1);
    expect(frame.organisms[0].id).toBe(1);
    expect(frame.food).toHaveLength(1);
    expect(frame.stats.population).toBe(1);
    expect(frame.stats.world_width).toBe(200);
    expect(frame.stats.world_height).toBe(200);
    expect(frame.species.threshold).toBe(0.3);
  });

  it("filters dead organisms", () => {
    const writer = new RecordingWriter();
    const world = makeWorldState(100, {
      organisms: [
        {
          id: 1,
          genome: {
            toDict: () => ({
              size: 1, shape: "CIRCLE", color_hue: 0, color_sat: 0.8, color_val: 0.8,
              base_metabolism: 0.1, photosynthesis_rate: 0, movement_speed: 1,
              food_detection_radius: 5, predator_detection_radius: 5, mate_detection_radius: 5,
              reproduction_threshold: 50, reproduction_cost: 30, sexual_reproduction: true,
              crossover_preference: 0.5, mutation_rate: 0.05, mutation_magnitude: 0.1,
              behavior_tree: [], species_id: 1, generation: 0, parent_ids: [],
            }),
          },
          position: { x: 10, y: 10 },
          energy: 50,
          age: 100,
          alive: true,
          generation: 0,
        },
        {
          id: 2,
          genome: {
            toDict: () => ({
              size: 1, shape: "CIRCLE", color_hue: 0, color_sat: 0.8, color_val: 0.8,
              base_metabolism: 0.1, photosynthesis_rate: 0, movement_speed: 1,
              food_detection_radius: 5, predator_detection_radius: 5, mate_detection_radius: 5,
              reproduction_threshold: 50, reproduction_cost: 30, sexual_reproduction: true,
              crossover_preference: 0.5, mutation_rate: 0.05, mutation_magnitude: 0.1,
              behavior_tree: [], species_id: 1, generation: 0, parent_ids: [],
            }),
          },
          position: { x: 20, y: 20 },
          energy: 0,
          age: 100,
          alive: false,
          generation: 0,
        },
      ],
    });

    writer.writeFrameFromWorld(world, [], makeSpeciesTracker());

    const reader = new RecordingReader();
    reader.loadFromString(writer.toString());
    expect(reader.getFrame(100)!.organisms).toHaveLength(1);
    expect(reader.getFrame(100)!.organisms[0].id).toBe(1);
  });

  it("tracks incremental events across multiple frames", () => {
    const writer = new RecordingWriter();
    const events = [
      { tick: 50, message: "Species 1 created", type: "speciation" },
      { tick: 80, message: "Birth", type: "birth" },
      { tick: 120, message: "Species 2 created", type: "speciation" },
    ];

    writer.writeFrameFromWorld(makeWorldState(100), events, makeSpeciesTracker());
    writer.writeFrameFromWorld(makeWorldState(200), events, makeSpeciesTracker());

    const reader = new RecordingReader();
    reader.loadFromString(writer.toString());

    const frame1 = reader.getFrame(100)!;
    const frame2 = reader.getFrame(200)!;

    expect(frame1.events).toHaveLength(3);
    expect(frame2.events).toHaveLength(0);
  });

  it("writer output is parseable by RecordingReader with correct format", () => {
    const writer = new RecordingWriter();
    writer.writeFrameFromWorld(makeWorldState(500), [], makeSpeciesTracker());

    const raw = writer.toString().trim();
    const parsed = JSON.parse(raw);

    expect(Object.keys(parsed).sort()).toEqual(
      ["events", "food", "organisms", "species", "stats", "tick"].sort()
    );
    expect(Object.keys(parsed.stats)).toContain("world_width");
    expect(Object.keys(parsed.stats)).toContain("world_height");
  });
});

describe("RecordingReader edge cases", () => {
  it("handles stats.food variation (Python inconsistency)", () => {
    const reader = new RecordingReader();
    const jsonl = JSON.stringify({
      tick: 1,
      organisms: [],
      food: [],
      stats: { population: 0, food: 42, average_energy: 0, average_age: 0, max_age: 0, total_births: 0, total_deaths: 0, tick: 1, world_width: 100, world_height: 100 },
      species: { threshold: 0.3, species: {}, speciation_events: [], extinction_events: [], phylogeny: {} },
      events: [],
    }) + "\n";

    reader.loadFromString(jsonl);
    expect(getFoodCount(reader.getFrame(1)!.stats)).toBe(42);
  });

  it("getSummary returns zeros for empty recording", () => {
    const reader = new RecordingReader();
    reader.loadFromString("");
    const summary = reader.getSummary();

    expect(summary.total_ticks).toBe(0);
    expect(summary.frames_recorded).toBe(0);
    expect(summary.initial_population).toBe(0);
    expect(summary.final_population).toBe(0);
    expect(summary.max_population).toBe(0);
    expect(summary.min_population).toBe(0);
    expect(summary.max_species).toBe(0);
    expect(summary.speciation_events).toBe(0);
    expect(summary.extinction_events).toBe(0);
  });

  it("getSummary deduplicates events by (tick, message) like Python", () => {
    const writer = new RecordingWriter();

    const speciationEvent = { tick: 100, message: "New species 2", type: "speciation" };

    writer.writeFrame(RecordingWriter.buildFrame({
      tick: 100,
      organisms: [],
      food: [],
      stats: {
        population: 5,
        food_count: 10,
        average_energy: 50,
        average_age: 10,
        max_age: 20,
        total_births: 5,
        total_deaths: 0,
        tick: 100,
        world_width: 200,
        world_height: 200,
      },
      species: {
        threshold: 0.3,
        species: {
          "1": { id: 1, member_count: 5, created_at_tick: 0, extinct_at_tick: null, parent_species_id: null, generation_spawned: 0 },
          "2": { id: 2, member_count: 2, created_at_tick: 100, extinct_at_tick: null, parent_species_id: 1, generation_spawned: 0 },
        },
        speciation_events: [],
        extinction_events: [],
        phylogeny: { "1": null, "2": 1 },
      },
      events: [speciationEvent],
    }));

    writer.writeFrame(RecordingWriter.buildFrame({
      tick: 200,
      organisms: [],
      food: [],
      stats: {
        population: 5,
        food_count: 10,
        average_energy: 50,
        average_age: 20,
        max_age: 30,
        total_births: 5,
        total_deaths: 0,
        tick: 200,
        world_width: 200,
        world_height: 200,
      },
      species: {
        threshold: 0.3,
        species: {
          "1": { id: 1, member_count: 3, created_at_tick: 0, extinct_at_tick: null, parent_species_id: null, generation_spawned: 0 },
          "2": { id: 2, member_count: 2, created_at_tick: 100, extinct_at_tick: null, parent_species_id: 1, generation_spawned: 0 },
        },
        speciation_events: [],
        extinction_events: [],
        phylogeny: { "1": null, "2": 1 },
      },
      events: [speciationEvent],
    }));

    const reader = new RecordingReader();
    reader.loadFromString(writer.toString());
    const summary = reader.getSummary();

    // Same event appears in two frames but should NOT be double-counted
    // Python deduplicates by (tick, message) key
    expect(summary.speciation_events).toBe(1);
    expect(summary.max_species).toBe(2);
  });

  it("skips malformed lines without throwing", () => {
    const reader = new RecordingReader();
    reader.loadFromString(
      '{"tick": 1, "organisms": [], "food": [], "stats": {"population": 0, "food_count": 0, "average_energy": 0, "average_age": 0, "max_age": 0, "total_births": 0, "total_deaths": 0, "tick": 1, "world_width": 100, "world_height": 100}, "species": {"threshold": 0.3, "species": {}, "speciation_events": [], "extinction_events": [], "phylogeny": {}}, "events": []}\n' +
      "THIS IS NOT JSON\n" +
      '{"tick": 2, "organisms": [], "food": [], "stats": {"population": 0, "food_count": 0, "average_energy": 0, "average_age": 0, "max_age": 0, "total_births": 0, "total_deaths": 0, "tick": 2, "world_width": 100, "world_height": 100}, "species": {"threshold": 0.3, "species": {}, "speciation_events": [], "extinction_events": [], "phylogeny": {}}, "events": []}\n'
    );

    expect(reader.frameCount).toBe(2);
  });

  it("loadFromFile reads a File object via FileReader fallback", async () => {
    const writer = new RecordingWriter();
    writer.writeFrame(RecordingWriter.buildFrame({
      tick: 42,
      organisms: [],
      food: [],
      stats: {
        population: 0,
        food_count: 0,
        average_energy: 0,
        average_age: 0,
        max_age: 0,
        total_births: 0,
        total_deaths: 0,
        tick: 42,
        world_width: 100,
        world_height: 100,
      },
      species: {
        threshold: 0.3,
        species: {},
        speciation_events: [],
        extinction_events: [],
        phylogeny: {},
      },
      events: [],
    }));

    const blob = writer.toBlob();
    const file = new File([blob], "test.jsonl", { type: "application/x-jsonlines" });

    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });

    const recReader = new RecordingReader();
    recReader.loadFromString(text);

    expect(recReader.frameCount).toBe(1);
    expect(recReader.getFrame(42)!.tick).toBe(42);
  });
});
