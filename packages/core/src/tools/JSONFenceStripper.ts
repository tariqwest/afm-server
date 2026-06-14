// ============================================================================
// JSONFenceStripper.ts — Strip ```json ... ``` markdown fences off a string
// so JSON.parse can consume what's left. Used in JSON-mode responses where
// the model wraps its output in a code fence.
// ============================================================================

export const JSONFenceStripper = {
  strip(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("```")) {
      return trimmed;
    }
    // ```json\n...\n```  or  ```\n...\n```
    const fenceClose = trimmed.lastIndexOf("```");
    if (fenceClose <= 3) {
      // No matching close fence; return original trimmed.
      return trimmed;
    }
    let inner = trimmed.slice(3, fenceClose);
    if (inner.startsWith("json\n")) inner = inner.slice(5);
    else if (inner.startsWith("json")) inner = inner.slice(4);
    return inner.trim();
  },
} as const;
