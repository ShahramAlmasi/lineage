import React, { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { Organism, Genome, BehaviorNode } from "../../simulation/types";
import { BehaviorNodeType, BehaviorAction, Shape } from "../../simulation/types";
import type { Perception } from "../../simulation/behavior";
import { evaluateCondition, decideAction } from "../../simulation/behavior";

const TOKENS = {
  bg: "rgba(10, 10, 10, 0.92)",
  border: "rgba(232, 213, 183, 0.12)",
  borderHover: "rgba(232, 213, 183, 0.2)",
  accent: "#e8d5b7",
  accentDim: "rgba(232, 213, 183, 0.5)",
  textPrimary: "#e0e0e0",
  textSecondary: "rgba(224, 224, 224, 0.7)",
  textMuted: "rgba(224, 224, 224, 0.45)",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  fontUi: "system-ui, -apple-system, sans-serif",
  radius: 8,
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
  yellow: "#fbbf24",
  pink: "#f472b6",
  cyan: "#22d3ee",
  orange: "#fb923c",
  purple: "#a78bfa",
} as const;

function hslToCss(h: number, s: number, v: number): string {
  return `hsl(${h}, ${s * 100}%, ${v * 100}%)`;
}

function shapeToIcon(shape: Shape): string {
  switch (shape) {
    case Shape.CIRCLE: return "●";
    case Shape.TRIANGLE: return "▲";
    case Shape.SQUARE: return "■";
    case Shape.DIAMOND: return "◆";
    default: return "●";
  }
}

function behaviorNodeTypeLabel(type: BehaviorNodeType): string {
  switch (type) {
    case BehaviorNodeType.FOOD_NEARBY: return "Food Nearby";
    case BehaviorNodeType.PREDATOR_NEARBY: return "Predator Nearby";
    case BehaviorNodeType.MATE_NEARBY: return "Mate Nearby";
    case BehaviorNodeType.ENERGY_ABOVE: return "Energy Above";
    case BehaviorNodeType.ALWAYS: return "Always";
    default: return String(type);
  }
}

function behaviorActionLabel(action: BehaviorAction): string {
  switch (action) {
    case BehaviorAction.MOVE_TOWARD_FOOD: return "Move to Food";
    case BehaviorAction.MOVE_TOWARD_MATE: return "Move to Mate";
    case BehaviorAction.FLEE: return "Flee";
    case BehaviorAction.WANDER: return "Wander";
    case BehaviorAction.REPRODUCE: return "Reproduce";
    case BehaviorAction.REST: return "Rest";
    case BehaviorAction.MOVE_TOWARD_CENTER: return "To Center";
    case BehaviorAction.ATTACK: return "Attack";
    default: return String(action);
  }
}

function actionColor(action: BehaviorAction): string {
  switch (action) {
    case BehaviorAction.MOVE_TOWARD_FOOD: return TOKENS.green;
    case BehaviorAction.MOVE_TOWARD_MATE: return TOKENS.pink;
    case BehaviorAction.FLEE: return TOKENS.red;
    case BehaviorAction.WANDER: return TOKENS.blue;
    case BehaviorAction.REPRODUCE: return TOKENS.purple;
    case BehaviorAction.REST: return TOKENS.cyan;
    case BehaviorAction.MOVE_TOWARD_CENTER: return TOKENS.yellow;
    case BehaviorAction.ATTACK: return TOKENS.orange;
    default: return TOKENS.textMuted;
  }
}

function conditionColor(type: BehaviorNodeType): string {
  switch (type) {
    case BehaviorNodeType.FOOD_NEARBY: return TOKENS.green;
    case BehaviorNodeType.PREDATOR_NEARBY: return TOKENS.red;
    case BehaviorNodeType.MATE_NEARBY: return TOKENS.pink;
    case BehaviorNodeType.ENERGY_ABOVE: return TOKENS.yellow;
    case BehaviorNodeType.ALWAYS: return TOKENS.cyan;
    default: return TOKENS.textMuted;
  }
}

interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  label: string;
  unit?: string;
}

function ProgressBar({ value, max, color = TOKENS.accent, label, unit = "" }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textMuted }}>
          {label}
        </span>
        <span style={{ fontFamily: TOKENS.fontMono, fontSize: 11, color: TOKENS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
          {value.toFixed(2)}{unit}
        </span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s ease", opacity: 0.85 }} />
      </div>
    </div>
  );
}

interface SensorBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function SensorBar({ label, value, max, color }: SensorBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 60, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: TOKENS.textMuted, textAlign: "right", flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s ease", opacity: 0.8 }} />
      </div>
      <span style={{ width: 32, fontFamily: TOKENS.fontMono, fontSize: 10, color: TOKENS.textSecondary, textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

interface StatPillProps {
  label: string;
  value: string | number;
}

function StatPill({ label, value }: StatPillProps) {
  const formatted = typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value;
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${TOKENS.border}`, borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textMuted }}>{label}</span>
      <span style={{ fontFamily: TOKENS.fontMono, fontSize: 13, color: TOKENS.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatted}</span>
    </div>
  );
}

interface BehaviorTreeNodeProps {
  node: BehaviorNode;
  index: number;
  isActive: boolean;
  isOnActivePath: boolean;
  perception: Perception | null | undefined;
  organism: Organism;
  isLast: boolean;
}

function BehaviorTreeNode({ node, isActive, isOnActivePath, perception, isLast }: BehaviorTreeNodeProps) {
  const conditionMet = useMemo(() => {
    if (!perception) return null;
    try { return evaluateCondition(node.condition, node.threshold, perception); } catch { return null; }
  }, [node.condition, node.threshold, perception]);

  const condColor = conditionColor(node.condition);
  const isHighlighted = isActive && isOnActivePath;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 160, padding: "10px 12px", background: isHighlighted ? `${condColor}18` : "rgba(255,255,255,0.04)", border: `1.5px solid ${isHighlighted ? condColor : TOKENS.border}`, borderRadius: 8, textAlign: "center", transition: "all 0.2s ease" }}>
        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: condColor, marginBottom: 4, fontWeight: 600 }}>
          {behaviorNodeTypeLabel(node.condition)}
        </div>
        <div style={{ fontFamily: TOKENS.fontMono, fontSize: 11, color: TOKENS.textSecondary }}>
          threshold: {node.threshold}
        </div>
        {conditionMet !== null && (
          <div style={{ position: "absolute", top: -8, right: -8, width: 18, height: 18, borderRadius: "50%", background: conditionMet ? TOKENS.green : TOKENS.red, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#000", border: "2px solid rgba(10,10,10,0.9)" }}>
            {conditionMet ? "T" : "F"}
          </div>
        )}
      </div>

      {isOnActivePath && conditionMet === true && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 }}>
          <div style={{ width: 1.5, height: 16, background: TOKENS.green, opacity: 0.6 }} />
          <div style={{ padding: "6px 14px", background: `${actionColor(node.ifTrue)}18`, border: `1.5px solid ${actionColor(node.ifTrue)}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: actionColor(node.ifTrue), textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {behaviorActionLabel(node.ifTrue)}
          </div>
        </div>
      )}

      {!isLast && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 1.5, height: 20, background: isOnActivePath && conditionMet === false ? TOKENS.red : TOKENS.border, opacity: isOnActivePath && conditionMet === false ? 0.8 : 0.4, transition: "all 0.2s ease" }} />
          {node.isLeaf && isOnActivePath && conditionMet === false && typeof node.ifFalse === "string" && (
            <div style={{ padding: "6px 14px", background: `${actionColor(node.ifFalse as BehaviorAction)}18`, border: `1.5px solid ${actionColor(node.ifFalse as BehaviorAction)}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: actionColor(node.ifFalse as BehaviorAction), textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              {behaviorActionLabel(node.ifFalse as BehaviorAction)}
            </div>
          )}
        </div>
      )}

      {isLast && isOnActivePath && conditionMet === false && node.isLeaf && typeof node.ifFalse === "string" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 8 }}>
          <div style={{ width: 1.5, height: 16, background: TOKENS.red, opacity: 0.6 }} />
          <div style={{ padding: "6px 14px", background: `${actionColor(node.ifFalse as BehaviorAction)}18`, border: `1.5px solid ${actionColor(node.ifFalse as BehaviorAction)}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: actionColor(node.ifFalse as BehaviorAction), textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {behaviorActionLabel(node.ifFalse as BehaviorAction)}
          </div>
        </div>
      )}
    </div>
  );
}

interface GenomeSectionProps {
  genome: Genome;
}

function GenomeSection({ genome }: GenomeSectionProps) {
  const colorCss = hslToCss(genome.colorHue, genome.colorSat, genome.colorVal);

  return (
    <div>
      <SectionTitle>Genome</SectionTitle>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: colorCss, border: `2px solid ${TOKENS.border}`, boxShadow: `0 0 12px ${colorCss}40`, flexShrink: 0 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 20, lineHeight: 1, color: TOKENS.textPrimary }}>{shapeToIcon(genome.shape)}</span>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textMuted }}>{genome.shape}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: TOKENS.fontMono, fontSize: 11, color: TOKENS.textSecondary }}>
            H{genome.colorHue.toFixed(0)}° S{(genome.colorSat * 100).toFixed(0)}% V{(genome.colorVal * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: 10, color: TOKENS.textMuted, marginTop: 2 }}>hue / sat / val</div>
        </div>
      </div>

      <ProgressBar label="Size" value={genome.size} max={3} color={TOKENS.blue} />
      <ProgressBar label="Speed" value={genome.movementSpeed} max={5} color={TOKENS.green} />
      <ProgressBar label="Metabolism" value={genome.baseMetabolism} max={3} color={TOKENS.orange} />
      <ProgressBar label="Mutation Rate" value={genome.mutationRate} max={0.5} color={TOKENS.purple} />

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textMuted, marginBottom: 8 }}>Sensor Ranges</div>
        <SensorBar label="Food" value={genome.foodDetectionRadius} max={50} color={TOKENS.green} />
        <SensorBar label="Predator" value={genome.predatorDetectionRadius} max={50} color={TOKENS.red} />
        <SensorBar label="Mate" value={genome.mateDetectionRadius} max={50} color={TOKENS.pink} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: TOKENS.textMuted, marginBottom: 8 }}>Reproduction</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="Threshold" value={genome.reproductionThreshold} />
          <StatPill label="Cost" value={genome.reproductionCost} />
          <StatPill label="Mode" value={genome.sexualReproduction ? "Sexual" : "Asexual"} />
          <StatPill label="Generation" value={genome.generation} />
        </div>
      </div>
    </div>
  );
}

interface BehaviorTreeSectionProps {
  tree: readonly BehaviorNode[];
  organism: Organism;
  perception: Perception | null | undefined;
}

function BehaviorTreeSection({ tree, organism, perception }: BehaviorTreeSectionProps) {
  const activeAction = useMemo(() => {
    if (!perception) return null;
    try { return decideAction(organism, perception); } catch { return null; }
  }, [organism, perception]);

  const activePath = useMemo(() => {
    if (!perception || !tree.length) return new Set<number>();
    const path = new Set<number>();
    let idx = 0;
    while (idx < tree.length) {
      path.add(idx);
      const node = tree[idx]!;
      const met = evaluateCondition(node.condition, node.threshold, perception);
      if (met) break;
      if (node.isLeaf) break;
      if (typeof node.ifFalse === "number") {
        idx = node.ifFalse;
      } else {
        break;
      }
    }
    return path;
  }, [tree, perception]);

  if (!tree.length) {
    return (
      <div>
        <SectionTitle>Behavior Tree</SectionTitle>
        <div style={{ fontSize: 12, color: TOKENS.textMuted, padding: "8px 0" }}>No behavior tree defined.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <SectionTitle>Behavior Tree</SectionTitle>
        {activeAction && (
          <div style={{ padding: "3px 10px", borderRadius: 4, background: `${actionColor(activeAction)}18`, border: `1px solid ${actionColor(activeAction)}`, fontSize: 10, fontWeight: 600, color: actionColor(activeAction), textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Active: {behaviorActionLabel(activeAction)}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0" }}>
        {tree.map((node, i) => (
          <BehaviorTreeNode
            key={i}
            node={node}
            index={i}
            isActive={!!perception}
            isOnActivePath={activePath.has(i)}
            perception={perception}
            organism={organism}
            isLast={i === tree.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

interface PerceptionSectionProps {
  perception: Perception | null | undefined;
}

function PerceptionSection({ perception }: PerceptionSectionProps) {
  if (!perception) {
    return (
      <div>
        <SectionTitle>Perception</SectionTitle>
        <div style={{ fontSize: 12, color: TOKENS.textMuted, padding: "8px 0" }}>No perception data available.</div>
      </div>
    );
  }

  const items = [
    { label: "Food", nearby: perception.foodNearby, distance: perception.foodDistance, color: TOKENS.green },
    { label: "Predator", nearby: perception.predatorNearby, distance: perception.predatorDistance, color: TOKENS.red },
    { label: "Prey", nearby: perception.preyNearby, distance: perception.preyDistance, color: TOKENS.orange },
    { label: "Mate", nearby: perception.mateNearby, distance: perception.mateDistance, color: TOKENS.pink },
  ];

  return (
    <div>
      <SectionTitle>Perception</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: item.nearby ? `${item.color}10` : "rgba(255,255,255,0.02)", border: `1px solid ${item.nearby ? `${item.color}40` : TOKENS.border}`, borderRadius: 6, transition: "all 0.2s ease" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.nearby ? item.color : TOKENS.textMuted, boxShadow: item.nearby ? `0 0 6px ${item.color}80` : "none", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: item.nearby ? item.color : TOKENS.textMuted, width: 60, flexShrink: 0 }}>{item.label}</span>
            <span style={{ fontSize: 11, color: TOKENS.textMuted, flexShrink: 0 }}>{item.nearby ? `${item.distance.toFixed(1)} away` : "None detected"}</span>
            <div style={{ flex: 1 }} />
            {item.nearby && <div style={{ width: Math.min(60, (item.distance / 50) * 60), height: 3, background: item.color, borderRadius: 2, opacity: 0.5 }} />}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <StatPill label="Energy" value={perception.energy.toFixed(1)} />
        <StatPill label="Position" value={`${perception.position.x.toFixed(0)}, ${perception.position.y.toFixed(0)}`} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: TOKENS.accentDim, marginBottom: 10, marginTop: 4, fontWeight: 600 }}>
      {children}
    </div>
  );
}

interface OrganismPanelProps {
  organism: Organism;
  perception?: Perception | null;
  isCompare?: boolean;
}

function OrganismPanel({ organism, perception }: OrganismPanelProps) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingRight: 4 }}>
      <div>
        <SectionTitle>Organism</SectionTitle>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="ID" value={`#${organism.id}`} />
          <StatPill label="Species" value={`#${organism.genome.speciesId}`} />
          <StatPill label="Age" value={organism.age} />
          <StatPill label="Energy" value={organism.energy.toFixed(1)} />
          <StatPill label="Generation" value={organism.generation} />
          <StatPill label="Alive" value={organism.alive ? "Yes" : "No"} />
        </div>
      </div>
      <div style={{ height: 1, background: TOKENS.border }} />
      <GenomeSection genome={organism.genome} />
      <div style={{ height: 1, background: TOKENS.border }} />
      <BehaviorTreeSection tree={organism.genome.behaviorTree} organism={organism} perception={perception} />
      <div style={{ height: 1, background: TOKENS.border }} />
      <PerceptionSection perception={perception} />
    </div>
  );
}

interface CompareBarProps {
  genomeA: Genome;
  genomeB: Genome;
}

function CompareBar({ genomeA, genomeB }: CompareBarProps) {
  const comparisons = [
    { label: "Size", a: genomeA.size, b: genomeB.size, max: 3, color: TOKENS.blue },
    { label: "Speed", a: genomeA.movementSpeed, b: genomeB.movementSpeed, max: 5, color: TOKENS.green },
    { label: "Metabolism", a: genomeA.baseMetabolism, b: genomeB.baseMetabolism, max: 3, color: TOKENS.orange },
    { label: "Mutation", a: genomeA.mutationRate, b: genomeB.mutationRate, max: 0.5, color: TOKENS.purple },
    { label: "Food Sense", a: genomeA.foodDetectionRadius, b: genomeB.foodDetectionRadius, max: 50, color: TOKENS.green },
    { label: "Pred Sense", a: genomeA.predatorDetectionRadius, b: genomeB.predatorDetectionRadius, max: 50, color: TOKENS.red },
    { label: "Mate Sense", a: genomeA.mateDetectionRadius, b: genomeB.mateDetectionRadius, max: 50, color: TOKENS.pink },
  ];

  return (
    <div>
      <SectionTitle>Genome Comparison</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {comparisons.map((c) => {
          const pctA = Math.min(100, Math.max(0, (c.a / c.max) * 100));
          const pctB = Math.min(100, Math.max(0, (c.b / c.max) * 100));
          const diff = c.a - c.b;
          return (
            <div key={c.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: TOKENS.textMuted }}>{c.label}</span>
                <span style={{ fontFamily: TOKENS.fontMono, fontSize: 10, color: TOKENS.textSecondary }}>{diff > 0 ? "+" : ""}{diff.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: TOKENS.fontMono, fontSize: 9, color: TOKENS.blue, width: 28, textAlign: "right", flexShrink: 0 }}>A</span>
                <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pctA}%`, height: "100%", background: c.color, borderRadius: 3, opacity: 0.7, transition: "width 0.3s ease" }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ fontFamily: TOKENS.fontMono, fontSize: 9, color: TOKENS.pink, width: 28, textAlign: "right", flexShrink: 0 }}>B</span>
                <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pctB}%`, height: "100%", background: c.color, borderRadius: 3, opacity: 0.5, transition: "width 0.3s ease" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface GenomeInspectorProps {
  organism: Organism | null;
  compareOrganism?: Organism | null;
  perception?: Perception | null;
  comparePerception?: Perception | null;
  onClose: () => void;
  onClearCompare?: () => void;
  style?: CSSProperties;
}

export const GenomeInspector = memo(function GenomeInspector({ organism, compareOrganism, perception, comparePerception, onClose, onClearCompare, style }: GenomeInspectorProps) {
  const isCompare = !!compareOrganism;

  if (!organism) return null;

  const panelStyle: CSSProperties = {
    position: "fixed",
    top: 16,
    right: 16,
    width: isCompare ? 720 : 360,
    maxHeight: "calc(100vh - 32px)",
    background: "rgba(10, 10, 10, 0.92)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(232, 213, 183, 0.15)",
    borderRadius: 8,
    color: "#e0e0e0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    zIndex: 1000,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
    animation: "slideInRight 0.25s ease",
    ...style,
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${TOKENS.border}`,
    flexShrink: 0,
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: organism.alive ? TOKENS.green : TOKENS.red, boxShadow: organism.alive ? "0 0 8px rgba(74,222,128,0.4)" : "0 0 8px rgba(248,113,113,0.4)" }} />
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "0.02em" }}>{isCompare ? "Compare Organisms" : "Genome Inspector"}</span>
          {isCompare && (
            <span style={{ fontFamily: TOKENS.fontMono, fontSize: 10, color: TOKENS.textMuted, background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4, border: `1px solid ${TOKENS.border}` }}>
              #{organism.id} vs #{compareOrganism.id}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isCompare && onClearCompare && (
            <button
              onClick={onClearCompare}
              style={{ background: "transparent", border: `1px solid ${TOKENS.border}`, borderRadius: 4, color: TOKENS.textMuted, fontSize: 11, padding: "3px 8px", cursor: "pointer", fontFamily: TOKENS.fontUi, transition: "all 0.15s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.borderHover; e.currentTarget.style.color = TOKENS.textSecondary; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.border; e.currentTarget.style.color = TOKENS.textMuted; }}
            >
              End Compare
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: TOKENS.textMuted, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "2px 4px", fontFamily: TOKENS.fontUi, transition: "color 0.15s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = TOKENS.textPrimary; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = TOKENS.textMuted; }}
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: isCompare ? "row" : "column" }}>
        {isCompare ? (
          <>
            <div style={{ flex: 1, padding: "16px", overflowY: "auto", borderRight: `1px solid ${TOKENS.border}` }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: TOKENS.blue, marginBottom: 12, fontWeight: 600 }}>Organism A</div>
              <OrganismPanel organism={organism} perception={perception} isCompare />
            </div>
            <div style={{ flex: 1, padding: "16px", overflowY: "auto" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: TOKENS.pink, marginBottom: 12, fontWeight: 600 }}>Organism B</div>
              <OrganismPanel organism={compareOrganism} perception={comparePerception} isCompare />
            </div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: "rgba(10,10,10,0.95)", borderTop: `1px solid ${TOKENS.border}`, backdropFilter: "blur(8px)", maxHeight: 180, overflowY: "auto" }}>
              <CompareBar genomeA={organism.genome} genomeB={compareOrganism.genome} />
            </div>
          </>
        ) : (
          <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
            <OrganismPanel organism={organism} perception={perception} />
          </div>
        )}
      </div>
    </div>
  );
});

export default GenomeInspector;
