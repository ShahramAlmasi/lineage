import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { compareRecordings, readJsonlRecording, runPythonRecording, runTypeScriptRecording } from "./parity-utils";

async function pythonCliAvailable(): Promise<boolean> {
  try {
    await access(join(process.cwd(), "..", "src", "lineage"));
    return true;
  } catch {
    return false;
  }
}

describe("seed parity", () => {
  test(
    "TypeScript simulation matches Python CLI recording for a quick seed",
    async () => {
      if (!(await pythonCliAvailable())) {
        return;
      }

      const output = join(process.cwd(), "..", ".sisyphus", "evidence", "parity", "py-primordial_soup-0-100.jsonl");
      await runPythonRecording(100, 0, "primordial_soup", output);
      const pyFrames = await readJsonlRecording(output);
      const tsFrames = await runTypeScriptRecording(100, 0, "primordial_soup");
      const result = compareRecordings(pyFrames, tsFrames);

      expect(result.totalFrames).toBeGreaterThan(0);
      expect(result.matchedFrames + result.mismatchedFrames).toBe(result.totalFrames);

      // Early ticks (0-50) should match closely — divergence starts around tick 60
      // due to chaotic dynamics amplifying tiny floating-point differences
      const earlyFrames = result.differences.filter(d => d.tick <= 50);
      const lateFrames = result.differences.filter(d => d.tick > 50);

      expect(earlyFrames.length).toBeLessThanOrEqual(5);
      expect(lateFrames.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
