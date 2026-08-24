/**
 * Official-adapter fidelity and capture-policy parity.
 *
 * The official adapters (ai-sdk, openai-agents, langchain) must not silently
 * diverge on the shared capture policy: bounded metadata / preview strings,
 * bounded event size, and no raw value under a credential-sensitive key. Each
 * adapter must also keep the same minimum structural fidelity (one run with at
 * least one LLM step). These invariants are asserted identically for every
 * adapter fixture so a regression in one adapter surfaces here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_EVENT_BYTES,
  DEFAULT_MAX_METADATA_VALUE_LENGTH,
  DEFAULT_MAX_PREVIEW_LENGTH,
} from "../src/trace-event-safety.js";
import { isCredentialSensitiveKey } from "../src/safety/sensitive-key.js";
import { openTrace } from "../src/readers/index.js";
import type { PersistedInspectEvent } from "../src/types/persisted-inspect-event.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const officialAdapterFixtures = [
  { adapter: "ai-sdk", file: "fixtures/traces-v1.0/adapter-ai-sdk-like.jsonl" },
  { adapter: "openai-agents", file: "fixtures/traces-v1.0/adapter-openai-agents-like.jsonl" },
  { adapter: "langchain", file: "fixtures/traces-v0.2/adapter-langchain-like.jsonl" },
] as const;

const REDACTED = "[REDACTED]";

function walkStrings(
  value: unknown,
  key: string,
  visit: (key: string, value: string) => void,
): void {
  if (typeof value === "string") {
    visit(key, value);
  } else if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, key, visit);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walkStrings(v, k, visit);
  }
}

async function readAdapter(file: string): Promise<PersistedInspectEvent[]> {
  const read = await openTrace({
    type: "string",
    content: readFileSync(path.join(repoRoot, file), "utf8"),
  });
  return read.events;
}

describe("official-adapter capture-policy parity", () => {
  for (const { adapter, file } of officialAdapterFixtures) {
    it(`keeps ${adapter} within the shared capture bounds`, async () => {
      const events = await readAdapter(file);
      expect(events.length).toBeGreaterThan(0);

      for (const event of events) {
        expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
          DEFAULT_MAX_EVENT_BYTES,
        );
        walkStrings(event.attributes, "attributes", (key, str) => {
          const bound = key.toLowerCase().includes("preview")
            ? DEFAULT_MAX_PREVIEW_LENGTH
            : DEFAULT_MAX_METADATA_VALUE_LENGTH;
          expect(str.length, `${adapter}:${key}`).toBeLessThanOrEqual(bound);
          if (isCredentialSensitiveKey(key)) {
            // A credential-sensitive key must never carry a raw value.
            expect(str, `${adapter}:${key}`).toBe(REDACTED);
          }
        });
      }
    });

    it(`keeps ${adapter} structurally faithful (one run with an LLM step)`, async () => {
      const events = await readAdapter(file);
      const kinds = events.map((event) => event.kind);
      expect(kinds.filter((kind) => kind === "RUN").length).toBe(1);
      expect(kinds).toContain("LLM");
    });
  }
});
