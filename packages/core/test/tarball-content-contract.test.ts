/**
 * Tarball-content contract for every public AgentInspect package.
 *
 * npm ships exactly what `files` allow-lists, so this pins that each published
 * package (the 18 fixed packages) ships its build output, never ships source or
 * tests, stays publishable (not private), and points its entry points into
 * dist. A packaging regression that would leak src/tests or drop dist fails
 * here instead of shipping to npm.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface PackageJson {
  name: string;
  private?: boolean;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  bin?: Record<string, string> | string;
}

function readJson(file: string): PackageJson {
  return JSON.parse(readFileSync(file, "utf8")) as PackageJson;
}

const changeset = JSON.parse(
  readFileSync(path.join(repoRoot, ".changeset/config.json"), "utf8"),
) as { fixed?: string[][] };
const fixedNames = changeset.fixed?.[0] ?? [];

// Map every public package name to its package.json path.
const nameToManifest = new Map<string, string>();
const rootManifest = path.join(repoRoot, "package.json");
nameToManifest.set(readJson(rootManifest).name, rootManifest);
for (const dir of readdirSync(path.join(repoRoot, "packages"))) {
  const manifest = path.join(repoRoot, "packages", dir, "package.json");
  if (!existsSync(manifest)) continue;
  nameToManifest.set(readJson(manifest).name, manifest);
}

const FORBIDDEN_FILE_ENTRY = /(^|\/)(src|test|tests|__tests__|tsconfig|vitest|coverage)(\/|$|\.)/i;

describe("public package tarball-content contract", () => {
  it("declares exactly 18 fixed public packages", () => {
    expect(fixedNames).toHaveLength(18);
  });

  for (const name of fixedNames) {
    describe(name, () => {
      const manifestPath = nameToManifest.get(name);

      it("resolves to a package.json", () => {
        expect(manifestPath, `missing manifest for ${name}`).toBeDefined();
      });

      it("is publishable and ships a files allow-list", () => {
        const pkg = readJson(manifestPath!);
        expect(pkg.private ?? false).toBe(false);
        expect(Array.isArray(pkg.files)).toBe(true);
        expect(pkg.files!.length).toBeGreaterThan(0);
      });

      it("ships dist and never ships source or tests", () => {
        const pkg = readJson(manifestPath!);
        expect(pkg.files!.some((entry) => entry.includes("dist"))).toBe(true);
        for (const entry of pkg.files!) {
          expect(entry, `${name} files[] entry`).not.toMatch(FORBIDDEN_FILE_ENTRY);
        }
      });

      it("points entry points into dist", () => {
        const pkg = readJson(manifestPath!);
        const entryPoints = [pkg.main, pkg.module, pkg.types ?? pkg.typings].filter(
          (value): value is string => typeof value === "string",
        );
        expect(entryPoints.length).toBeGreaterThan(0);
        for (const entry of entryPoints) {
          expect(entry, `${name} entry ${entry}`).toContain("dist");
        }
        const binTargets =
          typeof pkg.bin === "string"
            ? [pkg.bin]
            : pkg.bin
              ? Object.values(pkg.bin)
              : [];
        // A bin target must be shipped, i.e. live under one of the files entries.
        const normalize = (value: string) => value.replace(/^\.\//, "");
        for (const target of binTargets) {
          const shipped = pkg.files!.some((entry) =>
            normalize(target).startsWith(normalize(entry)),
          );
          expect(shipped, `${name} bin ${target} is not under files[]`).toBe(true);
        }
      });
    });
  }
});
