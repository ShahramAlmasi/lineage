import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { WorldStatistics } from "../../simulation/types";
import type { SimState } from "../../workers/simulation.worker";
import { Sparkline, LineChart, Histogram } from "./StatsGraph";

interface StatsPanelProps {
  stats: WorldStatistics | null;
  state: SimState | null;
  isRunning: boolean;
  maxHistory?: number;
}

interface HistoryPoint {
  tick: number;
  population: number;
  speciesCount: number;
  foodCount: number;
  averageEnergy: number;
  averageAge: number;
  maxAge: number;
  totalBirths: number;
  totalDeaths: number;
  averageFitness: number;
}

interface StatRowProps {
  label: string;
  value: string | number;
  sparklineData: number[];
  color?: string;
}

const StatRow = memo(function StatRow({ label, value, sparklineData, color = "#e8d5b7" }: StatRowProps) {
  const formatted =
    typeof value === "number"
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : value;

  const labelStyle: CSSProperties = {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(224,224,224,0.6)",
  };

  const valueStyle: CSSProperties = {
    fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: "13px",
    fontVariantNumeric: "tabular-nums",
    color: "#e0e0e0",
    minWidth: "48px",
    textAlign: "right",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "6px 0",
        borderBottom: "1px solid rgba(232,213,183,0.06)",
      }}
    >
      <span style={labelStyle}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Sparkline data={sparklineData} width={60} height={18} color={color} fillOpacity={0.1} />
        <span style={valueStyle}>{formatted}</span>
      </div>
    </div>
  );
});

export const StatsPanel = memo(function StatsPanel({
  stats,
  state,
  isRunning,
  maxHistory = 200,
}: StatsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const historyRef = useRef<HistoryPoint[]>([]);
  const tickCounterRef = useRef(0);

  const computeAverageFitness = useCallback((organisms: SimState["organisms"]) => {
    if (!organisms || organisms.length === 0) return 0;
    const alive = organisms.filter((o) => o.alive);
    if (alive.length === 0) return 0;
    const total = alive.reduce((sum, o) => sum + o.energy * o.size, 0);
    return total / alive.length;
  }, []);

  useEffect(() => {
    if (!stats) return;

    const avgFitness = state ? computeAverageFitness(state.organisms) : 0;
    const point: HistoryPoint = {
      tick: stats.tick,
      population: stats.population,
      speciesCount: state?.speciesCount ?? 0,
      foodCount: stats.foodCount,
      averageEnergy: stats.averageEnergy,
      averageAge: stats.averageAge,
      maxAge: stats.maxAge,
      totalBirths: stats.totalBirths,
      totalDeaths: stats.totalDeaths,
      averageFitness: avgFitness,
    };

    const next = [...historyRef.current, point];
    if (next.length > maxHistory) {
      next.shift();
    }
    historyRef.current = next;

    tickCounterRef.current++;
    if (!isRunning || tickCounterRef.current % 3 === 0) {
      setHistory(next);
    }
  }, [stats, state, isRunning, maxHistory, computeAverageFitness]);

  useEffect(() => {
    if (!isRunning && historyRef.current !== history) {
      setHistory(historyRef.current);
    }
  }, [isRunning, history]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const chartData = useMemo(() => ({
    popData: history.map((h) => h.population),
    speciesData: history.map((h) => h.speciesCount),
    foodData: history.map((h) => h.foodCount),
    energyData: history.map((h) => h.averageEnergy),
    ageData: history.map((h) => h.averageAge),
    maxAgeData: history.map((h) => h.maxAge),
    birthsData: history.map((h) => h.totalBirths),
    deathsData: history.map((h) => h.totalDeaths),
    fitnessData: history.map((h) => h.averageFitness),
    populationLine: history.map((h) => ({ x: h.tick, y: h.population })),
    speciesLine: history.map((h) => ({ x: h.tick, y: h.speciesCount })),
  }), [history]);

  const energyDistribution = useMemo(
    () => state?.organisms?.filter((o) => o.alive).map((o) => o.energy) ?? [],
    [state],
  );

  if (!stats) {
    return null;
  }

  const current = history[history.length - 1];

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: "16px",
    right: "16px",
    width: "320px",
    background: "rgba(10, 10, 10, 0.88)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(232, 213, 183, 0.12)",
    borderRadius: "8px",
    color: "#e0e0e0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    zIndex: 1000,
    overflow: "hidden",
    transition: "box-shadow 0.2s ease",
    boxShadow: collapsed
      ? "0 2px 8px rgba(0,0,0,0.3)"
      : "0 8px 32px rgba(0,0,0,0.4)",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: collapsed
      ? "none"
      : "1px solid rgba(232, 213, 183, 0.12)",
    transition: "background 0.15s ease",
  };

  const indicatorColor = isRunning ? "#4ade80" : "#f87171";
  const indicatorShadow = isRunning
    ? "0 0 6px rgba(74,222,128,0.4)"
    : "0 0 6px rgba(248,113,113,0.4)";

  return (
    <div style={panelStyle}>
      <div
        style={headerStyle}
        onClick={toggleCollapsed}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "rgba(232, 213, 183, 0.05)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: indicatorColor,
              boxShadow: indicatorShadow,
              transition: "background 0.3s ease",
            }}
          />
          <span
            style={{
              fontWeight: 600,
              fontSize: "13px",
              letterSpacing: "0.02em",
            }}
          >
            Statistics
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "10px",
              color: "rgba(224,224,224,0.4)",
              marginLeft: "4px",
            }}
          >
            tick {stats.tick.toLocaleString()}
          </span>
        </div>
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.2s ease",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            color: "rgba(232, 213, 183, 0.6)",
            fontSize: "12px",
          }}
        >
          ▼
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: "8px 16px 16px" }}>
          <StatRow
            label="Population"
            value={current?.population ?? stats.population}
              sparklineData={chartData.popData}
            color="#4ade80"
          />
          <StatRow
            label="Species"
            value={current?.speciesCount ?? state?.speciesCount ?? 0}
              sparklineData={chartData.speciesData}
            color="#60a5fa"
          />
          <StatRow
            label="Food"
            value={current?.foodCount ?? stats.foodCount}
              sparklineData={chartData.foodData}
            color="#fbbf24"
          />
          <StatRow
            label="Avg Energy"
            value={current?.averageEnergy ?? stats.averageEnergy}
              sparklineData={chartData.energyData}
            color="#f472b6"
          />
          <StatRow
            label="Avg Fitness"
            value={current?.averageFitness ?? 0}
              sparklineData={chartData.fitnessData}
            color="#a78bfa"
          />
          <StatRow
            label="Avg Age"
            value={current?.averageAge ?? stats.averageAge}
              sparklineData={chartData.ageData}
            color="#22d3ee"
          />
          <StatRow
            label="Max Age"
            value={current?.maxAge ?? stats.maxAge}
              sparklineData={chartData.maxAgeData}
            color="#fb923c"
          />
          <StatRow
            label="Births"
            value={current?.totalBirths ?? stats.totalBirths}
              sparklineData={chartData.birthsData}
            color="#34d399"
          />
          <StatRow
            label="Deaths"
            value={current?.totalDeaths ?? stats.totalDeaths}
              sparklineData={chartData.deathsData}
            color="#f87171"
          />

          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(224,224,224,0.5)",
                  marginBottom: "6px",
                }}
              >
                Population Over Time
              </div>
              <LineChart
                data={chartData.populationLine}
                width={288}
                height={100}
                color="#4ade80"
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(224,224,224,0.5)",
                  marginBottom: "6px",
                }}
              >
                Species Diversity Over Time
              </div>
              <LineChart
                data={chartData.speciesLine}
                width={288}
                height={100}
                color="#60a5fa"
              />
            </div>

            <div>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(224,224,224,0.5)",
                  marginBottom: "6px",
                }}
              >
                Energy Distribution
              </div>
              <Histogram
                data={energyDistribution}
                bins={14}
                width={288}
                height={100}
                color="#f472b6"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
