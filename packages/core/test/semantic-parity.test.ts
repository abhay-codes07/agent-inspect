import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildTraceFacts,
  createStructureIncompleteRule,
  createStructureOrphanRule,
  createToolUsageRule,
  defineTraceContract,
  evaluateTraceContract,
  runTraceChecks,
  summarizeSemanticParity,
} from "../src/checks/index.js";
import { openTrace } from "../src/readers/index.js";

// Resolve the fixture relative to this module, not process.cwd(). Running the
// package suite (`pnpm --filter @agent-inspect/core test`) sets cwd to
// packages/core, where a cwd-relative path misses the repo-root fixtures.
const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/langgraph/pilot-shaped-bridged-tool.jsonl",
);

describe("semantic parity (6.12.3)", () => {
  it("agrees across summary, TraceFacts, checks, and TraceContract aliases", async () => {
    const content = readFileSync(fixturePath, "utf8");
    const read = await openTrace({ type: "string", content });
    const summary = summarizeSemanticParity(read.events);
    const facts = buildTraceFacts(read.events);

    expect(summary.runningLogicalCount).toBe(0);
    expect(summary.finishedToolNames).toContain("lookup_orders");
    expect(facts.toolsByName.has("lookup_orders")).toBe(true);
    expect(facts.summary.finishedToolCount).toBe(summary.finishedToolCount);

    const checks = runTraceChecks(
      { read },
      {
        rules: [
          createStructureIncompleteRule(),
          createStructureOrphanRule(),
          createToolUsageRule({ required: ["lookup_orders"] }),
        ],
      },
    );
    expect(checks.status).toBe("pass");

    const contract = evaluateTraceContract(
      { read },
      defineTraceContract({
        tools: { requiredTools: ["lookup_orders"] },
        run: { requireCompleted: true, allowedStatuses: ["ok"] },
      }),
    );
    expect(contract.status).toBe("pass");
  });
});
