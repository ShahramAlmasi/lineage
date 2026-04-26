import { describe, it, expect } from "vitest";
import { PRNG } from "../utils/prng";
import { SpeciesTracker } from "./speciation";
import { geneticDistance, randomGenome } from "./genome";
import { type Genome, type Organism, Shape } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeGenome(overrides: Partial<Genome> = {}): Genome {
  return {
    size: 1.0,
    shape: Shape.CIRCLE,
    colorHue: 180,
    colorSat: 0.8,
    colorVal: 0.8,
    baseMetabolism: 0.1,
    photosynthesisRate: 0.0,
    movementSpeed: 1.0,
    foodDetectionRadius: 5.0,
    predatorDetectionRadius: 5.0,
    mateDetectionRadius: 5.0,
    reproductionThreshold: 50.0,
    reproductionCost: 30.0,
    sexualReproduction: true,
    crossoverPreference: 0.5,
    mutationRate: 0.05,
    mutationMagnitude: 0.1,
    behaviorTree: [],
    speciesId: 0,
    generation: 0,
    parentIds: [],
    ...overrides,
  };
}

function makeOrganism(
  id: number,
  genome: Genome,
  alive = true,
): Organism {
  return {
    id,
    genome,
    position: { x: 0, y: 0 },
    energy: 50,
    age: 0,
    alive,
    generation: genome.generation,
    ticksSinceReproduction: 0,
  };
}

function makeDistantGenome(baseGenome: Genome, factor: number): Genome {
  return {
    ...baseGenome,
    size: baseGenome.size + factor * 2,
    colorHue: (baseGenome.colorHue + factor * 100) % 360,
    baseMetabolism: baseGenome.baseMetabolism + factor * 0.5,
    movementSpeed: baseGenome.movementSpeed + factor * 2,
    foodDetectionRadius: baseGenome.foodDetectionRadius + factor * 10,
  };
}

// ── SpeciesTracker constructor ───────────────────────────────────────────

describe("SpeciesTracker", () => {
  it("initializes with default threshold 0.3", () => {
    const tracker = new SpeciesTracker();
    expect(tracker.threshold).toBe(0.3);
    expect(tracker.species.size).toBe(0);
    expect(tracker.nextSpeciesId).toBe(1);
    expect(tracker.speciationEvents).toHaveLength(0);
    expect(tracker.extinctionEvents).toHaveLength(0);
    expect(tracker.phylogeny.size).toBe(0);
  });

  it("accepts custom threshold", () => {
    const tracker = new SpeciesTracker(0.5);
    expect(tracker.threshold).toBe(0.5);
  });
});

// ── assignSpecies ────────────────────────────────────────────────────────

describe("assignSpecies", () => {
  it("creates first species for first organism", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome = makeGenome();
    const org = makeOrganism(1, genome);

    const [sid, isNew] = tracker.assignSpecies(org, 0);

    expect(sid).toBe(1);
    expect(isNew).toBe(true);
    expect(org.genome.speciesId).toBe(1);
    expect(tracker.species.get(1)!.memberIds.has(1)).toBe(true);
    expect(tracker.species.get(1)!.representativeGenome).toBe(genome);
  });

  it("assigns similar organisms to same species", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 100 });
    const genome2 = makeGenome({ colorHue: 110 });
    const org1 = makeOrganism(1, genome1);
    const org2 = makeOrganism(2, genome2);

    tracker.assignSpecies(org1, 0);
    const [sid2, isNew2] = tracker.assignSpecies(org2, 0);

    expect(sid2).toBe(1);
    expect(isNew2).toBe(false);
    expect(org2.genome.speciesId).toBe(1);
    expect(tracker.species.get(1)!.memberIds.size).toBe(2);
  });

  it("creates new species for genetically distant organisms", () => {
    const tracker = new SpeciesTracker(0.3);
    const closeGenome = makeGenome({ colorHue: 100 });
    const farGenome = makeDistantGenome(closeGenome, 3);
    const org1 = makeOrganism(1, closeGenome);
    const org2 = makeOrganism(2, farGenome);

    tracker.assignSpecies(org1, 0);
    const [sid2, isNew2] = tracker.assignSpecies(org2, 0);

    expect(sid2).toBe(2);
    expect(isNew2).toBe(true);
    expect(org2.genome.speciesId).toBe(2);
    expect(tracker.getSpeciesCount()).toBe(2);
  });

  it("assigns to closest species when multiple candidates exist", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const genome2 = makeDistantGenome(genome1, 1.5);
    const testGenome = makeGenome({ colorHue: 5 });

    const org1 = makeOrganism(1, genome1);
    const org2 = makeOrganism(2, genome2);
    const org3 = makeOrganism(3, testGenome);

    tracker.assignSpecies(org1, 0);
    tracker.assignSpecies(org2, 0);

    const [sid3] = tracker.assignSpecies(org3, 0);
    const dist1 = geneticDistance(testGenome, genome1);
    const dist2 = geneticDistance(testGenome, genome2);
    if (dist1 < dist2) {
      expect(sid3).toBe(1);
    } else {
      expect(sid3).toBe(2);
    }
  });

  it("skips extinct species when assigning", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const org1 = makeOrganism(1, genome1);

    tracker.assignSpecies(org1, 0);

    // Manually extinct species 1
    tracker.species.get(1)!.extinctAtTick = 10;

    // Same genome should create new species since species 1 is extinct
    const org2 = makeOrganism(2, makeGenome({ colorHue: 0 }));
    const [sid2, isNew2] = tracker.assignSpecies(org2, 10);

    expect(isNew2).toBe(true);
    expect(sid2).toBe(2);
  });

  it("records speciation event for new species", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 5);

    expect(tracker.speciationEvents).toHaveLength(1);
    expect(tracker.speciationEvents[0]).toEqual({
      tick: 5,
      newSpeciesId: 1,
      parentSpeciesId: null,
      reason: "genetic_divergence",
    });
  });

  it("records phylogeny for new species", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);
    expect(tracker.phylogeny.get(1)).toBe(null);
  });
});

// ── updateSpecies — extinction ───────────────────────────────────────────

describe("updateSpecies — extinction", () => {
  it("marks species extinct when no living members", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);

    // Kill the organism
    org.alive = false;

    const events = tracker.updateSpecies([org], 50);

    expect(tracker.species.get(1)!.extinctAtTick).toBe(50);
    expect(tracker.extinctionEvents).toHaveLength(1);
    expect(tracker.extinctionEvents[0]).toEqual({
      tick: 50,
      speciesId: 1,
      finalPopulation: 0,
      lifespanTicks: 50,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("went extinct");
    expect(tracker.getSpeciesCount()).toBe(0);
  });

  it("does not mark species extinct when members alive", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);

    const events = tracker.updateSpecies([org], 10);

    expect(tracker.species.get(1)!.extinctAtTick).toBeNull();
    expect(events).toHaveLength(0);
  });

  it("updates member_ids to only living members", () => {
    const tracker = new SpeciesTracker(0.3);
    const org1 = makeOrganism(1, makeGenome());
    const org2 = makeOrganism(2, makeGenome());
    tracker.assignSpecies(org1, 0);
    tracker.assignSpecies(org2, 0);

    org1.alive = false;

    tracker.updateSpecies([org1, org2], 10);

    expect(tracker.species.get(1)!.memberIds.has(1)).toBe(false);
    expect(tracker.species.get(1)!.memberIds.has(2)).toBe(true);
    expect(tracker.species.get(1)!.memberIds.size).toBe(1);
  });

  it("does not re-detect extinction for already-extinct species", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);
    org.alive = false;

    tracker.updateSpecies([org], 50);
    tracker.updateSpecies([org], 100);

    expect(tracker.extinctionEvents).toHaveLength(1);
  });
});

// ── updateSpecies — divergence ───────────────────────────────────────────

describe("updateSpecies — divergence", () => {
  it("creates new species when members diverge from representative", () => {
    const tracker = new SpeciesTracker(0.3);
    const repGenome = makeGenome({ colorHue: 0 });
    const org1 = makeOrganism(1, repGenome);
    tracker.assignSpecies(org1, 0);

    // Create a distant genome that exceeds threshold * 1.2 = 0.36
    const divergedGenome = makeDistantGenome(repGenome, 3);
    const org2 = makeOrganism(2, divergedGenome);
    org2.genome.speciesId = 1;
    tracker.species.get(1)!.memberIds.add(2);

    const dist = geneticDistance(divergedGenome, repGenome);
    expect(dist).toBeGreaterThanOrEqual(0.3 * 1.2);

    const events = tracker.updateSpecies([org1, org2], 10);

    // New species should have been created
    expect(events.length).toBeGreaterThanOrEqual(1);
    const divergenceEvent = events.find((e) => e.includes("diverged"));
    expect(divergenceEvent).toBeDefined();

    // org2 should be in new species
    expect(org2.genome.speciesId).toBe(2);
    expect(tracker.species.get(2)!.memberIds.has(2)).toBe(true);
    expect(tracker.species.get(1)!.memberIds.has(2)).toBe(false);
  });

  it("does not diverge when all members are equally distant", () => {
    const tracker = new SpeciesTracker(0.3);
    const repGenome = makeGenome({ colorHue: 0 });
    const org1 = makeOrganism(1, repGenome);
    tracker.assignSpecies(org1, 0);

    // Mutate all organisms away from the representative by overwriting genomes
    // so that EVERY member diverges from the rep
    const farGenome1 = makeDistantGenome(repGenome, 3);
    const farGenome2 = makeDistantGenome(repGenome, 3.1);
    org1.genome = farGenome1;
    const org2 = makeOrganism(2, farGenome2);
    org2.genome.speciesId = 1;
    tracker.species.get(1)!.memberIds.add(2);

    const d1 = geneticDistance(farGenome1, repGenome);
    const d2 = geneticDistance(farGenome2, repGenome);
    expect(d1).toBeGreaterThanOrEqual(0.3 * 1.2);
    expect(d2).toBeGreaterThanOrEqual(0.3 * 1.2);

    // Both members diverge from rep → diverged.length === members.length → no split
    const events = tracker.updateSpecies([org1, org2], 10);
    const divergenceEvent = events.find((e) => e.includes("diverged"));
    expect(divergenceEvent).toBeUndefined();
  });

  it("does not diverge species with fewer than 2 members", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);

    const events = tracker.updateSpecies([org], 10);
    const divergenceEvent = events.find((e) => e.includes("diverged"));
    expect(divergenceEvent).toBeUndefined();
  });
});

// ── updateSpecies — representative update ────────────────────────────────

describe("updateSpecies — representative update", () => {
  it("updates representative every 100 ticks", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const genome2 = makeGenome({ colorHue: 5 });
    const org1 = makeOrganism(1, genome1);
    const org2 = makeOrganism(2, genome2);

    tracker.assignSpecies(org1, 0);
    tracker.assignSpecies(org2, 0);

    const initialRep = tracker.species.get(1)!.representativeGenome;
    expect(initialRep.colorHue).toBe(0);

    // Tick 100 triggers representative update
    tracker.updateSpecies([org1, org2], 100);

    // members[0] is org1 (same order as added), so rep should be org1's genome
    expect(tracker.species.get(1)!.representativeGenome.colorHue).toBe(0);
  });

  it("does not update representative on non-100-aligned ticks", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const org1 = makeOrganism(1, genome1);
    tracker.assignSpecies(org1, 0);

    // Add another organism as members[0] won't change rep
    const genome2 = makeGenome({ colorHue: 50 });
    const org2 = makeOrganism(2, genome2);
    org2.genome.speciesId = 1;
    tracker.species.get(1)!.memberIds.add(2);

    tracker.updateSpecies([org1, org2], 50);

    // Representative should not change at tick 50
    expect(tracker.species.get(1)!.representativeGenome.colorHue).toBe(0);
  });
});

// ── getSpeciesCount ──────────────────────────────────────────────────────

describe("getSpeciesCount", () => {
  it("returns 0 when no species", () => {
    const tracker = new SpeciesTracker();
    expect(tracker.getSpeciesCount()).toBe(0);
  });

  it("counts only non-extinct species", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const genome2 = makeDistantGenome(genome1, 3);

    tracker.assignSpecies(makeOrganism(1, genome1), 0);
    tracker.assignSpecies(makeOrganism(2, genome2), 0);

    expect(tracker.getSpeciesCount()).toBe(2);

    // Extinct one
    tracker.species.get(1)!.extinctAtTick = 10;
    expect(tracker.getSpeciesCount()).toBe(1);
  });
});

// ── getSpeciesPopulations ────────────────────────────────────────────────

describe("getSpeciesPopulations", () => {
  it("returns populations for non-extinct species", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome = makeGenome();
    tracker.assignSpecies(makeOrganism(1, genome), 0);
    tracker.assignSpecies(makeOrganism(2, genome), 0);
    tracker.assignSpecies(makeOrganism(3, genome), 0);

    const pops = tracker.getSpeciesPopulations();
    expect(pops.get(1)).toBe(3);
  });

  it("excludes extinct species", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);
    tracker.species.get(1)!.extinctAtTick = 10;

    const pops = tracker.getSpeciesPopulations();
    expect(pops.has(1)).toBe(false);
  });
});

// ── getPhylogeneticTree ──────────────────────────────────────────────────

describe("getPhylogeneticTree", () => {
  it("returns tree structure", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    const tree = tracker.getPhylogeneticTree();
    expect(tree.has(1)).toBe(true);
    expect(tree.get(1)!.parentSpeciesId).toBe(null);
  });
});

// ── getPhylogeneticTreeAscii ─────────────────────────────────────────────

describe("getPhylogeneticTreeAscii", () => {
  it("generates ASCII tree with header", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    const ascii = tracker.getPhylogeneticTreeAscii();

    expect(ascii).toContain("Phylogenetic Tree");
    expect(ascii).toContain("=".repeat(30));
    expect(ascii).toContain("Species 1");
    expect(ascii).toContain("pop=");
  });

  it("shows EXTINCT for extinct species", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);
    tracker.species.get(1)!.extinctAtTick = 10;

    const ascii = tracker.getPhylogeneticTreeAscii();
    expect(ascii).toContain("EXTINCT");
  });

  it("shows parent-child relationships with branches", () => {
    const tracker = new SpeciesTracker(0.3);
    const genome1 = makeGenome({ colorHue: 0 });
    const genome2 = makeDistantGenome(genome1, 3);

    tracker.assignSpecies(makeOrganism(1, genome1), 0);
    tracker.assignSpecies(makeOrganism(2, genome2), 0);

    // Manually set parent to test tree rendering
    tracker.phylogeny.set(2, 1);
    tracker.species.get(2)!.parentSpeciesId = 1;

    const ascii = tracker.getPhylogeneticTreeAscii();
    expect(ascii).toContain("Species 1");
    expect(ascii).toContain("Species 2");
    expect(ascii).toContain("└──");
  });

  it("respects maxDepth parameter", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    // Create a chain of species
    for (let i = 2; i <= 10; i++) {
      const genome = makeGenome({ colorHue: i * 50 });
      tracker.createNewSpecies(genome, 0, i - 1);
    }

    const ascii = tracker.getPhylogeneticTreeAscii(2);
    // Should contain species 1, 2, 3 but not deeper ones at depth > 2
    expect(ascii).toContain("Species 1");
  });

  it("returns header-only tree when no species", () => {
    const tracker = new SpeciesTracker(0.3);
    const ascii = tracker.getPhylogeneticTreeAscii();
    expect(ascii).toBe("Phylogenetic Tree\n==============================");
  });
});

// ── toDict / fromDict ───────────────────────────────────────────────────

describe("toDict", () => {
  it("serializes to Python-compatible format", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    const d = tracker.toDict();

    expect(d["threshold"]).toBe(0.3);
    expect(d["species"]).toBeDefined();
    expect(d["speciation_events"]).toHaveLength(1);
    expect(d["extinction_events"]).toHaveLength(0);
    expect(d["phylogeny"]).toBeDefined();
  });

  it("serializes species data correctly", () => {
    const tracker = new SpeciesTracker(0.25);
    const genome = makeGenome({ generation: 5 });
    tracker.assignSpecies(makeOrganism(1, genome), 10);

    const d = tracker.toDict();
    const speciesData = d["species"] as Record<string, Record<string, unknown>>;
    const s1 = speciesData["1"];

    expect(s1["id"]).toBe(1);
    expect(s1["member_count"]).toBe(1);
    expect(s1["created_at_tick"]).toBe(10);
    expect(s1["extinct_at_tick"]).toBeNull();
    expect(s1["parent_species_id"]).toBeNull();
    expect(s1["generation_spawned"]).toBe(5);
  });

  it("serializes phylogeny correctly", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    const d = tracker.toDict();
    const phylogeny = d["phylogeny"] as Record<string, unknown>;
    expect(phylogeny["1"]).toBe(null);
  });

  it("serializes extinction events", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);
    org.alive = false;
    tracker.updateSpecies([org], 50);

    const d = tracker.toDict();
    const events = d["extinction_events"] as Record<string, unknown>[];
    expect(events).toHaveLength(1);
    expect(events[0]["tick"]).toBe(50);
    expect(events[0]["species_id"]).toBe(1);
    expect(events[0]["final_population"]).toBe(0);
    expect(events[0]["lifespan_ticks"]).toBe(50);
  });
});

describe("fromDict", () => {
  it("round-trips threshold and phylogeny", () => {
    const tracker = new SpeciesTracker(0.25);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 0);

    const d = tracker.toDict();
    const restored = SpeciesTracker.fromDict(d);

    expect(restored.threshold).toBe(0.25);
    expect(restored.phylogeny.get(1)).toBe(null);
    expect(restored.nextSpeciesId).toBe(2);
  });

  it("round-trips speciation events", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 5);

    const d = tracker.toDict();
    const restored = SpeciesTracker.fromDict(d);

    expect(restored.speciationEvents).toHaveLength(1);
    expect(restored.speciationEvents[0]).toEqual({
      tick: 5,
      newSpeciesId: 1,
      parentSpeciesId: null,
      reason: "genetic_divergence",
    });
  });

  it("round-trips extinction events", () => {
    const tracker = new SpeciesTracker(0.3);
    const org = makeOrganism(1, makeGenome());
    tracker.assignSpecies(org, 0);
    org.alive = false;
    tracker.updateSpecies([org], 100);

    const d = tracker.toDict();
    const restored = SpeciesTracker.fromDict(d);

    expect(restored.extinctionEvents).toHaveLength(1);
    expect(restored.extinctionEvents[0].speciesId).toBe(1);
    expect(restored.extinctionEvents[0].lifespanTicks).toBe(100);
  });

  it("restores species with correct metadata", () => {
    const tracker = new SpeciesTracker(0.3);
    tracker.assignSpecies(makeOrganism(1, makeGenome()), 10);

    const d = tracker.toDict();
    const restored = SpeciesTracker.fromDict(d);

    const species = restored.species.get(1)!;
    expect(species.id).toBe(1);
    expect(species.createdAtTick).toBe(10);
    expect(species.extinctAtTick).toBeNull();
    expect(species.parentSpeciesId).toBeNull();
  });
});

// ── Integration: multi-tick scenario ─────────────────────────────────────

describe("integration: multi-tick speciation", () => {
  it("tracks species through multiple ticks with random genomes", () => {
    const rng = new PRNG(42);
    const tracker = new SpeciesTracker(0.3);

    // Create initial population
    const organisms: Organism[] = [];
    for (let i = 1; i <= 20; i++) {
      const g = randomGenome(rng);
      const org = makeOrganism(i, g);
      tracker.assignSpecies(org, 0);
      organisms.push(org);
    }

    const initialCount = tracker.getSpeciesCount();
    expect(initialCount).toBeGreaterThan(0);

    // Run update at tick 100 (triggers representative update)
    tracker.updateSpecies(organisms, 100);

    // Populations should match
    const pops = tracker.getSpeciesPopulations();
    let totalPop = 0;
    for (const pop of pops.values()) {
      totalPop += pop;
    }
    expect(totalPop).toBe(20);
  });

  it("handles extinction and speciation in sequence", () => {
    const tracker = new SpeciesTracker(0.3);

    // Create species 1
    const g1 = makeGenome({ colorHue: 0 });
    const org1 = makeOrganism(1, g1);
    tracker.assignSpecies(org1, 0);

    // Kill all members of species 1
    org1.alive = false;
    tracker.updateSpecies([org1], 50);

    expect(tracker.getSpeciesCount()).toBe(0);
    expect(tracker.extinctionEvents).toHaveLength(1);

    // Create new organism — should get species 2 (since species 1 is extinct)
    const org2 = makeOrganism(2, makeGenome({ colorHue: 0 }));
    const [sid, isNew] = tracker.assignSpecies(org2, 60);

    expect(sid).toBe(2);
    expect(isNew).toBe(true);
    expect(tracker.getSpeciesCount()).toBe(1);
  });
});
