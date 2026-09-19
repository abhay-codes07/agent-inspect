# idempotency-receipt-correlation

Join agent tool calls to optional **counterparty receipt** evidence by
`idempotencyKey`, and fail closed when the evidence is missing or ambiguous.

This is a possible **6.32 evidence candidate**, not an evidence-gate approval.

## What it shows

AgentInspect already keeps `toolCallId`, `operationId`, `attemptId`, `retryOf`,
and `idempotencyKey` independent. This recipe correlates a sanitized counterparty
receipt fixture to the agent's operations **without conflating those
identifiers**, and never asserts exactly-once delivery or payment verification.

- A vendor-neutral `TraceReader` ([`src/receipt-reader.ts`](src/receipt-reader.ts))
  maps `fixture/receipts.json` into `RESULT` events, retaining only bounded IDs,
  status, time, provenance, and an optional digest.
- The join key is `idempotencyKey` (the client-supplied key the counterparty
  echoes back). Two attempts of one operation share the key; each attempt keeps
  its own `toolCallId` / `attemptId`.

## Correlation outcomes (fail-closed)

| Case | Condition | Result |
|------|-----------|--------|
| exact | one receipt, matching `operationId`, `acknowledged` | `correlated` |
| missing | no receipt for the key | `unknown` |
| mismatched | receipt's `operationId` differs | `unknown` |
| duplicate | two+ receipts share the key | `unknown` |

`unknown` is the safe default: the recipe reports what the evidence supports and
nothing more. Duplicate receipts are explicitly **not** treated as proof of a
single delivery.

## Proposed sanitized receipt shape

Names and semantics only — not a rail or SDK schema:

| Field | Meaning |
|-------|---------|
| `receiptId` | stable id of this receipt record |
| `idempotencyKey` | the client-supplied key the counterparty echoes back |
| `operationId` | the logical operation the counterparty acknowledges |
| `status` | `acknowledged` \| `rejected` \| `unknown` |
| `receivedAt` | ISO time the receipt was observed |
| `provenance` | where the receipt came from (e.g. `sandbox-webhook`) |
| `digest` | optional sha256 of the bounded record (integrity only) |

No amounts, account/card fields, customer data, or raw financial records.

## Run

```bash
pnpm --filter agent-inspect-recipe-idempotency-receipt-correlation start
```

Synthetic data only. No network, no vendor SDK, no new core dependency.
