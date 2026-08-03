import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  resolveOutputOption,
  resolveRedactionProfileOption,
} from "../src/cli-option-aliases.js";
import { exportCommand } from "../src/export.js";
import { redactCommand } from "../src/redact.js";

// Resolve fixtures relative to this module, not process.cwd(). The rest of the
// CLI suite does the same so `pnpm --filter @agent-inspect/cli test` (which runs
// with cwd set to packages/cli) finds the repo-root fixtures directory.
const fixturesTracesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/traces",
);

describe("CLI option aliases", () => {
  let tmp: string;

  afterEach(async () => {
    process.exitCode = 0;
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("prefers canonical --output / --redaction-profile over legacy aliases", () => {
    expect(resolveOutputOption({ output: "./a", out: "./b" })).toBe("./a");
    expect(resolveOutputOption({ out: "./b" })).toBe("./b");
    expect(resolveRedactionProfileOption({ redactionProfile: "strict", profile: "share" })).toBe(
      "strict",
    );
    expect(resolveRedactionProfileOption({ profile: "share" })).toBe("share");
  });

  it("export accepts --out and --profile aliases", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-cli-alias-export-"));
    const outPath = path.join(tmp, "export.md");
    await exportCommand("minimal-success", {
      dir: fixturesTracesDir,
      format: "markdown",
      out: outPath,
      profile: "share",
    });
    const content = await readFile(outPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("redact accepts --out and --redaction-profile aliases", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "agent-inspect-cli-alias-redact-"));
    const outPath = path.join(tmp, "redacted.jsonl");
    await redactCommand(path.join(fixturesTracesDir, "minimal-success.jsonl"), {
      out: outPath,
      redactionProfile: "share",
      json: true,
    });
    const content = await readFile(outPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });
});
