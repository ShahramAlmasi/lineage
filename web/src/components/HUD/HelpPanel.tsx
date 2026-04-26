import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TOKENS = {
  bg: "rgba(13, 13, 13, 0.95)",
  bgHover: "rgba(30, 30, 30, 0.97)",
  bgModal: "rgba(10, 10, 10, 0.92)",
  border: "rgba(255, 255, 255, 0.08)",
  borderAccent: "rgba(232, 213, 183, 0.25)",
  textPrimary: "#e8e8e8",
  textSecondary: "#888888",
  textMuted: "#555555",
  accent: "#e8d5b7",
  accentDim: "rgba(232, 213, 183, 0.15)",
  fontMono: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
  fontUi: "system-ui, -apple-system, sans-serif",
  radius: 8,
  radiusSm: 4,
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;

const TUTORIAL_STEPS = [
  {
    title: "The World",
    body: "This is the 3D world where organisms live. Watch them move, feed, and interact in real time.",
  },
  {
    title: "Playback Controls",
    body: "These are the controls — play, pause, speed. Use the scrubber to jump through history or speed up time.",
  },
  {
    title: "Inspect Organisms",
    body: "Click an organism to inspect its genome. See its traits, energy level, and genetic lineage.",
  },
  {
    title: "Run Experiments",
    body: "Adjust parameters to run experiments. Change mutation rates, food availability, and selection pressure.",
  },
  {
    title: "Recordings",
    body: "Load recordings to replay past simulations. Compare different runs and analyze evolutionary trends.",
  },
] as const;

const helpListStyle: React.CSSProperties = {
  margin: "8px 0 8px 16px",
  padding: 0,
  color: TOKENS.textSecondary,
  fontSize: 13,
  lineHeight: 1.7,
};

const shortcutGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: TOKENS.spacing.sm,
};

const shortcutRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: TOKENS.spacing.md,
};

const shortcutKeysStyle: React.CSSProperties = {
  display: "flex",
  gap: TOKENS.spacing.xs,
  minWidth: 80,
  justifyContent: "flex-end",
};

const shortcutKeyStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 8px",
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${TOKENS.border}`,
  borderRadius: 4,
  fontFamily: TOKENS.fontMono,
  fontSize: 11,
  color: TOKENS.textPrimary,
  lineHeight: 1.4,
};

const shortcutActionStyle: React.CSSProperties = {
  fontSize: 13,
  color: TOKENS.textSecondary,
};

interface HelpSection {
  id: string;
  title: string;
  content: React.ReactNode;
  keywords: string[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: "quick-start",
    title: "Quick Start Guide",
    keywords: ["start", "begin", "first", "launch", "run", "new"],
    content: (
      <>
        <p>
          <strong>1. Launch a simulation</strong> — Use the parameter panel on the left to set world size, population, and food. Pick a preset for a quick start.
        </p>
        <p>
          <strong>2. Watch evolution unfold</strong> — Organisms move, eat, reproduce, and die. Colours and shapes reflect their genomes.
        </p>
        <p>
          <strong>3. Interact</strong> — Click any organism to see its stats. Drag the camera to explore. Use playback controls to pause or speed up.
        </p>
        <p>
          <strong>4. Experiment</strong> — Change parameters mid-run or restart with new settings. Every run is unique.
        </p>
      </>
    ),
  },
  {
    id: "controls",
    title: "Controls Reference",
    keywords: ["controls", "play", "pause", "speed", "scrubber", "camera", "zoom", "orbit"],
    content: (
      <>
        <p>
          <strong>Playback bar</strong> (bottom centre):
        </p>
        <ul style={helpListStyle}>
          <li><strong>Reset</strong> — Restart the current simulation from tick 0.</li>
          <li><strong>Play / Pause</strong> — Toggle the simulation clock.</li>
          <li><strong>Step</strong> — Advance one tick while paused.</li>
          <li><strong>Speed</strong> — 0.25× to 10× time dilation.</li>
          <li><strong>Scrubber</strong> — Drag to jump to any recorded tick.</li>
        </ul>
        <p>
          <strong>Camera</strong> — Left-drag to orbit, right-drag to pan, scroll to zoom. Use preset buttons (top, side, isometric) to snap to a view.
        </p>
      </>
    ),
  },
  {
    id: "concepts",
    title: "Concepts Explained",
    keywords: ["evolution", "speciation", "natural selection", "genome", "mutation", "gene", "dna", "trait"],
    content: (
      <>
        <p>
          <strong>Evolution</strong> — Over many generations, beneficial traits spread through the population while harmful ones fade away.
        </p>
        <p>
          <strong>Natural Selection</strong> — Organisms with traits that improve survival or reproduction leave more offspring. The environment (food, predators, crowding) drives selection pressure.
        </p>
        <p>
          <strong>Speciation</strong> — When two groups diverge genetically enough, they are recognised as separate species. The simulator tracks this automatically using the speciation threshold.
        </p>
        <p>
          <strong>Genome</strong> — Each organism carries a genome that determines its shape, colour, size, speed, and other traits. Genomes mutate during reproduction, creating variation.
        </p>
      </>
    ),
  },
  {
    id: "shortcuts",
    title: "Keyboard Shortcuts",
    keywords: ["keyboard", "shortcut", "key", "hotkey", "space", "arrow", "home", "escape"],
    content: (
      <>
        <div style={shortcutGridStyle}>
          <ShortcutRow keys={["Space"]} action="Play / Pause" />
          <ShortcutRow keys={["→"]} action="Step forward" />
          <ShortcutRow keys={["Home"]} action="Reset simulation" />
          <ShortcutRow keys={["Esc"]} action="Exit follow mode / close panels" />
        </div>
        <p style={{ marginTop: TOKENS.spacing.md, color: TOKENS.textSecondary, fontSize: 12 }}>
          Shortcuts are ignored while typing in any input field.
        </p>
      </>
    ),
  },
  {
    id: "tips",
    title: "Tips for Experiments",
    keywords: ["tip", "experiment", "advice", "trick", "preset", "primordial", "pangea", "pressure"],
    content: (
      <>
        <p>
          <strong>Primordial Soup</strong> — Small world, high mutation. Great for watching rapid adaptation and colourful diversity.
        </p>
        <p>
          <strong>Pangea</strong> — Large world, sparse resources. Encourages regional divergence and eventual speciation.
        </p>
        <p>
          <strong>Pressure Cooker</strong> — Scarce food, aggressive selection. Only the most efficient organisms survive; expect frequent extinction events.
        </p>
        <p>
          <strong>Pro tip:</strong> Lower the speciation threshold to see more frequent species splits, or raise it to keep a single unified population.
        </p>
      </>
    ),
  },
];

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div style={shortcutRowStyle}>
      <div style={shortcutKeysStyle}>
        {keys.map((k) => (
          <span key={k} style={shortcutKeyStyle}>{k}</span>
        ))}
      </div>
      <span style={shortcutActionStyle}>{action}</span>
    </div>
  );
}

function SectionCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={sectionCardStyle}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={sectionHeaderStyle}
        aria-expanded={open}
      >
        <span style={{ fontSize: 10, color: TOKENS.accent }}>
          {open ? "▼" : "▶"}
        </span>
        <span style={sectionTitleStyle}>{title}</span>
      </button>
      {open && <div style={sectionBodyStyle}>{children}</div>}
    </div>
  );
}

const STORAGE_KEY_FIRST_VISIT = "lineage_help_first_visit";
const STORAGE_KEY_TUTORIAL_DONE = "lineage_help_tutorial_done";

function hasVisitedBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_FIRST_VISIT) === "true";
  } catch {
    return false;
  }
}

function markVisited(): void {
  try {
    localStorage.setItem(STORAGE_KEY_FIRST_VISIT, "true");
  } catch {
    return;
  }
}

function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_TUTORIAL_DONE) === "true";
  } catch {
    return false;
  }
}

function markTutorialDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY_TUTORIAL_DONE, "true");
  } catch {
    return;
  }
}

export default function HelpPanel() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasVisitedBefore()) {
      setShowWelcome(true);
      markVisited();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;

      if (e.key === "?" && !typing && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setPanelOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setPanelOpen(false);
        setShowWelcome(false);
        setTutorialActive(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (panelOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [panelOpen]);

  const startTutorial = useCallback(() => {
    setShowWelcome(false);
    setTutorialActive(true);
    setTutorialStep(0);
  }, []);

  const skipTutorial = useCallback(() => {
    setShowWelcome(false);
    markTutorialDone();
  }, []);

  const nextStep = useCallback(() => {
    setTutorialStep((prev) => {
      if (prev >= TUTORIAL_STEPS.length - 1) {
        setTutorialActive(false);
        markTutorialDone();
        return prev;
      }
      return prev + 1;
    });
  }, []);

  const prevStep = useCallback(() => {
    setTutorialStep((prev) => Math.max(0, prev - 1));
  }, []);

  const exitTutorial = useCallback(() => {
    setTutorialActive(false);
    markTutorialDone();
  }, []);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return HELP_SECTIONS;
    return HELP_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.includes(q))
    );
  }, [searchQuery]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        title="Help (?)"
        style={helpButtonStyle}
        aria-label="Open help panel"
      >
        ?
      </button>

      {showWelcome && (
        <div style={modalOverlayStyle} onClick={skipTutorial}>
          <div
            style={welcomeCardStyle}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Lineage"
          >
            <div style={welcomeIconStyle}>◈</div>
            <h2 style={welcomeTitleStyle}>Welcome to Lineage</h2>
            <p style={welcomeBodyStyle}>
              An interactive evolutionary simulator. Watch digital organisms compete, mutate, and speciate in a living 3D world.
            </p>
            <div style={welcomeActionsStyle}>
              <button type="button" onClick={startTutorial} style={primaryBtnStyle}>
                Start Tutorial
              </button>
              <button type="button" onClick={skipTutorial} style={secondaryBtnStyle}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {tutorialActive && (
        <div style={tutorialOverlayStyle}>
          <div style={tutorialCardStyle}>
            <div style={tutorialStepBadgeStyle}>
              Step {tutorialStep + 1} of {TUTORIAL_STEPS.length}
            </div>
            <h3 style={tutorialTitleStyle}>{TUTORIAL_STEPS[tutorialStep].title}</h3>
            <p style={tutorialBodyStyle}>{TUTORIAL_STEPS[tutorialStep].body}</p>
            <div style={tutorialProgressStyle}>
              {TUTORIAL_STEPS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    ...tutorialDotStyle,
                    background: i === tutorialStep ? TOKENS.accent : i < tutorialStep ? TOKENS.accentDim : TOKENS.border,
                  }}
                />
              ))}
            </div>
            <div style={tutorialActionsStyle}>
              <button type="button" onClick={prevStep} disabled={tutorialStep === 0} style={tertiaryBtnStyle}>
                Back
              </button>
              <button type="button" onClick={exitTutorial} style={tertiaryBtnStyle}>
                Skip Tutorial
              </button>
              <button type="button" onClick={nextStep} style={primaryBtnStyle}>
                {tutorialStep === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <div style={panelOverlayStyle} onClick={() => setPanelOpen(false)}>
          <div
            style={panelCardStyle}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Help panel"
          >
            <div style={panelHeaderStyle}>
              <h2 style={panelTitleStyle}>Help</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                style={panelCloseBtnStyle}
                aria-label="Close help panel"
              >
                ✕
              </button>
            </div>

            <div style={searchRowStyle}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search help topics…"
                style={searchInputStyle}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={searchClearBtnStyle}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {isTutorialDone() && (
              <button
                type="button"
                onClick={() => {
                  setTutorialActive(true);
                  setTutorialStep(0);
                  setPanelOpen(false);
                }}
                style={restartTutorialBtnStyle}
              >
                ▶ Restart Tutorial
              </button>
            )}

            <div style={panelScrollAreaStyle}>
              {filteredSections.length === 0 ? (
                <div style={noResultsStyle}>No topics match "{searchQuery}"</div>
              ) : (
                filteredSections.map((section) => (
                  <SectionCard key={section.id} title={section.title} defaultOpen={searchQuery.length > 0}>
                    <div style={{ color: TOKENS.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                      {section.content}
                    </div>
                  </SectionCard>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const helpButtonStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "rgba(10, 10, 10, 0.75)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: `1px solid ${TOKENS.borderAccent}`,
  color: TOKENS.accent,
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  transition: "all 0.2s ease",
  fontFamily: TOKENS.fontUi,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
  animation: "fadeIn 0.2s ease",
};

const welcomeCardStyle: React.CSSProperties = {
  width: 420,
  maxWidth: "90vw",
  background: TOKENS.bgModal,
  border: `1px solid ${TOKENS.borderAccent}`,
  borderRadius: TOKENS.radius,
  padding: TOKENS.spacing.xl,
  textAlign: "center",
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  animation: "slideUp 0.3s ease",
};

const welcomeIconStyle: React.CSSProperties = {
  fontSize: 48,
  color: TOKENS.accent,
  marginBottom: TOKENS.spacing.md,
  lineHeight: 1,
};

const welcomeTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: TOKENS.textPrimary,
  fontFamily: TOKENS.fontUi,
  letterSpacing: "0.5px",
};

const welcomeBodyStyle: React.CSSProperties = {
  marginTop: TOKENS.spacing.md,
  fontSize: 14,
  lineHeight: 1.6,
  color: TOKENS.textSecondary,
  fontFamily: TOKENS.fontUi,
};

const welcomeActionsStyle: React.CSSProperties = {
  marginTop: TOKENS.spacing.xl,
  display: "flex",
  gap: TOKENS.spacing.md,
  justifyContent: "center",
};

const tutorialOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1200,
};

const tutorialCardStyle: React.CSSProperties = {
  width: 480,
  maxWidth: "90vw",
  background: TOKENS.bgModal,
  border: `1px solid ${TOKENS.borderAccent}`,
  borderRadius: TOKENS.radius,
  padding: TOKENS.spacing.xl,
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
};

const tutorialStepBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: TOKENS.accent,
  marginBottom: TOKENS.spacing.sm,
};

const tutorialTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: TOKENS.textPrimary,
  fontFamily: TOKENS.fontUi,
};

const tutorialBodyStyle: React.CSSProperties = {
  marginTop: TOKENS.spacing.md,
  fontSize: 14,
  lineHeight: 1.6,
  color: TOKENS.textSecondary,
  fontFamily: TOKENS.fontUi,
};

const tutorialProgressStyle: React.CSSProperties = {
  display: "flex",
  gap: TOKENS.spacing.sm,
  marginTop: TOKENS.spacing.lg,
  justifyContent: "center",
};

const tutorialDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  transition: "background 0.2s ease",
};

const tutorialActionsStyle: React.CSSProperties = {
  marginTop: TOKENS.spacing.lg,
  display: "flex",
  gap: TOKENS.spacing.md,
  justifyContent: "space-between",
  alignItems: "center",
};

const panelOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.4)",
  zIndex: 1100,
  display: "flex",
  justifyContent: "flex-end",
};

const panelCardStyle: React.CSSProperties = {
  width: 420,
  maxWidth: "90vw",
  height: "100vh",
  background: TOKENS.bgModal,
  borderLeft: `1px solid ${TOKENS.borderAccent}`,
  display: "flex",
  flexDirection: "column",
  animation: "slideInRight 0.2s ease",
  fontFamily: TOKENS.fontUi,
  color: TOKENS.textPrimary,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${TOKENS.spacing.lg}px ${TOKENS.spacing.xl}px`,
  borderBottom: `1px solid ${TOKENS.border}`,
  flexShrink: 0,
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: TOKENS.accent,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const panelCloseBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: TOKENS.radiusSm,
  background: "transparent",
  border: `1px solid ${TOKENS.border}`,
  color: TOKENS.textSecondary,
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
};

const searchRowStyle: React.CSSProperties = {
  position: "relative",
  padding: `${TOKENS.spacing.md}px ${TOKENS.spacing.xl}px`,
  borderBottom: `1px solid ${TOKENS.border}`,
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 36px 10px 12px",
  background: "rgba(255,255,255,0.05)",
  border: `1px solid ${TOKENS.border}`,
  borderRadius: TOKENS.radiusSm,
  color: TOKENS.textPrimary,
  fontSize: 13,
  fontFamily: TOKENS.fontUi,
  outline: "none",
  transition: "border-color 0.15s ease",
};

const searchClearBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: TOKENS.spacing.xl + 8,
  top: "50%",
  transform: "translateY(-50%)",
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "transparent",
  border: "none",
  color: TOKENS.textMuted,
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const restartTutorialBtnStyle: React.CSSProperties = {
  margin: `${TOKENS.spacing.md}px ${TOKENS.spacing.xl}px 0`,
  padding: "8px 12px",
  background: "transparent",
  border: `1px solid ${TOKENS.borderAccent}`,
  borderRadius: TOKENS.radiusSm,
  color: TOKENS.accent,
  fontSize: 12,
  fontFamily: TOKENS.fontUi,
  cursor: "pointer",
  transition: "all 0.15s ease",
  flexShrink: 0,
};

const panelScrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: `${TOKENS.spacing.lg}px ${TOKENS.spacing.xl}px`,
  display: "flex",
  flexDirection: "column",
  gap: TOKENS.spacing.md,
  scrollbarWidth: "thin",
  scrollbarColor: `${TOKENS.textMuted} transparent`,
};

const noResultsStyle: React.CSSProperties = {
  textAlign: "center",
  color: TOKENS.textMuted,
  fontSize: 13,
  padding: TOKENS.spacing.xl,
};

const sectionCardStyle: React.CSSProperties = {
  border: `1px solid ${TOKENS.border}`,
  borderRadius: TOKENS.radiusSm,
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "rgba(232, 213, 183, 0.04)",
  border: "none",
  color: TOKENS.textPrimary,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: TOKENS.spacing.sm,
  textAlign: "left",
  fontFamily: TOKENS.fontUi,
  transition: "background 0.15s ease",
};

const sectionTitleStyle: React.CSSProperties = {
  letterSpacing: "0.3px",
};

const sectionBodyStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderTop: `1px solid ${TOKENS.border}`,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: TOKENS.accent,
  color: "#0a0a0a",
  border: "none",
  borderRadius: TOKENS.radiusSm,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: TOKENS.fontUi,
  transition: "opacity 0.15s ease",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "transparent",
  color: TOKENS.textSecondary,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: TOKENS.radiusSm,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: TOKENS.fontUi,
  transition: "all 0.15s ease",
};

const tertiaryBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "transparent",
  color: TOKENS.textSecondary,
  border: `1px solid ${TOKENS.border}`,
  borderRadius: TOKENS.radiusSm,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: TOKENS.fontUi,
  transition: "all 0.15s ease",
};
