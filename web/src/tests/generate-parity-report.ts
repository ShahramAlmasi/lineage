import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareRecordings, readJsonlRecording, runTypeScriptRecording, saveTypeScriptRecording } from "./parity-utils";

const seeds = [0, 1, 42, 99, 12345];
const presets = ["primordial_soup", "pangea", "pressure_cooker"];
const tickCounts = [100, 1000];
const repoRoot = join(process.cwd(), "..");
const evidenceDir = join(repoRoot, ".sisyphus", "evidence");
const parityDir = join(evidenceDir, "parity");

async function main(): Promise<void> {
  await mkdir(parityDir, { recursive: true });
  const lines: string[] = ["Task 34 Seed Parity Verification", "", "Summary:"];
  let pass = 0;
  let fail = 0;

  for (const preset of presets) {
    for (const seed of seeds) {
      for (const ticks of tickCounts) {
        const label = `${preset} seed=${seed} ticks=${ticks}`;
        const pyPath = join(parityDir, `py-${preset}-${seed}-${ticks}.jsonl`);
        const tsPath = join(parityDir, `ts-${preset}-${seed}-${ticks}.jsonl`);
        const pyFrames = await readJsonlRecording(pyPath);
        const tsFrames = await runTypeScriptRecording(ticks, seed, preset);
        await saveTypeScriptRecording(tsFrames, tsPath);
        const result = compareRecordings(pyFrames, tsFrames);

        if (result.match) pass++;
        else fail++;

        lines.push(`- ${result.match ? "PASS" : "FAIL"}: ${label}; frames ${result.matchedFrames}/${result.totalFrames}; differences ${result.differences.length}`);
        for (const difference of result.differences.slice(0, 25)) {
          lines.push(`  - tick ${difference.tick} ${difference.field}: python=${JSON.stringify(difference.pythonValue)} ts=${JSON.stringify(difference.tsValue)} tolerance=${difference.tolerance ?? "exact"}`);
        }
        if (result.differences.length > 25) lines.push(`  - ... ${result.differences.length - 25} additional differences omitted`);
      }
    }
  }

  lines.push("", `Totals: ${pass} passed, ${fail} failed`, `Recommendation: ${fail === 0 ? "APPROVE" : "REJECT"}`);
  await writeFile(join(evidenceDir, "task-34-parity.txt"), `${lines.join("\n")}\n`, "utf-8");
  await appendFile(join(repoRoot, ".sisyphus", "notepads", "lineage-3d-web", "learnings.md"), `\n## Task 34 Seed Parity Verification - ${new Date().toISOString()}\n- Generated Python and TypeScript JSONL recordings for 30 seed/preset/tick combinations under .sisyphus/evidence/parity/.\n- Comparison report saved to .sisyphus/evidence/task-34-parity.txt with recommendation ${fail === 0 ? "APPROVE" : "REJECT"}.\n`, "utf-8");
}

await main();
