import { describe, expect, test } from "vitest";
import { type AfmError as AfmErrorType, AfmError } from "../src/errors/AfmError.js";

function makeMinimal(kind: AfmErrorType["kind"]): AfmErrorType {
  switch (kind) {
    case "refusal":
      return { kind, explanation: "stub" };
    case "decodingFailure":
    case "unsupportedLanguage":
    case "toolExecution":
    case "pccNetworkFailure":
    case "unknown":
      return { kind, message: "stub" };
    case "pccUnavailable":
      return { kind, reason: "stub" };
    default:
      return { kind };
  }
}

describe("AfmError.openAIType", () => {
  test.each([
    ["guardrailViolation", "content_policy_violation"],
    ["refusal", "content_policy_violation"],
    ["contextOverflow", "context_length_exceeded"],
    ["rateLimited", "rate_limit_error"],
    ["concurrentRequest", "rate_limit_error"],
    ["pccQuotaExceeded", "rate_limit_error"],
    ["unsupportedGuide", "invalid_request_error"],
    ["unsupportedLanguage", "invalid_request_error"],
    ["assetsUnavailable", "server_error"],
    ["decodingFailure", "server_error"],
    ["toolExecution", "server_error"],
    ["pccUnavailable", "server_error"],
    ["pccNetworkFailure", "server_error"],
    ["unknown", "server_error"],
  ] as const)("%s -> %s", (kind, expected) => {
    expect(AfmError.openAIType(makeMinimal(kind))).toBe(expected);
  });
});

describe("AfmError.httpStatusCode", () => {
  test("refusal returns 200 (OpenAI wire-format for content_filter)", () => {
    expect(AfmError.httpStatusCode({ kind: "refusal", explanation: "x" })).toBe(200);
  });
  test("rate limits return 429", () => {
    expect(AfmError.httpStatusCode({ kind: "rateLimited" })).toBe(429);
    expect(AfmError.httpStatusCode({ kind: "pccQuotaExceeded" })).toBe(429);
  });
  test("503s for transient/unreachable backends", () => {
    expect(AfmError.httpStatusCode({ kind: "pccUnavailable", reason: "device" })).toBe(503);
    expect(AfmError.httpStatusCode({ kind: "pccNetworkFailure", message: "x" })).toBe(503);
    expect(AfmError.httpStatusCode({ kind: "assetsUnavailable" })).toBe(503);
  });
  test("400s for client-side validation", () => {
    expect(AfmError.httpStatusCode({ kind: "contextOverflow" })).toBe(400);
    expect(AfmError.httpStatusCode({ kind: "guardrailViolation" })).toBe(400);
    expect(AfmError.httpStatusCode({ kind: "unsupportedGuide" })).toBe(400);
  });
});

describe("AfmError.isRetryable", () => {
  test("pccNetworkFailure is retryable; pccQuotaExceeded is NOT", () => {
    expect(AfmError.isRetryable({ kind: "pccNetworkFailure", message: "x" })).toBe(true);
    expect(AfmError.isRetryable({ kind: "pccQuotaExceeded" })).toBe(false);
  });
  test("most kinds are not retryable", () => {
    expect(AfmError.isRetryable({ kind: "refusal", explanation: "x" })).toBe(false);
    expect(AfmError.isRetryable({ kind: "guardrailViolation" })).toBe(false);
    expect(AfmError.isRetryable({ kind: "unknown", message: "x" })).toBe(false);
  });
});

describe("AfmError.openAIMessage", () => {
  test("refusal embeds the explanation", () => {
    const msg = AfmError.openAIMessage({ kind: "refusal", explanation: "I cannot answer that." });
    expect(msg).toContain("I cannot answer that.");
  });

  test("pccUnavailable mentions macOS 27 and the fallback model id", () => {
    const msg = AfmError.openAIMessage({ kind: "pccUnavailable", reason: "deviceNotEligible" });
    expect(msg).toContain("deviceNotEligible");
    expect(msg).toContain("macOS 27");
    expect(msg).toContain("apple-foundationmodel");
  });

  test("pccQuotaExceeded mentions retry guidance", () => {
    expect(AfmError.openAIMessage({ kind: "pccQuotaExceeded" })).toContain("Retry later");
  });
});

describe("AfmError.classify", () => {
  test("passes through an already-typed envelope from the helper wire", () => {
    const e = AfmError.classify({ kind: "pccUnavailable", reason: "systemNotReady" });
    expect(e.kind).toBe("pccUnavailable");
  });

  test("string fallback recognises refusal-ish wording", () => {
    expect(AfmError.classify("The model refused that request.").kind).toBe("refusal");
  });

  test("string fallback recognises guardrail-ish wording", () => {
    expect(AfmError.classify("Blocked by guardrail").kind).toBe("guardrailViolation");
  });

  test("unknown text falls back to .unknown", () => {
    const e = AfmError.classify("some completely unrelated text");
    expect(e.kind).toBe("unknown");
    expect("message" in e && e.message).toContain("some completely unrelated");
  });

  test("Error instance with message classifies via the same string fallbacks", () => {
    const e = AfmError.classify(new Error("Rate limit exceeded"));
    expect(e.kind).toBe("rateLimited");
  });
});

describe("AfmError.reclassifyForBackend", () => {
  test("unknown on PCC becomes pccUnavailable with helpful hint", () => {
    const out = AfmError.reclassifyForBackend(
      { kind: "unknown", message: "operation couldn't be completed" },
      "privateCloudCompute",
    );
    expect(out.kind).toBe("pccUnavailable");
    if (out.kind === "pccUnavailable") {
      expect(out.reason).toContain("operation couldn't be completed");
      expect(out.reason).toContain("Apple Intelligence is enabled");
    }
  });

  test("no-op for on-device", () => {
    const original = { kind: "unknown" as const, message: "x" };
    expect(AfmError.reclassifyForBackend(original, "onDevice")).toEqual(original);
  });

  test("typed PCC errors pass through unchanged", () => {
    const e = { kind: "pccQuotaExceeded" as const };
    expect(AfmError.reclassifyForBackend(e, "privateCloudCompute")).toEqual(e);
  });
});
