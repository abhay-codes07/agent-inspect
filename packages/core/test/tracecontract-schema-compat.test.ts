/**
 * TraceContract compatibility across persisted schema 0.1, 0.2, and 1.0.
 *
 * 1.x readers must keep evaluating older traces, and the LLM model constraint
 * must resolve the model regardless of where each schema stores it. In 0.1 the
 * model lives under attributes.metadata (the #200 nested-metadata regression,
 * fixed by #201); in 0.2 / 1.0 it is a top-level attribute. These tests pin a
 * deterministic pass/fail for each schema so a reader change cannot silently
 * break contract evaluation on legacy traces.
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function evaluate(relPath: string, contract: TraceContractInput): Promise<string> {
  const read = await openTrace({
    type: "string",
    content: readFileSync(path.join(repoRoot, relPath), "utf8"),
  });
  return evaluateTraceContract({ read }, defineTraceContract(contract)).status;
}

// The model name is "fixture-model" in every schema fixture; only its location
// differs. requireCompleted:false isolates the LLM rule from run-completion,
// which the streaming 0.2 fixture intentionally leaves running.
const isolateRun = { requireCompleted: false } as const;

const schemaFixtures = [
  { schema: "0.1", file: "fixtures/traces/llm-with-tokens.jsonl" },
  { schema: "0.2", file: "fixtures/traces-v0.2/llm-tokens-and-streaming.jsonl" },
  { schema: "1.0", file: "fixtures/traces-v1.0/manual-basic.jsonl" },
] as const;

describe("TraceContract schema compatibility", () => {
  for (const { schema, file } of schemaFixtures) {
    it(`resolves the LLM model allowlist on schema ${schema}`, async () => {
      expect(
        await evaluate(file, { run: isolateRun, llm: { allowedModels: ["fixture-model"] } }),
      ).toBe("pass");
      expect(
        await evaluate(file, { run: isolateRun, llm: { allowedModels: ["other-model"] } }),
      ).toBe("fail");
    });
  }

  it("resolves the 0.1 model from nested attributes.metadata (#200 / #201)", async () => {
    // Guards the regression where 0.1 LLM steps store the model under
    // attributes.metadata rather than at the top level.
    expect(
      await evaluate("fixtures/traces/llm-with-tokens.jsonl", {
        run: isolateRun,
        llm: { allowedModels: ["fixture-model"] },
      }),
    ).toBe("pass");
  });

  it("evaluates tool requirements on schema 1.0", async () => {
    expect(
      await evaluate("fixtures/traces-v1.0/manual-basic.jsonl", {
        run: isolateRun,
        tools: { requiredTools: ["search"] },
      }),
    ).toBe("pass");
    expect(
      await evaluate("fixtures/traces-v1.0/manual-basic.jsonl", {
        run: isolateRun,
        tools: { requiredTools: ["missing-tool"] },
      }),
    ).toBe("fail");
  });

  it("evaluates run completion on a completed 0.1 trace", async () => {
    expect(
      await evaluate("fixtures/traces/llm-with-tokens.jsonl", {
        run: { allowedStatuses: ["ok"] },
      }),
    ).toBe("pass");
  });
});
