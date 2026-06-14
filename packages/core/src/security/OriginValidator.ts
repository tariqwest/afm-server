// ============================================================================
// OriginValidator.ts — Origin-header allowlist + bearer-token equality.
// Pure helpers; the server-side middleware wires them into Hono.
// Port of Sources/Core/OriginValidator.swift.
// ============================================================================

export const OriginValidator = {
  /** Defaults: localhost variants only. */
  defaultAllowedOrigins: ["http://127.0.0.1", "http://localhost", "http://[::1]"] as const,

  /**
   * Decide whether an incoming Origin is allowed.
   *
   * - `null` origin (non-browser requests like curl/native) is always allowed.
   * - Empty allowedOrigins list: only `null` passes.
   * - `*` in allowedOrigins: any non-null origin passes.
   * - Otherwise: origin must match either the exact entry or the entry's
   *   bare-host prefix (so `http://localhost:3000` matches `http://localhost`).
   */
  isAllowed(origin: string | null | undefined, allowedOrigins: readonly string[]): boolean {
    if (origin == null) return true;
    if (allowedOrigins.length === 0) return false;
    if (allowedOrigins.includes("*")) return true;
    for (const allowed of allowedOrigins) {
      if (origin === allowed) return true;
      // Allow `http://localhost` to match `http://localhost:3000`.
      if (origin.startsWith(`${allowed}:`)) return true;
    }
    return false;
  },

  /**
   * Constant-time-ish bearer-token equality. Returns true when the server has
   * no token configured (auth disabled). When configured, the provided token
   * must exactly match.
   */
  isValidToken(provided: string | null | undefined, expected: string | null | undefined): boolean {
    if (expected == null || expected === "") return true;
    if (provided == null) return false;
    if (provided.length !== expected.length) return false;
    let mismatches = 0;
    for (let i = 0; i < provided.length; i++) {
      if (provided.charCodeAt(i) !== expected.charCodeAt(i)) mismatches++;
    }
    return mismatches === 0;
  },
} as const;
