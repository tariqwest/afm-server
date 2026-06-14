import { describe, expect, test } from "vitest";
import { FinishReason, FinishReasonResolver } from "../src/chat/FinishReasonResolver.js";

describe("FinishReasonResolver.resolve", () => {
  test("tool calls take precedence over length", () => {
    expect(
      FinishReasonResolver.resolve({ hasToolCalls: true, completionTokens: 256, maxTokens: 256 }),
    ).toBe("toolCalls");
  });

  test("hitting the maxTokens cap returns length", () => {
    expect(
      FinishReasonResolver.resolve({ hasToolCalls: false, completionTokens: 100, maxTokens: 100 }),
    ).toBe("length");
  });

  test("under-cap returns stop", () => {
    expect(
      FinishReasonResolver.resolve({ hasToolCalls: false, completionTokens: 50, maxTokens: 100 }),
    ).toBe("stop");
  });

  test("no maxTokens cap returns stop regardless of completionTokens", () => {
    expect(
      FinishReasonResolver.resolve({
        hasToolCalls: false,
        completionTokens: 99999,
        maxTokens: undefined,
      }),
    ).toBe("stop");
  });

  test("zero completionTokens never returns length even if cap is 0", () => {
    expect(
      FinishReasonResolver.resolve({ hasToolCalls: false, completionTokens: 0, maxTokens: 0 }),
    ).toBe("stop");
  });
});

describe("FinishReason.openAIValue", () => {
  test.each([
    ["stop", "stop"],
    ["length", "length"],
    ["toolCalls", "tool_calls"],
    ["contentFilter", "content_filter"],
  ] as const)("%s -> %s", (input, expected) => {
    expect(FinishReason.openAIValue(input)).toBe(expected);
  });
});
