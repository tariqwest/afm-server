// ============================================================================
// AfmError.ts — Typed error taxonomy mirroring Swift's ApfelCore.ApfelError.
//
// Discriminated union with one variant per FoundationModels failure mode plus
// PCC-specific variants. Each variant carries the openAIType, httpStatusCode,
// retryability, and user-facing message so callers can build wire responses
// without a second switch.
// ============================================================================

import type { ModelBackend } from "../backend/ModelBackend.js";

export type AfmErrorKind =
  | "guardrailViolation"
  | "refusal"
  | "contextOverflow"
  | "rateLimited"
  | "concurrentRequest"
  | "assetsUnavailable"
  | "unsupportedGuide"
  | "decodingFailure"
  | "unsupportedLanguage"
  | "toolExecution"
  | "pccUnavailable"
  | "pccQuotaExceeded"
  | "pccNetworkFailure"
  | "unknown";

export type AfmError =
  | { kind: "guardrailViolation" }
  | { kind: "refusal"; explanation: string }
  | { kind: "contextOverflow" }
  | { kind: "rateLimited" }
  | { kind: "concurrentRequest" }
  | { kind: "assetsUnavailable" }
  | { kind: "unsupportedGuide" }
  | { kind: "decodingFailure"; message: string }
  | { kind: "unsupportedLanguage"; message: string }
  | { kind: "toolExecution"; message: string }
  | { kind: "pccUnavailable"; reason: string }
  | { kind: "pccQuotaExceeded" }
  | { kind: "pccNetworkFailure"; message: string }
  | { kind: "unknown"; message: string };

export const AfmError = {
  cliLabel(e: AfmError): string {
    switch (e.kind) {
      case "guardrailViolation":
        return "[guardrail]";
      case "refusal":
        return "[refusal]";
      case "contextOverflow":
        return "[context overflow]";
      case "rateLimited":
        return "[rate limited]";
      case "concurrentRequest":
        return "[busy]";
      case "assetsUnavailable":
        return "[model loading]";
      case "unsupportedGuide":
        return "[unsupported guide]";
      case "decodingFailure":
        return "[decoding failure]";
      case "unsupportedLanguage":
        return "[unsupported language]";
      case "toolExecution":
        return "[tool error]";
      case "pccUnavailable":
        return "[pcc unavailable]";
      case "pccQuotaExceeded":
        return "[pcc quota]";
      case "pccNetworkFailure":
        return "[pcc network]";
      case "unknown":
        return "[error]";
    }
  },

  openAIType(e: AfmError): string {
    switch (e.kind) {
      case "guardrailViolation":
      case "refusal":
        return "content_policy_violation";
      case "contextOverflow":
        return "context_length_exceeded";
      case "rateLimited":
      case "concurrentRequest":
      case "pccQuotaExceeded":
        return "rate_limit_error";
      case "unsupportedGuide":
      case "unsupportedLanguage":
        return "invalid_request_error";
      case "assetsUnavailable":
      case "decodingFailure":
      case "toolExecution":
      case "pccUnavailable":
      case "pccNetworkFailure":
      case "unknown":
        return "server_error";
    }
  },

  /**
   * HTTP status code for this error type.
   *
   * `refusal` returns 200 because an output-side refusal is a successful
   * completion per the OpenAI wire format: HTTP 200 with
   * `finish_reason: "content_filter"` and the refusal text on the assistant
   * message.
   */
  httpStatusCode(e: AfmError): number {
    switch (e.kind) {
      case "guardrailViolation":
      case "contextOverflow":
      case "unsupportedGuide":
      case "unsupportedLanguage":
        return 400;
      case "refusal":
        return 200;
      case "rateLimited":
      case "concurrentRequest":
      case "pccQuotaExceeded":
        return 429;
      case "assetsUnavailable":
      case "pccUnavailable":
      case "pccNetworkFailure":
        return 503;
      case "decodingFailure":
      case "toolExecution":
      case "unknown":
        return 500;
    }
  },

  openAIMessage(e: AfmError): string {
    switch (e.kind) {
      case "guardrailViolation":
        return "The request was blocked by Apple's safety guardrails. Try rephrasing.";
      case "refusal":
        return `The on-device model refused the request: ${e.explanation}`;
      case "contextOverflow":
        return "Input exceeds the model's context window. Shorten the conversation history.";
      case "rateLimited":
        return "Apple Intelligence is rate limited. Retry after a few seconds.";
      case "concurrentRequest":
        return "Apple Intelligence is busy with another request. Retry shortly.";
      case "assetsUnavailable":
        return "Model assets are loading. Try again in a moment.";
      case "unsupportedGuide":
        return "The requested generation guide is not supported by this model.";
      case "decodingFailure":
        return `Model output could not be decoded: ${e.message}`;
      case "unsupportedLanguage":
        return `Unsupported language: ${e.message}`;
      case "toolExecution":
        return e.message;
      case "pccUnavailable":
        return (
          `Apple Private Cloud Compute is not available on this device (${e.reason}). ` +
          "PCC requires macOS 27+, Apple Intelligence enabled, and an eligible device. " +
          "Try the on-device model (`system`) instead."
        );
      case "pccQuotaExceeded":
        return "Apple Private Cloud Compute quota for this Apple Account has been reached. Retry later or fall back to the on-device model.";
      case "pccNetworkFailure":
        return `Apple Private Cloud Compute could not be reached: ${e.message}. Check your network and retry, or use the on-device model.`;
      case "unknown":
        return e.message;
    }
  },

  isRetryable(e: AfmError): boolean {
    switch (e.kind) {
      case "rateLimited":
      case "concurrentRequest":
      case "assetsUnavailable":
      case "pccNetworkFailure":
        return true;
      default:
        return false;
    }
  },

  /**
   * Classify an arbitrary thrown value into a typed AfmError.
   *
   * `unknown` is the safe default. The Swift helper sends already-classified
   * `error.kind` tags over the wire, so most failures arrive as a structured
   * object and skip the string fallbacks.
   */
  classify(err: unknown): AfmError {
    if (err && typeof err === "object") {
      const obj = err as { kind?: unknown; message?: unknown };
      // Helper-protocol error envelope: { kind, ... }
      if (typeof obj.kind === "string" && (KNOWN_KINDS as readonly string[]).includes(obj.kind)) {
        return err as AfmError;
      }
      if (obj instanceof Error && typeof obj.message === "string") {
        return classifyMessage(obj.message);
      }
    }
    if (typeof err === "string") return classifyMessage(err);
    return { kind: "unknown", message: String(err) };
  },

  /**
   * Re-classify a server-side AfmError with knowledge of which backend served
   * the request. When PCC was requested and we ended up with a generic
   * `.unknown`, turn it into a `.pccUnavailable` with a clearer hint.
   * No-op for on-device.
   */
  reclassifyForBackend(e: AfmError, backend: ModelBackend): AfmError {
    if (backend !== "privateCloudCompute") return e;
    if (e.kind === "unknown") {
      const trimmed = e.message.trim();
      return {
        kind: "pccUnavailable",
        reason: `the framework rejected the request (${trimmed}). Make sure Apple Intelligence is enabled, you are signed in to an Apple Account, and PCC is supported on this Mac`,
      };
    }
    return e;
  },
} as const;

const KNOWN_KINDS = [
  "guardrailViolation",
  "refusal",
  "contextOverflow",
  "rateLimited",
  "concurrentRequest",
  "assetsUnavailable",
  "unsupportedGuide",
  "decodingFailure",
  "unsupportedLanguage",
  "toolExecution",
  "pccUnavailable",
  "pccQuotaExceeded",
  "pccNetworkFailure",
  "unknown",
] as const satisfies readonly AfmErrorKind[];

function classifyMessage(raw: string): AfmError {
  const desc = raw.toLowerCase();
  if (containsAny(desc, ["refused", "refusal", "declined"])) {
    return { kind: "refusal", explanation: raw };
  }
  if (containsAny(desc, ["guardrail", "content policy", "unsafe"])) {
    return { kind: "guardrailViolation" };
  }
  // Match rate-limit FIRST: real-world strings like "Rate limit exceeded"
  // would otherwise be miscategorised as contextOverflow by the bare
  // "exceeded" check (which the Swift impl had; we tightened it here).
  if (containsAny(desc, ["rate limit", "ratelimited", "rate_limit"])) {
    return { kind: "rateLimited" };
  }
  if (desc.includes("context window")) {
    return { kind: "contextOverflow" };
  }
  if (desc.includes("concurrent")) {
    return { kind: "concurrentRequest" };
  }
  if (desc.includes("unsupported language")) {
    return { kind: "unsupportedLanguage", message: raw };
  }
  return { kind: "unknown", message: raw };
}

function containsAny(s: string, needles: readonly string[]): boolean {
  return needles.some((n) => s.includes(n));
}
