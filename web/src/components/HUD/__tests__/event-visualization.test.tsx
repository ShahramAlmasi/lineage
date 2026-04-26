import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventLog } from "../EventLog";
import { EventTimeline } from "../EventTimeline";
import type { SimulationEvent } from "../../../simulation/types";

const SAMPLE_EVENTS: SimulationEvent[] = [
  { tick: 10, message: "New species 1 emerged", eventType: "Speciation" },
  { tick: 25, message: "Organism 42 born", eventType: "Birth" },
  { tick: 38, message: "Organism 15 died", eventType: "Death" },
  { tick: 50, message: "Species 0 went extinct", eventType: "Extinction" },
];

const POPULATION_HISTORY = [
  { tick: 0, population: 50 },
  { tick: 10, population: 55 },
  { tick: 25, population: 62 },
  { tick: 50, population: 78 },
];

describe("EventLog", () => {
  it("renders event list with correct event types", () => {
    const onJumpToTick = vi.fn();
    render(
      <EventLog events={SAMPLE_EVENTS} onJumpToTick={onJumpToTick} />
    );

    expect(screen.getByText("Event Log")).toBeDefined();
    expect(screen.getByText("New species 1 emerged")).toBeDefined();
    expect(screen.getByText("Organism 42 born")).toBeDefined();
    expect(screen.getByText("Organism 15 died")).toBeDefined();
    expect(screen.getByText("Species 0 went extinct")).toBeDefined();
  });

  it("filters events by type", () => {
    const onJumpToTick = vi.fn();
    render(
      <EventLog events={SAMPLE_EVENTS} onJumpToTick={onJumpToTick} />
    );

    const speciationButton = screen.getAllByText("Speciation")[0];
    fireEvent.click(speciationButton);

    expect(screen.queryByText("New species 1 emerged")).toBeNull();
    expect(screen.getByText("Organism 42 born")).toBeDefined();
  });

  it("calls onJumpToTick when event is clicked", () => {
    const onJumpToTick = vi.fn();
    render(
      <EventLog events={SAMPLE_EVENTS} onJumpToTick={onJumpToTick} />
    );

    const eventRow = screen.getByText("New species 1 emerged").closest("div");
    fireEvent.click(eventRow!);

    expect(onJumpToTick).toHaveBeenCalledWith(10);
  });
});

describe("EventTimeline", () => {
  it("renders timeline with events", () => {
    const onJumpToTick = vi.fn();
    render(
      <EventTimeline
        events={SAMPLE_EVENTS}
        onJumpToTick={onJumpToTick}
        populationHistory={POPULATION_HISTORY}
      />
    );

    expect(screen.getByText("Event Timeline")).toBeDefined();
  });

  it("has zoom controls", () => {
    const onJumpToTick = vi.fn();
    render(
      <EventTimeline
        events={SAMPLE_EVENTS}
        onJumpToTick={onJumpToTick}
        populationHistory={POPULATION_HISTORY}
      />
    );

    expect(screen.getByText("+")).toBeDefined();
    expect(screen.getByText("−")).toBeDefined();
    expect(screen.getByText("Reset")).toBeDefined();
  });
});
