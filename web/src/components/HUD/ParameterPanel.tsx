import { memo, useState, useCallback, useMemo } from "react";
import type { SimulationConfig } from "../../simulation/types";
import { DEFAULT_CONFIG, PRESETS } from "../../simulation/config";

/** Extended config that includes organism-level genome defaults. */
export interface ParameterPanelConfig extends SimulationConfig {
  mutationRate: number;
  reproductionThreshold: number;
  reproductionCost: number;
  sexualReproduction: boolean;
}

interface ParameterPanelProps {
  initialConfig?: Partial<ParameterPanelConfig>;
  onApply: (config: ParameterPanelConfig) => void;
}

interface ParamRange {
  min: number;
  max: number;
  step: number;
}

const PARAM_RANGES: Record<string, ParamRange> = {
  worldWidth: { min: 50, max: 500, step: 10 },
  worldHeight: { min: 50, max: 500, step: 10 },
  initialPopulation: { min: 10, max: 2000, step: 10 },
  maxPopulation: { min: 100, max: 5000, step: 50 },
  initialFood: { min: 0, max: 2000, step: 10 },
  foodSpawnRate: { min: 0, max: 1, step: 0.01 },
  foodEnergy: { min: 1, max: 50, step: 0.5 },
  carryingCapacityPressure: { min: 0, max: 0.01, step: 0.0001 },
  speciationThreshold: { min: 0, max: 1, step: 0.01 },
  ticks: { min: 1000, max: 500_000, step: 1000 },
  recordEveryNTicks: { min: 1, max: 1000, step: 1 },
  renderEveryNTicks: { min: 1, max: 100, step: 1 },
  mutationRate: { min: 0, max: 0.5, step: 0.001 },
  reproductionThreshold: { min: 1, max: 200, step: 1 },
  reproductionCost: { min: 1, max: 200, step: 1 },
};

const DEFAULT_ORGANISM_PARAMS = {
  mutationRate: 0.01,
  reproductionThreshold: 60,
  reproductionCost: 30,
  sexualReproduction: true,
};

function buildDefaultPanelConfig(): ParameterPanelConfig {
  return {
    ...DEFAULT_CONFIG,
    ...DEFAULT_ORGANISM_PARAMS,
  };
}

function mergeWithDefaults(partial?: Partial<ParameterPanelConfig>): ParameterPanelConfig {
  return {
    ...buildDefaultPanelConfig(),
    ...partial,
  };
}

function presetToPanelConfig(preset: SimulationConfig): ParameterPanelConfig {
  return {
    ...preset,
    ...DEFAULT_ORGANISM_PARAMS,
  };
}

function clampParam(key: keyof typeof PARAM_RANGES, value: number): number {
  const range = PARAM_RANGES[key];
  if (!range) return value;
  const clamped = Math.max(range.min, Math.min(range.max, value));
  return Math.round(clamped / range.step) * range.step;
}

function getValidationWarnings(config: ParameterPanelConfig): string[] {
  const warnings: string[] = [];
  if (config.worldWidth > 400 || config.worldHeight > 400) {
    warnings.push("Large worlds may impact performance.");
  }
  if (config.maxPopulation > 3000) {
    warnings.push("High population may cause lag.");
  }
  if (config.foodEnergy < 5) {
    warnings.push("Low food energy: organisms may starve quickly.");
  }
  if (config.mutationRate > 0.2) {
    warnings.push("High mutation rate: simulation may become chaotic.");
  }
  if (config.speciationThreshold < 0.1) {
    warnings.push("Low speciation threshold: excessive speciation expected.");
  }
  if (config.carryingCapacityPressure > 0.008) {
    warnings.push("High selection pressure: population may collapse.");
  }
  if (config.initialPopulation > config.maxPopulation) {
    warnings.push("Initial population exceeds max population.");
  }
  if (config.reproductionCost >= config.reproductionThreshold) {
    warnings.push("Reproduction cost >= threshold: organisms cannot reproduce.");
  }
  return warnings;
}


const ToggleSwitch = memo(function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div style={toggleRowStyle}>
      <span style={paramLabelStyle}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          ...toggleTrackStyle,
          backgroundColor: checked ? "#e8d5b7" : "#333",
        }}
        aria-checked={checked}
        role="switch"
      >
        <span
          style={{
            ...toggleThumbStyle,
            transform: checked ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
});

const NumberParamRow = memo(function NumberParamRow({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: ParamRange;
  onChange: (v: number) => void;
}) {
  const step = range.step;
  const displayValue =
    step < 0.01 ? value.toFixed(4) : step < 0.1 ? value.toFixed(3) : step < 1 ? value.toFixed(1) : String(value);

  return (
    <div style={paramRowStyle}>
      <div style={paramHeaderStyle}>
        <span style={paramLabelStyle}>{label}</span>
        <span style={paramValueStyle}>{displayValue}</span>
      </div>
      <div style={sliderRowStyle}>
        <span style={rangeLabelStyle}>{range.min}</span>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={sliderStyle}
        />
        <span style={rangeLabelStyle}>{range.max}</span>
        <input
          type="number"
          min={range.min}
          max={range.max}
          step={range.step}
          value={displayValue}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (!isNaN(parsed)) onChange(parsed);
          }}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
});

const ParamGroup = memo(function ParamGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={groupStyle}>
      <button type="button" onClick={() => setOpen(!open)} style={groupHeaderStyle}>
        <span>{open ? "▼" : "▶"}</span>
        <span style={groupTitleStyle}>{title}</span>
      </button>
      {open && <div style={groupBodyStyle}>{children}</div>}
    </div>
  );
});

function ParameterPanel({ initialConfig, onApply }: ParameterPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [config, setConfig] = useState<ParameterPanelConfig>(() =>
    mergeWithDefaults(initialConfig)
  );
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  const warnings = useMemo(() => getValidationWarnings(config), [config]);

  const updateNumeric = useCallback(
    (key: keyof ParameterPanelConfig, value: number) => {
      if (key in PARAM_RANGES) {
        value = clampParam(key as keyof typeof PARAM_RANGES, value);
      }
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const loadPreset = useCallback(
    (name: string) => {
      const preset = PRESETS[name];
      if (!preset) return;
      setConfig(presetToPanelConfig(preset));
      setSelectedPreset(name);
    },
    []
  );

  const resetToDefaults = useCallback(() => {
    setConfig(buildDefaultPanelConfig());
    setSelectedPreset("");
  }, []);

  const handleApply = useCallback(() => {
    onApply({ ...config });
  }, [config, onApply]);

  return (
    <div style={{ ...panelOuterStyle, width: collapsed ? 44 : 320 }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={collapseBtnStyle}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        {collapsed ? "▶" : "◀"}
      </button>

      {!collapsed && (
        <div style={panelInnerStyle}>
          <h2 style={panelTitleStyle}>Parameters</h2>

          <div style={presetRowStyle}>
            <label style={presetLabelStyle}>Preset</label>
            <select
              value={selectedPreset}
              onChange={(e) => loadPreset(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Custom —</option>
              <option value="primordial_soup">Primordial Soup</option>
              <option value="pangea">Pangea</option>
              <option value="pressure_cooker">Pressure Cooker</option>
            </select>
          </div>

          <div style={presetBtnRowStyle}>
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => loadPreset(name)}
                style={{
                  ...presetBtnStyle,
                  borderColor: selectedPreset === name ? "#e8d5b7" : "#444",
                  color: selectedPreset === name ? "#e8d5b7" : "#ccc",
                }}
              >
                {name.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          <ParamGroup title="World">
            <NumberParamRow
              label="Width"
              value={config.worldWidth}
              range={PARAM_RANGES.worldWidth}
              onChange={(v) => updateNumeric("worldWidth", v)}
            />
            <NumberParamRow
              label="Height"
              value={config.worldHeight}
              range={PARAM_RANGES.worldHeight}
              onChange={(v) => updateNumeric("worldHeight", v)}
            />
            <NumberParamRow
              label="Initial Population"
              value={config.initialPopulation}
              range={PARAM_RANGES.initialPopulation}
              onChange={(v) => updateNumeric("initialPopulation", v)}
            />
            <NumberParamRow
              label="Max Population"
              value={config.maxPopulation}
              range={PARAM_RANGES.maxPopulation}
              onChange={(v) => updateNumeric("maxPopulation", v)}
            />
          </ParamGroup>

          <ParamGroup title="Food">
            <NumberParamRow
              label="Spawn Rate"
              value={config.foodSpawnRate}
              range={PARAM_RANGES.foodSpawnRate}
              onChange={(v) => updateNumeric("foodSpawnRate", v)}
            />
            <NumberParamRow
              label="Energy"
              value={config.foodEnergy}
              range={PARAM_RANGES.foodEnergy}
              onChange={(v) => updateNumeric("foodEnergy", v)}
            />
            <NumberParamRow
              label="Initial Amount"
              value={config.initialFood}
              range={PARAM_RANGES.initialFood}
              onChange={(v) => updateNumeric("initialFood", v)}
            />
          </ParamGroup>

          <ParamGroup title="Organisms">
            <NumberParamRow
              label="Mutation Rate"
              value={config.mutationRate}
              range={PARAM_RANGES.mutationRate}
              onChange={(v) => updateNumeric("mutationRate", v)}
            />
            <NumberParamRow
              label="Reproduction Threshold"
              value={config.reproductionThreshold}
              range={PARAM_RANGES.reproductionThreshold}
              onChange={(v) => updateNumeric("reproductionThreshold", v)}
            />
            <NumberParamRow
              label="Reproduction Cost"
              value={config.reproductionCost}
              range={PARAM_RANGES.reproductionCost}
              onChange={(v) => updateNumeric("reproductionCost", v)}
            />
            <ToggleSwitch
              label="Sexual Reproduction"
              checked={config.sexualReproduction}
              onChange={(v) => setConfig((prev) => ({ ...prev, sexualReproduction: v }))}
            />
          </ParamGroup>

          <ParamGroup title="Selection">
            <NumberParamRow
              label="Carrying Capacity Pressure"
              value={config.carryingCapacityPressure}
              range={PARAM_RANGES.carryingCapacityPressure}
              onChange={(v) => updateNumeric("carryingCapacityPressure", v)}
            />
            <NumberParamRow
              label="Speciation Threshold"
              value={config.speciationThreshold}
              range={PARAM_RANGES.speciationThreshold}
              onChange={(v) => updateNumeric("speciationThreshold", v)}
            />
          </ParamGroup>

          <ParamGroup title="Simulation">
            <NumberParamRow
              label="Ticks"
              value={config.ticks}
              range={PARAM_RANGES.ticks}
              onChange={(v) => updateNumeric("ticks", v)}
            />
            <NumberParamRow
              label="Record Every N"
              value={config.recordEveryNTicks}
              range={PARAM_RANGES.recordEveryNTicks}
              onChange={(v) => updateNumeric("recordEveryNTicks", v)}
            />
            <NumberParamRow
              label="Render Every N"
              value={config.renderEveryNTicks}
              range={PARAM_RANGES.renderEveryNTicks}
              onChange={(v) => updateNumeric("renderEveryNTicks", v)}
            />
          </ParamGroup>

          {warnings.length > 0 && (
            <div style={warningsStyle}>
              {warnings.map((w, i) => (
                <div key={i} style={warningItemStyle}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          <div style={actionRowStyle}>
            <button type="button" onClick={handleApply} style={applyBtnStyle}>
              Apply &amp; Restart
            </button>
            <button type="button" onClick={resetToDefaults} style={resetBtnStyle}>
              Reset to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ParameterPanel);

const panelOuterStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  height: "100vh",
  zIndex: 100,
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  backgroundColor: "rgba(10, 10, 10, 0.92)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  borderRight: "1px solid rgba(232, 213, 183, 0.15)",
  transition: "width 0.25s ease, opacity 0.2s ease",
  overflow: "hidden",
  fontFamily: "system-ui, -apple-system, sans-serif",
  color: "#e0e0e0",
};

const collapseBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  background: "transparent",
  border: "none",
  color: "#e8d5b7",
  fontSize: 16,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelInnerStyle: React.CSSProperties = {
  flex: 1,
  padding: "16px 16px 24px 0",
  overflowY: "auto",
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
  color: "#e8d5b7",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const presetRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 4,
};

const presetLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: "#1a1a1a",
  color: "#e0e0e0",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 13,
  cursor: "pointer",
};

const presetBtnRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const presetBtnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 60,
  padding: "6px 8px",
  background: "#1a1a1a",
  border: "1px solid #444",
  borderRadius: 4,
  fontSize: 11,
  textTransform: "capitalize",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const groupStyle: React.CSSProperties = {
  border: "1px solid rgba(232, 213, 183, 0.1)",
  borderRadius: 6,
  overflow: "hidden",
};

const groupHeaderStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "rgba(232, 213, 183, 0.06)",
  border: "none",
  color: "#e8d5b7",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  textAlign: "left",
};

const groupTitleStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const groupBodyStyle: React.CSSProperties = {
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const paramRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const paramHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
};

const paramLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#bbb",
};

const paramValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#e8d5b7",
  fontVariantNumeric: "tabular-nums",
};

const sliderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const rangeLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#666",
  minWidth: 24,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "#e8d5b7",
  cursor: "pointer",
};

const numberInputStyle: React.CSSProperties = {
  width: 64,
  background: "#1a1a1a",
  color: "#e0e0e0",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "4px 6px",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
};

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 0",
};

const toggleTrackStyle: React.CSSProperties = {
  width: 40,
  height: 20,
  borderRadius: 10,
  border: "none",
  padding: 0,
  position: "relative",
  cursor: "pointer",
  transition: "background-color 0.2s ease",
};

const toggleThumbStyle: React.CSSProperties = {
  display: "block",
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "#fff",
  position: "absolute",
  top: 2,
  left: 2,
  transition: "transform 0.2s ease",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
};

const warningsStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255, 180, 60, 0.08)",
  border: "1px solid rgba(255, 180, 60, 0.25)",
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const warningItemStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#ffb43c",
  lineHeight: 1.4,
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 4,
};

const applyBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#e8d5b7",
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s ease",
};

const resetBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  color: "#999",
  border: "1px solid #444",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  transition: "all 0.15s ease",
};
