/**
 * Evidence v2 reproducibility.
 *
 * CI gates and support reproduction need deterministic artifacts: the same
 * inputs must produce the same manifest and the same file digests. The only
 * wall-clock field is `createdAt`, which callers can pin; everything else is a
 * pure function of the inputs and is sorted, so input ordering does not matter.
 */
import { describe, expect, it } from "vitest";

import {
  buildEvidenceManifest,
  sha256Hex,
  type EvidencePackagedFile,
  type EvidenceSourceHash,
} from "../../src/entries/advanced.js";

const FIXED_CREATED_AT = "2026-06-26T00:00:00.000Z";

function sourceHash(runId: string, content: string): EvidenceSourceHash {
  return { runId, algorithm: "sha256", hash: sha256Hex(content) };
}

const files: EvidencePackagedFile[] = [
  { path: "trace.jsonl", content: '{"runId":"run-a"}\n' },
  { path: "views/summary.html", content: "<h1>summary</h1>" },
  { path: "report.md", content: "# report\n" },
];

function manifestParts(createdAt = FIXED_CREATED_AT) {
  return {
    generatorVersion: "6.17.2",
    runIds: ["run-a"],
    traceSchemaVersions: ["0.2"],
    sourceHashes: [sourceHash("run-a", '{"runId":"run-a"}\n')],
    redactionProfile: "share" as const,
    assessmentStatus: "SAFE" as const,
    files,
    createdAt,
  };
}

describe("Evidence v2 reproducibility", () => {
  it("builds byte-identical manifests from identical inputs", () => {
    const first = buildEvidenceManifest(manifestParts());
    const second = buildEvidenceManifest(manifestParts());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("is independent of input ordering", () => {
    const ordered = buildEvidenceManifest(manifestParts());
    const shuffled = buildEvidenceManifest({
      ...manifestParts(),
      files: [...files].reverse(),
      traceSchemaVersions: ["0.2"],
    });
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(ordered));
  });

  it("isolates createdAt as the only non-deterministic field", () => {
    const a = buildEvidenceManifest(manifestParts("2026-01-01T00:00:00.000Z"));
    const b = buildEvidenceManifest(manifestParts("2026-12-31T00:00:00.000Z"));
    expect(a.createdAt).not.toBe(b.createdAt);
    const { createdAt: _a, ...restA } = a;
    const { createdAt: _b, ...restB } = b;
    expect(JSON.stringify(restB)).toBe(JSON.stringify(restA));
  });

  it("derives file digests deterministically from content", () => {
    const manifest = buildEvidenceManifest(manifestParts());
    for (const entry of manifest.files) {
      const source = files.find((f) => f.path === entry.path);
      expect(source).toBeDefined();
      expect(entry.sha256).toBe(sha256Hex(source!.content));
    }
    // Files are sorted by path for a stable manifest order.
    const paths = manifest.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((x, y) => x.localeCompare(y)));
  });
});
