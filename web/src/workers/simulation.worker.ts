/**
 * Web Worker that runs the simulation loop off the main thread.
 *
 * Message protocol (inbound):
 *   INIT      { config: SimulationConfig }           — create & initialize simulation
 *   TICK                                                   — advance one tick
 *   RUN       { ticks: number, throttleMs?: number }  — run N ticks (throttled state posts)
 *   STOP                                                  — pause a running loop
 *   GET_STATE                                             — request full state snapshot
 *
 * Message protocol (outbound):
 *   INITIALIZED   — simulation ready
 *   TICK_COMPLETE { tick: number }
 *   RUN_COMPLETE  — requested batch finished
 *   STOPPED       — loop paused
 *   STATE         { state: SimState }
 *   STATS         { stats: WorldStatistics }
 *   EVENT         { events: SimulationEvent[] }
 *   ERROR         { error: string }
 */

import type { SimulationConfig, WorldStatistics, SimulationEvent } from "../simulation/types";
import { Simulation } from "../simulation/simulation";

export interface SimState {
  tick: number;
  organisms: Array<{
    id: number;
    x: number;
    y: number;
    energy: number;
    size: number;
    hue: number;
    shape: string;
    speciesId: number;
    alive: boolean;
  }>;
  food: Array<{ x: number; y: number; energy: number }>;
  speciesCount: number;
}

interface InitMessage {
  type: "INIT";
  config: SimulationConfig;
}

interface TickMessage {
  type: "TICK";
}

interface RunMessage {
  type: "RUN";
  ticks: number;
  throttleMs?: number;
}

interface StopMessage {
  type: "STOP";
}

interface GetStateMessage {
  type: "GET_STATE";
}

type InboundMessage = InitMessage | TickMessage | RunMessage | StopMessage | GetStateMessage;
interface OutboundMessage {
  type: "INITIALIZED" | "TICK_COMPLETE" | "RUN_COMPLETE" | "STOPPED" | "STATE" | "STATS" | "EVENT" | "ERROR";
  [key: string]: unknown;
}

interface SimulationEngine {
  initialize(): void;
  runTick(): WorldStatistics;
  getEvents(): SimulationEvent[];
  getState(): SimState;
}

let sim: SimulationEngine | null = null;
let running = false;

function post(msg: OutboundMessage): void {
  self.postMessage(msg);
}

function createSimulation(config: SimulationConfig): SimulationEngine {
  return new Simulation(config);
}

function runLoop(ticks: number, throttleMs: number): void {
  if (!sim || !running) return;

  let ticksRun = 0;
  let lastPostTime = performance.now();

  const batchSize = throttleMs > 0 ? 1 : 50;

  function step(): void {
    if (!running) return;

    const batchEnd = Math.min(ticksRun + batchSize, ticks);
    while (ticksRun < batchEnd && running) {
      const stats = sim!.runTick();
      ticksRun++;

      const events = sim!.getEvents();
      const now = performance.now();
      if (now - lastPostTime >= throttleMs || ticksRun >= ticks) {
        post({ type: "STATS", stats });
        if (events.length > 0) {
          post({ type: "EVENT", events: events.slice(-50) });
        }
        lastPostTime = now;
      }
    }

    post({ type: "TICK_COMPLETE", tick: ticksRun });

    if (running && ticksRun < ticks) {
      setTimeout(step, throttleMs > 0 ? throttleMs : 0);
    } else if (ticksRun >= ticks) {
      running = false;
      post({ type: "RUN_COMPLETE" });
    }
  }

  step();
}

self.onmessage = (e: MessageEvent<InboundMessage>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case "INIT": {
        sim = createSimulation(msg.config);
        sim.initialize();
        running = false;
        post({ type: "INITIALIZED" });
        post({ type: "STATE", state: sim.getState() });
        break;
      }

      case "TICK": {
        if (!sim) {
          post({ type: "ERROR", error: "Simulation not initialized" });
          return;
        }
        const stats = sim.runTick();
        const events = sim.getEvents();
        post({ type: "TICK_COMPLETE", tick: stats.tick });
        post({ type: "STATS", stats });
        if (events.length > 0) {
          post({ type: "EVENT", events: events.slice(-50) });
        }
        break;
      }

      case "RUN": {
        if (!sim) {
          post({ type: "ERROR", error: "Simulation not initialized" });
          return;
        }
        running = true;
        runLoop(msg.ticks, msg.throttleMs ?? 16);
        break;
      }

      case "STOP": {
        running = false;
        post({ type: "STOPPED" });
        break;
      }

      case "GET_STATE": {
        if (!sim) {
          post({ type: "ERROR", error: "Simulation not initialized" });
          return;
        }
        post({ type: "STATE", state: sim.getState() });
        break;
      }
    }
  } catch (err) {
    post({
      type: "ERROR",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
