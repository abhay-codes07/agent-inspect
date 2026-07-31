import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { extractMetadata } from "../src/trace-metadata.js";
import { parseDurationFilter, searchTraces } from "../src/search.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces",
);
const fixturesV02Dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces-v0.2",
);

describe("searchTraces", () => {
  it("parses duration filters", () => {
    expect(parseDurationFilter(">5s")).toEqual({ op: ">", ms: 5000 });
  });

  it("finds error runs by status", async () => {
    const metas = [
      await extractMetadata(path.join(fixturesDir, "minimal-error.jsonl")),
    ];
    const results = await searchTraces(metas, {
      traceDir: fixturesDir,
      status: "error",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.runId === "minimal-error")).toBe(true);
  });

  it("finds tool steps by type", async () => {
    const metas = [
      await extractMetadata(path.join(fixturesDir, "tool-with-io.jsonl")),
    ];
    const results = await searchTraces(metas, {
      traceDir: fixturesDir,
      kind: "tool",
    });
    expect(results.some((r) => r.stepType === "tool")).toBe(true);
  });

  it("filters by duration comparator", async () => {
    const metas = [
      await extractMetadata(path.join(fixturesDir, "tool-with-io.jsonl")),
    ];
    const results = await searchTraces(metas, {
      traceDir: fixturesDir,
      duration: ">50ms",
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns deterministic ordering", async () => {
    const metas = await Promise.all(
      ["minimal-success.jsonl", "minimal-error.jsonl"].map((f) =>
        extractMetadata(path.join(fixturesDir, f)),
      ),
    );
    const a = await searchTraces(metas, { traceDir: fixturesDir, limit: 10 });
    const b = await searchTraces(metas, { traceDir: fixturesDir, limit: 10 });
    expect(a).toEqual(b);
  });

  describe("result ordering", () => {
    let dir: string;

    const runJsonl = (runId: string, name: string, start: number): string =>
      [
        `{"schemaVersion":"0.1","event":"run_started","timestamp":${start},"runId":"${runId}","name":"${name}","startTime":${start}}`,
        `{"schemaVersion":"0.1","event":"step_started","timestamp":${start + 10},"runId":"${runId}","stepId":"s1","name":"lookup","type":"tool","startTime":${start + 10}}`,
        `{"schemaVersion":"0.1","event":"step_completed","timestamp":${start + 60},"runId":"${runId}","stepId":"s1","status":"success","endTime":${start + 60},"durationMs":50}`,
        `{"schemaVersion":"0.1","event":"run_completed","timestamp":${start + 100},"runId":"${runId}","status":"success","endTime":${start + 100},"durationMs":100}`,
      ].join("\n");

    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), "ai-search-order-"));
      await writeFile(
        path.join(dir, "run_old.jsonl"),
        runJsonl("run_old", "old-run", 1_000_000_000_000),
      );
      await writeFile(
        path.join(dir, "run_new.jsonl"),
        runJsonl("run_new", "new-run", 2_000_000_000_000),
      );
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    const loadMetas = async () =>
      Promise.all(
        ["run_old.jsonl", "run_new.jsonl"].map((f) =>
          extractMetadata(path.join(dir, f)),
        ),
      );

    it("orders bare and content-filtered searches newest first alike", async () => {
      const metas = await loadMetas();

      const bare = await searchTraces(metas, { traceDir: dir });
      expect(bare.map((r) => r.runId)).toEqual(["run_new", "run_old"]);

      // Any content filter previously flipped ordering to oldest first.
      for (const filter of [
        { status: "success" as const },
        { name: "run" },
        { tool: "lookup" },
        { duration: ">10ms" },
      ]) {
        const results = await searchTraces(metas, { traceDir: dir, ...filter });
        const firstIndex = results.findIndex((r) => r.runId === "run_new");
        const lastIndex = results.map((r) => r.runId).lastIndexOf("run_old");
        expect(firstIndex).toBeGreaterThanOrEqual(0);
        expect(firstIndex).toBeLessThan(lastIndex);
        expect(results[0]!.runId).toBe("run_new");
      }
    });

    it("keeps the most recent matches when a content filter is limited", async () => {
      const metas = await loadMetas();
      const limited = await searchTraces(metas, {
        traceDir: dir,
        status: "success",
        limit: 1,
      });
      expect(limited).toHaveLength(1);
      expect(limited[0]!.runId).toBe("run_new");
    });
  });

  it("matches v0.1 and v0.2 step searches using exact file paths", async () => {
    const v01Meta = await extractMetadata(
      path.join(fixturesDir, "dual-format-parity.jsonl"),
    );
    const v02Meta = await extractMetadata(
      path.join(fixturesV02Dir, "dual-format-parity.jsonl"),
    );
    const options = {
      status: "success" as const,
      kind: "tool",
      tool: "fixture-search",
      duration: ">=500ms",
    };

    const v01 = await searchTraces([v01Meta], {
      traceDir: fixturesDir,
      ...options,
    });
    const v02 = await searchTraces([v02Meta], {
      traceDir: fixturesV02Dir,
      ...options,
    });

    for (const results of [v01, v02]) {
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        runId: "run_dual_format_parity",
        runName: "dual-format-parity",
        runStatus: "success",
        stepName: "fixture-search",
        stepType: "tool",
        durationMs: 500,
      });
    }
  });
});
