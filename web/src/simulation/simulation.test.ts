import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation";
import type { SimulationConfig } from "./types";

function makeConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    worldWidth: 50,
    worldHeight: 50,
    initialPopulation: 10,
    maxPopulation: 100,
    initialFood: 30,
    foodSpawnRate: 0.5,
    foodEnergy: 15.0,
    fertileZones: [[0.5, 0.5, 0.3]],
    carryingCapacityPressure: 0.001,
    speciationThreshold: 0.3,
    ticks: 1000,
    recordEveryNTicks: 100,
    renderEveryNTicks: 10,
    seed: 42,
    ...overrides,
  };
}

describe("Simulation", () => {
  it("initializes world with correct population and food", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();

    const stats = sim.world.statistics();
    expect(stats.population).toBe(config.initialPopulation);
    expect(stats.foodCount).toBe(config.initialFood);
    expect(stats.tick).toBe(0);
    expect(stats.totalBirths).toBe(config.initialPopulation);
    expect(stats.totalDeaths).toBe(0);
  });

  it("assigns species to all initial organisms", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();

    const speciesCount = sim.speciesTracker.getSpeciesCount();
    expect(speciesCount).toBeGreaterThanOrEqual(1);

    for (const org of sim.world.organisms) {
      expect(org.genome.speciesId).toBeGreaterThan(0);
    }
  });

  it("runTick increments tick and returns statistics", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();

    const stats = sim.runTick();
    expect(stats.tick).toBe(1);

    const stats2 = sim.runTick();
    expect(stats2.tick).toBe(2);
  });

  it("returns valid statistics with all required fields", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();

    const stats = sim.runTick();
    expect(stats).toHaveProperty("population");
    expect(stats).toHaveProperty("foodCount");
    expect(stats).toHaveProperty("averageEnergy");
    expect(stats).toHaveProperty("averageAge");
    expect(stats).toHaveProperty("maxAge");
    expect(stats).toHaveProperty("totalBirths");
    expect(stats).toHaveProperty("totalDeaths");
    expect(stats).toHaveProperty("tick");
    expect(stats).toHaveProperty("worldWidth");
    expect(stats).toHaveProperty("worldHeight");

    expect(typeof stats.population).toBe("number");
    expect(typeof stats.foodCount).toBe("number");
    expect(typeof stats.averageEnergy).toBe("number");
    expect(typeof stats.averageAge).toBe("number");
    expect(typeof stats.maxAge).toBe("number");
    expect(typeof stats.totalBirths).toBe("number");
    expect(typeof stats.totalDeaths).toBe("number");
    expect(typeof stats.tick).toBe("number");
  });

  it("produces identical statistics for same seed (determinism)", () => {
    const config = makeConfig({ seed: 12345 });

    const sim1 = new Simulation(config);
    sim1.initialize();
    const stats1_init = sim1.world.statistics();

    const sim2 = new Simulation(config);
    sim2.initialize();
    const stats2_init = sim2.world.statistics();

    expect(stats1_init).toEqual(stats2_init);

    for (let i = 0; i < 20; i++) {
      sim1.runTick();
      sim2.runTick();
    }

    expect(sim1.world.statistics()).toEqual(sim2.world.statistics());
  });

  it("organisms age and have energy modified after tick", () => {
    const config = makeConfig({ seed: 99 });
    const sim = new Simulation(config);
    sim.initialize();

    const org = sim.world.organisms[0]!;
    const ageBefore = org.age;

    sim.runTick();

    expect(org.age).toBe(ageBefore + 1);
    expect(org.energy).toBeGreaterThanOrEqual(0);
    expect(org.energy).toBeLessThanOrEqual(200.0);
  });

  it("events list starts empty and grows with speciation/extinction", () => {
    const config = makeConfig({
      seed: 42,
      initialPopulation: 20,
      speciationThreshold: 0.15,
    });
    const sim = new Simulation(config);
    sim.initialize();

    expect(sim.getEvents()).toHaveLength(0);

    sim.run(50);

    const events = sim.getEvents();
    for (const e of events) {
      expect(e).toHaveProperty("tick");
      expect(e).toHaveProperty("message");
      expect(e).toHaveProperty("eventType");
      expect(["speciation", "extinction"]).toContain(e.eventType);
    }
  });

  it("extinction events contain 'extinct' and have correct type", () => {
    const config = makeConfig({
      seed: 7,
      initialPopulation: 5,
      maxPopulation: 50,
      speciationThreshold: 0.1,
      ticks: 200,
    });
    const sim = new Simulation(config);
    sim.initialize();
    sim.run(200);

    const extinctionEvents = sim
      .getEvents()
      .filter((e) => e.eventType === "extinction");
    for (const e of extinctionEvents) {
      expect(e.message.toLowerCase()).toContain("extinct");
    }
  });

  it("carrying capacity pressure reduces energy when population is high", () => {
    const config = makeConfig({
      seed: 42,
      initialPopulation: 80,
      maxPopulation: 100,
      initialFood: 200,
      foodSpawnRate: 1.0,
    });
    const sim = new Simulation(config);
    sim.initialize();

    const aliveBefore = sim.world.organisms.filter((o) => o.alive);
    const totalEnergyBefore = aliveBefore.reduce((s, o) => s + o.energy, 0);

    sim.run(10);

    const aliveAfter = sim.world.organisms.filter((o) => o.alive);
    const totalEnergyAfter = aliveAfter.reduce((s, o) => s + o.energy, 0);

    expect(totalEnergyAfter).toBeLessThan(totalEnergyBefore);
  });

  it("toDict serializes simulation state correctly", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();
    sim.runTick();

    const dict = sim.toDict();

    expect(dict).toHaveProperty("tick", 1);
    expect(dict).toHaveProperty("world");
    expect(dict).toHaveProperty("species");
    expect(dict).toHaveProperty("events");

    expect(typeof (dict["tick"] as number)).toBe("number");
    expect(Array.isArray(dict["events"])).toBe(true);
  });

  it("toDict keeps only last 100 events", () => {
    const config = makeConfig({
      seed: 42,
      speciationThreshold: 0.05,
      initialPopulation: 30,
    });
    const sim = new Simulation(config);
    sim.initialize();
    sim.run(100);

    const dict = sim.toDict();
    const events = dict["events"] as unknown[];
    expect(events.length).toBeLessThanOrEqual(100);
  });

  it("run method respects maxTicks parameter", () => {
    const config = makeConfig();
    const sim = new Simulation(config);
    sim.initialize();
    sim.run(5);

    expect(sim.world.statistics().tick).toBe(5);
  });

  it("dead organisms are removed after tick processing", () => {
    const config = makeConfig({
      seed: 42,
      initialFood: 0,
      foodSpawnRate: 0.0,
    });
    const sim = new Simulation(config);
    sim.initialize();
    sim.run(200);

    for (const org of sim.world.organisms) {
      expect(org.alive).toBe(true);
    }
  });

  it("population stays bounded near maxPopulation under carrying capacity", () => {
    const config = makeConfig({
      seed: 42,
      initialPopulation: 50,
      maxPopulation: 60,
      initialFood: 500,
      foodSpawnRate: 1.0,
      foodEnergy: 50.0,
    });
    const sim = new Simulation(config);
    sim.initialize();
    sim.run(100);

    const stats = sim.world.statistics();
    expect(stats.population).toBeLessThanOrEqual(config.maxPopulation * 1.2);
  });
});
