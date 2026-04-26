/**
 * PhylogenyTree — Collapsible phylogenetic tree visualization with two view modes.
 *
 * Tree view: hierarchical SVG tree with species as nodes.
 * Timeline view: horizontal bars showing species lifespans.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Species } from "../../simulation/types";

// ── Design Tokens ───────────────────────────────────────────────────────

const TOKENS = {
  bg: "#0a0a0a",
  panelBg: "rgba(12, 12, 14, 0.92)",
  text: "#e0e0e0",
  textMuted: "#888888",
  accent: "#e8d5b7",
  border: "rgba(232, 213, 183, 0.15)",
  extinct: "#555555",
  tooltipBg: "rgba(20, 20, 24, 0.95)",
  font: 'system-ui, -apple-system, sans-serif',
  nodeRadiusBase: 6,
  levelHeight: 56,
  siblingGap: 24,
  timelineRowHeight: 28,
  timelineBarHeight: 18,
} as const;

// ── HSL → RGB helper (matches InstancedOrganisms) ───────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r, g, b];
}

export default memo(PhylogenyTree);

function speciesColor(species: Species): string {
  const g = species.representativeGenome;
  const [r, gVal, b] = hslToRgb(g.colorHue, g.colorSat, g.colorVal);
  return `rgb(${Math.round(r * 255)}, ${Math.round(gVal * 255)}, ${Math.round(b * 255)})`;
}

function speciesColorFaded(species: Species): string {
  const g = species.representativeGenome;
  const [r, gVal, b] = hslToRgb(g.colorHue, g.colorSat * 0.4, g.colorVal * 0.5);
  return `rgb(${Math.round(r * 255)}, ${Math.round(gVal * 255)}, ${Math.round(b * 255)})`;
}

// ── Tree Data Structures ────────────────────────────────────────────────

interface TreeNode {
  species: Species;
  parentId: number | null;
  children: TreeNode[];
  x: number;
  y: number;
  subtreeWidth: number;
}

interface TimelineRow {
  species: Species;
  y: number;
  depth: number;
}

// ── Props ───────────────────────────────────────────────────────────────

interface PhylogenyTreeProps {
  /** Phylogenetic tree from SpeciesTracker.getPhylogeneticTree() */
  tree: Map<number, { species: Species; parentSpeciesId: number | null }>;
  /** Current simulation tick (for timeline end-of-life) */
  currentTick: number;
  /** Called when a species node/bar is clicked */
  onSpeciesClick?: (speciesId: number) => void;
  /** Currently highlighted species (from external selection) */
  highlightedSpecies?: number | null;
  /** Panel width in pixels */
  width?: number;
  /** Panel height in pixels */
  height?: number;
}

type ViewMode = "tree" | "timeline";

// ── Tooltip ─────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  species: Species | null;
  currentTick: number;
}

const Tooltip = memo(function Tooltip({ state }: { state: TooltipState }) {
  if (!state.visible || !state.species) return null;
  const s = state.species;
  const lifespan =
    s.extinctAtTick !== null
      ? s.extinctAtTick - s.createdAtTick
      : state.currentTick - s.createdAtTick;
  const peakPop = s.memberIds.size;

  return (
    <div
      style={{
        position: "absolute",
        left: state.x + 12,
        top: state.y - 12,
        background: TOKENS.tooltipBg,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 6,
        padding: "8px 12px",
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        fontSize: 12,
        lineHeight: 1.5,
        pointerEvents: "none",
        zIndex: 1000,
        whiteSpace: "nowrap",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontWeight: 600, color: TOKENS.accent, marginBottom: 4 }}>
        Species {s.id}
        {s.extinctAtTick !== null && (
          <span style={{ color: TOKENS.extinct, marginLeft: 8 }}>(extinct)</span>
        )}
      </div>
      <div style={{ color: TOKENS.textMuted }}>
        Lifespan: {s.createdAtTick} → {s.extinctAtTick ?? "now"} ({lifespan} ticks)
      </div>
      <div style={{ color: TOKENS.textMuted }}>
        Peak population: {peakPop}
      </div>
      {s.parentSpeciesId !== null && (
        <div style={{ color: TOKENS.textMuted }}>
          Parent: Species {s.parentSpeciesId}
        </div>
      )}
      <div style={{ color: TOKENS.textMuted }}>
        Generation: {s.generationSpawned}
      </div>
    </div>
  );
});

// ── Tree Layout ─────────────────────────────────────────────────────────

function buildTreeNodes(
  tree: Map<number, { species: Species; parentSpeciesId: number | null }>,
): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  // First pass: create nodes
  for (const [id, entry] of tree) {
    const node: TreeNode = {
      species: entry.species,
      parentId: entry.parentSpeciesId,
      children: [],
      x: 0,
      y: 0,
      subtreeWidth: 0,
    };
    nodeMap.set(id, node);
  }

  // Second pass: wire children
  for (const [id, entry] of tree) {
    const node = nodeMap.get(id)!;
    if (entry.parentSpeciesId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(entry.parentSpeciesId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphaned node, treat as root
        roots.push(node);
      }
    }
  }

  // Sort children by species ID for stable layout
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => a.species.id - b.species.id);
  }

  // Compute subtree widths (post-order)
  const computeWidths = (node: TreeNode): number => {
    if (node.children.length === 0) {
      node.subtreeWidth = TOKENS.siblingGap;
      return node.subtreeWidth;
    }
    let width = 0;
    for (const child of node.children) {
      width += computeWidths(child);
    }
    node.subtreeWidth = width;
    return width;
  };

  for (const root of roots) {
    computeWidths(root);
  }

  // Assign positions (pre-order)
  const assignPositions = (node: TreeNode, x: number, y: number): void => {
    node.x = x + node.subtreeWidth / 2;
    node.y = y;
    let childX = x;
    for (const child of node.children) {
      assignPositions(child, childX, y + TOKENS.levelHeight);
      childX += child.subtreeWidth;
    }
  };

  let rootX = 0;
  for (const root of roots) {
    assignPositions(root, rootX, TOKENS.levelHeight);
    rootX += root.subtreeWidth;
  }

  // Return flat list of all nodes
  const allNodes: TreeNode[] = [];
  const collect = (node: TreeNode) => {
    allNodes.push(node);
    for (const child of node.children) collect(child);
  };
  for (const root of roots) collect(root);

  return allNodes;
}

// ── Timeline Layout ─────────────────────────────────────────────────────

function buildTimelineRows(
  tree: Map<number, { species: Species; parentSpeciesId: number | null }>,
): TimelineRow[] {
  const nodeMap = new Map<number, { species: Species; children: number[] }>();
  const roots: number[] = [];

  for (const [id, entry] of tree) {
    nodeMap.set(id, { species: entry.species, children: [] });
  }

  for (const [id, entry] of tree) {
    if (entry.parentSpeciesId === null) {
      roots.push(id);
    } else {
      nodeMap.get(entry.parentSpeciesId)?.children.push(id);
    }
  }

  roots.sort((a, b) => a - b);
  for (const entry of nodeMap.values()) {
    entry.children.sort((a, b) => a - b);
  }

  const rows: TimelineRow[] = [];
  const traverse = (id: number, depth: number) => {
    const entry = nodeMap.get(id);
    if (!entry) return;
    rows.push({ species: entry.species, y: rows.length * TOKENS.timelineRowHeight, depth });
    for (const childId of entry.children) {
      traverse(childId, depth + 1);
    }
  };

  for (const rootId of roots) {
    traverse(rootId, 0);
  }

  return rows;
}

// ── Zoom/Pan State ──────────────────────────────────────────────────────

interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

// ── Tree View ───────────────────────────────────────────────────────────

interface TreeViewProps {
  nodes: TreeNode[];
  highlightedSpecies: number | null;
  onSpeciesHover: (species: Species | null, x: number, y: number) => void;
  onSpeciesClick: (speciesId: number) => void;
  viewport: Viewport;
  setViewport: (v: Viewport | ((prev: Viewport) => Viewport)) => void;
}

function TreeView({
  nodes,
  highlightedSpecies,
  onSpeciesHover,
  onSpeciesClick,
  viewport,
  setViewport,
}: TreeViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport.scale * delta));

      // Zoom towards mouse pointer
      const scaleRatio = newScale / viewport.scale;
      const newTx = mouseX - (mouseX - viewport.tx) * scaleRatio;
      const newTy = mouseY - (mouseY - viewport.ty) * scaleRatio;

      setViewport({ scale: newScale, tx: newTx, ty: newTy });
    },
    [viewport, setViewport],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setViewport((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
      }
    },
    [setViewport],
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleNodeEnter = useCallback(
    (species: Species, e: React.MouseEvent) => {
      onSpeciesHover(species, e.clientX, e.clientY);
    },
    [onSpeciesHover],
  );

  const handleNodeMove = useCallback(
    (species: Species, e: React.MouseEvent) => {
      onSpeciesHover(species, e.clientX, e.clientY);
    },
    [onSpeciesHover],
  );

  const handleNodeLeave = useCallback(() => {
    onSpeciesHover(null, 0, 0);
  }, [onSpeciesHover]);

  // Compute content bounds for viewBox
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }
    // Add padding
    const pad = 40;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }, [nodes]);

  const viewBoxWidth = bounds.maxX - bounds.minX;
  const viewBoxHeight = bounds.maxY - bounds.minY;

  const maxPopulation = useMemo(() => {
    let max = 1;
    for (const node of nodes) {
      max = Math.max(max, node.species.memberIds.size);
    }
    return max;
  }, [nodes]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${bounds.minX} ${bounds.minY} ${viewBoxWidth} ${viewBoxHeight}`}
      style={{
        cursor: dragging.current ? "grabbing" : "grab",
        display: "block",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g
        transform={`translate(${viewport.tx}, ${viewport.ty}) scale(${viewport.scale})`}
      >
        {/* Branch lines */}
        {nodes.map((node) =>
          node.children.map((child) => (
            <line
              key={`branch-${node.species.id}-${child.species.id}`}
              x1={node.x}
              y1={node.y}
              x2={child.x}
              y2={child.y}
              stroke={TOKENS.border}
              strokeWidth={1.5}
              opacity={node.species.extinctAtTick !== null && child.species.extinctAtTick !== null ? 0.4 : 0.8}
            />
          )),
        )}

        {/* Nodes */}
        {nodes.map((node) => {
          const isExtinct = node.species.extinctAtTick !== null;
          const isHighlighted = highlightedSpecies === node.species.id;
          const popRatio = node.species.memberIds.size / maxPopulation;
          const radius = TOKENS.nodeRadiusBase * (0.6 + popRatio * 1.4);
          const color = isExtinct
            ? speciesColorFaded(node.species)
            : speciesColor(node.species);

          return (
            <g
              key={`node-${node.species.id}`}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={(e) => handleNodeEnter(node.species, e)}
              onMouseMove={(e) => handleNodeMove(node.species, e)}
              onMouseLeave={handleNodeLeave}
              onClick={() => onSpeciesClick(node.species.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Glow for highlighted */}
              {isHighlighted && (
                <circle
                  r={radius + 8}
                  fill={color}
                  opacity={0.2}
                />
              )}
              {/* Node circle */}
              <circle
                r={radius}
                fill={color}
                stroke={isHighlighted ? TOKENS.accent : TOKENS.text}
                strokeWidth={isHighlighted ? 2.5 : 1}
                opacity={isExtinct ? 0.45 : 1}
              />
              {/* Species ID label */}
              <text
                y={radius + 14}
                textAnchor="middle"
                fill={isExtinct ? TOKENS.extinct : TOKENS.textMuted}
                fontSize={10}
                fontFamily={TOKENS.font}
                pointerEvents="none"
              >
                {node.species.id}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ── Timeline View ───────────────────────────────────────────────────────

interface TimelineViewProps {
  rows: TimelineRow[];
  currentTick: number;
  highlightedSpecies: number | null;
  onSpeciesHover: (species: Species | null, x: number, y: number) => void;
  onSpeciesClick: (speciesId: number) => void;
  viewport: Viewport;
  setViewport: (v: Viewport | ((prev: Viewport) => Viewport)) => void;
}

function TimelineView({
  rows,
  currentTick,
  highlightedSpecies,
  onSpeciesHover,
  onSpeciesClick,
  viewport,
  setViewport,
}: TimelineViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const maxTick = useMemo(() => {
    let max = currentTick;
    for (const row of rows) {
      if (row.species.extinctAtTick !== null) {
        max = Math.max(max, row.species.extinctAtTick);
      }
    }
    return Math.max(max, 1);
  }, [rows, currentTick]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewport.scale * delta));
      const scaleRatio = newScale / viewport.scale;
      const newTx = mouseX - (mouseX - viewport.tx) * scaleRatio;
      const newTy = mouseY - (mouseY - viewport.ty) * scaleRatio;

      setViewport({ scale: newScale, tx: newTx, ty: newTy });
    },
    [viewport, setViewport],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging.current) {
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setViewport((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
      }
    },
    [setViewport],
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleBarEnter = useCallback(
    (species: Species, e: React.MouseEvent) => {
      onSpeciesHover(species, e.clientX, e.clientY);
    },
    [onSpeciesHover],
  );

  const handleBarMove = useCallback(
    (species: Species, e: React.MouseEvent) => {
      onSpeciesHover(species, e.clientX, e.clientY);
    },
    [onSpeciesHover],
  );

  const handleBarLeave = useCallback(() => {
    onSpeciesHover(null, 0, 0);
  }, [onSpeciesHover]);

  const timeScale = 300 / Math.max(maxTick, 100); // pixels per tick
  const rowHeight = TOKENS.timelineRowHeight;
  const barHeight = TOKENS.timelineBarHeight;
  const leftMargin = 60;
  const topMargin = 30;

  const totalHeight = topMargin + rows.length * rowHeight + 20;
  const totalWidth = leftMargin + maxTick * timeScale + 40;

  // Tick marks every N ticks
  const tickInterval = Math.max(1, Math.pow(10, Math.floor(Math.log10(maxTick / 5))));
  const ticks: number[] = [];
  for (let t = 0; t <= maxTick; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      style={{
        cursor: dragging.current ? "grabbing" : "grab",
        display: "block",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g
        transform={`translate(${viewport.tx}, ${viewport.ty}) scale(${viewport.scale})`}
      >
        {/* Grid lines */}
        {ticks.map((t) => (
          <line
            key={`grid-${t}`}
            x1={leftMargin + t * timeScale}
            y1={topMargin}
            x2={leftMargin + t * timeScale}
            y2={topMargin + rows.length * rowHeight}
            stroke={TOKENS.border}
            strokeWidth={0.5}
            opacity={0.3}
          />
        ))}

        {/* Axis labels */}
        {ticks.map((t) => (
          <text
            key={`tick-${t}`}
            x={leftMargin + t * timeScale}
            y={topMargin - 8}
            textAnchor="middle"
            fill={TOKENS.textMuted}
            fontSize={10}
            fontFamily={TOKENS.font}
          >
            {t}
          </text>
        ))}

        {/* Timeline bars */}
        {rows.map((row) => {
          const s = row.species;
          const isExtinct = s.extinctAtTick !== null;
          const startX = leftMargin + s.createdAtTick * timeScale;
          const endX = leftMargin + (isExtinct ? s.extinctAtTick! : currentTick) * timeScale;
          const width = Math.max(2, endX - startX);
          const y = topMargin + row.y + (rowHeight - barHeight) / 2;
          const isHighlighted = highlightedSpecies === s.id;
          const color = isExtinct
            ? speciesColorFaded(s)
            : speciesColor(s);

          return (
            <g
              key={`bar-${s.id}`}
              onMouseEnter={(e) => handleBarEnter(s, e)}
              onMouseMove={(e) => handleBarMove(s, e)}
              onMouseLeave={handleBarLeave}
              onClick={() => onSpeciesClick(s.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Bar background for hover area */}
              <rect
                x={startX}
                y={y - 2}
                width={width}
                height={barHeight + 4}
                fill="transparent"
              />
              {/* Actual bar */}
              <rect
                x={startX}
                y={y}
                width={width}
                height={barHeight}
                rx={3}
                fill={color}
                stroke={isHighlighted ? TOKENS.accent : "none"}
                strokeWidth={isHighlighted ? 2 : 0}
                opacity={isExtinct ? 0.4 : 0.85}
              />
              {/* Species ID at left of bar */}
              {width > 30 && (
                <text
                  x={startX + 6}
                  y={y + barHeight / 2 + 4}
                  fill={isExtinct ? TOKENS.extinct : TOKENS.text}
                  fontSize={10}
                  fontFamily={TOKENS.font}
                  pointerEvents="none"
                >
                  {s.id}
                </text>
              )}
            </g>
          );
        })}

        {/* Current time indicator */}
        <line
          x1={leftMargin + currentTick * timeScale}
          y1={topMargin}
          x2={leftMargin + currentTick * timeScale}
          y2={topMargin + rows.length * rowHeight}
          stroke={TOKENS.accent}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
      </g>
    </svg>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

function PhylogenyTree({
  tree,
  currentTick,
  onSpeciesClick,
  highlightedSpecies,
  width = 420,
  height = 320,
}: PhylogenyTreeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [treeViewport, setTreeViewport] = useState<Viewport>({
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const [timelineViewport, setTimelineViewport] = useState<Viewport>({
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    species: null,
    currentTick,
  });

  // Reset viewports when tree data changes significantly
  const treeKey = useMemo(() => {
    const ids = Array.from(tree.keys()).sort((a, b) => a - b);
    return ids.join(",");
  }, [tree]);

  useEffect(() => {
    setTreeViewport({ scale: 1, tx: 0, ty: 0 });
    setTimelineViewport({ scale: 1, tx: 0, ty: 0 });
  }, [treeKey]);

  const handleSpeciesHover = useCallback(
    (species: Species | null, x: number, y: number) => {
      if (species) {
        setTooltip({
          visible: true,
          x,
          y,
          species,
          currentTick,
        });
      } else {
        setTooltip((prev) => ({ ...prev, visible: false }));
      }
    },
    [currentTick],
  );

  const handleSpeciesClickInternal = useCallback(
    (speciesId: number) => {
      onSpeciesClick?.(speciesId);
    },
    [onSpeciesClick],
  );

  const treeNodes = useMemo(() => buildTreeNodes(tree), [tree]);
  const timelineRows = useMemo(() => buildTimelineRows(tree), [tree]);

  const speciesCount = tree.size;
  const extinctCount = useMemo(() => {
    let count = 0;
    for (const entry of tree.values()) {
      if (entry.species.extinctAtTick !== null) count++;
    }
    return count;
  }, [tree]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        width: collapsed ? "auto" : width,
        height: collapsed ? "auto" : height,
        background: TOKENS.panelBg,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: 10,
        backdropFilter: "blur(12px)",
        fontFamily: TOKENS.font,
        color: TOKENS.text,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease, height 0.2s ease",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: collapsed ? "none" : `1px solid ${TOKENS.border}`,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: TOKENS.accent }}>
            Phylogeny
          </span>
          {!collapsed && (
            <span style={{ fontSize: 11, color: TOKENS.textMuted }}>
              {speciesCount} species ({speciesCount - extinctCount} living)
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: TOKENS.textMuted,
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          ▼
        </span>
      </div>

      {/* Controls (only when expanded) */}
      {!collapsed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderBottom: `1px solid ${TOKENS.border}`,
          }}
        >
          <button
            onClick={() => setViewMode("tree")}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              background: viewMode === "tree" ? TOKENS.accent : "transparent",
              color: viewMode === "tree" ? TOKENS.bg : TOKENS.text,
              fontSize: 11,
              fontFamily: TOKENS.font,
              cursor: "pointer",
              fontWeight: 500,
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            Tree
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "none",
              background: viewMode === "timeline" ? TOKENS.accent : "transparent",
              color: viewMode === "timeline" ? TOKENS.bg : TOKENS.text,
              fontSize: 11,
              fontFamily: TOKENS.font,
              cursor: "pointer",
              fontWeight: 500,
              transition: "background 0.15s ease, color 0.15s ease",
            }}
          >
            Timeline
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              if (viewMode === "tree") {
                setTreeViewport({ scale: 1, tx: 0, ty: 0 });
              } else {
                setTimelineViewport({ scale: 1, tx: 0, ty: 0 });
              }
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: `1px solid ${TOKENS.border}`,
              background: "transparent",
              color: TOKENS.textMuted,
              fontSize: 10,
              fontFamily: TOKENS.font,
              cursor: "pointer",
            }}
            title="Reset view"
          >
            Reset
          </button>
        </div>
      )}

      {/* Content (only when expanded) */}
      {!collapsed && (
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {viewMode === "tree" ? (
            <TreeView
              nodes={treeNodes}
              highlightedSpecies={highlightedSpecies ?? null}
              onSpeciesHover={handleSpeciesHover}
              onSpeciesClick={handleSpeciesClickInternal}
              viewport={treeViewport}
              setViewport={setTreeViewport}
            />
          ) : (
            <TimelineView
              rows={timelineRows}
              currentTick={currentTick}
              highlightedSpecies={highlightedSpecies ?? null}
              onSpeciesHover={handleSpeciesHover}
              onSpeciesClick={handleSpeciesClickInternal}
              viewport={timelineViewport}
              setViewport={setTimelineViewport}
            />
          )}

          {/* Tooltip */}
          <Tooltip state={tooltip} />
        </div>
      )}
    </div>
  );
}
