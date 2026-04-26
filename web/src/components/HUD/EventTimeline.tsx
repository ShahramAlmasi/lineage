import React, { useCallback, useMemo, useRef, useState } from "react";
import type { SimulationEvent } from "../../simulation/types";

const TOKENS = {
  bg: "rgba(13, 13, 13, 0.92)",
  border: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#e8e8e8",
  textSecondary: "#888888",
  textMuted: "#555555",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  fontUi: "system-ui, -apple-system, sans-serif",
  radius: 4,
} as const;

const EVENT_COLORS: Record<string, string> = {
  Speciation: "#4ade80",
  Extinction: "#f87171",
  Birth: "#60a5fa",
  Death: "#9ca3af",
};

function getEventColor(eventType: string): string {
  return EVENT_COLORS[eventType] || "#a0a0a0";
}

interface PopulationPoint {
  tick: number;
  population: number;
}

interface EventTimelineProps {
  events: SimulationEvent[];
  onJumpToTick: (tick: number) => void;
  currentTick?: number;
  populationHistory?: PopulationPoint[];
  maxEvents?: number;
  style?: React.CSSProperties;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  onJumpToTick,
  currentTick = 0,
  populationHistory,
  maxEvents = 1000,
  style,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewWindow, setViewWindow] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWindow = useRef<{ start: number; end: number } | null>(null);

  const limitedEvents = useMemo(() => events.slice(-maxEvents), [events, maxEvents]);

  const maxTick = useMemo(() => {
    const eventMax = limitedEvents.length > 0
      ? limitedEvents[limitedEvents.length - 1].tick
      : currentTick;
    const popMax = populationHistory?.length
      ? populationHistory[populationHistory.length - 1].tick
      : 0;
    return Math.max(eventMax, popMax, currentTick, 100);
  }, [limitedEvents, populationHistory, currentTick]);

  const effectiveWindow = useMemo(() => {
    if (viewWindow) return viewWindow;
    return { start: 0, end: maxTick };
  }, [viewWindow, maxTick]);

  const tickRange = effectiveWindow.end - effectiveWindow.start;

  const zoomIn = useCallback(() => {
    setViewWindow((prev) => {
      const current = prev ?? { start: 0, end: maxTick };
      const range = current.end - current.start;
      const newRange = Math.max(50, range * 0.7);
      const center = (current.start + current.end) / 2;
      return {
        start: Math.max(0, center - newRange / 2),
        end: center + newRange / 2,
      };
    });
  }, [maxTick]);

  const zoomOut = useCallback(() => {
    setViewWindow((prev) => {
      const current = prev ?? { start: 0, end: maxTick };
      const range = current.end - current.start;
      const newRange = Math.min(maxTick * 1.2, range * 1.4);
      const center = (current.start + current.end) / 2;
      return {
        start: Math.max(0, center - newRange / 2),
        end: Math.min(maxTick * 1.05, center + newRange / 2),
      };
    });
  }, [maxTick]);

  const resetZoom = useCallback(() => {
    setViewWindow(null);
  }, []);

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      setIsDragging(true);
      dragStartX.current = e.clientX;
      dragStartWindow.current = { ...effectiveWindow };
    },
    [effectiveWindow]
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging || !svgRef.current || !dragStartWindow.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStartX.current;
      const tickDelta = (dx / rect.width) * tickRange;
      const newStart = dragStartWindow.current.start - tickDelta;
      const newEnd = dragStartWindow.current.end - tickDelta;
      if (newStart >= 0) {
        setViewWindow({ start: newStart, end: newEnd });
      }
    },
    [isDragging, tickRange]
  );

  const handleSvgMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartWindow.current = null;
  }, []);

  const tickToX = useCallback(
    (tick: number, width: number) => {
      const ratio = (tick - effectiveWindow.start) / tickRange;
      return ratio * width;
    },
    [effectiveWindow, tickRange]
  );

  const svgWidth = 800;
  const svgHeight = 100;
  const padding = { top: 8, bottom: 20, left: 0, right: 0 };
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const populationPath = useMemo(() => {
    if (!populationHistory || populationHistory.length < 2) return "";
    const visiblePop = populationHistory.filter(
      (p) => p.tick >= effectiveWindow.start && p.tick <= effectiveWindow.end
    );
    if (visiblePop.length < 2) return "";

    const maxPop = Math.max(...populationHistory.map((p) => p.population), 1);

    let d = "";
    visiblePop.forEach((point, i) => {
      const x = tickToX(point.tick, svgWidth);
      const y = padding.top + chartHeight * (1 - point.population / maxPop);
      if (i === 0) d += `M ${x} ${y}`;
      else d += ` L ${x} ${y}`;
    });

    const lastX = tickToX(visiblePop[visiblePop.length - 1].tick, svgWidth);
    const firstX = tickToX(visiblePop[0].tick, svgWidth);
    d += ` L ${lastX} ${padding.top + chartHeight} L ${firstX} ${padding.top + chartHeight} Z`;

    return d;
  }, [populationHistory, effectiveWindow, tickToX, chartHeight]);

  const populationStroke = useMemo(() => {
    if (!populationHistory || populationHistory.length < 2) return "";
    const visiblePop = populationHistory.filter(
      (p) => p.tick >= effectiveWindow.start && p.tick <= effectiveWindow.end
    );
    if (visiblePop.length < 2) return "";

    const maxPop = Math.max(...populationHistory.map((p) => p.population), 1);

    let d = "";
    visiblePop.forEach((point, i) => {
      const x = tickToX(point.tick, svgWidth);
      const y = padding.top + chartHeight * (1 - point.population / maxPop);
      if (i === 0) d += `M ${x} ${y}`;
      else d += ` L ${x} ${y}`;
    });

    return d;
  }, [populationHistory, effectiveWindow, tickToX, chartHeight]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<number, SimulationEvent[]>();
    limitedEvents.forEach((ev) => {
      if (ev.tick < effectiveWindow.start || ev.tick > effectiveWindow.end) return;
      const existing = groups.get(ev.tick);
      if (existing) existing.push(ev);
      else groups.set(ev.tick, [ev]);
    });
    return groups;
  }, [limitedEvents, effectiveWindow]);

  const currentX = tickToX(currentTick, svgWidth);
  const isCurrentVisible = currentTick >= effectiveWindow.start && currentTick <= effectiveWindow.end;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        left: 412,
        display: "flex",
        flexDirection: "column",
        background: TOKENS.bg,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radius,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: TOKENS.fontUi,
        fontSize: 13,
        color: TOKENS.textPrimary,
        overflow: "hidden",
        zIndex: 100,
        ...style,
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: TOKENS.textSecondary,
          }}
        >
          Event Timeline
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span
            style={{
              fontSize: 11,
              color: TOKENS.textMuted,
              fontFamily: TOKENS.fontMono,
              marginRight: 8,
            }}
          >
            {Math.round(effectiveWindow.start).toLocaleString()} -{" "}
            {Math.round(effectiveWindow.end).toLocaleString()}
          </span>
          <button
            onClick={zoomIn}
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              border: `1px solid ${TOKENS.border}`,
              background: "transparent",
              color: TOKENS.textSecondary,
              fontSize: 14,
              fontFamily: TOKENS.fontMono,
              cursor: "pointer",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.textSecondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            +
          </button>
          <button
            onClick={zoomOut}
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              border: `1px solid ${TOKENS.border}`,
              background: "transparent",
              color: TOKENS.textSecondary,
              fontSize: 14,
              fontFamily: TOKENS.fontMono,
              cursor: "pointer",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.textSecondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            −
          </button>
          <button
            onClick={resetZoom}
            style={{
              padding: "2px 8px",
              borderRadius: 3,
              border: `1px solid ${TOKENS.border}`,
              background: "transparent",
              color: TOKENS.textSecondary,
              fontSize: 11,
              fontFamily: TOKENS.fontUi,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = TOKENS.textSecondary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = TOKENS.border;
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          height: svgHeight,
          cursor: isDragging ? "grabbing" : "grab",
          overflow: "hidden",
        }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          {populationPath && (
            <>
              <path
                d={populationPath}
                fill="rgba(96, 165, 250, 0.08)"
                stroke="none"
              />
              <path
                d={populationStroke}
                fill="none"
                stroke="rgba(96, 165, 250, 0.25)"
                strokeWidth={1.5}
              />
            </>
          )}

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const x = ratio * svgWidth;
            const tick = effectiveWindow.start + ratio * tickRange;
            return (
              <g key={ratio}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={svgHeight - padding.bottom}
                  stroke="rgba(255,255,255,0.03)"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={svgHeight - 4}
                  fill={TOKENS.textMuted}
                  fontSize={9}
                  fontFamily={TOKENS.fontMono}
                  textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
                >
                  {Math.round(tick).toLocaleString()}
                </text>
              </g>
            );
          })}

          {Array.from(groupedEvents.entries()).map(([tick, evs]) => {
            const x = tickToX(tick, svgWidth);
            const yBase = padding.top + chartHeight * 0.5;
            return evs.map((ev, i) => {
              const color = getEventColor(ev.eventType);
              const y = yBase + (i - evs.length / 2) * 7;
              return (
                <g
                  key={`${tick}-${ev.eventType}-${i}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onJumpToTick(tick)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={3}
                    fill={color}
                    opacity={0.9}
                  />
                  <title>
                    {ev.eventType} @ tick {tick.toLocaleString()}: {ev.message}
                  </title>
                </g>
              );
            });
          })}

          {isCurrentVisible && (
            <g>
              <line
                x1={currentX}
                y1={padding.top}
                x2={currentX}
                y2={svgHeight - padding.bottom}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <polygon
                points={`${currentX - 4},${padding.top} ${currentX + 4},${padding.top} ${currentX},${padding.top + 5}`}
                fill="rgba(255,255,255,0.5)"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default EventTimeline;
