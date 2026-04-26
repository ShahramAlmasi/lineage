import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationConfig, SimulationEvent, WorldStatistics } from "../simulation/types";
import type { SimState } from "../workers/simulation.worker";
import SimulationWorker from "../workers/simulation.worker?worker";

const STATS_UPDATE_INTERVAL_TICKS = 10;
const MAX_EVENT_HISTORY = 500;

interface UseSimulationWorkerReturn {
  state: SimState | null;
  stats: WorldStatistics | null;
  events: SimulationEvent[];
  isRunning: boolean;
  isInitialized: boolean;
  error: string | null;
  initialize: (config: SimulationConfig) => void;
  tick: () => void;
  run: (ticks?: number, throttleMs?: number) => void;
  pause: () => void;
  getState: () => void;
  terminate: () => void;
}

export function useSimulationWorker(): UseSimulationWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<SimState | null>(null);
  const [stats, setStats] = useState<WorldStatistics | null>(null);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRunningRef = useRef(false);
  const lastStatsTickRef = useRef(-STATS_UPDATE_INTERVAL_TICKS);
  const eventFlushFrameRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<SimulationEvent[] | null>(null);

  const flushEvents = useCallback(() => {
    eventFlushFrameRef.current = null;
    const pending = pendingEventsRef.current;
    if (!pending) return;
    pendingEventsRef.current = null;
    setEvents(pending.slice(-MAX_EVENT_HISTORY));
  }, []);

  const ensureWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new SimulationWorker();
      workerRef.current.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; [key: string]: unknown };
        switch (msg.type) {
          case "INITIALIZED":
            setIsInitialized(true);
            setError(null);
            break;
          case "STATE":
            setState(msg.state as SimState);
            break;
          case "STATS":
            {
              const nextStats = msg.stats as WorldStatistics;
              if (nextStats.tick - lastStatsTickRef.current >= STATS_UPDATE_INTERVAL_TICKS || !isRunningRef.current) {
                lastStatsTickRef.current = nextStats.tick;
                setStats(nextStats);
              }
            }
            break;
          case "EVENT":
            pendingEventsRef.current = msg.events as SimulationEvent[];
            if (eventFlushFrameRef.current === null) {
              eventFlushFrameRef.current = requestAnimationFrame(flushEvents);
            }
            break;
          case "TICK_COMPLETE":
            break;
          case "RUN_COMPLETE":
            setIsRunning(false);
            isRunningRef.current = false;
            break;
          case "STOPPED":
            setIsRunning(false);
            isRunningRef.current = false;
            break;
          case "ERROR":
            setError(msg.error as string);
            setIsRunning(false);
            isRunningRef.current = false;
            break;
        }
      };
      workerRef.current.onerror = (e: ErrorEvent) => {
        setError(e.message);
        setIsRunning(false);
      };
    }
    return workerRef.current;
  }, [flushEvents]);

  const initialize = useCallback((config: SimulationConfig) => {
    const worker = ensureWorker();
    worker.postMessage({ type: "INIT", config });
  }, [ensureWorker]);

  const tick = useCallback(() => {
    const worker = ensureWorker();
    worker.postMessage({ type: "TICK" });
  }, [ensureWorker]);

  const run = useCallback((ticks = 10000, throttleMs = 16) => {
    const worker = ensureWorker();
    setIsRunning(true);
    isRunningRef.current = true;
    worker.postMessage({ type: "RUN", ticks, throttleMs });
  }, [ensureWorker]);

  const pause = useCallback(() => {
    workerRef.current?.postMessage({ type: "STOP" });
    isRunningRef.current = false;
  }, []);

  const getState = useCallback(() => {
    workerRef.current?.postMessage({ type: "GET_STATE" });
  }, []);

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsRunning(false);
    isRunningRef.current = false;
    setIsInitialized(false);
    setState(null);
    setStats(null);
    setEvents([]);
    setError(null);
    lastStatsTickRef.current = -STATS_UPDATE_INTERVAL_TICKS;
    pendingEventsRef.current = null;
    if (eventFlushFrameRef.current !== null) {
      cancelAnimationFrame(eventFlushFrameRef.current);
      eventFlushFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (eventFlushFrameRef.current !== null) {
        cancelAnimationFrame(eventFlushFrameRef.current);
      }
    };
  }, []);

  return {
    state,
    stats,
    events,
    isRunning,
    isInitialized,
    error,
    initialize,
    tick,
    run,
    pause,
    getState,
    terminate,
  };
}
