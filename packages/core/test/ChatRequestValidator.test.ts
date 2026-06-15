import { describe, expect, test } from "vitest";
import { ChatCompletionRequest } from "../src/openai/index.js";
import { ChatRequestValidator } from "../src/validators/ChatRequestValidator.js";

function makeRequest(overrides: Partial<unknown> = {}): ChatCompletionRequest {
  return ChatCompletionRequest.parse({
    model: "system",
    messages: [{ role: "user", content: "hi" }],
    ...(overrides as object),
  });
}

describe("ChatRequestValidator.validate", () => {
  test("accepts a minimal valid request", () => {
    expect(ChatRequestValidator.validate(makeRequest())).toBeNull();
  });

  test("accepts the PCC model id", () => {
    for (const model of ["pcc"]) {
      expect(ChatRequestValidator.validate(makeRequest({ model }))).toBeNull();
    }
  });

  test("model check is case-insensitive and whitespace-trimmed", () => {
    expect(ChatRequestValidator.validate(makeRequest({ model: "PCC" }))).toBeNull();
    expect(ChatRequestValidator.validate(makeRequest({ model: "  pcc  " }))).toBeNull();
  });

  test("unknown models are rejected (no fallthrough)", () => {
    const f = ChatRequestValidator.validate(makeRequest({ model: "gpt-4" }));
    expect(f).not.toBeNull();
    if (f) {
      expect(f.kind).toBe("invalidModel");
      expect(ChatRequestValidator.message(f)).toContain("'gpt-4'");
      expect(ChatRequestValidator.message(f)).toContain("Available models");
      expect(ChatRequestValidator.message(f)).toContain("pcc");
    }
  });

  test("empty messages array is rejected", () => {
    const f = ChatRequestValidator.validate(makeRequest({ messages: [] }));
    expect(f?.kind).toBe("emptyMessages");
  });

  test("last role must be user or tool", () => {
    const f = ChatRequestValidator.validate(
      makeRequest({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "there" },
        ],
      }),
    );
    expect(f?.kind).toBe("invalidLastRole");
  });

  test("rejects unsupported OpenAI parameters with a typed kind", () => {
    expect(ChatRequestValidator.validate(makeRequest({ logprobs: true }))?.kind).toBe(
      "unsupportedParameter",
    );
    expect(ChatRequestValidator.validate(makeRequest({ n: 2 }))?.kind).toBe("unsupportedParameter");
    expect(ChatRequestValidator.validate(makeRequest({ presence_penalty: 1 }))?.kind).toBe(
      "unsupportedParameter",
    );
    expect(ChatRequestValidator.validate(makeRequest({ frequency_penalty: 1 }))?.kind).toBe(
      "unsupportedParameter",
    );
    expect(ChatRequestValidator.validate(makeRequest({ stop: "STOP" }))?.kind).toBe(
      "unsupportedParameter",
    );
  });

  test("n=1 is allowed (OpenAI default)", () => {
    expect(ChatRequestValidator.validate(makeRequest({ n: 1 }))).toBeNull();
  });

  test("logprobs=false is allowed", () => {
    expect(ChatRequestValidator.validate(makeRequest({ logprobs: false }))).toBeNull();
  });

  test("image_url content parts are rejected with a clear kind", () => {
    const f = ChatRequestValidator.validate(
      makeRequest({
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: "data:image/png;base64,…" } }],
          },
        ],
      }),
    );
    expect(f?.kind).toBe("imageContent");
  });

  test("acceptedModelIDs includes system and pcc", () => {
    expect(ChatRequestValidator.acceptedModelIDs.has("system")).toBe(true);
    expect(ChatRequestValidator.acceptedModelIDs.has("pcc")).toBe(true);
  });
});

describe("ChatRequestValidator.message / event", () => {
  test("invalidModel message lists both accepted ids and PCC aliases", () => {
    const msg = ChatRequestValidator.message({ kind: "invalidModel", model: "gpt-5" });
    expect(msg).toContain("'gpt-5'");
    expect(msg).toContain("'system'");
    expect(msg).toContain("'pcc'");
  });

  test("event strings are stable for debug log scraping", () => {
    expect(ChatRequestValidator.event({ kind: "invalidModel", model: "gpt-5" })).toBe(
      "validation failed: unknown model gpt-5",
    );
    expect(ChatRequestValidator.event({ kind: "emptyMessages" })).toBe(
      "validation failed: empty messages",
    );
  });
});
