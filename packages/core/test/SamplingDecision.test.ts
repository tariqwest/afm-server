import { describe, expect, test } from "vitest";
import { SamplingDecision } from "../src/sampling/SamplingDecision.js";

describe("SamplingDecision.resolve", () => {
  test("temperature=0 (no top_p) -> greedy", () => {
    expect(SamplingDecision.resolve({ temperature: 0 })).toEqual({ kind: "greedy" });
    expect(SamplingDecision.resolve({ temperature: 0, seed: 42 })).toEqual({ kind: "greedy" });
  });

  test("top_p -> nucleus, carrying seed when present", () => {
    expect(SamplingDecision.resolve({ topP: 0.9 })).toEqual({
      kind: "nucleus",
      probabilityThreshold: 0.9,
      seed: undefined,
    });
    expect(SamplingDecision.resolve({ topP: 0.9, seed: 7 })).toEqual({
      kind: "nucleus",
      probabilityThreshold: 0.9,
      seed: 7,
    });
  });

  test("top_p wins over temperature=0", () => {
    expect(SamplingDecision.resolve({ temperature: 0, topP: 0.5 })).toEqual({
      kind: "nucleus",
      probabilityThreshold: 0.5,
      seed: undefined,
    });
  });

  test("seed-only -> top-k(50)", () => {
    expect(SamplingDecision.resolve({ seed: 99 })).toEqual({ kind: "topK", top: 50, seed: 99 });
  });

  test("seed + non-zero temperature still goes top-k(50)", () => {
    expect(SamplingDecision.resolve({ temperature: 0.7, seed: 99 })).toEqual({
      kind: "topK",
      top: 50,
      seed: 99,
    });
  });

  test("nothing specified -> defaultMode", () => {
    expect(SamplingDecision.resolve({})).toEqual({ kind: "defaultMode" });
  });

  test("non-zero temperature with no seed/top_p -> defaultMode", () => {
    expect(SamplingDecision.resolve({ temperature: 0.7 })).toEqual({ kind: "defaultMode" });
  });
});
