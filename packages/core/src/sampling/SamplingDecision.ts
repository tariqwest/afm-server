// ============================================================================
// SamplingDecision.ts — Resolve a generation's sampling mode from the
// OpenAI-style {temperature, top_p, seed} triple. Pure decision logic.
// Port of Sources/Core/SamplingDecision.swift.
// ============================================================================

export type SamplingDecision =
  | { kind: "greedy" }
  | { kind: "nucleus"; probabilityThreshold: number; seed?: number | undefined }
  | { kind: "topK"; top: number; seed?: number | undefined }
  | { kind: "defaultMode" };

export const SamplingDecision = {
  resolve(args: {
    temperature?: number | undefined;
    topP?: number | undefined;
    seed?: number | undefined;
  }): SamplingDecision {
    // top_p wins: nucleus sampling carries the seed.
    if (args.topP != null) {
      return { kind: "nucleus", probabilityThreshold: args.topP, seed: args.seed };
    }
    // temperature=0 (deterministic) -> greedy decoding.
    if (args.temperature === 0) {
      return { kind: "greedy" };
    }
    // Seed without top_p -> top-k(50) preserves the seed.
    if (args.seed != null) {
      return { kind: "topK", top: 50, seed: args.seed };
    }
    return { kind: "defaultMode" };
  },
} as const;
