import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SimulationEvent } from "../../simulation/types";

const TOKENS = {
  bg: "rgba(13, 13, 13, 0.92)",
  bgHover: "rgba(30, 30, 30, 0.95)",
  border: "rgba(255, 255, 255, 0.08)",
  borderHover: "rgba(255, 255, 255, 0.15)",
  textPrimary: "#e8e8e8",
  textSecondary: "#888888",
  textMuted: "#555555",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  fontUi: "system-ui, -apple-system, sans-serif",
  radius: 4,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
} as const;

const EVENT_COLORS: Record<string, string> = {
  Speciation: "#4ade80",
  Extinction: "#f87171",
  Birth: "#60a5fa",
  Death: "#9ca3af",
};

const ALL_EVENT_TYPES = ["Speciation", "Extinction", "Birth", "Death"];

function getEventColor(eventType: string): string {
  return EVENT_COLORS[eventType] || "#a0a0a0";
}

interface EventLogProps {
  events: SimulationEvent[];
  onJumpToTick: (tick: number) => void;
  currentTick?: number;
  maxEvents?: number;
  style?: React.CSSProperties;
}

export const EventLog: React.FC<EventLogProps> = ({
  events,
  onJumpToTick,
  currentTick,
  maxEvents = 100,
  style,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(ALL_EVENT_TYPES)
  );
  const [userScrolled, setUserScrolled] = useState(false);

  const limitedEvents = useMemo(() => {
    return events.slice(-maxEvents);
  }, [events, maxEvents]);

  const filteredEvents = useMemo(() => {
    return limitedEvents.filter((e) => activeFilters.has(e.eventType));
  }, [limitedEvents, activeFilters]);

  useEffect(() => {
    if (!scrollRef.current || userScrolled) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [filteredEvents, userScrolled]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setUserScrolled(!isAtBottom);
  }, []);

  const toggleFilter = useCallback((type: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        width: 380,
        maxHeight: "calc(100vh - 200px)",
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
          padding: `${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px`,
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
            textTransform: "uppercase" as const,
            color: TOKENS.textSecondary,
          }}
        >
          Event Log
        </span>
        <span style={{ fontSize: 11, color: TOKENS.textMuted, fontFamily: TOKENS.fontMono }}>
          {filteredEvents.length} / {limitedEvents.length}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          gap: TOKENS.spacing.xs,
          padding: `${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px`,
          borderBottom: `1px solid ${TOKENS.border}`,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {ALL_EVENT_TYPES.map((type) => {
          const isActive = activeFilters.has(type);
          const color = getEventColor(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 3,
                border: `1px solid ${isActive ? color : TOKENS.border}`,
                background: isActive ? `${color}15` : "transparent",
                color: isActive ? color : TOKENS.textMuted,
                fontSize: 11,
                fontFamily: TOKENS.fontUi,
                cursor: "pointer",
                transition: "all 0.15s ease",
                opacity: isActive ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = isActive ? "1" : "0.5";
                e.currentTarget.style.borderColor = isActive ? color : TOKENS.border;
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              {type}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 120,
          maxHeight: 320,
          scrollbarWidth: "thin",
          scrollbarColor: `${TOKENS.textMuted} transparent`,
        }}
      >
        {filteredEvents.length === 0 ? (
          <div
            style={{
              padding: TOKENS.spacing.lg,
              textAlign: "center",
              color: TOKENS.textMuted,
              fontSize: 12,
            }}
          >
            No events
          </div>
        ) : (
          filteredEvents.map((event, index) => {
            const color = getEventColor(event.eventType);
            const isCurrent = currentTick !== undefined && event.tick === currentTick;
            const isLast = index === filteredEvents.length - 1;
            return (
              <div
                key={`${event.tick}-${event.eventType}-${index}`}
                onClick={() => onJumpToTick(event.tick)}
                style={{
                  padding: `${TOKENS.spacing.sm}px ${TOKENS.spacing.md}px`,
                  borderBottom: isLast ? "none" : `1px solid ${TOKENS.border}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: TOKENS.spacing.sm,
                  background: isCurrent ? "rgba(255,255,255,0.05)" : "transparent",
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = TOKENS.bgHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div
                  style={{
                    width: 3,
                    minHeight: 28,
                    borderRadius: 2,
                    background: color,
                    flexShrink: 0,
                    marginTop: 2,
                    opacity: 0.8,
                  }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: TOKENS.spacing.sm,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: TOKENS.fontMono,
                        fontSize: 11,
                        color: TOKENS.textSecondary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      tick {event.tick.toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: TOKENS.textMuted,
                        fontFamily: TOKENS.fontMono,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTime(new Date())}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: TOKENS.textPrimary,
                      wordBreak: "break-word" as const,
                    }}
                  >
                    <span
                      style={{
                        color,
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.03em",
                        marginRight: 6,
                      }}
                    >
                      {event.eventType}
                    </span>
                    {event.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const MemoizedEventLog = React.memo(EventLog);

export default MemoizedEventLog;
