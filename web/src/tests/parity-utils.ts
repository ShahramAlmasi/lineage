import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { getPreset } from "../simulation/config";
import { RecordingWriter, type RecordingFrame } from "../simulation/recording";
import { Simulation } from "../simulation/simulation";

const execFileAsync = promisify(execFile);
const POSITION_TOLERANCE = 0.1;
const ENERGY_TOLERANCE = 0.01;

export interface ParityResult {
  match: boolean;
  totalFrames: number;
  matchedFrames: number;
  mismatchedFrames: number;
  differences: FrameDifference[];
}

export interface FrameDifference {
  tick: number;
  field: string;
  pythonValue: unknown;
  tsValue: unknown;
  tolerance?: number;
}

export async function runPythonRecording(
  ticks: number,
  seed: number,
  preset: string,
  outputPath: string,
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await execFileAsync(
    "python3",
    [
      "-m",
      "lineage",
      "run",
      "--ticks",
      String(ticks),
      "--seed",
      String(seed),
      "--preset",
      preset,
      "--record-every",
      "10",
      "--output",
      outputPath,
    ],
    { cwd: "..", timeout: 120_000 },
  );
  return outputPath;
}

export async function runTypeScriptRecording(
  ticks: number,
  seed: number,
  preset: string,
): Promise<RecordingFrame[]> {
  const config = { ...getPreset(preset), ticks, seed, recordEveryNTicks: 10 };
  const sim = new Simulation(config);
  const writer = new RecordingWriter();
  sim.initialize();
  let lastEventIndex = 0;

  for (let tick = 1; tick <= ticks; tick++) {
    sim.runTick();
    if (tick % 10 === 0) {
      writer.writeFrame(buildFrameFromSimulation(sim, lastEventIndex));
      lastEventIndex = sim.getEvents().length;
    }
  }

  return writer.getLines().map((line) => JSON.parse(line) as RecordingFrame);
}

export async function saveTypeScriptRecording(frames: RecordingFrame[], outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n", "utf-8");
  return outputPath;
}

export async function readJsonlRecording(path: string): Promise<RecordingFrame[]> {
  const text = await readFile(path, "utf-8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RecordingFrame);
}

export function compareRecordings(pyFrames: RecordingFrame[], tsFrames: RecordingFrame[]): ParityResult {
  const differences: FrameDifference[] = [];
  const totalFrames = Math.max(pyFrames.length, tsFrames.length);
  let matchedFrames = 0;

  for (let index = 0; index < totalFrames; index++) {
    const before = differences.length;
    const pyFrame = pyFrames[index];
    const tsFrame = tsFrames[index];

    if (!pyFrame || !tsFrame) {
      differences.push({ tick: pyFrame?.tick ?? tsFrame?.tick ?? -1, field: `frames[${index}]`, pythonValue: pyFrame ?? null, tsValue: tsFrame ?? null });
      continue;
    }

    compareValue(differences, pyFrame.tick, "tick", pyFrame.tick, tsFrame.tick);
    compareStats(differences, pyFrame, tsFrame);
    compareSpecies(differences, pyFrame, tsFrame);
    compareEvents(differences, pyFrame, tsFrame);
    compareOrganisms(differences, pyFrame, tsFrame);
    compareFood(differences, pyFrame, tsFrame);

    if (differences.length === before) matchedFrames++;
  }

  return {
    match: differences.length === 0,
    totalFrames,
    matchedFrames,
    mismatchedFrames: totalFrames - matchedFrames,
    differences,
  };
}

function normalizeEvents(events: Array<{ tick: number; message: string; eventType: string }>) {
  return events.map((event) => ({ tick: event.tick, message: event.message, type: event.eventType }));
}

function buildFrameFromSimulation(sim: Simulation, lastEventIndex: number): RecordingFrame {
  const stats = sim.world.statistics();
  return RecordingWriter.buildFrame({
    tick: stats.tick,
    organisms: sim.world.organisms
      .filter((organism) => organism.alive)
      .map((organism) => ({
        id: organism.id,
        genome: organism.toDict()["genome"] as RecordingFrame["organisms"][number]["genome"],
        position: { x: organism.position.x, y: organism.position.y },
        energy: organism.energy,
        age: organism.age,
        alive: organism.alive,
        generation: organism.generation,
      })),
    food: sim.world.food.map((food) => ({ x: food.position.x, y: food.position.y, energy: food.energy })),
    stats: {
      population: stats.population,
      food_count: stats.foodCount,
      average_energy: stats.averageEnergy,
      average_age: stats.averageAge,
      max_age: stats.maxAge,
      total_births: stats.totalBirths,
      total_deaths: stats.totalDeaths,
      tick: stats.tick,
      world_width: stats.worldWidth,
      world_height: stats.worldHeight,
    },
    species: sim.speciesTracker.toDict() as unknown as RecordingFrame["species"],
    events: normalizeEvents(sim.getEvents().slice(lastEventIndex)),
  });
}

function compareStats(differences: FrameDifference[], pyFrame: RecordingFrame, tsFrame: RecordingFrame): void {
  const exact = ["population", "total_births", "total_deaths", "tick"] as const;
  for (const field of exact) compareValue(differences, pyFrame.tick, `stats.${field}`, pyFrame.stats[field], tsFrame.stats[field]);
}

function compareSpecies(differences: FrameDifference[], pyFrame: RecordingFrame, tsFrame: RecordingFrame): void {
  compareValue(differences, pyFrame.tick, "species.count", Object.keys(pyFrame.species.species).length, Object.keys(tsFrame.species.species).length);
}

function compareEvents(differences: FrameDifference[], pyFrame: RecordingFrame, tsFrame: RecordingFrame): void {
  compareValue(differences, pyFrame.tick, "events.length", pyFrame.events.length, tsFrame.events.length);
}

function compareOrganisms(differences: FrameDifference[], pyFrame: RecordingFrame, tsFrame: RecordingFrame): void {
  compareValue(differences, pyFrame.tick, "organisms.length", pyFrame.organisms.length, tsFrame.organisms.length);
  const count = Math.min(pyFrame.organisms.length, tsFrame.organisms.length);
  for (let i = 0; i < count; i++) {
    const py = pyFrame.organisms[i]!;
    const ts = tsFrame.organisms[i]!;
    const prefix = `organisms[${i}]`;
    compareValue(differences, pyFrame.tick, `${prefix}.id`, py.id, ts.id);
    compareNumber(differences, pyFrame.tick, `${prefix}.position.x`, py.position.x, ts.position.x, POSITION_TOLERANCE);
    compareNumber(differences, pyFrame.tick, `${prefix}.position.y`, py.position.y, ts.position.y, POSITION_TOLERANCE);
    compareNumber(differences, pyFrame.tick, `${prefix}.energy`, py.energy, ts.energy, ENERGY_TOLERANCE);
  }
}

function compareFood(differences: FrameDifference[], pyFrame: RecordingFrame, tsFrame: RecordingFrame): void {
  compareValue(differences, pyFrame.tick, "food.length", pyFrame.food.length, tsFrame.food.length);
  const count = Math.min(pyFrame.food.length, tsFrame.food.length);
  for (let i = 0; i < count; i++) {
    const py = pyFrame.food[i]!;
    const ts = tsFrame.food[i]!;
    compareNumber(differences, pyFrame.tick, `food[${i}].x`, py.x, ts.x, POSITION_TOLERANCE);
    compareNumber(differences, pyFrame.tick, `food[${i}].y`, py.y, ts.y, POSITION_TOLERANCE);
  }
}

function compareValue(differences: FrameDifference[], tick: number, field: string, pythonValue: unknown, tsValue: unknown): void {
  if (pythonValue !== tsValue) differences.push({ tick, field, pythonValue, tsValue });
}

function compareNumber(differences: FrameDifference[], tick: number, field: string, pythonValue: number, tsValue: number, tolerance: number): void {
  if (Math.abs(pythonValue - tsValue) > tolerance) differences.push({ tick, field, pythonValue, tsValue, tolerance });
}
