/**
 * idempotency-receipt-correlation — join agent tool calls to sanitized
 * counterparty receipts by idempotencyKey, fail-closed on ambiguity.
 *
 * The AgentInspect model keeps toolCallId, operationId, attemptId, retryOf, and
 * idempotencyKey independent; this recipe joins optional counterparty receipt
 * evidence WITHOUT conflating those identifiers. It never claims exactly-once
 * delivery or payment verification — missing or ambiguous evidence stays
 * `unknown` (fail-closed). Synthetic data only; no network, no vendor SDK.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openTrace, DEFAULT_TRACE_READERS } from "agent-inspect/readers";

import { counterpartyReceiptReader } from "./receipt-reader.js";

/** One tool-call attempt as carried in a TOOL step's metadata. */
interface ToolCallAttempt {
  toolCallId: string;
  operationId: string;
  attemptId: string;
  idempotencyKey: string;
  retryOf?: string;
}

// Agent side: two attempts of op-A share operationId + idempotencyKey but have
// distinct toolCallId / attemptId (att-A2 retries att-A1). op-B/C/D are single
// attempts. Every id kind is a distinct value — never an alias of another.
const attempts: ToolCallAttempt[] = [
  { toolCallId: "call-A1", operationId: "op-A", attemptId: "att-A1", idempotencyKey: "idem-A" },
  {
    toolCallId: "call-A2",
    operationId: "op-A",
    attemptId: "att-A2",
    idempotencyKey: "idem-A",
    retryOf: "att-A1",
  },
  { toolCallId: "call-B1", operationId: "op-B", attemptId: "att-B1", idempotencyKey: "idem-B" },
  { toolCallId: "call-C1", operationId: "op-C", attemptId: "att-C1", idempotencyKey: "idem-C" },
  { toolCallId: "call-D1", operationId: "op-D", attemptId: "att-D1", idempotencyKey: "idem-D" },
];

// Guard the core invariant: within an attempt the four identifiers are distinct.
for (const a of attempts) {
  const ids = [a.toolCallId, a.operationId, a.attemptId, a.idempotencyKey];
  if (new Set(ids).size !== ids.length) {
    throw new Error(`conflated identifiers in ${a.toolCallId}`);
  }
}

/** A logical operation is the set of attempts sharing one idempotencyKey. */
interface Operation {
  operationId: string;
  idempotencyKey: string;
  attemptCount: number;
}

const operations: Operation[] = [];
for (const a of attempts) {
  const existing = operations.find((o) => o.idempotencyKey === a.idempotencyKey);
  if (existing) {
    existing.attemptCount += 1;
    if (existing.operationId !== a.operationId) {
      throw new Error(`idempotencyKey ${a.idempotencyKey} spans two operationIds`);
    }
  } else {
    operations.push({ operationId: a.operationId, idempotencyKey: a.idempotencyKey, attemptCount: 1 });
  }
}

interface ReceiptRecord {
  receiptId: string;
  idempotencyKey: string;
  operationId: string;
  receiptStatus: string;
}

async function loadReceipts(): Promise<ReceiptRecord[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(here, "..", "fixture", "receipts.json");
  const read = await openTrace(
    { type: "file", path: fixturePath },
    { readers: [counterpartyReceiptReader, ...DEFAULT_TRACE_READERS] },
  );
  return read.events.map((event) => {
    const attributes = event.attributes ?? {};
    return {
      receiptId: String(attributes.receiptId ?? event.eventId),
      idempotencyKey: String(attributes.idempotencyKey ?? ""),
      operationId: String(attributes.operationId ?? ""),
      receiptStatus: String(attributes.receiptStatus ?? "unknown"),
    };
  });
}

type CorrelationStatus = "correlated" | "unknown";

interface Correlation {
  operationId: string;
  idempotencyKey: string;
  status: CorrelationStatus;
  reason: string;
}

/** Join one operation to its receipts by idempotencyKey; fail closed. */
function correlate(operation: Operation, receipts: ReceiptRecord[]): Correlation {
  const matches = receipts.filter((r) => r.idempotencyKey === operation.idempotencyKey);
  const base = { operationId: operation.operationId, idempotencyKey: operation.idempotencyKey };

  if (matches.length === 0) {
    return { ...base, status: "unknown", reason: "missing: no counterparty receipt" };
  }
  if (matches.length > 1) {
    // Duplicate receipts for one key are ambiguous. Do NOT assert a single
    // delivery; correlation stays unknown.
    return {
      ...base,
      status: "unknown",
      reason: `duplicate: ${matches.length} receipts share this idempotencyKey`,
    };
  }
  const receipt = matches[0]!;
  if (receipt.operationId !== operation.operationId) {
    return {
      ...base,
      status: "unknown",
      reason: `mismatch: receipt operationId ${receipt.operationId} != ${operation.operationId}`,
    };
  }
  if (receipt.receiptStatus !== "acknowledged") {
    return {
      ...base,
      status: "unknown",
      reason: `receipt status is ${receipt.receiptStatus}`,
    };
  }
  return { ...base, status: "correlated", reason: `receipt ${receipt.receiptId} acknowledged` };
}

const receipts = await loadReceipts();
const correlations = operations.map((op) => correlate(op, receipts));

console.log("Idempotency <-> counterparty receipt correlation (fail-closed)");
console.log(`Attempts: ${attempts.length}  Operations: ${operations.length}  Receipts: ${receipts.length}`);
console.log("");
for (const c of correlations) {
  console.log(`${c.operationId} [${c.idempotencyKey}] -> ${c.status} (${c.reason})`);
}
console.log("");
const correlated = correlations.filter((c) => c.status === "correlated").length;
const unknown = correlations.filter((c) => c.status === "unknown").length;
console.log(`Summary: ${correlated} correlated, ${unknown} unknown (fail-closed)`);
console.log("Identifiers stay independent; no exactly-once or payment-verification claim.");
console.log("ok");
