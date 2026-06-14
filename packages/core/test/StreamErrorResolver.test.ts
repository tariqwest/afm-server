import { describe, expect, test } from "vitest";
import { StreamErrorResolver } from "../src/chat/StreamErrorResolver.js";

describe("StreamErrorResolver.resolve", () => {
  test("contextOverflow + content already streamed -> truncated", () => {
    const r = StreamErrorResolver.resolve("partial reply", { kind: "contextOverflow" });
    expect(r.kind).toBe("truncated");
    if (r.kind === "truncated") expect(r.content).toBe("partial reply");
  });

  test("contextOverflow + empty prev -> fatal (prompt itself too big)", () => {
    const r = StreamErrorResolver.resolve("", { kind: "contextOverflow" });
    expect(r.kind).toBe("fatal");
  });

  test("any non-overflow error is fatal regardless of prev", () => {
    const r = StreamErrorResolver.resolve("anything", { kind: "guardrailViolation" });
    expect(r.kind).toBe("fatal");
  });

  test("rateLimited mid-stream is fatal (retry policy handles it elsewhere)", () => {
    const r = StreamErrorResolver.resolve("partial", { kind: "rateLimited" });
    expect(r.kind).toBe("fatal");
  });
});

describe("StreamErrorResolver.refusalCompletionText", () => {
  test("concatenates prev + explanation (single tokenize call avoids double-count)", () => {
    expect(StreamErrorResolver.refusalCompletionText("hello ", "I can't help.")).toBe(
      "hello I can't help.",
    );
  });

  test("handles empty prev", () => {
    expect(StreamErrorResolver.refusalCompletionText("", "Sorry")).toBe("Sorry");
  });
});
