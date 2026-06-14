// ============================================================================
// BufferedLineReader.ts — newline-framed line accumulator for readable streams.
// Used by the MCP stdio client and shared with the helper bridge's framing.
//
// Port of Sources/Core/BufferedLineReader.swift.
// ============================================================================

export class BufferedLineReader {
  private buffer = "";

  /** Feed a chunk; returns any complete lines now available. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let nl: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard line-framing pattern
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }

  /** Drain any unterminated trailing content (e.g. on EOF). */
  flush(): string | null {
    if (this.buffer.length === 0) return null;
    const out = this.buffer;
    this.buffer = "";
    return out;
  }
}
