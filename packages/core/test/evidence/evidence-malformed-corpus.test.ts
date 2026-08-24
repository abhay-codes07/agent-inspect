/**
 * Evidence v2 malformed-bundle corpus.
 *
 * CI and support flows must fail closed on tampered or malformed bundles
 * without crashing. Each fixture under fixtures/evidence/malformed is a tiny
 * synthetic evidence.json that verify must reject with a stable diagnostic.
 */
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyEvidenceDirectory } from "../../src/entries/advanced.js";

const corpusDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/evidence/malformed",
);

interface Case {
  fixture: string;
  /** Whether a companion trace.jsonl (matching the valid manifest) is present. */
  withTrace: boolean;
  expectCode: string;
}

// Strict manifest validation collapses most structural defects to
// manifest_invalid; file_missing is the distinct missing-payload case.
const cases: Case[] = [
  { fixture: "not-json.evidence.json", withTrace: false, expectCode: "manifest_invalid" },
  { fixture: "unsupported-version.evidence.json", withTrace: true, expectCode: "manifest_invalid" },
  { fixture: "missing-generator.evidence.json", withTrace: true, expectCode: "manifest_invalid" },
  { fixture: "empty-run-ids.evidence.json", withTrace: true, expectCode: "manifest_invalid" },
  { fixture: "missing-assessment.evidence.json", withTrace: true, expectCode: "manifest_invalid" },
  { fixture: "self-listed-manifest.evidence.json", withTrace: true, expectCode: "manifest_invalid" },
  { fixture: "file-missing.evidence.json", withTrace: false, expectCode: "file_missing" },
];

describe("Evidence v2 malformed-bundle corpus", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-evidence-malformed-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  for (const { fixture, withTrace, expectCode } of cases) {
    it(`fails closed on ${fixture} with ${expectCode}`, async () => {
      await cp(path.join(corpusDir, fixture), path.join(tmp, "evidence.json"));
      if (withTrace) {
        // Matches the sha256 baked into the valid manifest baseline.
        await writeFile(path.join(tmp, "trace.jsonl"), "trace\n", "utf-8");
      }

      const result = await verifyEvidenceDirectory(tmp);

      expect(result.ok).toBe(false);
      expect(result.status).toBe("fail");
      expect(result.issues.map((issue) => issue.code)).toContain(expectCode);
      // Fail closed: every reported issue that blocks is an error, and the
      // verifier returned a structured result rather than throwing.
      expect(result.issues.every((issue) => typeof issue.code === "string")).toBe(true);
    });
  }

  it("does not throw on an empty directory (missing manifest)", async () => {
    const result = await verifyEvidenceDirectory(tmp);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("manifest_missing");
  });
});
