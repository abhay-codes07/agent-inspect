# Evidence v2 retention, size, and PR attachment

**Status:** Guidance for AgentInspect **6.17.x** (local-first; not a compliance certification)

**See also:** [EVIDENCE-FORMAT.md](./EVIDENCE-FORMAT.md) · [BUNDLES.md](./BUNDLES.md) · [SAFE-TRACE-SHARING.md](./SAFE-TRACE-SHARING.md) · [CI-ARTIFACTS.md](./CI-ARTIFACTS.md)

Evidence bundles are **local files**. AgentInspect never uploads them; retention is entirely up to you and your CI. This page covers how long to keep them, how big they get, and how to attach them to a PR safely.

## Privacy first

An evidence bundle can contain redacted copies of real agent traces. Before attaching one anywhere it can be read by others:

- **Never attach production secrets or raw production traces.** Build bundles with the `share` or `strict` redaction profile, or from synthetic fixtures.
- Run the built-in integrity and safety check before sharing: `agent-inspect bundle verify <path>`.
- Prefer synthetic or anonymized runs for public PRs and issues. The repository's own examples use synthetic fixtures only.

Redaction is applied at build time by the profile you pass:

```bash
# Redacted, share-safe (default profile is share)
agent-inspect bundle <runId> --dir ./.agent-inspect --profile share

# Maximum redaction (also drops prompts/outputs)
agent-inspect bundle <runId> --dir ./.agent-inspect --profile strict
```

## Retention

- Bundles live under your trace directory (for example `./.agent-inspect`) as ordinary files. Delete them like any other build artifact when you no longer need them.
- Nothing expires automatically. Treat a bundle as a point-in-time snapshot of the runs it names in `evidence.json` (`source.runIds`), not a live view.
- `createdAt` in the manifest records when the bundle was built. Every other manifest field is a deterministic function of the inputs, so rebuilding from the same traces reproduces the same digests.
- For CI, keep bundles as run artifacts with a bounded retention window (see [CI-ARTIFACTS.md](./CI-ARTIFACTS.md)) rather than committing them to the repository.

## Size

Individual captured events are bounded at write time, which keeps bundles small and predictable:

| Bound | Default | Applies to |
|-------|---------|------------|
| Max event size | 64 KB | one serialized trace event |
| Max preview string | 500 chars | metadata keys containing `preview` |
| Max metadata value | 2000 chars | other string metadata values |

Directory-level scale also has warnings: AgentInspect warns once a trace directory passes ~1,000 runs, and flags individual trace files over 50 MB, because `open` / `check` / `report` slow down past those points (see [SCALE-LIMITS.md](./SCALE-LIMITS.md)). Bundle a specific run, session, or time window rather than an entire large directory:

```bash
agent-inspect bundle <runId> --dir ./.agent-inspect
agent-inspect bundle --session <sessionId> --dir ./.agent-inspect
agent-inspect bundle --since 24h --dir ./.agent-inspect
```

## Attaching to a pull request

1. Build a redacted bundle: `agent-inspect bundle <runId> --dir ./.agent-inspect --profile share`.
2. Verify it: `agent-inspect bundle verify ./.agent-inspect/<bundle>`.
3. Attach the bundle directory (or its `.zip`) to the PR, or upload it as a CI artifact instead of committing it.

For CI, uploading the bundle as a workflow artifact is preferred over committing binaries into the repository — it keeps history clean and lets retention be managed by the CI provider. See [CI-ARTIFACTS.md](./CI-ARTIFACTS.md) for a GitHub Actions example.
