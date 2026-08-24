/**
 * Read-only MCP boundary and path-containment regressions.
 *
 * MCP exposure is high-risk, so these pin two guarantees:
 *  - the tool surface is read-only (no source-mutating / destructive tools)
 *  - run selection is confined to the configured trace directory. Runs are
 *    matched by listing that directory and comparing metadata run ids, never by
 *    joining a caller-supplied id into a path, so traversal ids and ids that
 *    only exist outside the root resolve to "Run not found".
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectRun } from "agent-inspect";

import {
  READ_ONLY_TOOLS,
  callReadOnlyTool,
  createMcpServerContext,
} from "../src/tools.js";

describe("read-only MCP boundary and path containment", () => {
  let traceDir: string;
  let outsideDir: string;
  let outsideRunId: string;

  beforeEach(async () => {
    traceDir = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-mcp-inside-"));
    outsideDir = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-mcp-outside-"));
    await inspectRun("inside-run", async () => {}, { traceDir });
    await inspectRun("outside-secret-run", async () => {}, { traceDir: outsideDir });

    // Discover the real run id written outside the configured root.
    const outsideCtx = createMcpServerContext({ traceDir: outsideDir });
    const listed = await callReadOnlyTool(outsideCtx, "list_traces", {});
    const payload = JSON.parse(listed.content[0]!.text as string) as Array<{ runId: string }>;
    outsideRunId = payload[0]!.runId;
  });

  afterEach(async () => {
    await rm(traceDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it("exposes no source-mutating or destructive tools", () => {
    const names = READ_ONLY_TOOLS.map((tool) => tool.name);
    expect(names.length).toBeGreaterThan(0);
    const forbidden = /(delete|remove|overwrite|mutate|edit|rename|move|write_trace|drop)/i;
    for (const name of names) {
      expect(name, name).not.toMatch(forbidden);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not resolve a run that exists only outside the configured root", async () => {
    const context = createMcpServerContext({ traceDir });
    // Sanity: the run really is resolvable from a context rooted at outsideDir.
    const outsideCtx = createMcpServerContext({ traceDir: outsideDir });
    await expect(
      callReadOnlyTool(outsideCtx, "get_first_causal_failure", { runId: outsideRunId }),
    ).resolves.toBeDefined();
    // From the inside root it must not resolve.
    await expect(
      callReadOnlyTool(context, "get_first_causal_failure", { runId: outsideRunId }),
    ).rejects.toThrow(/Run not found/);
  });

  it("rejects path-traversal run ids without escaping the root", async () => {
    const context = createMcpServerContext({ traceDir });
    const traversalIds = [
      "../outside-secret-run",
      "../../etc/passwd",
      "/etc/passwd",
      "..\\..\\secret",
      `${outsideDir}${path.sep}outside-secret-run`,
    ];
    for (const runId of traversalIds) {
      await expect(
        callReadOnlyTool(context, "get_first_causal_failure", { runId }),
        runId,
      ).rejects.toThrow(/Run not found/);
    }
  });

  it("reports only basenames, never the absolute trace directory", async () => {
    const context = createMcpServerContext({ traceDir });
    const listed = await callReadOnlyTool(context, "list_traces", {});
    const text = listed.content[0]!.text as string;
    expect(text).not.toContain(traceDir);
    expect(text).not.toContain(outsideDir);
  });
});
