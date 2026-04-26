import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import World3D from "./components/World3D";
import { CameraUI, type CameraApi } from "./components/CameraControls";
import { StatsPanel } from "./components/HUD/StatsPanel";
import EventLog from "./components/HUD/EventLog";
import PlaybackControls from "./components/HUD/PlaybackControls";
import ParameterPanel from "./components/HUD/ParameterPanel";
import type { ParameterPanelConfig } from "./components/HUD/ParameterPanel";
import type { SimulationConfig } from "./simulation/types";
import EducationalOverlay from "./components/HUD/EducationalOverlay";
import HelpPanel from "./components/HUD/HelpPanel";
import { SimulationProvider, useSimulationContext } from "./store/SimulationContext";

const PhylogenyTree = lazy(() => import("./components/HUD/PhylogenyTree"));
const GenomeInspector = lazy(() => import("./components/HUD/GenomeInspector"));
const ComparisonView = lazy(() => import("./components/HUD/ComparisonView"));
const RecordingLoader = lazy(() => import("./components/HUD/RecordingLoader"));

function IntegratedApp() {
  const sim = useSimulationContext();
  const [cameraApi, setCameraApi] = useState<CameraApi | null>(null);

  const handleApplyConfig = useCallback((config: ParameterPanelConfig) => {
    sim.setConfig(config);
  }, [sim.setConfig]);

  const handleJump = useCallback((tick: number) => {
    if (tick <= sim.currentTick) return;
    sim.pause();
  }, [sim.currentTick, sim.pause]);

  const handleScrub = useCallback((tick: number) => {
    if (tick === 0) sim.reset();
  }, [sim.reset]);

  const handleFrame = useCallback(() => {
    // RecordingLoader owns recording playback state; live worker state remains paused.
  }, []);

  const handleToggleRecordingMode = useCallback(() => {
    sim.setRecordingMode(sim.recordingMode === "off" ? "loader" : "off");
  }, [sim.recordingMode, sim.setRecordingMode]);

  const handleEducationalConfigChange = useCallback((config: Partial<SimulationConfig>) => {
    sim.setConfig({ ...sim.currentConfig, ...config });
  }, [sim.currentConfig, sim.setConfig]);

  const handleCloseGenomeInspector = useCallback(() => {
    sim.selectOrganism(null);
  }, [sim.selectOrganism]);

  const comparisonView = useMemo(() => (
    <Suspense fallback={null}>
      <ComparisonView active leftConfig={sim.currentConfig} rightConfig={sim.currentConfig} />
    </Suspense>
  ), [sim.currentConfig]);

  if (sim.comparisonMode) {
    return (
      <div style={appStyle}>
        {comparisonView}
        <button style={modeButtonStyle} onClick={sim.toggleComparison}>Exit comparison</button>
      </div>
    );
  }

  return (
    <div style={appStyle}>
      {sim.recordingMode === "off" && (
        <World3D
          organisms={sim.organisms}
          food={sim.food}
          worldWidth={sim.currentConfig.worldWidth}
          worldHeight={sim.currentConfig.worldHeight}
          isRunning={sim.isRunning}
          selectedOrganismId={sim.selectedOrganismId}
          onSelectOrganism={sim.selectOrganism}
          onCameraApiReady={setCameraApi}
        />
      )}

      <div data-tour="help" style={topLeftStyle}>
        <HelpPanel />
      </div>

      <div data-tour="stats" style={statsStyle}>
        <StatsPanel stats={sim.stats} state={sim.state} isRunning={sim.isRunning} />
      </div>

      {sim.species.size > 0 && (
        <div style={phylogenyStyle}>
          <Suspense fallback={null}>
            <PhylogenyTree tree={sim.species} currentTick={sim.currentTick} />
          </Suspense>
        </div>
      )}

      <div data-tour="parameters">
        <ParameterPanel initialConfig={sim.currentConfig} onApply={handleApplyConfig} />
      </div>

      <div data-tour="events">
        <EventLog events={sim.events} onJumpToTick={handleJump} currentTick={sim.currentTick} />
      </div>

      <div data-tour="playback">
        <PlaybackControls
          isRunning={sim.isRunning}
          isInitialized={sim.isInitialized}
          currentTick={sim.currentTick}
          totalTicks={sim.currentConfig.ticks}
          speed={sim.playbackSpeed}
          hasHistory={false}
          onPlay={sim.run}
          onPause={sim.pause}
          onStep={sim.tick}
          onReset={sim.reset}
          onSpeedChange={sim.setSpeed}
          onScrub={handleScrub}
        />
      </div>

      <CameraUI selectedOrganismId={sim.selectedOrganismId} cameraApi={cameraApi} />

      <div style={modeToggleStyle}>
        <button style={hudButtonStyle} onClick={sim.toggleComparison}>Compare</button>
        <button style={hudButtonStyle} onClick={handleToggleRecordingMode}>
          {sim.recordingMode === "off" ? "Load Recording" : "Live Mode"}
        </button>
      </div>

      {sim.recordingMode !== "off" && (
        <Suspense fallback={null}>
          <RecordingLoader onFrameUpdate={handleFrame} />
        </Suspense>
      )}

      <EducationalOverlay
        hoveredOrganism={null}
        hoveredFood={null}
        hoveredStatLabel={null}
        currentConfig={sim.currentConfig}
        onRequestConfigChange={handleEducationalConfigChange}
      />

      <Suspense fallback={null}>
        <GenomeInspector organism={sim.selectedOrganism} onClose={handleCloseGenomeInspector} />
      </Suspense>

      {sim.error && (
        <div className="lineage-error-banner" role="alert" aria-live="assertive">
          {sim.error}
        </div>
      )}

      {!sim.isInitialized && (
        <div className="lineage-loading-container">
          <div className="lineage-loading-spinner" aria-label="Initializing simulation" />
          <span className="lineage-loading-text">Initializing simulation…</span>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <SimulationProvider>
      <IntegratedApp />
    </SimulationProvider>
  );
}

const appStyle: React.CSSProperties = {
  minHeight: "100vh",
  margin: 0,
  background: "#0a0a0a",
  color: "#e0e0e0",
  fontFamily: "system-ui, -apple-system, sans-serif",
  overflow: "hidden",
};

const topLeftStyle: React.CSSProperties = { position: "fixed", top: 16, left: 16, zIndex: 1200 };
const statsStyle: React.CSSProperties = { position: "fixed", top: 16, right: 16, zIndex: 100 };
const phylogenyStyle: React.CSSProperties = { position: "fixed", top: 260, right: 16, zIndex: 100 };
const modeToggleStyle: React.CSSProperties = { position: "fixed", top: 16, left: 84, display: "flex", gap: 8, zIndex: 1100 };
const modeButtonStyle: React.CSSProperties = { position: "fixed", top: 16, left: 16, zIndex: 2000 };

const hudButtonStyle: React.CSSProperties = {
  background: "rgba(10, 10, 10, 0.85)",
  color: "#e8d5b7",
  border: "1px solid rgba(232, 213, 183, 0.2)",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  backdropFilter: "blur(8px)",
};

export default App;
