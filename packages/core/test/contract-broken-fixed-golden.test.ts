/**
 * Golden broken -> fail -> fixed -> pass path for TraceContract.
 *
 * First-use proof and CI teaching both need one deterministic path that shows a
 * contract catching a real trajectory failure and then passing once the run is
 * fixed. The broken run errors out without calling the required tool; the fixed
 * run calls it and completes. Failure reasons are pinned so the diagnostics stay
 * actionable.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  defineTraceContract,
  evaluateTraceContract,
  type TraceContractInput,
} from "../src/checks/index.js";
import { openTrace } from "../src/readers/index.js";

const tracesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces",
);

// A refund agent must call refund_order and finish cleanly.
const refundContract: TraceContractInput = {
  tools: { requiredTools: ["refund_order"] },
  run: { allowedStatuses: ["ok"] },
};

async function evaluate(fixture: string) {
  const read = await openTrace({
    type: "string",
    content: readFileSync(path.join(tracesDir, fixture), "utf8"),
  });
  const result = evaluateTraceContract({ read }, defineTraceContract(refundContract));
  return {
    status: result.status,
    failedRules: result.findings.filter((f) => f.status === "fail").map((f) => f.ruleId),
  };
}

describe("TraceContract broken -> fixed golden path", () => {
  it("fails the broken run with actionable, stable reasons", async () => {
    const broken = await evaluate("contract-broken.jsonl");
    expect(broken.status).toBe("fail");
    // The run errored AND the required tool was never called.
    expect([...broken.failedRules].sort()).toEqual(["run.status", "tool.usage"]);
  });

  it("passes the fixed run", async () => {
    const fixed = await evaluate("contract-fixed.jsonl");
    expect(fixed.status).toBe("pass");
    expect(fixed.failedRules).toEqual([]);
  });
});
