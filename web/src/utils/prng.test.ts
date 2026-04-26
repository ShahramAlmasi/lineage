import { describe, it, expect } from "vitest";
import { PRNG } from "./prng";

describe("PRNG", () => {
  describe("random()", () => {
    it("matches Python seed=0", () => {
      const rng = new PRNG(0);
      const expected = [
        0.8444218515250481, 0.7579544029403025, 0.420571580830845,
        0.25891675029296335, 0.5112747213686085,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.random()).toBeCloseTo(expected[i]!, 15);
      }
    });

    it("matches Python seed=1", () => {
      const rng = new PRNG(1);
      const expected = [
        0.13436424411240122, 0.8474337369372327, 0.763774618976614,
        0.2550690257394217, 0.49543508709194095,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.random()).toBeCloseTo(expected[i]!, 15);
      }
    });

    it("matches Python seed=42 (10 values)", () => {
      const rng = new PRNG(42);
      const expected = [
        0.6394267984578837, 0.025010755222666936, 0.27502931836911926,
        0.22321073814882275, 0.7364712141640124, 0.6766994874229113,
        0.8921795677048454, 0.08693883262941615, 0.4219218196852704,
        0.029797219438070344,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.random()).toBeCloseTo(expected[i]!, 15);
      }
    });

    it("matches Python seed=12345", () => {
      const rng = new PRNG(12345);
      const expected = [
        0.41661987254534116, 0.010169169457068361, 0.8252065092537432,
        0.2986398551995928, 0.3684116894884757,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.random()).toBeCloseTo(expected[i]!, 15);
      }
    });

    it("returns values in [0, 1)", () => {
      const rng = new PRNG(999);
      for (let i = 0; i < 1000; i++) {
        const v = rng.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe("uniform()", () => {
    it("matches Python seed=42 uniform(0.5, 2.0)", () => {
      const rng = new PRNG(42);
      const expected = [
        1.4591401976868257, 0.5375161328340003, 0.9125439775536789,
        0.8348161072232341, 1.6047068212460185,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.uniform(0.5, 2.0)).toBeCloseTo(expected[i]!, 15);
      }
    });

    it("matches Python seed=42 uniform(30.0, 70.0)", () => {
      const rng = new PRNG(42);
      const expected = [
        55.57707193831535, 31.00043020890668, 41.00117273476477,
        38.92842952595291, 59.4588485665605,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.uniform(30.0, 70.0)).toBeCloseTo(expected[i]!, 14);
      }
    });
  });

  describe("gauss()", () => {
    it("matches Python seed=42 gauss(0, 1)", () => {
      const rng = new PRNG(42);
      const expected = [
        -0.14409032957792836, -0.1729036003315193, -0.11131586156766246,
        0.7019837250988631, -0.12758828378288709,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.gauss(0, 1)).toBeCloseTo(expected[i]!, 12);
      }
    });

    it("matches Python seed=42 gauss(0.5, 0.15)", () => {
      const rng = new PRNG(42);
      const expected = [
        0.47838645056331075, 0.47406445995027213, 0.48330262076485064,
        0.6052975587648295, 0.4808617574325669,
      ];
      for (let i = 0; i < expected.length; i++) {
        expect(rng.gauss(0.5, 0.15)).toBeCloseTo(expected[i]!, 12);
      }
    });
  });

  describe("choice()", () => {
    it("matches Python seed=42 choice(['a','b','c','d','e'])", () => {
      const rng = new PRNG(42);
      const seq = ["a", "b", "c", "d", "e"];
      const expected = ["a", "a", "c", "b", "b"];
      for (const exp of expected) {
        expect(rng.choice(seq)).toBe(exp);
      }
    });
  });

  describe("shuffle()", () => {
    it("matches Python seed=42 shuffle([1,2,3,4,5])", () => {
      const rng = new PRNG(42);
      const arr = [1, 2, 3, 4, 5];
      rng.shuffle(arr);
      expect(arr).toEqual([4, 2, 3, 5, 1]);
    });

    it("shuffles in place", () => {
      const rng = new PRNG(100);
      const arr = [1, 2, 3, 4, 5];
      rng.shuffle(arr);
      expect(arr).toHaveLength(5);
      expect(new Set(arr).size).toBe(5);
    });
  });

  describe("randint()", () => {
    it("matches Python seed=42 randint(0, 10)", () => {
      const rng = new PRNG(42);
      const expected = [10, 1, 0, 4, 3];
      for (const exp of expected) {
        expect(rng.randint(0, 10)).toBe(exp);
      }
    });
  });

  describe("determinism", () => {
    it("produces identical sequences from same seed", () => {
      const a = new PRNG(42);
      const b = new PRNG(42);
      for (let i = 0; i < 100; i++) {
        expect(a.random()).toBe(b.random());
      }
    });

    it("different seeds produce different sequences", () => {
      const a = new PRNG(1);
      const b = new PRNG(2);
      expect(a.random()).not.toBe(b.random());
    });
  });

  describe("MT state consumption", () => {
    it("gauss() consumes random() state identically to Python", () => {
      const rng1 = new PRNG(42);
      rng1.gauss(0, 1);

      const rng2 = new PRNG(42);
      rng2.random();
      rng2.random();

      expect(rng1.random()).toBeCloseTo(rng2.random(), 15);
    });
  });
});
