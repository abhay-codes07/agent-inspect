# Walkthrough: GitHub Actions artifact → local Studio

This walkthrough uploads a **share-safe evidence bundle** from CI as a workflow artifact, then pulls it into a **local, read-only Studio**. The pull is operator-initiated with the operator's own GitHub token — Studio never phones home and there is no maintainer proxy.

**See also:** [CI-ARTIFACTS.md](./CI-ARTIFACTS.md) · [BUNDLES.md](./BUNDLES.md) · [SELF-HOSTING.md](./SELF-HOSTING.md) · [SAFE-TRACE-SHARING.md](./SAFE-TRACE-SHARING.md)

## Before you start

- **Only upload redacted, share-safe bundles.** Build with the `share` (default) or `strict` profile, or use synthetic runs. Never put production secrets or raw traces in an artifact.
- Importing needs a GitHub token with `actions:read` on the repository. Keep it in an environment variable; it is never logged.

## 1. Produce and upload a share-safe bundle in CI

Add a step to your workflow that builds a verified bundle and uploads it as an artifact:

```yaml
# .github/workflows/agent-inspect-evidence.yml
name: agent-inspect evidence
on: [pull_request]

jobs:
  evidence:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # ... run your agent against synthetic fixtures and produce a run ...

      - name: Build share-safe bundle
        run: npx agent-inspect bundle <run-id> --profile share --out ./bundle-out

      - name: Verify bundle
        run: npx agent-inspect bundle verify ./bundle-out

      - name: Upload evidence artifact
        uses: actions/upload-artifact@v4
        with:
          name: agent-inspect-evidence
          path: ./bundle-out
          retention-days: 14
```

Bounded `retention-days` keeps artifact storage tidy; the artifact is share-safe because the bundle was built with a redaction profile.

## 2. Pull the artifact into Studio

On your machine (or a team Studio host), download the artifact directly into the Studio import directory:

```bash
export GITHUB_TOKEN=...   # actions:read on your repo
npx agent-inspect studio import github \
  --repo owner/name \
  --run-id 123456789 \
  --artifact agent-inspect-evidence \
  --workspace ./studio-registry.json
```

This downloads the artifact zip into the registry's `import.bundlesDir`, records idempotent ingest bookkeeping, and refreshes the project index. Re-running the same import does not duplicate it. See [SELF-HOSTING.md](./SELF-HOSTING.md#studio-registry) for the `studio-registry.json` shape.

## 3. View it in Studio

```bash
npx agent-inspect studio --workspace ./studio-registry.json --open
```

Studio starts read-only on `127.0.0.1:7340` and shows the imported run.

## Notes

- The GitHub pull is **operator-initiated**: nothing runs on a schedule and Studio never fetches on its own.
- Review imported evidence with `scan` / `verify-safe` before sharing beyond your network.
- The `studio` command requires the optional `@agent-inspect/studio` package; it adds no dependency to AgentInspect core.
