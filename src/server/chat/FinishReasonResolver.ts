// ============================================================================
// FinishReasonResolver.ts — Pure decision logic for OpenAI's finish_reason.
// Port of Sources/Core/Chat/FinishReasonResolver.swift.
// ============================================================================

export type FinishReason = "stop" | "length" | "toolCalls" | "contentFilter";

export const FinishReason = {
  openAIValue(r: FinishReason): "stop" | "length" | "tool_calls" | "content_filter" {
    switch (r) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "toolCalls":
        return "tool_calls";
      case "contentFilter":
        return "content_filter";
    }
  },
} as const;

export const FinishReasonResolver = {
  /**
   * Selects the OpenAI finish_reason for a completed response. Tool calls
   * take precedence over length truncation.
   */
  resolve(args: {
    hasToolCalls: boolean;
    completionTokens: number;
    maxTokens?: number | undefined;
  }): FinishReason {
    if (args.hasToolCalls) return "toolCalls";
    if (
      args.maxTokens != null &&
      args.completionTokens >= args.maxTokens &&
      args.completionTokens > 0
    ) {
      return "length";
    }
    return "stop";
  },
} as const;
