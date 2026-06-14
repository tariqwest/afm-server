import { describe, expect, test } from "vitest";
import { ToolCallHandler } from "../src/tools/ToolCallHandler.js";

describe("ToolCallHandler.detectToolCall — happy paths", () => {
  test("clean JSON object with one tool call", () => {
    const response = JSON.stringify({
      tool_calls: [
        { id: "call_a", type: "function", function: { name: "add", arguments: '{"a":1,"b":2}' } },
      ],
    });
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls).not.toBeNull();
    expect(calls?.length).toBe(1);
    expect(calls?.[0]?.id).toBe("call_a");
    expect(calls?.[0]?.name).toBe("add");
    expect(calls?.[0]?.argumentsString).toBe('{"a":1,"b":2}');
  });

  test("multiple tool calls in one envelope", () => {
    const response = JSON.stringify({
      tool_calls: [
        { id: "1", function: { name: "a", arguments: "{}" } },
        { id: "2", function: { name: "b", arguments: "{}" } },
      ],
    });
    expect(ToolCallHandler.detectToolCall(response)?.length).toBe(2);
  });

  test("JSON inside ```json … ``` markdown fence", () => {
    const response = `Here you go:\n\n\`\`\`json
{"tool_calls":[{"id":"x","function":{"name":"ping","arguments":"{}"}}]}
\`\`\``;
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.name).toBe("ping");
  });

  test("JSON inside bare ``` ``` fence (no language tag)", () => {
    const response = "Before\n\n```\n{\"tool_calls\":[{\"id\":\"y\",\"function\":{\"name\":\"q\",\"arguments\":\"{}\"}}]}\n```";
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.name).toBe("q");
  });

  test("JSON after a preamble (no fence)", () => {
    const response = `Sure, here you go: {"tool_calls":[{"id":"z","function":{"name":"calc","arguments":"{\\"v\\":1}"}}]} done`;
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.name).toBe("calc");
  });
});

describe("ToolCallHandler.detectToolCall — both function-name shapes", () => {
  test('alt shape: {"function":"name", "arguments":"..."}', () => {
    const response = JSON.stringify({
      tool_calls: [{ id: "alt-1", function: "shortcut", arguments: '{"k":"v"}' }],
    });
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.name).toBe("shortcut");
    expect(calls?.[0]?.argumentsString).toBe('{"k":"v"}');
  });

  test("both shapes are accepted in the same array", () => {
    const response = JSON.stringify({
      tool_calls: [
        { id: "1", function: { name: "a", arguments: "{}" } },
        { id: "2", function: "b", arguments: "{}" },
      ],
    });
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.map((c) => c.name)).toEqual(["a", "b"]);
  });
});

describe("ToolCallHandler.detectToolCall — edge cases & repair", () => {
  test("'}' inside a quoted argument string does NOT close the outer object early", () => {
    // The id contains '}' which would confuse a naive brace scanner.
    const response = `{"tool_calls":[{"id":"call_a}b","function":{"name":"echo","arguments":"{\\"text\\":\\"hi}\\"}"}}]}`;
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.id).toBe("call_a}b");
    expect(calls?.[0]?.name).toBe("echo");
  });

  test("unclosed tool_calls array is repaired by inserting a missing ]", () => {
    // Note the missing ']' before the final '}'.
    const response = `{"tool_calls":[{"id":"r","function":{"name":"repair","arguments":"{}"}}}`;
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.[0]?.name).toBe("repair");
  });

  test("normal text reply returns null", () => {
    expect(ToolCallHandler.detectToolCall("Hello, world!")).toBeNull();
    expect(ToolCallHandler.detectToolCall("Here is a list: 1, 2, 3.")).toBeNull();
  });

  test("malformed JSON inside tool_calls returns null", () => {
    expect(ToolCallHandler.detectToolCall("{\"tool_calls\": this is not json}")).toBeNull();
  });

  test("empty tool_calls array returns null", () => {
    expect(ToolCallHandler.detectToolCall('{"tool_calls":[]}')).toBeNull();
  });

  test("missing id on a call drops just that call but keeps the rest", () => {
    const response = JSON.stringify({
      tool_calls: [{ function: { name: "a", arguments: "{}" } }, { id: "ok", function: { name: "b", arguments: "{}" } }],
    });
    const calls = ToolCallHandler.detectToolCall(response);
    expect(calls?.length).toBe(1);
    expect(calls?.[0]?.id).toBe("ok");
  });
});

describe("ToolCallHandler.ensureJSONArguments", () => {
  test("empty -> '{}'", () => {
    expect(ToolCallHandler.ensureJSONArguments("")).toBe("{}");
    expect(ToolCallHandler.ensureJSONArguments("   ")).toBe("{}");
  });

  test("already an object passes through verbatim", () => {
    expect(ToolCallHandler.ensureJSONArguments('{"a":1}')).toBe('{"a":1}');
  });

  test("already an array passes through verbatim", () => {
    expect(ToolCallHandler.ensureJSONArguments("[1,2,3]")).toBe("[1,2,3]");
  });

  test('plain string wraps as {"value":"…"}', () => {
    expect(ToolCallHandler.ensureJSONArguments("desktop")).toBe('{"value":"desktop"}');
  });

  test("special characters in plain string are escaped via JSON.stringify", () => {
    expect(ToolCallHandler.ensureJSONArguments('he said "hi"')).toBe('{"value":"he said \\"hi\\""}');
  });
});

describe("ToolCallHandler.stripToolCallJSON", () => {
  test("removes a trailing tool_calls block", () => {
    const input = `Some text. {"tool_calls":[{"id":"a"}]}`;
    expect(ToolCallHandler.stripToolCallJSON(input)).toBe("Some text.");
  });

  test("returns trimmed input when no tool_calls marker present", () => {
    expect(ToolCallHandler.stripToolCallJSON("  hello  ")).toBe("hello");
  });
});

describe("ToolCallHandler.build* prompt builders", () => {
  test("output-format instructions include the function names", () => {
    const text = ToolCallHandler.buildOutputFormatInstructions(["search", "echo"]);
    expect(text).toContain("(search, echo)");
    expect(text).toContain('"tool_calls"');
  });

  test("output-format instructions handle the no-tools case", () => {
    const text = ToolCallHandler.buildOutputFormatInstructions([]);
    expect(text).not.toContain("()");
  });

  test("fallback prompt is empty when no tools provided", () => {
    expect(ToolCallHandler.buildFallbackPrompt([])).toBe("");
  });

  test("fallback prompt embeds tool name and parsed parameters", () => {
    const text = ToolCallHandler.buildFallbackPrompt([
      {
        name: "add",
        description: "Add two numbers",
        parametersJSON: '{"type":"object","properties":{"a":{"type":"number"}}}',
      },
    ]);
    expect(text).toContain('"name": "add"');
    expect(text).toContain('"description": "Add two numbers"');
    expect(text).toContain('"properties"');
  });
});
