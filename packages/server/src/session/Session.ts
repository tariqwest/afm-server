// ============================================================================
// Session.ts — Thin facade over the helper-process session lifecycle.
// Open a session, dispatch respond/stream, close on shutdown. Backend
// dispatch and PCC availability live on the helper side; this file is just
// the Node-side mirror.
// ============================================================================

import { AfmError, type ModelBackend } from "@afm-js/core";
import type { HelperProcess } from "../bridge/HelperProcess.js";

export interface SessionOptions {
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

export interface SessionRespondResult {
  content: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export class Session {
  private constructor(
    private readonly helper: HelperProcess,
    public readonly id: string,
    public readonly backend: ModelBackend,
  ) {}

  /**
   * Open a session against the requested backend. Surfaces a typed
   * AfmError.pccUnavailable if PCC was asked for on an ineligible host.
   */
  static async open(
    helper: HelperProcess,
    backend: ModelBackend,
    instructions?: string,
  ): Promise<Session> {
    const reply = await helper.call({
      op: "openSession",
      backend: backend === "onDevice" ? "on_device" : "pcc",
      instructions,
    });
    if (!("session" in reply) || typeof reply.session !== "string") {
      throw AfmError.classify({
        kind: "unknown",
        message: "helper did not return a session id",
      });
    }
    return new Session(helper, reply.session, backend);
  }

  async respond(prompt: string, options?: SessionOptions): Promise<SessionRespondResult> {
    const reply = await this.helper.call({
      op: "respond",
      session: this.id,
      prompt,
      options,
    });
    if (!("content" in reply)) {
      throw AfmError.classify({
        kind: "unknown",
        message: "helper respond reply missing 'content'",
      });
    }
    return {
      content: reply.content,
      finishReason: reply.finishReason,
      usage: reply.usage,
    };
  }

  async close(): Promise<void> {
    try {
      await this.helper.call({ op: "closeSession", session: this.id });
    } catch {
      // Best-effort: a failed close is non-fatal.
    }
  }
}
