/**
 * Vendor-neutral counterparty-receipt TraceReader (sanitized demo).
 *
 * Maps `{ receipts: [...] }` JSON into PersistedInspectEvent RESULT rows so a
 * recipe can join optional counterparty evidence to agent tool calls by
 * `idempotencyKey`. Only bounded IDs, status, time, provenance, and an optional
 * digest are retained. No network, no vendor SDK, no financial fields.
 *
 * Proposed sanitized shape (names + semantics only — not a rail or SDK schema):
 *   receiptId       stable id of this receipt record
 *   idempotencyKey  the client-supplied key the counterparty echoes back
 *   operationId     the logical operation the counterparty acknowledges
 *   status          acknowledged | rejected | unknown
 *   receivedAt      ISO time the receipt was observed
 *   provenance      where the receipt came from (e.g. "sandbox-webhook")
 *   digest          optional sha256 of the bounded record (integrity only)
 */
import {
  TraceReadError,
  type TraceFormatCandidate,
  type TraceInput,
  type TraceReadResult,
  type TraceReader,
} from "agent-inspect/readers";
import {
  isPersistedInspectEvent,
  persistedInspectEventsToRunTrees,
  type PersistedInspectEvent,
} from "agent-inspect/persisted";

export const COUNTERPARTY_RECEIPT_FORMAT = "counterparty-receipt-json";
const RECEIPTS_RUN_ID = "counterparty-receipts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveContent(input: TraceInput): Promise<string> {
  if (input.type === "string") return input.content;
  if (input.type === "buffer") return input.content.toString("utf8");
  if (input.type === "file") {
    const { readFile } = await import("node:fs/promises");
    return readFile(input.path, "utf8");
  }
  throw new TraceReadError(
    "unsupported_format",
    "Counterparty receipt reader requires file, string, or buffer input.",
  );
}

/** Normalize a receipt status to a bounded vocabulary; unknown values stay "unknown". */
function mapReceiptStatus(status: unknown): "acknowledged" | "rejected" | "unknown" {
  if (status === "acknowledged") return "acknowledged";
  if (status === "rejected") return "rejected";
  return "unknown";
}

export const counterpartyReceiptReader: TraceReader = {
  format: COUNTERPARTY_RECEIPT_FORMAT,
  name: "Counterparty receipt JSON",
  async detect(input): Promise<TraceFormatCandidate | undefined> {
    try {
      const parsed = JSON.parse(await resolveContent(input)) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) return undefined;
      return {
        format: COUNTERPARTY_RECEIPT_FORMAT,
        confidence: 0.86,
        readerName: "Counterparty receipt JSON",
        description: "Vendor-neutral sanitized counterparty receipt document",
      };
    } catch {
      return undefined;
    }
  },
  async read(input): Promise<TraceReadResult> {
    let content: string;
    try {
      content = await resolveContent(input);
    } catch (error) {
      if (error instanceof TraceReadError) throw error;
      throw new TraceReadError("unsupported_format", "Unable to resolve receipt input.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      throw new TraceReadError("invalid_input", "Receipt input is not valid JSON.", [
        { code: "receipt_invalid_json", message: "JSON parse failed.", severity: "error" },
      ]);
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      throw new TraceReadError(
        "unsupported_format",
        "Counterparty receipt document requires a receipts[] array.",
      );
    }

    const warnings: TraceReadResult["warnings"] = [];
    const unsupportedFields: string[] = [];
    const events: PersistedInspectEvent[] = [];
    const seenReceiptIds = new Set<string>();

    for (const [index, raw] of parsed.receipts.entries()) {
      const at = `receipts[${index}]`;
      if (
        !isRecord(raw) ||
        typeof raw.receiptId !== "string" ||
        typeof raw.idempotencyKey !== "string" ||
        typeof raw.operationId !== "string"
      ) {
        warnings.push({
          code: "receipt_invalid_record",
          message: `Skipped malformed receipt at ${at}.`,
          severity: "warning",
          field: at,
        });
        unsupportedFields.push(at);
        continue;
      }
      if (seenReceiptIds.has(raw.receiptId)) {
        throw new TraceReadError("invalid_input", `Duplicate receiptId "${raw.receiptId}".`, [
          {
            code: "receipt_duplicate_id",
            message: `Duplicate receiptId "${raw.receiptId}" is rejected deterministically.`,
            severity: "error",
            field: `${at}.receiptId`,
          },
        ]);
      }
      seenReceiptIds.add(raw.receiptId);

      const receivedAt =
        typeof raw.receivedAt === "string" && raw.receivedAt.trim() !== ""
          ? raw.receivedAt
          : "1970-01-01T00:00:00.000Z";

      // Retain only bounded fields; never copy through unknown/raw payload.
      const event: PersistedInspectEvent = {
        schemaVersion: "0.2",
        eventId: raw.receiptId,
        runId: RECEIPTS_RUN_ID,
        kind: "RESULT",
        name: "counterparty-receipt",
        timestamp: receivedAt,
        confidence: "correlated",
        source: { type: "adapter", name: "counterparty-receipt-reader" },
        attributes: {
          receiptId: raw.receiptId,
          idempotencyKey: raw.idempotencyKey,
          operationId: raw.operationId,
          receiptStatus: mapReceiptStatus(raw.status),
          provenance: typeof raw.provenance === "string" ? raw.provenance : "unknown",
          ...(typeof raw.digest === "string" && raw.digest.trim() !== ""
            ? { digest: raw.digest }
            : {}),
        },
      };

      if (!isPersistedInspectEvent(event)) {
        throw new TraceReadError(
          "reader_failed",
          `Normalized receipt at ${at} failed isPersistedInspectEvent.`,
        );
      }
      events.push(event);
    }

    return {
      format: COUNTERPARTY_RECEIPT_FORMAT,
      events,
      runs: persistedInspectEventsToRunTrees(events, { skipInvalid: true }),
      warnings,
      unsupportedFields: unsupportedFields.sort((a, b) => a.localeCompare(b)),
      sourceFiles: input.type === "file" ? [input.path] : [],
    };
  },
};
