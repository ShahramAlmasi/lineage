import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Organism, SimulationConfig } from "../../simulation/types";

export interface TooltipData {
  type: "organism" | "food" | "stat";
  title: string;
  lines: { label: string; value: string; color?: string }[];
}

export interface TourStep {
  id: string;
  title: string;
  content: string;
  targetSelector?: string;
  placement?: "top" | "bottom" | "left" | "right";
  fallbackPosition?: { top: number; left: number };
}

export interface ExperimentSuggestion {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  configOverride: Partial<SimulationConfig>;
  compareConfig?: Partial<SimulationConfig>;
}

export interface ConceptPanelData {
  id: string;
  title: string;
  subtitle?: string;
  sections: { heading?: string; body: string }[];
  diagram?: "natural-selection" | "mutation" | null;
}

export interface EducationalOverlayProps {
  hoveredOrganism?: Pick<Organism, "id" | "energy" | "age" | "genome"> | null;
  hoveredFood?: { energy: number } | null;
  hoveredStatLabel?: string | null;
  mousePosition?: { x: number; y: number };
  currentConfig?: SimulationConfig;
  onRequestConfigChange?: (config: Partial<SimulationConfig>) => void;
  onTourComplete?: () => void;
  activeConceptId?: string | null;
  onCloseConcept?: () => void;
  zIndex?: number;
  disableAutoTour?: boolean;
}

const TOKENS = {
  bgPanel: "rgba(10, 10, 10, 0.92)",
  bgPanelLight: "rgba(18, 18, 18, 0.95)",
  border: "rgba(232, 213, 183, 0.12)",
  borderHover: "rgba(232, 213, 183, 0.25)",
  accent: "#e8d5b7",
  accentMuted: "rgba(232, 213, 183, 0.6)",
  textPrimary: "#e0e0e0",
  textSecondary: "rgba(224, 224, 224, 0.7)",
  textMuted: "rgba(224, 224, 224, 0.5)",
  textTertiary: "rgba(224, 224, 224, 0.35)",
  fontUi: "system-ui, -apple-system, sans-serif",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  green: "#4ade80",
  blue: "#60a5fa",
  red: "#f87171",
  yellow: "#fbbf24",
  purple: "#a78bfa",
  pink: "#f472b6",
  cyan: "#22d3ee",
  radius: 8,
  radiusSm: 4,
  shadow: "0 8px 32px rgba(0,0,0,0.5)",
  shadowSm: "0 2px 8px rgba(0,0,0,0.3)",
} as const;

const STAT_DEFINITIONS: Record<string, { short: string; full: string }> = {
  Population: {
    short: "Number of living organisms",
    full: "Population counts all organisms that are currently alive in the simulation world. It fluctuates as organisms are born and die.",
  },
  Species: {
    short: "Genetically distinct groups",
    full: "A species is a group of organisms whose genomes are similar enough to interbreed. New species form through speciation when genetic divergence exceeds the threshold.",
  },
  Food: {
    short: "Available energy sources",
    full: "Food items appear randomly or in fertile zones. Organisms gain energy by consuming food, which is essential for survival and reproduction.",
  },
  "Avg Energy": {
    short: "Mean energy of all organisms",
    full: "Average energy reflects the overall health of the population. Low values indicate starvation pressure; high values suggest abundant resources.",
  },
  "Avg Fitness": {
    short: "Mean reproductive fitness",
    full: "Fitness is calculated as energy × size. It approximates an organism's expected reproductive success based on its current state.",
  },
  "Avg Age": {
    short: "Mean lifetime in ticks",
    full: "Average age of living organisms. One tick represents one simulation step. Higher ages suggest lower mortality pressure.",
  },
  "Max Age": {
    short: "Oldest living organism",
    full: "The age of the longest-lived organism currently alive. A high max age can indicate an organism with efficient energy management.",
  },
  Births: {
    short: "Total organisms born",
    full: "Cumulative count of all organisms that have been born since the simulation started. Births occur when an organism reproduces.",
  },
  Deaths: {
    short: "Total organisms died",
    full: "Cumulative count of all organisms that have died. Death occurs when energy reaches zero, from old age, or from predation.",
  },
};

const CONCEPT_PANELS: ConceptPanelData[] = [
  {
    id: "speciation",
    title: "What is Speciation?",
    subtitle: "The birth of new species",
    sections: [
      {
        heading: "Definition",
        body: "Speciation is the evolutionary process by which populations evolve to become distinct species. In Lineage, speciation occurs when two groups of organisms become genetically different enough that they can no longer successfully interbreed.",
      },
      {
        heading: "How it works here",
        body: "Each organism carries a genome with traits like size, speed, color, and behavior. When the genetic distance between groups exceeds the **speciation threshold** (default 0.3), a new species is born. The original species becomes the 'parent' of the new lineage.",
      },
      {
        heading: "Why it matters",
        body: "Speciation drives biodiversity. Without it, all organisms would remain similar. Watch the Species count in the Statistics panel — each jump represents a new branch on the tree of life.",
      },
    ],
    diagram: null,
  },
  {
    id: "natural-selection",
    title: "Natural Selection",
    subtitle: "Survival of the fittest",
    sections: [
      {
        heading: "The Principle",
        body: "Natural selection is the differential survival and reproduction of individuals due to differences in phenotype. Organisms with traits better suited to their environment tend to survive and produce more offspring.",
      },
      {
        heading: "In this simulation",
        body: "Faster organisms catch more food. Smaller organisms use less energy. Better sensors find mates and avoid predators. Over thousands of ticks, advantageous traits spread through the population while disadvantageous ones fade away.",
      },
      {
        heading: "Visual cue",
        body: "Watch the color of the population shift over time. If green organisms survive better, the world will gradually turn greener. This is evolution in action.",
      },
    ],
    diagram: "natural-selection",
  },
  {
    id: "mutation",
    title: "Mutation",
    subtitle: "The engine of variation",
    sections: [
      {
        heading: "What is mutation?",
        body: "Mutation is a permanent change in the DNA sequence of an organism. In Lineage, mutations occur during reproduction when a child genome is copied from its parent. Random changes to traits introduce variation into the population.",
      },
      {
        heading: "Genome traits affected",
        body: "Mutations can alter: size, metabolism rate, movement speed, detection radius, reproduction threshold, color, and even behavior tree decisions. Most mutations are small, but occasionally a dramatic change occurs.",
      },
      {
        heading: "Mutation rate",
        body: "The **mutation rate** controls how often mutations occur. A low rate (0.01) produces stable populations. A high rate (0.3) creates rapid change but can prevent beneficial traits from stabilizing.",
      },
    ],
    diagram: "mutation",
  },
];

const EXPERIMENT_SUGGESTIONS: ExperimentSuggestion[] = [
  {
    id: "high-mutation",
    title: "Accelerated Evolution",
    description: "Increase the mutation rate to 0.25 and observe how quickly new species form. The population will become more diverse, but may also become less stable.",
    actionLabel: "Apply: High Mutation",
    configOverride: { speciationThreshold: 0.2, carryingCapacityPressure: 0.002 },
  },
  {
    id: "food-scarcity",
    title: "Scarcity Pressure",
    description: "Reduce food energy to 8 and spawn rate to 0.03. Only the most efficient organisms will survive. Watch average fitness rise as selection pressure intensifies.",
    actionLabel: "Apply: Food Scarcity",
    configOverride: { foodEnergy: 8, foodSpawnRate: 0.03 },
  },
  {
    id: "compare-presets",
    title: "Compare Ecosystems",
    description: "Run two simulations: one with the 'primordial_soup' preset (fast, high mutation) and one with 'pangea' (large, stable). Compare how speciation rates differ.",
    actionLabel: "Apply: Primordial Soup",
    configOverride: {
      worldWidth: 100,
      worldHeight: 100,
      initialPopulation: 100,
      maxPopulation: 500,
      foodSpawnRate: 0.15,
      foodEnergy: 20,
      speciationThreshold: 0.25,
    },
    compareConfig: {
      worldWidth: 300,
      worldHeight: 300,
      initialPopulation: 200,
      maxPopulation: 1500,
      foodSpawnRate: 0.08,
      foodEnergy: 15,
      speciationThreshold: 0.35,
    },
  },
  {
    id: "pressure-cooker",
    title: "Pressure Cooker",
    description: "Use the pressure_cooker preset: scarce food, high carrying capacity pressure, small world. Only the strongest will survive. Extinction events will be common.",
    actionLabel: "Apply: Pressure Cooker",
    configOverride: {
      worldWidth: 150,
      worldHeight: 150,
      initialPopulation: 150,
      maxPopulation: 400,
      initialFood: 200,
      foodSpawnRate: 0.05,
      foodEnergy: 10,
      carryingCapacityPressure: 0.005,
    },
  },
];

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Lineage",
    content: "This is an interactive evolution simulator. Digital organisms compete, mutate, and speciate in a 2D world. Let's take a quick tour of the key features.",
    fallbackPosition: { top: 120, left: 120 },
  },
  {
    id: "world-view",
    title: "The World",
    content: "This is the simulation world. Each shape is an organism — circles, triangles, squares, and diamonds represent different species. Click and drag to rotate the camera. Scroll to zoom.",
    targetSelector: "canvas",
    placement: "bottom",
  },
  {
    id: "stats-panel",
    title: "Statistics Panel",
    content: "Watch population, species count, and other metrics update in real time. Hover over any stat to learn what it means. Click the header to collapse the panel.",
    targetSelector: "[data-tour='stats-panel']",
    placement: "left",
    fallbackPosition: { top: 80, left: 120 },
  },
  {
    id: "playback-controls",
    title: "Playback Controls",
    content: "Play, pause, step forward, or reset the simulation. Change speed to watch evolution unfold faster. Use the scrubber to jump to any previous tick.",
    targetSelector: "[data-tour='playback-controls']",
    placement: "top",
    fallbackPosition: { top: 80, left: 120 },
  },
  {
    id: "parameter-panel",
    title: "Parameter Panel",
    content: "Adjust world size, food abundance, mutation rates, and more. Apply changes to restart the simulation with new parameters. Try presets for different evolutionary pressures.",
    targetSelector: "[data-tour='parameter-panel']",
    placement: "right",
    fallbackPosition: { top: 80, left: 120 },
  },
  {
    id: "educational-overlay",
    title: "Learn More",
    content: "Click the ? button anytime to explore concepts like speciation, natural selection, and mutation. Or try suggested experiments to see evolution in action.",
    targetSelector: "[data-tour='help-button']",
    placement: "left",
    fallbackPosition: { top: 80, left: 120 },
  },
  {
    id: "done",
    title: "You're Ready!",
    content: "That's the basics! Hover over organisms to see their stats, watch the event log for speciation and extinction events, and experiment with parameters. Enjoy exploring evolution!",
    fallbackPosition: { top: 120, left: 120 },
  },
];

const STORAGE_KEYS = {
  tourCompleted: "lineage-tour-completed",
  tourStep: "lineage-tour-step",
  dismissedExperiments: "lineage-dismissed-experiments",
} as const;

function getTourCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.tourCompleted) === "true";
  } catch {
    return false;
  }
}

function setTourCompleted(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tourCompleted, String(value));
  } catch {
    return;
  }
}

function getTourStep(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.tourStep);
    return raw ? Math.max(0, parseInt(raw, 10)) : 0;
  } catch {
    return 0;
  }
}

function setTourStepValue(step: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tourStep, String(step));
  } catch {
    return;
  }
}

function getDismissedExperiments(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dismissedExperiments);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setDismissedExperimentsValue(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.dismissedExperiments, JSON.stringify(ids));
  } catch {
    return;
  }
}

function renderMarkdownLike(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: TOKENS.textPrimary, fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function NaturalSelectionDiagram() {
  return (
    <div
      style={{
        background: TOKENS.bgPanelLight,
        borderRadius: TOKENS.radiusSm,
        padding: 16,
        marginBottom: 4,
      }}
    >
      <svg viewBox="0 0 400 120" style={{ width: "100%", height: "auto" }}>
        <text x={200} y={14} textAnchor="middle" fill={TOKENS.textMuted} fontSize={10} fontFamily={TOKENS.fontUi}>
          Environment with limited food
        </text>

        <circle cx={60} cy={60} r={14} fill={TOKENS.red} opacity={0.3} />
        <text x={60} y={64} textAnchor="middle" fill={TOKENS.textPrimary} fontSize={10}>
          Slow
        </text>
        <text x={60} y={92} textAnchor="middle" fill={TOKENS.red} fontSize={9}>
          Dies
        </text>

        <path d="M60 78 L60 88" stroke={TOKENS.red} strokeWidth={1.5} markerEnd="url(#arrowRed)" />

        <circle cx={200} cy={60} r={14} fill={TOKENS.yellow} opacity={0.5} />
        <text x={200} y={64} textAnchor="middle" fill={TOKENS.textPrimary} fontSize={10}>
          Medium
        </text>
        <text x={200} y={92} textAnchor="middle" fill={TOKENS.yellow} fontSize={9}>
          Survives
        </text>

        <circle cx={340} cy={60} r={16} fill={TOKENS.green} opacity={0.7} />
        <text x={340} y={64} textAnchor="middle" fill={TOKENS.textPrimary} fontSize={10}>
          Fast
        </text>
        <text x={340} y={92} textAnchor="middle" fill={TOKENS.green} fontSize={9}>
          Reproduces
        </text>

        <path d="M340 42 L340 32" stroke={TOKENS.green} strokeWidth={1.5} markerEnd="url(#arrowGreen)" />

        <defs>
          <marker id="arrowRed" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={TOKENS.red} />
          </marker>
          <marker id="arrowGreen" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={TOKENS.green} />
          </marker>
        </defs>

        <text x={200} y={112} textAnchor="middle" fill={TOKENS.accentMuted} fontSize={10} fontStyle="italic">
          Selection pressure favors speed over generations
        </text>
      </svg>
    </div>
  );
}

function MutationDiagram() {
  const [step, setStep] = useState(0);

  const genomeBefore = [
    { label: "Size", value: "0.50", color: TOKENS.blue },
    { label: "Speed", value: "1.20", color: TOKENS.blue },
    { label: "Color", value: "0.35", color: TOKENS.blue },
    { label: "Metabolism", value: "0.80", color: TOKENS.blue },
  ];

  const genomeAfter = [
    { label: "Size", value: "0.50", color: TOKENS.blue },
    { label: "Speed", value: "1.35", color: TOKENS.green },
    { label: "Color", value: "0.35", color: TOKENS.blue },
    { label: "Metabolism", value: "0.75", color: TOKENS.red },
  ];

  return (
    <div
      style={{
        background: TOKENS.bgPanelLight,
        borderRadius: TOKENS.radiusSm,
        padding: 16,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 11, color: TOKENS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Parent Genome
        </span>
        <span style={{ fontSize: 16, color: TOKENS.accentMuted }}>→</span>
        <span style={{ fontSize: 11, color: TOKENS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Child Genome (mutated)
        </span>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ flex: 1 }}>
          {genomeBefore.map((g, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: `1px solid ${TOKENS.border}`,
                fontFamily: TOKENS.fontMono,
                fontSize: 12,
              }}
            >
              <span style={{ color: TOKENS.textSecondary }}>{g.label}</span>
              <span style={{ color: g.color }}>{g.value}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {genomeAfter.map((g, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: `1px solid ${TOKENS.border}`,
                fontFamily: TOKENS.fontMono,
                fontSize: 12,
              }}
            >
              <span style={{ color: TOKENS.textSecondary }}>{g.label}</span>
              <span style={{ color: g.color }}>{g.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 11 }}>
        <span style={{ color: TOKENS.green }}>● Speed increased (+0.15)</span>
        <span style={{ color: TOKENS.red }}>● Metabolism decreased (−0.05)</span>
      </div>

      <button
        onClick={() => setStep((s) => (s + 1) % 3)}
        style={{
          marginTop: 12,
          padding: "6px 14px",
          background: "rgba(232, 213, 183, 0.1)",
          border: `1px solid ${TOKENS.border}`,
          borderRadius: TOKENS.radiusSm,
          color: TOKENS.accent,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: TOKENS.fontUi,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(232, 213, 183, 0.2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(232, 213, 183, 0.1)";
        }}
      >
        {step === 0 ? "Simulate another mutation" : step === 1 ? "Simulate again" : "Reset"}
      </button>
    </div>
  );
}

function EducationalOverlay({
  hoveredOrganism,
  hoveredFood,
  hoveredStatLabel,
  mousePosition,
  onRequestConfigChange,
  onTourComplete,
  activeConceptId: externalConceptId,
  onCloseConcept,
  zIndex = 2000,
  disableAutoTour = false,
}: EducationalOverlayProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeConceptId, setActiveConceptId] = useState<string | null>(externalConceptId ?? null);
  const [tourStep, setTourStep] = useState<number>(-1);
  const [dismissedExperiments, setDismissedExperiments] = useState<string[]>(getDismissedExperiments);
  const [tourAutoStarted, setTourAutoStarted] = useState(false);

  useEffect(() => {
    if (externalConceptId !== undefined) {
      setActiveConceptId(externalConceptId);
    }
  }, [externalConceptId]);

  useEffect(() => {
    if (tourAutoStarted || disableAutoTour) return;
    setTourAutoStarted(true);

    const completed = getTourCompleted();
    const savedStep = getTourStep();

    if (!completed) {
      setTourStep(savedStep);
    }
  }, [tourAutoStarted, disableAutoTour]);

  useEffect(() => {
    if (tourStep >= 0) {
      setTourStepValue(tourStep);
    }
  }, [tourStep]);

  const tooltipData = useMemo<TooltipData | null>(() => {
    if (hoveredOrganism) {
      return {
        type: "organism",
        title: `Organism #${hoveredOrganism.id}`,
        lines: [
          { label: "Energy", value: hoveredOrganism.energy.toFixed(1), color: TOKENS.green },
          { label: "Age", value: `${hoveredOrganism.age} ticks`, color: TOKENS.blue },
          { label: "Generation", value: String(hoveredOrganism.genome.generation), color: TOKENS.yellow },
          { label: "Species", value: `#${hoveredOrganism.genome.speciesId}`, color: TOKENS.purple },
          { label: "Size", value: hoveredOrganism.genome.size.toFixed(2), color: TOKENS.pink },
        ],
      };
    }

    if (hoveredFood) {
      return {
        type: "food",
        title: "Food",
        lines: [{ label: "Energy value", value: hoveredFood.energy.toFixed(1), color: TOKENS.green }],
      };
    }

    if (hoveredStatLabel && STAT_DEFINITIONS[hoveredStatLabel]) {
      const def = STAT_DEFINITIONS[hoveredStatLabel];
      return {
        type: "stat",
        title: hoveredStatLabel,
        lines: [
          { label: "Definition", value: def.short, color: TOKENS.accent },
          { label: "Details", value: def.full, color: TOKENS.textSecondary },
        ],
      };
    }

    return null;
  }, [hoveredOrganism, hoveredFood, hoveredStatLabel]);

  const handleTourNext = useCallback(() => {
    setTourStep((prev) => {
      const next = prev + 1;
      if (next >= TOUR_STEPS.length) {
        setTourCompleted(true);
        onTourComplete?.();
        return -1;
      }
      setTourStepValue(next);
      return next;
    });
  }, [onTourComplete]);

  const handleTourPrev = useCallback(() => {
    setTourStep((prev) => {
      const next = Math.max(0, prev - 1);
      setTourStepValue(next);
      return next;
    });
  }, []);

  const handleTourSkip = useCallback(() => {
    setTourCompleted(true);
    onTourComplete?.();
    setTourStep(-1);
  }, [onTourComplete]);

  const handleStartTour = useCallback(() => {
    setTourCompleted(false);
    setTourStep(0);
    setMenuOpen(false);
  }, []);

  const handleOpenConcept = useCallback((id: string) => {
    setActiveConceptId(id);
    setMenuOpen(false);
  }, []);

  const handleCloseConcept = useCallback(() => {
    setActiveConceptId(null);
    onCloseConcept?.();
  }, [onCloseConcept]);

  const handleDismissExperiment = useCallback((id: string) => {
    setDismissedExperiments((prev) => {
      const next = [...prev, id];
      setDismissedExperimentsValue(next);
      return next;
    });
  }, []);

  const handleApplyExperiment = useCallback(
    (exp: ExperimentSuggestion) => {
      onRequestConfigChange?.(exp.configOverride);
      setMenuOpen(false);
    },
    [onRequestConfigChange]
  );

  const activeConcept = useMemo(
    () => CONCEPT_PANELS.find((c) => c.id === activeConceptId) || null,
    [activeConceptId]
  );

  const tooltipPos = mousePosition ?? { x: 0, y: 0 };
  const visibleExperiments = EXPERIMENT_SUGGESTIONS.filter((e) => !dismissedExperiments.includes(e.id));

  return (
    <>
      <style>{`
        @keyframes eduFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes eduSlideUp {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
        @keyframes eduSlideRight {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes eduPulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.45), 0 0 12px ${TOKENS.accent}30; }
          50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.45), 0 0 24px ${TOKENS.accent}60; }
        }
      `}</style>

      <HelpButton onClick={() => setMenuOpen((v) => !v)} zIndex={zIndex} />

      {menuOpen && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.25)",
              zIndex: zIndex + 8,
              animation: "eduFadeIn 0.2s ease-out",
            }}
            onClick={() => setMenuOpen(false)}
          />
          <MenuPanel
            onClose={() => setMenuOpen(false)}
            onOpenConcept={handleOpenConcept}
            onStartTour={handleStartTour}
            visibleExperiments={visibleExperiments}
            onDismissExperiment={handleDismissExperiment}
            onApplyExperiment={handleApplyExperiment}
            zIndex={zIndex}
          />
        </>
      )}

      {activeConcept && <ConceptPanel concept={activeConcept} onClose={handleCloseConcept} zIndex={zIndex} />}

      {tooltipData && mousePosition && (
        <Tooltip data={tooltipData} position={tooltipPos} zIndex={zIndex} />
      )}

      {tourStep >= 0 && tourStep < TOUR_STEPS.length && (
        <TourOverlay
          steps={TOUR_STEPS}
          currentStep={tourStep}
          onNext={handleTourNext}
          onPrev={handleTourPrev}
          onSkip={handleTourSkip}
          zIndex={zIndex + 100}
        />
      )}
    </>
  );
}

function HelpButton({ onClick, zIndex }: { onClick: () => void; zIndex: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      data-tour="help-button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        zIndex: zIndex + 5,
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered ? "rgba(232, 213, 183, 0.15)" : "rgba(10, 10, 10, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${hovered ? TOKENS.borderHover : TOKENS.border}`,
        borderRadius: TOKENS.radius,
        color: TOKENS.accent,
        fontSize: 18,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: TOKENS.shadowSm,
        transition: "all 0.15s ease",
        fontFamily: TOKENS.fontUi,
      }}
      aria-label="Open educational content"
      title="Learn about evolution"
    >
      ?
    </button>
  );
}

function MenuPanel({
  onClose,
  onOpenConcept,
  onStartTour,
  visibleExperiments,
  onDismissExperiment,
  onApplyExperiment,
  zIndex,
}: {
  onClose: () => void;
  onOpenConcept: (id: string) => void;
  onStartTour: () => void;
  visibleExperiments: ExperimentSuggestion[];
  onDismissExperiment: (id: string) => void;
  onApplyExperiment: (exp: ExperimentSuggestion) => void;
  zIndex: number;
}) {
  const [activeTab, setActiveTab] = useState<"concepts" | "experiments">("concepts");

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: 16,
        zIndex: zIndex + 12,
        width: 380,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 96px)",
        background: TOKENS.bgPanel,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radius,
        boxShadow: TOKENS.shadow,
        fontFamily: TOKENS.fontUi,
        color: TOKENS.textPrimary,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "eduSlideRight 0.25s ease-out",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: TOKENS.accent,
            }}
          >
            Evolution Guide
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: TOKENS.textMuted }}>
            Learn concepts and try experiments
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: TOKENS.textMuted,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: 4,
            borderRadius: TOKENS.radiusSm,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textPrimary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textMuted;
          }}
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${TOKENS.border}`,
        }}
      >
        {(
          [
            { key: "concepts" as const, label: "Concepts" },
            { key: "experiments" as const, label: `Experiments${visibleExperiments.length > 0 ? ` (${visibleExperiments.length})` : ""}` },
          ]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: activeTab === tab.key ? "rgba(232, 213, 183, 0.08)" : "transparent",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.key ? TOKENS.accent : "transparent"}`,
              color: activeTab === tab.key ? TOKENS.accent : TOKENS.textSecondary,
              fontSize: 12,
              fontWeight: activeTab === tab.key ? 600 : 400,
              cursor: "pointer",
              fontFamily: TOKENS.fontUi,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {activeTab === "concepts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {CONCEPT_PANELS.map((concept) => (
              <button
                key={concept.id}
                onClick={() => onOpenConcept(concept.id)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  background: TOKENS.bgPanelLight,
                  border: `1px solid ${TOKENS.border}`,
                  borderRadius: TOKENS.radiusSm,
                  cursor: "pointer",
                  fontFamily: TOKENS.fontUi,
                  color: TOKENS.textPrimary,
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.borderHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.border;
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: TOKENS.accent, marginBottom: 2 }}>
                  {concept.title}
                </div>
                <div style={{ fontSize: 12, color: TOKENS.textMuted }}>{concept.subtitle}</div>
              </button>
            ))}

            <button
              onClick={onStartTour}
              style={{
                marginTop: 4,
                padding: "10px 14px",
                background: "rgba(96, 165, 250, 0.1)",
                border: `1px solid ${TOKENS.blue}`,
                borderRadius: TOKENS.radiusSm,
                color: TOKENS.blue,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: TOKENS.fontUi,
                fontWeight: 500,
                textAlign: "center",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(96, 165, 250, 0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(96, 165, 250, 0.1)";
              }}
            >
              Restart Welcome Tour
            </button>
          </div>
        )}

        {activeTab === "experiments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleExperiments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: TOKENS.textMuted, fontSize: 13 }}>
                No active experiment suggestions.
                <br />
                <span style={{ fontSize: 11 }}>Dismissed suggestions can be restored by clearing local storage.</span>
              </div>
            ) : (
              visibleExperiments.map((exp) => (
                <ExperimentCard
                  key={exp.id}
                  experiment={exp}
                  onApply={() => onApplyExperiment(exp)}
                  onDismiss={() => onDismissExperiment(exp.id)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment,
  onApply,
  onDismiss,
}: {
  experiment: ExperimentSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: TOKENS.bgPanelLight,
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radiusSm,
        padding: "12px 14px",
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = TOKENS.borderHover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = TOKENS.border;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: TOKENS.accent }}>{experiment.title}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            background: "none",
            border: "none",
            color: TOKENS.textMuted,
            cursor: "pointer",
            fontSize: 12,
            padding: 2,
          }}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.6, color: TOKENS.textSecondary }}>
            {experiment.description}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onApply}
              style={{
                padding: "5px 12px",
                background: "rgba(74, 222, 128, 0.15)",
                border: `1px solid ${TOKENS.green}`,
                borderRadius: TOKENS.radiusSm,
                color: TOKENS.green,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: TOKENS.fontUi,
                fontWeight: 500,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(74, 222, 128, 0.25)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(74, 222, 128, 0.15)";
              }}
            >
              {experiment.actionLabel}
            </button>
            <button
              onClick={onDismiss}
              style={{
                padding: "5px 12px",
                background: "transparent",
                border: `1px solid ${TOKENS.border}`,
                borderRadius: TOKENS.radiusSm,
                color: TOKENS.textMuted,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: TOKENS.fontUi,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.red;
                (e.currentTarget as HTMLButtonElement).style.color = TOKENS.red;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = TOKENS.border;
                (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textMuted;
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptPanel({
  concept,
  onClose,
  zIndex,
}: {
  concept: ConceptPanelData;
  onClose: () => void;
  zIndex: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: zIndex + 20,
        width: 480,
        maxWidth: "calc(100vw - 40px)",
        maxHeight: "calc(100vh - 80px)",
        background: TOKENS.bgPanel,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${TOKENS.border}`,
        borderRadius: TOKENS.radius,
        boxShadow: TOKENS.shadow,
        fontFamily: TOKENS.fontUi,
        color: TOKENS.textPrimary,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "eduSlideUp 0.25s ease-out",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${TOKENS.border}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: TOKENS.accent,
              letterSpacing: "0.01em",
            }}
          >
            {concept.title}
          </h2>
          {concept.subtitle && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: TOKENS.textMuted,
              }}
            >
              {concept.subtitle}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: TOKENS.textMuted,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: 4,
            borderRadius: TOKENS.radiusSm,
            transition: "color 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textPrimary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textMuted;
          }}
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div
        style={{
          padding: "16px 20px 20px",
          overflowY: "auto",
          flex: 1,
        }}
      >
        {concept.diagram === "natural-selection" && <NaturalSelectionDiagram />}
        {concept.diagram === "mutation" && <MutationDiagram />}

        {concept.sections.map((section, i) => (
          <div key={i} style={{ marginTop: i > 0 ? 16 : concept.diagram ? 16 : 0 }}>
            {section.heading && (
              <h3
                style={{
                  margin: "0 0 6px",
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: TOKENS.accentMuted,
                }}
              >
                {section.heading}
              </h3>
            )}
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.7,
                color: TOKENS.textSecondary,
              }}
            >
              {renderMarkdownLike(section.body)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tooltip({
  data,
  position,
  zIndex,
}: {
  data: TooltipData;
  position: { x: number; y: number };
  zIndex: number;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState(position);

  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x + 16;
    let y = position.y + 16;

    if (x + rect.width > vw - 8) x = position.x - rect.width - 8;
    if (y + rect.height > vh - 8) y = position.y - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    setAdjustedPos({ x, y });
  }, [position]);

  const style: CSSProperties = {
    position: "fixed",
    left: adjustedPos.x,
    top: adjustedPos.y,
    zIndex: zIndex + 10,
    minWidth: 180,
    maxWidth: 280,
    background: TOKENS.bgPanel,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${TOKENS.border}`,
    borderRadius: TOKENS.radius,
    padding: "10px 14px",
    boxShadow: TOKENS.shadow,
    fontFamily: TOKENS.fontUi,
    fontSize: 12,
    color: TOKENS.textPrimary,
    pointerEvents: "none",
    animation: "eduFadeIn 0.15s ease-out",
  };

  return (
    <div ref={tooltipRef} style={style}>
      <div
        style={{
          fontWeight: 600,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: TOKENS.accent,
          marginBottom: 6,
        }}
      >
        {data.title}
      </div>
      {data.lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginTop: i > 0 ? 3 : 0,
          }}
        >
          <span style={{ color: TOKENS.textSecondary }}>{line.label}</span>
          <span
            style={{
              color: line.color || TOKENS.textPrimary,
              fontFamily: TOKENS.fontMono,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {line.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function TourOverlay({
  steps,
  currentStep,
  onNext,
  onPrev,
  onSkip,
  zIndex,
}: {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  zIndex: number;
}) {
  const step = steps[currentStep];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  const tooltipPos = useMemo(() => {
    if (targetRect) {
      const padding = 16;
      const placement = step.placement || "bottom";
      const tooltipWidth = 320;
      const tooltipHeight = 140;

      let top = 0;
      let left = 0;

      switch (placement) {
        case "bottom":
          top = targetRect.bottom + padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          break;
        case "top":
          top = targetRect.top - tooltipHeight - padding;
          left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
          break;
        case "left":
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.left - tooltipWidth - padding;
          break;
        case "right":
          top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
          left = targetRect.right + padding;
          break;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      left = Math.max(12, Math.min(vw - tooltipWidth - 12, left));
      top = Math.max(12, Math.min(vh - tooltipHeight - 12, top));

      return { top, left };
    }

    if (step.fallbackPosition) {
      const fp = step.fallbackPosition;
      return { top: fp.top, left: fp.left };
    }

    return { top: 120, left: 120 };
  }, [targetRect, step]);

  const highlightStyle: CSSProperties | undefined = targetRect
    ? {
        position: "fixed",
        top: targetRect.top - 4,
        left: targetRect.left - 4,
        width: targetRect.width + 8,
        height: targetRect.height + 8,
        border: `2px solid ${TOKENS.accent}`,
        borderRadius: TOKENS.radius,
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.45), 0 0 20px ${TOKENS.accent}40`,
        zIndex: zIndex + 5,
        pointerEvents: "none",
        animation: "eduPulse 2s ease-in-out infinite",
      }
    : undefined;

  const tooltipStyle: CSSProperties = {
    position: "fixed",
    top: tooltipPos.top,
    left: tooltipPos.left,
    width: 320,
    zIndex: zIndex + 15,
    background: TOKENS.bgPanel,
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${TOKENS.borderHover}`,
    borderRadius: TOKENS.radius,
    padding: "16px 18px",
    boxShadow: TOKENS.shadow,
    fontFamily: TOKENS.fontUi,
    color: TOKENS.textPrimary,
    animation: "eduFadeIn 0.2s ease-out",
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: zIndex + 4,
          pointerEvents: "auto",
          animation: "eduFadeIn 0.3s ease-out",
        }}
        onClick={onSkip}
      />

      {highlightStyle && <div style={highlightStyle} />}

      <div style={tooltipStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: TOKENS.accentMuted,
            }}
          >
            Tour {currentStep + 1} / {steps.length}
          </span>
          <button
            onClick={onSkip}
            style={{
              background: "none",
              border: "none",
              color: TOKENS.textMuted,
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 6px",
              borderRadius: TOKENS.radiusSm,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textPrimary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = TOKENS.textMuted;
            }}
          >
            Skip tour
          </button>
        </div>

        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: TOKENS.accent }}>{step.title}</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: TOKENS.textSecondary }}>{step.content}</p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={onPrev}
            disabled={currentStep === 0}
            style={{
              padding: "5px 12px",
              background: "transparent",
              border: `1px solid ${TOKENS.border}`,
              borderRadius: TOKENS.radiusSm,
              color: currentStep === 0 ? TOKENS.textTertiary : TOKENS.textSecondary,
              fontSize: 12,
              cursor: currentStep === 0 ? "not-allowed" : "pointer",
              fontFamily: TOKENS.fontUi,
            }}
          >
            ← Back
          </button>

          <div style={{ display: "flex", gap: 4 }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === currentStep ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === currentStep ? TOKENS.accent : TOKENS.border,
                  transition: "all 0.2s ease",
                }}
              />
            ))}
          </div>

          <button
            onClick={onNext}
            style={{
              padding: "5px 14px",
              background: "rgba(232, 213, 183, 0.15)",
              border: `1px solid ${TOKENS.accentMuted}`,
              borderRadius: TOKENS.radiusSm,
              color: TOKENS.accent,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: TOKENS.fontUi,
              fontWeight: 500,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(232, 213, 183, 0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(232, 213, 183, 0.15)";
            }}
          >
            {currentStep === steps.length - 1 ? "Finish" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(EducationalOverlay);

export { CONCEPT_PANELS, EXPERIMENT_SUGGESTIONS, TOUR_STEPS, STAT_DEFINITIONS };
