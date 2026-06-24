// ============================================================================
// ContextStrategy.ts — How to trim conversation history when it exceeds the
// model's context window. Pure enum + config; the actual trimming runs in
// the server's ContextManager.
// Port of Sources/Core/ContextStrategy.swift.
// ============================================================================

export type ContextStrategy =
  | "newest-first"
  | "oldest-first"
  | "sliding-window"
  | "summarize"
  | "strict";

export const ContextStrategy = {
  default: "newest-first" as ContextStrategy,
  all: ["newest-first", "oldest-first", "sliding-window", "summarize", "strict"] as const,

  isValid(value: string): value is ContextStrategy {
    return (ContextStrategy.all as readonly string[]).includes(value);
  },
} as const;

export interface ContextConfig {
  strategy: ContextStrategy;
  /** Sliding-window only: max number of message turns to retain. */
  maxTurns?: number | undefined;
  /** Reserved tokens for the model's output (default 512). */
  outputReserve: number;
  /** Whether to use permissive content guardrails when summarising. */
  permissive: boolean;
}

export const ContextConfig = {
  defaults: {
    strategy: "newest-first",
    outputReserve: 512,
    permissive: false,
  } as ContextConfig,
} as const;
