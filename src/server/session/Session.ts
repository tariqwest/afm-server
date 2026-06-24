// ============================================================================
// Session.ts — Per-request LanguageModelSession wrapper over InferenceService.
// ============================================================================

import type { LanguageModelSession } from "apple-fm-sdk";
import { AfmError } from "../errors/AfmError.js";
import type { ModelBackend } from "../backend/ModelBackend.js";
import {
  InferenceService,
  type InferenceRespondResult,
  type InferenceStreamEvent,
} from "../sdk/InferenceService.js";

export interface SessionOptions {
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

export type SessionRespondResult = InferenceRespondResult;

export class Session {
  private constructor(
    private readonly inference: InferenceService,
    private readonly sdkSession: LanguageModelSession,
    public readonly backend: ModelBackend,
  ) {}

  static open(
    inference: InferenceService,
    backend: ModelBackend,
    instructions?: string,
  ): Session {
    try {
      const sdkSession = inference.openSession(backend, instructions);
      return new Session(inference, sdkSession, backend);
    } catch (err) {
      throw AfmError.classify(err);
    }
  }

  async respond(prompt: string, options?: SessionOptions): Promise<SessionRespondResult> {
    return this.inference.respond(this.sdkSession, prompt, options);
  }

  async *stream(
    prompt: string,
    options?: SessionOptions,
    signal?: AbortSignal,
  ): AsyncGenerator<InferenceStreamEvent, void, void> {
    yield* this.inference.stream(this.sdkSession, prompt, options, signal);
  }

  async close(): Promise<void> {
    try {
      this.sdkSession.release();
    } catch {
      // Best-effort: a failed close is non-fatal.
    }
  }
}

export type StreamEvent = InferenceStreamEvent;