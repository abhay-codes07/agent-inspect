/**
 * Large trace-directory warning and bounded-scan evidence.
 *
 * Extends the threshold-message coverage with the directory assessment itself:
 * the warning thresholds have a clean boundary, the scanner reports counts over
 * a real directory, its large-file sampling is bounded (it does not stat every
 * file in a big directory), and emission respects --json.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { TraceDirectory } from "@agent-inspect/core/advanced";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TRACE_COUNT_SEVERE,
  TRACE_COUNT_WARN,
  assessTraceDirectoryScale,
  buildScaleWarnings,
  emitScaleWarnings,
} from "../src/trace-dir-scale.js";

const runLine = (id: string) =>
  `${JSON.stringify({
    schemaVersion: "0.1",
    event: "run_started",
    timestamp: 1_700_000_000_000,
    runId: id,
    name: id,
    startTime: 1_700_000_000_000,
  })}\n`;

describe("trace directory scale assessment", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-scale-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmp, { recursive: true, force: true });
  });

  it("stays quiet just below the count threshold", () => {
    expect(buildScaleWarnings(TRACE_COUNT_WARN - 1, 0)).toEqual([]);
  });

  it("escalates to the archive message without the milder one at severe scale", () => {
    const warnings = buildScaleWarnings(TRACE_COUNT_SEVERE, 0);
    expect(warnings.some((w) => w.includes("archive"))).toBe(true);
    expect(warnings.some((w) => w.includes("list/search/stats"))).toBe(false);
  });

  it("reports counts over a real directory of small traces", async () => {
    for (let i = 0; i < 3; i++) {
      await writeFile(path.join(tmp, `run-${i}.jsonl`), runLine(`run-${i}`), "utf-8");
    }
    const assessment = await assessTraceDirectoryScale(new TraceDirectory({ dir: tmp }));
    expect(assessment.traceCount).toBe(3);
    expect(assessment.largeFileCount).toBe(0);
    expect(assessment.warnings).toEqual([]);
  });

  it("bounds large-file sampling instead of statting every file", async () => {
    const fileCount = 30;
    for (let i = 0; i < fileCount; i++) {
      await writeFile(
        path.join(tmp, `run-${String(i).padStart(3, "0")}.jsonl`),
        runLine(`run-${i}`),
        "utf-8",
      );
    }
    const td = new TraceDirectory({ dir: tmp });
    const statSpy = vi.spyOn(td, "getFileStats");

    const assessment = await assessTraceDirectoryScale(td, { sampleLargeFiles: 5 });

    expect(assessment.traceCount).toBe(fileCount);
    // Only the sampled subset is statted, not all 30 files.
    expect(statSpy.mock.calls.length).toBeLessThanOrEqual(5);
    expect(statSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("emits warnings to stderr only when not in JSON mode", () => {
    const assessment = { traceCount: TRACE_COUNT_WARN, largeFileCount: 0, warnings: buildScaleWarnings(TRACE_COUNT_WARN, 0) };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    emitScaleWarnings(assessment, { json: true });
    expect(errSpy).not.toHaveBeenCalled();

    emitScaleWarnings(assessment, { json: false });
    expect(errSpy).toHaveBeenCalledTimes(assessment.warnings.length);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("[AgentInspect] warning:");
  });
});
