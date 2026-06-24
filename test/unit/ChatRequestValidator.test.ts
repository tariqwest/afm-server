import { describe, it, expect } from "vitest";
import { ChatRequestValidator } from "../../src/server/validators/ChatRequestValidator.js";

describe("ChatRequestValidator", () => {
  it("rejects pcc model with a dedicated failure", () => {
    const failure = ChatRequestValidator.validate({
      model: "pcc",
      messages: [{ role: "user", content: "hi" }],
    } as never);

    expect(failure).toEqual({ kind: "pccUnsupported" });
    expect(ChatRequestValidator.message(failure!)).toContain("not supported");
  });

  it("accepts system model", () => {
    const failure = ChatRequestValidator.validate({
      model: "system",
      messages: [{ role: "user", content: "hi" }],
    } as never);

    expect(failure).toBeNull();
  });
});