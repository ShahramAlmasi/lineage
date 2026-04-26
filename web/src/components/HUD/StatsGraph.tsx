import type { CSSProperties } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "#e8d5b7",
  fillOpacity = 0.15,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} style={{ opacity: 0.3 }}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="2,2"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon points={fillPoints} fill={color} fillOpacity={fillOpacity} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LineChartProps {
  data: { x: number; y: number }[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export function LineChart({
  data,
  width = 300,
  height = 120,
  color = "#e8d5b7",
  strokeWidth = 2,
}: LineChartProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} style={{ opacity: 0.3 }}>
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill={color}
          fontSize={12}
        >
          collecting data...
        </text>
      </svg>
    );
  }

  const padding = { top: 8, right: 8, bottom: 24, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minX = data[0].x;
  const maxX = data[data.length - 1].x;
  const xRange = maxX - minX || 1;

  const yValues = data.map((d) => d.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const yPad = (maxY - minY || 1) * 0.1;
  const yMin = Math.max(0, minY - yPad);
  const yMax = maxY + yPad;
  const ySpan = yMax - yMin || 1;

  const sx = (x: number) => padding.left + ((x - minX) / xRange) * chartW;
  const sy = (y: number) => padding.top + chartH - ((y - yMin) / ySpan) * chartH;

  const points = data.map((d) => `${sx(d.x)},${sy(d.y)}`).join(" ");

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const y = yMin + (i / yTicks) * ySpan;
    const yPos = sy(y);
    return (
      <g key={`grid-${i}`}>
        <line
          x1={padding.left}
          y1={yPos}
          x2={width - padding.right}
          y2={yPos}
          stroke="rgba(232,213,183,0.1)"
          strokeWidth={0.5}
        />
        <text
          x={padding.left - 6}
          y={yPos + 3}
          textAnchor="end"
          fill="rgba(224,224,224,0.5)"
          fontSize={9}
          fontFamily="monospace"
        >
          {Math.round(y).toLocaleString()}
        </text>
      </g>
    );
  });

  const xTickIdx = [0, Math.floor(data.length / 2), data.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const xTicks = xTickIdx.map((i) => {
    const d = data[i];
    return (
      <text
        key={`xtick-${i}`}
        x={sx(d.x)}
        y={height - 6}
        textAnchor="middle"
        fill="rgba(224,224,224,0.5)"
        fontSize={9}
        fontFamily="monospace"
      >
        {d.x.toLocaleString()}
      </text>
    );
  });

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {gridLines}
      {xTicks}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartH}
        x2={width - padding.right}
        y2={padding.top + chartH}
        stroke="rgba(232,213,183,0.2)"
        strokeWidth={0.5}
      />
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + chartH}
        stroke="rgba(232,213,183,0.2)"
        strokeWidth={0.5}
      />
    </svg>
  );
}

interface HistogramProps {
  data: number[];
  bins?: number;
  width?: number;
  height?: number;
  color?: string;
}

export function Histogram({
  data,
  bins = 12,
  width = 300,
  height = 120,
  color = "#e8d5b7",
}: HistogramProps) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} style={{ opacity: 0.3 }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill={color} fontSize={12}>
          no data
        </text>
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const binW = range / bins;

  const counts = new Array(bins).fill(0);
  for (const v of data) {
    const idx = Math.min(Math.floor((v - min) / binW), bins - 1);
    counts[idx]++;
  }

  const maxCount = Math.max(...counts);
  const pad = { top: 8, right: 8, bottom: 24, left: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const barW = chartW / bins;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {counts.map((count, i) => {
        const barH = (count / maxCount) * chartH;
        const x = pad.left + i * barW;
        const y = pad.top + chartH - barH;
        return (
          <rect
            key={i}
            x={x + 1}
            y={y}
            width={barW - 2}
            height={barH}
            fill={color}
            fillOpacity={0.6 + (i / bins) * 0.4}
            rx={1}
          />
        );
      })}
      <text
        x={pad.left}
        y={height - 6}
        textAnchor="middle"
        fill="rgba(224,224,224,0.5)"
        fontSize={9}
        fontFamily="monospace"
      >
        {Math.round(min)}
      </text>
      <text
        x={width - pad.right}
        y={height - 6}
        textAnchor="middle"
        fill="rgba(224,224,224,0.5)"
        fontSize={9}
        fontFamily="monospace"
      >
        {Math.round(max)}
      </text>
      <line
        x1={pad.left}
        y1={pad.top + chartH}
        x2={width - pad.right}
        y2={pad.top + chartH}
        stroke="rgba(232,213,183,0.2)"
        strokeWidth={0.5}
      />
    </svg>
  );
}

interface MiniBarProps {
  value: number;
  max: number;
  width?: number;
  height?: number;
  color?: string;
  backgroundColor?: string;
}

export function MiniBar({
  value,
  max,
  width = 60,
  height = 4,
  color = "#e8d5b7",
  backgroundColor = "rgba(232,213,183,0.1)",
}: MiniBarProps) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const barStyle: CSSProperties = {
    width: `${ratio * 100}%`,
    height: "100%",
    background: color,
    borderRadius: "2px",
    transition: "width 0.2s ease",
  };
  const trackStyle: CSSProperties = {
    width,
    height,
    background: backgroundColor,
    borderRadius: "2px",
    overflow: "hidden",
  };
  return (
    <div style={trackStyle}>
      <div style={barStyle} />
    </div>
  );
}
