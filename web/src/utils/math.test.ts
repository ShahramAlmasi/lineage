import { describe, it, expect } from "vitest";
import { distanceTo, directionTo, move, blendAngle } from "./math";
import type { Position } from "./math";

describe("distanceTo", () => {
  it("returns 0 for identical positions", () => {
    const pos: Position = { x: 50, y: 50 };
    expect(distanceTo(pos, pos, 200, 200)).toBe(0);
  });

  it("computes straight-line distance", () => {
    const a: Position = { x: 0, y: 0 };
    const b: Position = { x: 3, y: 4 };
    expect(distanceTo(a, b, 200, 200)).toBeCloseTo(5, 10);
  });

  it("wraps via shorter toroidal path", () => {
    const a: Position = { x: 1, y: 0 };
    const b: Position = { x: 199, y: 0 };
    expect(distanceTo(a, b, 200, 200)).toBeCloseTo(2, 10);
  });

  it("wraps vertically", () => {
    const a: Position = { x: 0, y: 1 };
    const b: Position = { x: 0, y: 199 };
    expect(distanceTo(a, b, 200, 200)).toBeCloseTo(2, 10);
  });

  it("wraps both axes", () => {
    const a: Position = { x: 1, y: 1 };
    const b: Position = { x: 199, y: 199 };
    const d = distanceTo(a, b, 200, 200);
    expect(d).toBeCloseTo(Math.hypot(2, 2), 10);
  });
});

describe("directionTo", () => {
  it("returns (0,0) for identical positions", () => {
    const pos: Position = { x: 50, y: 50 };
    const dir = directionTo(pos, pos, 200, 200);
    expect(dir).toEqual({ dx: 0, dy: 0 });
  });

  it("returns unit vector for straight line", () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 0, y: 10 };
    const dir = directionTo(from, to, 200, 200);
    expect(dir.dx).toBeCloseTo(0, 10);
    expect(dir.dy).toBeCloseTo(1, 10);
  });

  it("wraps direction via shorter path", () => {
    const from: Position = { x: 199, y: 0 };
    const to: Position = { x: 1, y: 0 };
    const dir = directionTo(from, to, 200, 200);
    expect(dir.dx).toBeCloseTo(1, 10);
    expect(dir.dy).toBeCloseTo(0, 10);
  });

  it("wraps direction backward", () => {
    const from: Position = { x: 1, y: 0 };
    const to: Position = { x: 199, y: 0 };
    const dir = directionTo(from, to, 200, 200);
    expect(dir.dx).toBeCloseTo(-1, 10);
    expect(dir.dy).toBeCloseTo(0, 10);
  });

  it("returns normalized vector", () => {
    const from: Position = { x: 0, y: 0 };
    const to: Position = { x: 3, y: 4 };
    const dir = directionTo(from, to, 200, 200);
    expect(dir.dx).toBeCloseTo(0.6, 10);
    expect(dir.dy).toBeCloseTo(0.8, 10);
    const mag = Math.hypot(dir.dx, dir.dy);
    expect(mag).toBeCloseTo(1, 10);
  });
});

describe("move", () => {
  it("moves forward", () => {
    const pos: Position = { x: 10, y: 10 };
    move(pos, 5, 3, 200, 200);
    expect(pos.x).toBe(15);
    expect(pos.y).toBe(13);
  });

  it("wraps forward past width", () => {
    const pos: Position = { x: 198, y: 10 };
    move(pos, 5, 0, 200, 200);
    expect(pos.x).toBeCloseTo(3, 10);
    expect(pos.y).toBe(10);
  });

  it("wraps backward past zero", () => {
    const pos: Position = { x: 2, y: 10 };
    move(pos, -5, 0, 200, 200);
    expect(pos.x).toBeCloseTo(197, 10);
    expect(pos.y).toBe(10);
  });

  it("wraps height", () => {
    const pos: Position = { x: 10, y: 198 };
    move(pos, 0, 5, 200, 200);
    expect(pos.x).toBe(10);
    expect(pos.y).toBeCloseTo(3, 10);
  });

  it("wraps both axes", () => {
    const pos: Position = { x: 199, y: 199 };
    move(pos, 1, 1, 200, 200);
    expect(pos.x).toBeCloseTo(0, 10);
    expect(pos.y).toBeCloseTo(0, 10);
  });
});

describe("blendAngle", () => {
  it("blends 0 and 90 to 45", () => {
    expect(blendAngle(0, 90)).toBeCloseTo(45, 10);
  });

  it("wraps 359→1 correctly", () => {
    expect(blendAngle(359, 1)).toBeCloseTo(0, 10);
  });

  it("wraps 350→10 correctly", () => {
    expect(blendAngle(350, 10)).toBeCloseTo(0, 10);
  });

  it("blends 180 and 270 to ~225", () => {
    expect(blendAngle(180, 270)).toBeCloseTo(225, 10);
  });

  it("blends 90 and 270 to 180", () => {
    expect(blendAngle(90, 270)).toBeCloseTo(180, 10);
  });

  it("same angle returns same angle", () => {
    expect(blendAngle(0, 0)).toBeCloseTo(0, 10);
    expect(blendAngle(180, 180)).toBeCloseTo(180, 10);
  });

  it("always returns [0, 360)", () => {
    for (let a = 0; a < 360; a += 30) {
      for (let b = 0; b < 360; b += 30) {
        const result = blendAngle(a, b);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(360);
      }
    }
  });

  it("is symmetric", () => {
    expect(blendAngle(45, 135)).toBeCloseTo(blendAngle(135, 45), 10);
  });
});
