import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Shape } from "../../../simulation/types";
import EducationalOverlay, { CONCEPT_PANELS, EXPERIMENT_SUGGESTIONS, STAT_DEFINITIONS } from "../EducationalOverlay";

describe("EducationalOverlay", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the help button", () => {
    render(<EducationalOverlay disableAutoTour />);
    expect(screen.queryByLabelText("Open educational content")).toBeTruthy();
  });

  it("opens the menu when help button is clicked", () => {
    render(<EducationalOverlay disableAutoTour />);
    fireEvent.click(screen.getByLabelText("Open educational content"));
    expect(screen.queryByText("Evolution Guide")).toBeTruthy();
    expect(screen.queryByText("Concepts")).toBeTruthy();
    expect(screen.queryByText(/Experiments/)).toBeTruthy();
  });

  it("shows concept list in menu", () => {
    render(<EducationalOverlay disableAutoTour />);
    fireEvent.click(screen.getByLabelText("Open educational content"));
    expect(screen.queryByText("What is Speciation?")).toBeTruthy();
    expect(screen.queryByText("Natural Selection")).toBeTruthy();
    expect(screen.queryByText("Mutation")).toBeTruthy();
  });

  it("opens a concept panel when clicked", async () => {
    render(<EducationalOverlay disableAutoTour />);
    fireEvent.click(screen.getByLabelText("Open educational content"));
    fireEvent.click(screen.getByText("What is Speciation?"));
    await waitFor(() => {
      expect(screen.queryByText("The birth of new species")).toBeTruthy();
    });
  });

  it("closes concept panel when x is clicked", async () => {
    render(<EducationalOverlay disableAutoTour />);
    fireEvent.click(screen.getByLabelText("Open educational content"));
    fireEvent.click(screen.getByText("What is Speciation?"));
    await waitFor(() => {
      expect(screen.queryByLabelText("Close panel")).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("Close panel"));
    await waitFor(() => {
      expect(screen.queryByText("The birth of new species")).toBeFalsy();
    });
  });

  it("shows experiment suggestions", () => {
    render(<EducationalOverlay disableAutoTour />);
    fireEvent.click(screen.getByLabelText("Open educational content"));
    fireEvent.click(screen.getByText(/Experiments/));
    expect(screen.queryByText("Accelerated Evolution")).toBeTruthy();
    expect(screen.queryByText("Scarcity Pressure")).toBeTruthy();
  });

  it("shows tooltip on organism hover", () => {
    const { rerender } = render(<EducationalOverlay disableAutoTour />);
    rerender(
      <EducationalOverlay
        disableAutoTour
        hoveredOrganism={{
          id: 42,
          energy: 75.5,
          age: 120,
          genome: {
            size: 1.2,
            shape: Shape.CIRCLE,
            colorHue: 0.5,
            colorSat: 0.8,
            colorVal: 0.7,
            baseMetabolism: 0.1,
            photosynthesisRate: 0,
            movementSpeed: 1.5,
            foodDetectionRadius: 30,
            predatorDetectionRadius: 20,
            mateDetectionRadius: 25,
            reproductionThreshold: 60,
            reproductionCost: 30,
            sexualReproduction: true,
            crossoverPreference: 0.5,
            mutationRate: 0.05,
            mutationMagnitude: 0.1,
            behaviorTree: [],
            speciesId: 3,
            generation: 5,
            parentIds: [],
          },
        }}
        mousePosition={{ x: 200, y: 200 }}
      />
    );
    expect(screen.queryByText("Organism #42")).toBeTruthy();
    expect(screen.queryByText("75.5")).toBeTruthy();
    expect(screen.queryByText("120 ticks")).toBeTruthy();
  });

  it("shows tooltip on food hover", () => {
    const { rerender } = render(<EducationalOverlay disableAutoTour />);
    rerender(
      <EducationalOverlay
        disableAutoTour
        hoveredFood={{ energy: 15.0 }}
        mousePosition={{ x: 200, y: 200 }}
      />
    );
    expect(screen.queryByText("Food")).toBeTruthy();
    expect(screen.queryByText("15.0")).toBeTruthy();
  });

  it("shows tooltip on stat hover", () => {
    const { rerender } = render(<EducationalOverlay disableAutoTour />);
    rerender(
      <EducationalOverlay
        disableAutoTour
        hoveredStatLabel="Population"
        mousePosition={{ x: 200, y: 200 }}
      />
    );
    expect(screen.queryByText("Population")).toBeTruthy();
    expect(screen.queryByText("Number of living organisms")).toBeTruthy();
  });

  it("exports educational content", () => {
    expect(CONCEPT_PANELS.length).toBeGreaterThan(0);
    expect(EXPERIMENT_SUGGESTIONS.length).toBeGreaterThan(0);
    expect(Object.keys(STAT_DEFINITIONS).length).toBeGreaterThan(0);
  });
});
