import { describe, it, expect, beforeEach } from "vitest";
import { SpatialHash } from "./spatial-hash";

describe("SpatialHash", () => {
  let hash: SpatialHash<string>;

  beforeEach(() => {
    hash = new SpatialHash(10.0, 200, 200);
  });

  describe("cell key computation", () => {
    it("groups positions into cells by cell_size", () => {
      hash.add("a", 0, 0);
      hash.add("b", 5, 5);
      hash.add("c", 10, 10);

      // query(2, 2, 0) → rCells=1, searches cells ±1 → includes cell (1,1)
      expect(hash.query(2, 2, 0)).toContain("a");
      expect(hash.query(2, 2, 0)).toContain("b");
      expect(hash.query(2, 2, 0)).toContain("c");
      // (2,2) is in cell (0,0), (30,30) is in cell (3,3) — beyond rCells=1
      hash.add("d", 30, 30);
      expect(hash.query(2, 2, 0)).not.toContain("d");
    });

    it("handles negative positions via floor division", () => {
      hash.add("neg", -1, -1);
      expect(hash.query(-1, -1, 0)).toContain("neg");
    });
  });

  describe("add", () => {
    it("stores objects in correct cell", () => {
      hash.add("x", 15, 25);
      expect(hash.query(15, 25, 0)).toEqual(["x"]);
    });

    it("stores multiple objects in same cell", () => {
      hash.add("a", 3, 3);
      hash.add("b", 7, 8);
      expect(hash.query(3, 3, 0)).toContain("a");
      expect(hash.query(3, 3, 0)).toContain("b");
    });
  });

  describe("clear", () => {
    it("removes all objects", () => {
      hash.add("a", 5, 5);
      hash.add("b", 50, 50);
      hash.clear();
      expect(hash.query(5, 5, 100)).toEqual([]);
    });
  });

  describe("query", () => {
    it("returns empty array when no objects added", () => {
      expect(hash.query(0, 0, 50)).toEqual([]);
    });

    it("finds objects within radius using cell range", () => {
      hash.add("near", 12, 12);
      hash.add("far", 150, 150);

      const results = hash.query(0, 0, 20);
      expect(results).toContain("near");
      expect(results).not.toContain("far");
    });

    it("searches correct number of cells: floor(radius / cellSize) + 1", () => {
      // Python: r_cells = int(radius // cell_size) + 1
      // radius=10, cellSize=10 → rCells = 2 → searches cells -2 to +2
      hash.add("adjacent", 20, 0);
      hash.add("too_far", 30, 0);

      const results = hash.query(0, 0, 10);
      expect(results).toContain("adjacent");
      expect(results).not.toContain("too_far");
    });

    it("returns all objects from overlapping cells without distance filtering", () => {
      hash.add("close", 1, 1);
      hash.add("far_in_cell", 9, 9);

      const results = hash.query(0, 0, 2);
      expect(results).toContain("close");
      expect(results).toContain("far_in_cell");
    });

    it("does NOT handle toroidal wrapping (matches Python limitation)", () => {
      // Toroidal distance from (0,0) to (195,0) in 200-wide world = 5,
      // but spatial hash doesn't wrap — caller must filter by toroidal distance
      hash.add("edge", 195, 0);
      const results = hash.query(0, 0, 10);
      expect(results).not.toContain("edge");
    });
  });

  describe("parity with Python implementation", () => {
    it("matches Python cell keys: int(x // cell_size), int(y // cell_size)", () => {
      const cases: Array<[number, number]> = [
        [0, 0], [9.9, 9.9], [10, 10], [-1, -1], [25, 37],
      ];

      for (const [x, y] of cases) {
        const h = new SpatialHash(10.0, 200, 200);
        h.add("obj", x, y);
        expect(h.query(x, y, 0)).toContain("obj");
      }


      const h = new SpatialHash(10.0, 200, 200);
      h.add("a", 0, 0);
      h.add("b", 50, 50);
      expect(h.query(0, 0, 0)).not.toContain("b");
    });

    it("matches Python r_cells = int(radius // cell_size) + 1", () => {
      // radius=5  → rCells=1 (searches -1..+1, i.e. 3x3 grid)
      // radius=10 → rCells=2 (searches -2..+2, i.e. 5x5 grid)
      // radius=15 → rCells=2 (floor(15/10)=1, +1=2)
      // radius=20 → rCells=3 (searches -3..+3, i.e. 7x7 grid)
      const radiusCases: Array<[number, number]> = [
        [5, 1], [10, 2], [15, 2], [20, 3],
      ];

      for (const [radius, expectedRC] of radiusCases) {
        // Place object exactly expectedRC cells away (just inside boundary)
        const objX = expectedRC * 10;
        const h = new SpatialHash(10.0, 200, 200);
        h.add("obj", objX, 0);
        expect(h.query(0, 0, radius)).toContain("obj");

        // Place object one cell beyond — should NOT be found
        const beyondX = (expectedRC + 1) * 10;
        const h2 = new SpatialHash(10.0, 200, 200);
        h2.add("obj", beyondX, 0);
        expect(h2.query(0, 0, radius)).not.toContain("obj");
      }
    });
  });

  describe("performance", () => {
    it("queries a hash with 1000 organisms in under 1ms", () => {
      const perfHash = new SpatialHash(10.0, 200, 200);

      for (let i = 0; i < 1000; i++) {
        perfHash.add(`org-${i}`, Math.random() * 200, Math.random() * 200);
      }

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        perfHash.query(Math.random() * 200, Math.random() * 200, 20);
      }
      const elapsed = performance.now() - start;

      expect(elapsed / 10).toBeLessThan(1);
    });
  });
});
