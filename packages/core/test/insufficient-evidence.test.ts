/**
 * Insufficient-evidence coverage for suite and cohort gates.
 *
 * CI usability depends on distinguishing "not enough evidence to judge" from a
 * hard contract failure. These tests pin that suite reports a missing trace as
 * a skipped case with an actionable diagnostic (separate from a contract fail),
 * and that cohort refuses to compare under-sampled groups with a clear warning
 * rather than inventing a pass or a regression.
 */
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  analyzeCohort,
  loadSessionRunRecords,
  loadTraceMetadataList,
  TraceDirectory,
} from "../src/entries/advanced.js";
import { runSuite } from "../src/suite/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("suite insufficient-evidence handling", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-suite-insufficient-"));
    const traces = path.join(tmp, "traces");
    await mkdir(traces, { recursive: true });
    await cp(
      path.join(repoRoot, "fixtures/traces/minimal-success.jsonl"),
      path.join(traces, "minimal-success.jsonl"),
    );
    await writeFile(
      path.join(tmp, "agent-inspect.suite.json"),
      JSON.stringify({
        name: "insufficient-suite",
        traces: "./traces",
        cases: [
          { id: "missing-evidence", runId: "run-that-does-not-exist" },
          { id: "contract-fail", runId: "minimal-success", requireTools: ["charge_card"] },
        ],
      }),
      "utf-8",
    );
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("skips a missing trace and fails a broken contract distinctly", async () => {
    const result = await runSuite({
      configPath: path.join(tmp, "agent-inspect.suite.json"),
    });

    const missing = result.cases.find((c) => c.id === "missing-evidence");
    const failed = result.cases.find((c) => c.id === "contract-fail");

    // Missing evidence is not a hard failure: it is skipped with a warning.
    expect(missing?.status).toBe("skipped");
    expect(missing?.diagnostics.map((d) => d.code)).toContain("AI_SUITE_CASE_TRACE_MISSING");
    expect(missing?.diagnostics.every((d) => d.severity !== "error")).toBe(true);

    // A recorded trace that violates the contract is a hard failure.
    expect(failed?.status).toBe("fail");

    // The two states are counted separately, and the suite does not pass.
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.ok).toBe(false);
  });
});

describe("cohort insufficient-evidence handling", () => {
  async function loadRuns(fixtureDir: string) {
    const td = new TraceDirectory({ dir: fixtureDir });
    const files = await td.list();
    const metas = await loadTraceMetadataList(fixtureDir, files, (fileName) =>
      td.getPath(fileName),
    );
    return loadSessionRunRecords(metas);
  }

  it("refuses to compare under-sampled groups and warns clearly", async () => {
    const fixtureDir = path.join(repoRoot, "fixtures/cohorts/before-after");
    const runs = await loadRuns(fixtureDir);

    const result = await analyzeCohort(runs, {
      traceDir: fixtureDir,
      baseline: "before",
      candidate: "after",
      cohortKey: "cohort",
      groupBy: "model",
      metrics: ["errorRate", "duration"],
      // Each cohort group has at most two runs; require more than exists.
      tolerance: { minSampleSize: 5 },
    });

    expect(result.comparisons).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("Insufficient sample"))).toBe(true);
    // No comparison ran, so nothing is reported as a regression.
    expect(result.comparisons.some((item) => item.regression)).toBe(false);
  });
});
