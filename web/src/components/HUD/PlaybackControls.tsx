import { memo, useCallback, useEffect, useRef, useState } from "react";

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;

export interface PlaybackControlsProps {
  isRunning: boolean;
  isInitialized: boolean;
  currentTick: number;
  totalTicks: number;
  speed: number;
  hasHistory?: boolean;
  isRecording?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onScrub: (tick: number) => void;
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "12px 20px",
  background: "rgba(10, 10, 10, 0.75)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(232, 213, 183, 0.15)",
  borderRadius: 8,
  color: "#e0e0e0",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 13,
  userSelect: "none",
  zIndex: 1000,
};

const transportGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const timeDisplayStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontSize: 12,
  color: "rgba(224, 224, 224, 0.8)",
  whiteSpace: "nowrap",
  minWidth: 140,
  textAlign: "center",
};

const speedGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const sliderContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  width: 180,
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "rgba(224, 224, 224, 0.5)",
  fontVariantNumeric: "tabular-nums",
};

interface ControlButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

const ControlButton = memo(function ControlButton({ children, onClick, disabled, title }: ControlButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered ? "rgba(232, 213, 183, 0.15)" : "transparent",
        border: "1px solid rgba(232, 213, 183, 0.2)",
        borderRadius: 6,
        color: disabled ? "rgba(224, 224, 224, 0.3)" : "#e0e0e0",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 16,
        lineHeight: 1,
        padding: 0,
        transition: "background 0.15s ease",
      }}
    >
      {children}
    </button>
  );
});

interface SpeedButtonProps {
  speedValue: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const SpeedButton = memo(function SpeedButton({ speedValue, active, disabled, onClick }: SpeedButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "4px 8px",
        fontSize: 11,
        borderRadius: 4,
        border: "1px solid",
        borderColor: active
          ? "#e8d5b7"
          : hovered
            ? "rgba(232, 213, 183, 0.4)"
            : "rgba(232, 213, 183, 0.2)",
        background: active
          ? "rgba(232, 213, 183, 0.2)"
          : hovered
            ? "rgba(232, 213, 183, 0.08)"
            : "transparent",
        color: active ? "#e8d5b7" : "rgba(224, 224, 224, 0.7)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        fontFamily: "inherit",
      }}
    >
      {speedValue}x
    </button>
  );
});

function PlaybackControls({
  isRunning,
  isInitialized,
  currentTick,
  totalTicks,
  speed,
  hasHistory = false,
  isRecording = false,
  onPlay,
  onPause,
  onStep,
  onReset,
  onSpeedChange,
  onScrub,
}: PlaybackControlsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isRunning) {
            onPause();
          } else {
            onPlay();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          onStep();
          break;
        case "Home":
          e.preventDefault();
          onReset();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, onPlay, onPause, onStep, onReset]);

  useEffect(() => {
    if (!isRecording) return;
    let frame: number;
    const animate = () => {
      setPulsePhase((prev) => (prev + 0.05) % (Math.PI * 2));
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isRecording]);

  const getTickFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || totalTicks <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * totalTicks);
    },
    [totalTicks]
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!hasHistory || totalTicks <= 0 || !isInitialized) return;
      const tick = getTickFromClientX(e.clientX);
      onScrub(tick);
      setIsDragging(true);
    },
    [hasHistory, totalTicks, isInitialized, getTickFromClientX, onScrub]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!hasHistory || totalTicks <= 0 || !isInitialized) return;
      const tick = getTickFromClientX(e.touches[0].clientX);
      onScrub(tick);
      setIsDragging(true);
    },
    [hasHistory, totalTicks, isInitialized, getTickFromClientX, onScrub]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const tick = getTickFromClientX(e.clientX);
      onScrub(tick);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const tick = getTickFromClientX(e.touches[0].clientX);
      onScrub(tick);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, getTickFromClientX, onScrub]);

  const sliderPercent =
    totalTicks > 0 ? Math.min(100, (currentTick / totalTicks) * 100) : 0;

  const recordingOpacity = isRecording ? 0.5 + 0.5 * Math.sin(pulsePhase) : 0;
  const scrubberEnabled = hasHistory && isInitialized && totalTicks > 0;

  const handleTrackKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!scrubberEnabled || totalTicks <= 0) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          onScrub(Math.max(0, currentTick - Math.max(1, Math.round(totalTicks * 0.01))));
          break;
        case "ArrowRight":
          e.preventDefault();
          onScrub(Math.min(totalTicks, currentTick + Math.max(1, Math.round(totalTicks * 0.01))));
          break;
        case "Home":
          e.preventDefault();
          onScrub(0);
          break;
        case "End":
          e.preventDefault();
          onScrub(totalTicks);
          break;
      }
    },
    [scrubberEnabled, totalTicks, currentTick, onScrub]
  );

  return (
    <div style={containerStyle}>
      <div
        title={isRecording ? "Recording active" : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#ff4444",
          opacity: recordingOpacity,
          transition: isRecording ? undefined : "opacity 0.3s ease",
          flexShrink: 0,
        }}
      />

      <div style={transportGroupStyle}>
        <ControlButton
          onClick={onReset}
          disabled={!isInitialized}
          title="Reset (Home)"
        >
          &#x21BA;
        </ControlButton>

        <ControlButton
          onClick={isRunning ? onPause : onPlay}
          disabled={!isInitialized}
          title={isRunning ? "Pause (Space)" : "Play (Space)"}
        >
          {isRunning ? "\u23F8" : "\u25B6"}
        </ControlButton>

        <ControlButton
          onClick={onStep}
          disabled={!isInitialized || isRunning}
          title="Step forward (→)"
        >
          &#x23ED;
        </ControlButton>
      </div>

      <div style={timeDisplayStyle}>
        Tick {currentTick.toLocaleString()} / {totalTicks.toLocaleString()}
      </div>

      <div style={speedGroupStyle}>
        {SPEEDS.map((s) => (
          <SpeedButton
            key={s}
            speedValue={s}
            active={speed === s}
            disabled={!isInitialized}
            onClick={() => onSpeedChange(s)}
          />
        ))}
      </div>

      <div style={sliderContainerStyle}>
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          onTouchStart={handleTouchStart}
          onKeyDown={handleTrackKeyDown}
          tabIndex={scrubberEnabled ? 0 : -1}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={totalTicks}
          aria-valuenow={currentTick}
          aria-label="Timeline scrubber"
          style={{
            position: "relative",
            width: "100%",
            height: 4,
            background: "rgba(232, 213, 183, 0.2)",
            borderRadius: 2,
            cursor: scrubberEnabled
              ? isDragging
                ? "grabbing"
                : "grab"
              : "not-allowed",
            opacity: scrubberEnabled ? 1 : 0.4,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${sliderPercent}%`,
              background: "#e8d5b7",
              borderRadius: 2,
              transition: isDragging ? undefined : "width 0.1s ease-out",
            }}
          />

          <div
            style={{
              position: "absolute",
              left: `${sliderPercent}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 14,
              height: 14,
              background: "#e8d5b7",
              borderRadius: "50%",
              boxShadow: "0 0 4px rgba(232, 213, 183, 0.5)",
              opacity: scrubberEnabled ? 1 : 0,
              transition: isDragging ? undefined : "left 0.1s ease-out",
              pointerEvents: "none",
            }}
          />
        </div>

        <div style={sliderLabelStyle}>
          {scrubberEnabled
            ? `${currentTick.toLocaleString()} / ${totalTicks.toLocaleString()}`
            : "Live"}
        </div>
      </div>
    </div>
  );
}

export default memo(PlaybackControls);
