/**
 * Regression: explain's run.slowestNode must name the slowest actual step, not
 * the RUN boundary. The run envelope spans the whole run, so ranking it as a
 * node always shadows real work and disagrees with stats' slowest-step ranking.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildLocalExplanation } from "../src/explain.js";
import { openTrace } from "../src/readers/index.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces",
);

describe("explain run.slowestNode", () => {
  it("reports the slowest step rather than the RUN boundary", async () => {
    // llm-with-tokens has one step (llm:generate-answer, 2044ms) and a
    // run_completed boundary at 2100ms. The boundary must not win.
    const opened = await openTrace({
      type: "file",
      path: path.join(fixturesDir, "llm-with-tokens.jsonl"),
    });
    const explained = buildLocalExplanation(opened.runs[0]!);

    const slowest = explained.facts.find((f) => f.id === "run.slowestNode");
    expect(slowest).toBeDefined();
    const value = slowest!.value as {
      name: string;
      kind: string;
      durationMs: number;
    };
    expect(value.kind).not.toBe("RUN");
    expect(value.name).toBe("llm_001");
    expect(value.durationMs).toBe(2044);
  });

  it("omits run.slowestNode when a run has only boundary nodes", async () => {
    // A run with no step-level nodes has nothing to rank; falling back to the
    // run envelope would be the same bug in a different shape.
    const content = [
      JSON.stringify({
        schemaVersion: "0.1",
        event: "run_started",
        runId: "boundary-only",
        name: "boundary-only",
        timestamp: 1_700_000_000_000,
        startTime: 1_700_000_000_000,
      }),
      JSON.stringify({
        schemaVersion: "0.1",
        event: "run_completed",
        runId: "boundary-only",
        status: "success",
        durationMs: 1234,
        timestamp: 1_700_000_001_234,
        endTime: 1_700_000_001_234,
      }),
    ].join("\n");
    const opened = await openTrace(
      { type: "string", content },
      { format: "agent-inspect-jsonl" },
    );
    const explained = buildLocalExplanation(opened.runs[0]!);
    expect(explained.facts.find((f) => f.id === "run.slowestNode")).toBeUndefined();
  });
});
