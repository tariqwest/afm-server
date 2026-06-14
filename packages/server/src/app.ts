// ============================================================================
// app.ts — Hono application factory. Registers the routes that mirror
// apfel-plus's Server.swift: /health, /v1/models, /v1/chat/completions.
// ============================================================================

import { Hono } from "hono";
import { AfmError, ChatCompletionRequest, ChatRequestValidator, ModelBackend } from "@afm-js/core";
import type { HelperProcess } from "./bridge/HelperProcess.js";
import { Session } from "./session/Session.js";

export interface AppConfig {
  /** Bearer token clients must present. Set to null/undefined to disable auth. */
  token?: string | null;
  /** Helper-binary proxy used to fulfil chat completion requests. */
  helper: HelperProcess;
  /** Debug log function. */
  debug?: (msg: string) => void;
}

export function createApp(config: AppConfig): Hono {
  const app = new Hono();
  const debug = config.debug ?? (() => {});

  // MARK: - Bearer auth
  app.use("*", async (c, next) => {
    if (!config.token) {
      await next();
      return;
    }
    // /health doesn't require auth so health checks survive a misconfigured client.
    if (c.req.path === "/health") {
      await next();
      return;
    }
    const header = c.req.header("authorization") ?? "";
    if (header !== `Bearer ${config.token}`) {
      return c.json(
        {
          error: {
            message: "Missing or invalid bearer token.",
            type: "invalid_request_error",
          },
        },
        401,
        { "WWW-Authenticate": "Bearer" },
      );
    }
    await next();
  });

  // MARK: - /health
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      model: "apple-foundationmodel",
      version: "0.0.1",
    });
  });

  // MARK: - /v1/models
  app.get("/v1/models", (c) => {
    const sharedParams = [
      "temperature",
      "max_tokens",
      "seed",
      "stream",
      "tools",
      "tool_choice",
      "response_format",
    ];
    const unsupported = ["logprobs", "n", "stop", "presence_penalty", "frequency_penalty"];
    return c.json({
      object: "list",
      data: [
        {
          id: "apple-foundationmodel",
          object: "model",
          created: 1719792000,
          owned_by: "apple",
          context_window: 4096,
          supported_parameters: sharedParams,
          unsupported_parameters: unsupported,
          notes:
            "Apple on-device model via FoundationModels framework. " +
            "Unsupported parameters are rejected with 400 when present (except n=1 and logprobs=false).",
        },
        // PCC entry advertised unconditionally; the helper returns the typed
        // pccUnavailable error at request time on ineligible hosts.
        {
          id: "apple-foundationmodel-pcc",
          object: "model",
          created: 1749340800,
          owned_by: "apple",
          context_window: 32_768,
          supported_parameters: sharedParams,
          unsupported_parameters: unsupported,
          notes:
            "Apple Private Cloud Compute via FoundationModels framework (macOS 27+). " +
            "32K context, no API keys. Opt in per request with " +
            'model: "apple-foundationmodel-pcc" (aliases: pcc, apfel-pcc).',
        },
      ],
    });
  });

  // MARK: - POST /v1/chat/completions
  app.post("/v1/chat/completions", async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(
        { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
        400,
      );
    }

    const parsed = ChatCompletionRequest.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            message: `Request body validation failed: ${parsed.error.message}`,
            type: "invalid_request_error",
          },
        },
        400,
      );
    }
    const request = parsed.data;

    const failure = ChatRequestValidator.validate(request);
    if (failure) {
      debug(ChatRequestValidator.event(failure));
      return c.json(
        {
          error: {
            message: ChatRequestValidator.message(failure),
            type: "invalid_request_error",
          },
        },
        400,
      );
    }

    if (request.stream) {
      // M1 deliberately stubs streaming. M2 wires in Hono's streamSSE helper.
      return c.json(
        {
          error: {
            message:
              "Streaming is not yet implemented in afm-js v0.0.1. Set stream:false and retry.",
            type: "server_error",
          },
        },
        501,
      );
    }

    const backend = ModelBackend.fromModelName(request.model);

    // Build a synthetic 'instructions' string from a leading system message,
    // matching apfel-plus's ContextManager: system messages become
    // Transcript.Instructions on the helper side.
    const systemMessage = request.messages.find((m) => m.role === "system");
    const instructions = typeof systemMessage?.content === "string"
      ? systemMessage.content
      : undefined;

    // The last user/tool message is the prompt; everything else is context
    // we will support in M2's ContextManager port. M1 simplification: only
    // the last user message is sent.
    const lastMessage = request.messages.at(-1);
    if (!lastMessage || lastMessage.role !== "user") {
      return c.json(
        {
          error: {
            message: "M1: only single-turn user prompts are supported. Multi-turn lands in M2.",
            type: "invalid_request_error",
          },
        },
        400,
      );
    }
    const promptText =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : (lastMessage.content ?? [])
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");

    let session: Session;
    try {
      session = await Session.open(config.helper, backend, instructions);
    } catch (err) {
      const classified = AfmError.reclassifyForBackend(AfmError.classify(err), backend);
      return c.json(
        {
          error: {
            message: AfmError.openAIMessage(classified),
            type: AfmError.openAIType(classified),
          },
        },
        AfmError.httpStatusCode(classified) as 400 | 401 | 403 | 404 | 429 | 500 | 503,
      );
    }

    try {
      const result = await session.respond(promptText, {
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        seed: request.seed,
      });
      return c.json({
        id: `chatcmpl-${cryptoRandomId()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: ModelBackend.canonicalModelID(backend),
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: result.content },
            finish_reason: result.finishReason,
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        },
      });
    } catch (err) {
      const classified = AfmError.reclassifyForBackend(AfmError.classify(err), backend);
      debug(`chat completion error: ${AfmError.cliLabel(classified)} ${AfmError.openAIMessage(classified)}`);
      return c.json(
        {
          error: {
            message: AfmError.openAIMessage(classified),
            type: AfmError.openAIType(classified),
          },
        },
        AfmError.httpStatusCode(classified) as 400 | 401 | 403 | 404 | 429 | 500 | 503,
      );
    } finally {
      await session.close();
    }
  });

  return app;
}

function cryptoRandomId(): string {
  // 12-char base16 — matches apfel-plus's chatcmpl-xxxxxxxxxxxx shape.
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
