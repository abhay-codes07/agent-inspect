/**
 * OTLP preservation and known-loss boundaries.
 *
 * The OTLP reader preserves instrumentation scope while reporting the span
 * shapes it cannot map (events, links, vendor extensions) as unsupportedFields
 * rather than dropping them silently. This pins both sides of that boundary so
 * a reader change cannot quietly lose data or overclaim lossless import.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { openTrace } from "../src/readers/index.js";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/standards/otlp-preservation-corpus.json",
);

describe("OTLP preservation corpus", () => {
  it("preserves instrumentation scope and known-loses events, links, and extensions", async () => {
    const read = await openTrace({
      type: "string",
      content: readFileSync(fixturePath, "utf8"),
    });

    expect(read.format).toBe("otlp-json");

    // Scope is preserved onto event attributes.
    const scoped = read.events.find(
      (event) => event.attributes?.["scope.name"] !== undefined,
    );
    expect(scoped).toBeDefined();
    expect(scoped!.attributes?.["scope.name"]).toBe("agent-inspect-preservation-scope");
    expect(scoped!.attributes?.["scope.version"]).toBe("3.1-fixture");

    // Known-loss boundaries are reported, not silently dropped.
    const unsupported = read.unsupportedFields;
    expect(unsupported.some((field) => field.endsWith(".links"))).toBe(true);
    expect(unsupported.some((field) => field.endsWith(".vendorExtensionField"))).toBe(true);
    expect(unsupported.some((field) => field.includes(".events["))).toBe(true);
  });
});
