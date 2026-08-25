# Support levels

Canonical maturity labels for AgentInspect public packages and major surfaces (6.17.x fixed release line).

## Definitions

| Level | Meaning |
| ----- | ------- |
| **Stable** | Core contracts intended for long-term use; breaking changes require a major version |
| **Supported** | Officially maintained; API may evolve with minors; documented and tested |
| **Beta** | Useful and tested; API or UX may change; known limitations disclosed |
| **Preview** | Early surface; expect gaps; not for production-critical workflows alone |
| **Experimental** | Research / extension; may be removed or redesigned |

## Package matrix (fixed release line)

| Package / surface | Level |
| ----------------- | ----- |
| `agent-inspect` core schema, readers, writers, inspection CLI | Stable |
| Redaction engine / `@agent-inspect/redact` | Stable |
| Deterministic checks (`agent-inspect/checks`) | Stable |
| Official adapters (ai-sdk, openai-agents, langchain / LangGraph fidelity classes) | Supported |
| Vitest / Jest reporters | Supported |
| `@agent-inspect/harness` | Supported |
| Workspace / bundles / observed outcomes / Evidence v2 | Supported |
| TraceFacts programmatic API | Beta |
| TraceContract API | Beta |
| Suites / cohorts / gates | Beta |
| `@agent-inspect/index-sqlite` | Beta |
| `@agent-inspect/viewer` | Beta |
| `@agent-inspect/adapter-sdk` / plugins | Beta |
| `@agent-inspect/studio` | Beta |
| Studio HTTP / GitHub ingest | Preview |
| `@agent-inspect/mcp-server` (read-only MCP) | Preview |
| Standards round-trip / Collector–Phoenix external proof | Preview |
| Vitest/Jest TraceContract matchers (`toPassTraceContract`, `toHaveRequiredTool`) | Experimental |

Part of the fixed AgentInspect release line — see the npm badge for the current version.

> Every level in this matrix must be one of the Definitions levels above, and `docs/product/PUBLIC-PRODUCT-FACTS.json` `matchers.status` must match the matchers row here. `pnpm public-truth:check` enforces both; update the doc and the facts file together.

## Public package groups (presentation only)

Physical packages stay the fixed group of 18. Outreach/install kits group them as:

1. **Core kit** — `agent-inspect` (+ CLI)
2. **Framework kit** — official adapters matching your stack
3. **CI / Evidence kit** — checks, gates, reporters, Evidence v2 workflows

See [INSTALL-KITS.md](./INSTALL-KITS.md).

## Compatibility promise

- Persisted schema **1.0**; v0.1 / v0.2 / 1.0 traces remain readable
- Optional packages do not add root/core runtime dependencies
- Network behavior is explicit (see [NETWORK-BEHAVIOR.md](./NETWORK-BEHAVIOR.md))

## Promotion criteria

A surface moves up only with tests, docs, packed smoke where relevant, real-project or external retained use where required for Supported/Stable, and honest limitation disclosure — not changelog marketing alone.
