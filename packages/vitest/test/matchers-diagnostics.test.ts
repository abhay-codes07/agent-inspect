/**
 * Golden failure diagnostics for the Vitest TraceContract / TraceFacts matchers.
 *
 * Contributors rely on these messages in CI, so their wording and shape must
 * not drift silently. Pins the passing outcome plus the mismatch and
 * insufficient-input (missing { read }) failure messages.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { openTrace } from "agent-inspect/readers";
import type { TraceReadResult } from "agent-inspect/readers";

import { agentInspectVitestMatchers } from "../src/matchers.js";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces/tool-with-io.jsonl",
);

async function openFixture(): Promise<TraceReadResult> {
  return openTrace({ type: "string", content: readFileSync(fixturePath, "utf8") });
}

describe("Vitest matcher golden diagnostics", () => {
  it("passes toHaveRequiredTool for a present tool", async () => {
    const read = await openFixture();
    const result = agentInspectVitestMatchers.toHaveRequiredTool(read.events, "fixture-search");
    expect(result.pass).toBe(true);
  });

  it("reports the missing tool and the observed tools on failure", async () => {
    const read = await openFixture();
    const result = agentInspectVitestMatchers.toHaveRequiredTool(read.events, "charge_card");
    expect(result.pass).toBe(false);
    expect(result.message()).toBe(
      'expected required tool charge_card; found=["fixture-search"]',
    );
  });

  it("passes toPassTraceContract when the required tool is present", async () => {
    const read = await openFixture();
    const result = agentInspectVitestMatchers.toPassTraceContract(
      { read },
      { tools: { requiredTools: ["fixture-search"] } },
    );
    expect(result.pass).toBe(true);
  });

  it("names the failing rule ids when a contract fails", async () => {
    const read = await openFixture();
    const result = agentInspectVitestMatchers.toPassTraceContract(
      { read },
      { tools: { requiredTools: ["charge_card"] } },
    );
    expect(result.pass).toBe(false);
    expect(result.message()).toBe(
      'expected trace contract to pass; findings=["tool.usage"]',
    );
  });

  it("explains the required { read } input when given bare events", async () => {
    const read = await openFixture();
    const result = agentInspectVitestMatchers.toPassTraceContract(
      read.events as never,
      { tools: { requiredTools: ["fixture-search"] } },
    );
    expect(result.pass).toBe(false);
    expect(result.message()).toBe(
      "toPassTraceContract expects TraceCheckInput ({ read }) so evaluateTraceContract can run.",
    );
  });
});
