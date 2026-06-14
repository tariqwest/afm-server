// ============================================================================
// ChatRequestValidator.ts — Server-side validation of a decoded chat
// request. Mirrors Swift's ChatRequestValidator: parameter rejection +
// accepted-model set + last-message-role guard.
// ============================================================================

import type { ChatCompletionRequest } from "../openai/index.js";

export type ChatRequestValidationFailure =
  | { kind: "emptyMessages" }
  | { kind: "unsupportedParameter"; name: UnsupportedChatParameter }
  | { kind: "invalidLastRole" }
  | { kind: "imageContent" }
  | { kind: "invalidParameterValue"; detail: string }
  | { kind: "invalidModel"; model: string };

export type UnsupportedChatParameter =
  | "logprobs"
  | "n"
  | "stop"
  | "presence_penalty"
  | "frequency_penalty";

export const ChatRequestValidator = {
  /**
   * Canonical on-device model name. Kept as a single constant for downstream
   * consumers; route decisions go through `ModelBackend.fromModelName`.
   */
  validModel: "apple-foundationmodel" as const,

  /**
   * The set of model ids this server accepts on `/v1/chat/completions`.
   * Matches the entries advertised by `/v1/models` and the parsing rules in
   * `ModelBackend.fromModelName`. Comparison is case-insensitive after
   * trimming whitespace.
   */
  acceptedModelIDs: new Set<string>([
    "apple-foundationmodel",
    "apple-foundationmodel-pcc",
    "pcc",
    "apfel-pcc",
  ]),

  validate(request: ChatCompletionRequest): ChatRequestValidationFailure | null {
    if (request.messages.length === 0) {
      return { kind: "emptyMessages" };
    }

    const normalized = request.model.trim().toLowerCase();
    if (!ChatRequestValidator.acceptedModelIDs.has(normalized)) {
      return { kind: "invalidModel", model: request.model };
    }

    if (request.logprobs === true) {
      return { kind: "unsupportedParameter", name: "logprobs" };
    }
    if (request.n != null && request.n !== 1) {
      return { kind: "unsupportedParameter", name: "n" };
    }
    if (request.stop != null) {
      return { kind: "unsupportedParameter", name: "stop" };
    }
    if (request.presence_penalty != null) {
      return { kind: "unsupportedParameter", name: "presence_penalty" };
    }
    if (request.frequency_penalty != null) {
      return { kind: "unsupportedParameter", name: "frequency_penalty" };
    }

    const last = request.messages.at(-1);
    if (!last || (last.role !== "user" && last.role !== "tool")) {
      return { kind: "invalidLastRole" };
    }

    if (containsImageContent(request)) {
      return { kind: "imageContent" };
    }

    return null;
  },

  message(f: ChatRequestValidationFailure): string {
    switch (f.kind) {
      case "emptyMessages":
        return "'messages' must contain at least one message";
      case "unsupportedParameter":
        return unsupportedParameterMessage(f.name);
      case "invalidLastRole":
        return "Last message must have role 'user' or 'tool'";
      case "imageContent":
        return "Image content is not supported by the Apple on-device model";
      case "invalidParameterValue":
        return f.detail;
      case "invalidModel":
        return (
          `The model '${f.model}' does not exist. Available models: ` +
          "'apple-foundationmodel' (on-device), " +
          "'apple-foundationmodel-pcc' (Private Cloud Compute; aliases: pcc, apfel-pcc)."
        );
    }
  },

  event(f: ChatRequestValidationFailure): string {
    switch (f.kind) {
      case "emptyMessages":
        return "validation failed: empty messages";
      case "unsupportedParameter":
        return `validation failed: unsupported parameter ${f.name}`;
      case "invalidLastRole":
        return "validation failed: last role != user/tool";
      case "imageContent":
        return "rejected: image content";
      case "invalidParameterValue":
        return `validation failed: ${f.detail}`;
      case "invalidModel":
        return `validation failed: unknown model ${f.model}`;
    }
  },
} as const;

function unsupportedParameterMessage(name: UnsupportedChatParameter): string {
  switch (name) {
    case "logprobs":
      return "Parameter 'logprobs' is not supported by Apple's on-device model.";
    case "n":
      return "Parameter 'n' is not supported by Apple's on-device model. Only n=1 is allowed.";
    case "stop":
      return "Parameter 'stop' is not supported by Apple's on-device model.";
    case "presence_penalty":
      return "Parameter 'presence_penalty' is not supported by Apple's on-device model.";
    case "frequency_penalty":
      return "Parameter 'frequency_penalty' is not supported by Apple's on-device model.";
  }
}

function containsImageContent(request: ChatCompletionRequest): boolean {
  for (const message of request.messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "image_url") return true;
      }
    }
  }
  return false;
}
