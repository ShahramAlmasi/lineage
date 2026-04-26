import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlaybackControls from "./PlaybackControls";
import type {
  RecordingFrame,
  RecordingSummary,
  RecordedEvent,
} from "../../simulation/recording";

export interface RecordingLoaderProps {
  /** Called whenever the currently displayed frame changes. `null` when unloaded. */
  onFrameUpdate: (frame: RecordingFrame | null) => void;
  /** Called with all events from frames 0..currentFrame. */
  onAllEvents?: (events: RecordedEvent[]) => void;
  /** Called once after a recording is loaded with the world dimensions. */
  onWorldSize?: (width: number, height: number) => void;
}

const MemoizedRecordingLoader = memo(RecordingLoader);

type LoadState = "idle" | "loading" | "loaded" | "error";

interface ParseResult {
  frames: RecordingFrame[];
  errors: number;
  fileName: string;
}

async function streamParseJsonl(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<ParseResult> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const totalSize = file.size;
  let bytesRead = 0;
  let buffer = "";
  const frames: RecordingFrame[] = [];
  let errors = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.length;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (validateFrame(parsed)) {
          frames.push(parsed);
        } else {
          errors++;
          console.warn("RecordingLoader: invalid frame structure, skipping line.");
        }
      } catch {
        errors++;
      }
    }

    onProgress(bytesRead / totalSize);
  }

  if (buffer.trim().length > 0) {
    try {
      const parsed = JSON.parse(buffer.trim());
      if (validateFrame(parsed)) {
        frames.push(parsed);
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return { frames, errors, fileName: file.name };
}

function validateFrame(obj: unknown): obj is RecordingFrame {
  if (typeof obj !== "object" || obj === null) return false;
  const f = obj as Record<string, unknown>;
  return (
    typeof f.tick === "number" &&
    Array.isArray(f.organisms) &&
    Array.isArray(f.food) &&
    typeof f.stats === "object" &&
    f.stats !== null &&
    typeof (f.stats as Record<string, unknown>).tick === "number"
  );
}

function computeSummary(frames: RecordingFrame[]): RecordingSummary {
  if (frames.length === 0) {
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

  for (const frame of frames) {
    const pop = frame.stats.population;
    if (pop > maxPop) maxPop = pop;
    if (pop < minPop) minPop = pop;

    const livingSpecies = Object.values(frame.species.species).filter(
      (s) => s.extinct_at_tick === null || s.extinct_at_tick === undefined,
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
    total_ticks: frames[frames.length - 1].tick,
    frames_recorded: frames.length,
    initial_population: frames[0].stats.population,
    final_population: frames[frames.length - 1].stats.population,
    max_population: maxPop,
    min_population: minPop === Infinity ? 0 : minPop,
    max_species: maxSpecies,
    speciation_events: totalSpeciation,
    extinction_events: totalExtinction,
  };
}

function RecordingLoader({
  onFrameUpdate,
  onAllEvents,
  onWorldSize,
}: RecordingLoaderProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [frames, setFrames] = useState<RecordingFrame[]>([]);
  const [summary, setSummary] = useState<RecordingSummary | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const framesRef = useRef<RecordingFrame[]>([]);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const lastTimeRef = useRef(0);
  const accumulatorRef = useRef(0);
  const onFrameUpdateRef = useRef(onFrameUpdate);
  const onAllEventsRef = useRef(onAllEvents);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    onFrameUpdateRef.current = onFrameUpdate;
  }, [onFrameUpdate]);
  useEffect(() => {
    onAllEventsRef.current = onAllEvents;
  }, [onAllEvents]);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragging(true);
    };
    const handleDragLeave = () => {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        void handleFile(files[0]);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleFile(file);
      }
      e.target.value = "";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [],
  );

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".jsonl")) {
      setError(`Invalid file type: "${file.name}". Expected .jsonl format.`);
      setLoadState("error");
      return;
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
    setCurrentIndex(0);
    currentIndexRef.current = 0;

    setLoadState("loading");
    setProgress(0);
    setError(null);
    setFileName(file.name);

    try {
      const result = await streamParseJsonl(file, setProgress);

      if (result.frames.length === 0) {
        setError(
          result.errors > 0
            ? `No valid frames found in "${file.name}". ${result.errors} parse error(s).`
            : `"${file.name}" contains no frames.`,
        );
        setLoadState("error");
        return;
      }

      result.frames.sort((a, b) => a.tick - b.tick);

      const summ = computeSummary(result.frames);

      setFrames(result.frames);
      framesRef.current = result.frames;
      setSummary(summ);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      setLoadState("loaded");

      onFrameUpdateRef.current(result.frames[0]);
      onWorldSize?.(
        result.frames[0].stats.world_width,
        result.frames[0].stats.world_height,
      );

      if (result.frames[0].events.length > 0) {
        onAllEventsRef.current?.(result.frames[0].events);
      }
    } catch (err) {
      setError(
        `Failed to read "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
      setLoadState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitEventsUpTo = useCallback(
    (idx: number) => {
      if (!onAllEvents) return;
      const events: RecordedEvent[] = [];
      for (let i = 0; i <= idx; i++) {
        events.push(...frames[i].events);
      }
      onAllEvents(events);
    },
    [onAllEvents, frames],
  );

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;

    lastTimeRef.current = 0;
    accumulatorRef.current = 0;
    let frameId: number;

    const BASE_FPS = 60;
    const targetFPS = BASE_FPS * speed;
    const frameDuration = 1000 / targetFPS;

    const tick = (now: number) => {
      if (!isPlayingRef.current) return;

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
      }

      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;
      accumulatorRef.current += delta;

      const fr = framesRef.current;
      let advanced = false;

      while (accumulatorRef.current >= frameDuration && isPlayingRef.current) {
        accumulatorRef.current -= frameDuration;
        const nextIdx = currentIndexRef.current + 1;
        if (nextIdx >= fr.length) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          break;
        }
        currentIndexRef.current = nextIdx;
        advanced = true;
      }

      if (advanced) {
        const idx = currentIndexRef.current;
        setCurrentIndex(idx);
        onFrameUpdateRef.current(fr[idx]);

        if (onAllEventsRef.current) {
          const events: RecordedEvent[] = [];
          for (let i = 0; i <= idx; i++) {
            events.push(...fr[i].events);
          }
          onAllEventsRef.current(events);
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, speed, frames.length]);

  const handlePlay = useCallback(() => {
    if (frames.length === 0) return;
    if (currentIndexRef.current >= frames.length - 1) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
      onFrameUpdateRef.current(frames[0]);
      emitEventsUpTo(0);
    }
    setIsPlaying(true);
  }, [frames, emitEventsUpTo]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStep = useCallback(() => {
    if (frames.length === 0) return;
    setIsPlaying(false);
    const nextIdx = Math.min(currentIndexRef.current + 1, frames.length - 1);
    currentIndexRef.current = nextIdx;
    setCurrentIndex(nextIdx);
    onFrameUpdateRef.current(frames[nextIdx]);
    emitEventsUpTo(nextIdx);
  }, [frames, emitEventsUpTo]);

  const handleReset = useCallback(() => {
    if (frames.length === 0) return;
    setIsPlaying(false);
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    onFrameUpdateRef.current(frames[0]);
    emitEventsUpTo(0);
  }, [frames, emitEventsUpTo]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  const handleScrub = useCallback(
    (tick: number) => {
      if (frames.length === 0) return;
      let bestIdx = 0;
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].tick <= tick) bestIdx = i;
        else break;
      }
      currentIndexRef.current = bestIdx;
      setCurrentIndex(bestIdx);
      onFrameUpdateRef.current(frames[bestIdx]);
      emitEventsUpTo(bestIdx);
    },
    [frames, emitEventsUpTo],
  );

  const handleUnload = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setFrames([]);
    framesRef.current = [];
    setSummary(null);
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setFileName(null);
    setLoadState("idle");
    onFrameUpdateRef.current(null);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const totalTicks = useMemo(
    () => (frames.length > 0 ? frames[frames.length - 1].tick : 0),
    [frames],
  );
  const currentTick = useMemo(
    () => (frames.length > 0 && currentIndex < frames.length ? frames[currentIndex].tick : 0),
    [frames, currentIndex],
  );

  const currentFrame = useMemo(
    () => (frames.length > 0 && currentIndex < frames.length ? frames[currentIndex] : null),
    [frames, currentIndex],
  );

  return (
    <>
      {isDragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(10, 10, 10, 0.85)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              border: "2px dashed rgba(232, 213, 183, 0.5)",
              borderRadius: 16,
              padding: "48px 64px",
              color: "#e8d5b7",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.8 }}>
              &#x1F4C2;
            </div>
            <div>Drop .jsonl recording here</div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(224, 224, 224, 0.5)",
                marginTop: 8,
              }}
            >
              Python Lineage recordings only
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".jsonl"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />

      <div
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          width: collapsed && loadState === "loaded" ? 200 : 300,
          background: "rgba(10, 10, 10, 0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(232, 213, 183, 0.12)",
          borderRadius: 8,
          color: "#e0e0e0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 13,
          zIndex: 1000,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          transition: "width 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            cursor: loadState === "loaded" ? "pointer" : "default",
            userSelect: "none",
            borderBottom:
              loadState !== "idle" && !collapsed
                ? "1px solid rgba(232, 213, 183, 0.1)"
                : "none",
          }}
          onClick={loadState === "loaded" ? toggleCollapsed : undefined}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 14,
                opacity: 0.8,
              }}
            >
              &#x23FA;
            </span>
            <span
              style={{
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: "0.02em",
              }}
            >
              Recording
            </span>
            {fileName && loadState === "loaded" && (
              <span
                style={{
                  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                  fontSize: 10,
                  color: "rgba(224,224,224,0.4)",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileName}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {loadState !== "idle" && (
              <span
                style={{
                  display: "inline-block",
                  transition: "transform 0.2s ease",
                  transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  color: "rgba(232, 213, 183, 0.6)",
                  fontSize: 11,
                }}
              >
                &#x25BC;
              </span>
            )}
          </div>
        </div>

        {!collapsed && (
          <div style={{ padding: "10px 14px 14px" }}>
            {loadState === "idle" && (
              <button
                onClick={handleFilePicker}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(232, 213, 183, 0.12)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(232, 213, 183, 0.06)";
                }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "rgba(232, 213, 183, 0.06)",
                  border: "1px dashed rgba(232, 213, 183, 0.3)",
                  borderRadius: 6,
                  color: "#e8d5b7",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  transition: "background 0.15s ease",
                }}
              >
                &#x1F4C2; Load .jsonl Recording
              </button>
            )}

            {loadState === "loading" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(224, 224, 224, 0.6)",
                  }}
                >
                  Parsing {fileName}...
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 4,
                    background: "rgba(232, 213, 183, 0.15)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(progress * 100)}%`,
                      height: "100%",
                      background: "#e8d5b7",
                      borderRadius: 2,
                      transition: "width 0.15s ease-out",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                    fontSize: 11,
                    color: "rgba(224, 224, 224, 0.5)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Math.round(progress * 100)}%
                </div>
              </div>
            )}

            {loadState === "error" && error && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "#f87171",
                    lineHeight: 1.5,
                    wordBreak: "break-word" as const,
                  }}
                >
                  {error}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleFilePicker}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(232, 213, 183, 0.12)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(232, 213, 183, 0.06)";
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "rgba(232, 213, 183, 0.06)",
                      border: "1px solid rgba(232, 213, 183, 0.2)",
                      borderRadius: 6,
                      color: "#e8d5b7",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      transition: "background 0.15s ease",
                    }}
                  >
                    Browse...
                  </button>
                  <button
                    onClick={() => setLoadState("idle")}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(232, 213, 183, 0.12)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(232, 213, 183, 0.06)";
                    }}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(232, 213, 183, 0.06)",
                      border: "1px solid rgba(232, 213, 183, 0.2)",
                      borderRadius: 6,
                      color: "rgba(224, 224, 224, 0.6)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      transition: "background 0.15s ease",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {loadState === "loaded" && summary && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px 12px",
                  }}
                >
                  <MetaRow label="Ticks" value={summary.total_ticks.toLocaleString()} />
                  <MetaRow label="Frames" value={summary.frames_recorded.toLocaleString()} />
                  <MetaRow
                    label="World"
                    value={
                      currentFrame
                        ? `${currentFrame.stats.world_width}×${currentFrame.stats.world_height}`
                        : "—"
                    }
                  />
                  <MetaRow label="Species" value={`${summary.max_species}`} />
                  <MetaRow label="Population" value={`${summary.initial_population} → ${summary.final_population}`} />
                  <MetaRow label="Peak" value={`${summary.max_population.toLocaleString()}`} />
                  <MetaRow label="Speciations" value={`${summary.speciation_events}`} />
                  <MetaRow label="Extinctions" value={`${summary.extinction_events}`} />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnload();
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(248, 113, 113, 0.12)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(248, 113, 113, 0.06)";
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 12px",
                    background: "rgba(248, 113, 113, 0.06)",
                    border: "1px solid rgba(248, 113, 113, 0.2)",
                    borderRadius: 6,
                    color: "rgba(248, 113, 113, 0.8)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 11,
                    transition: "background 0.15s ease",
                  }}
                >
                  Unload Recording
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loadState === "loaded" && frames.length > 0 && (
        <PlaybackControls
          isRunning={isPlaying}
          isInitialized={true}
          currentTick={currentTick}
          totalTicks={totalTicks}
          speed={speed}
          hasHistory={true}
          isRecording={false}
          onPlay={handlePlay}
          onPause={handlePause}
          onStep={handleStep}
          onReset={handleReset}
          onSpeedChange={handleSpeedChange}
          onScrub={handleScrub}
        />
      )}
    </>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(224,224,224,0.45)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
          color: "#e0e0e0",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default MemoizedRecordingLoader;
