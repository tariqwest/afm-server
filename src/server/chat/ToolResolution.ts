// ============================================================================
// ToolResolution.ts — Choose which tools to send to the model:
//   - client-supplied tools take precedence;
//   - else MCP-injected tools fill in;
//   - flag the result so callers know whether they should auto-execute
//     resulting tool calls (only true for the MCP-injected case).
// Port of Sources/Core/Chat/ToolResolution.swift.
// ============================================================================

import type { OpenAITool } from "../openai/index.js";

export interface ResolvedTools {
  tools: OpenAITool[] | null;
  /** True only when MCP tools were server-injected (we auto-execute). */
  injected: boolean;
}

export const ToolResolution = {
  resolve(
    clientTools: OpenAITool[] | null | undefined,
    mcpTools: OpenAITool[] | null | undefined,
  ): ResolvedTools {
    if (clientTools && clientTools.length > 0) {
      return { tools: clientTools, injected: false };
    }
    if (mcpTools && mcpTools.length > 0) {
      return { tools: mcpTools, injected: true };
    }
    return { tools: null, injected: false };
  },
} as const;
