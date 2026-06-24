// ============================================================================
// StreamErrorResolver.ts — Decide whether a mid-stream error becomes a
// graceful `length` finish (partial content already emitted, model ran into
// the context ceiling) or propagates as fatal.
//
// Port of Sources/Core/Chat/StreamOutcome.swift (the resolver lives there in
// the Swift source).
// ============================================================================

import type { AfmError } from "../errors/AfmError.js";
import type { FinishReason } from "./FinishReasonResolver.js";

export interface StreamOutcome {
  content: string;
  finishReason: FinishReason;
}

export type StreamErrorResolution =
  | { kind: "truncated"; content: string }
  | { kind: "fatal"; error: AfmError };

export const StreamErrorResolver = {
  /**
   * - `prev` empty + contextOverflow -> the prompt itself is too big. Fatal.
   * - `prev` non-empty + contextOverflow -> the model ran out of room while
   *   generating. Treat as a graceful truncation; emit finish_reason: "length"
   *   and hand the partial content back to the caller.
   * - Anything else -> fatal.
   */
  resolve(prev: string, error: AfmError): StreamErrorResolution {
    if (error.kind === "contextOverflow" && prev.length > 0) {
      return { kind: "truncated", content: prev };
    }
    return { kind: "fatal", error };
  },

  /**
   * Text whose tokens count toward `completion_tokens` when a refusal arrives
   * mid-stream. Returning the concatenation (rather than summing two
   * independent token counts) lets the caller make a single token-count call
   * and avoids double-counting at the join boundary.
   */
  refusalCompletionText(prev: string, explanation: string): string {
    return prev + explanation;
  },
} as const;
