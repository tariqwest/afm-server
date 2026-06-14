import { describe, expect, test } from "vitest";
import { JSONFenceStripper } from "../src/tools/JSONFenceStripper.js";

describe("JSONFenceStripper.strip", () => {
  test("plain JSON without a fence is returned trimmed", () => {
    expect(JSONFenceStripper.strip(`  {"a":1}  `)).toBe('{"a":1}');
  });

  test("```json ... ``` fence is removed", () => {
    expect(JSONFenceStripper.strip('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("bare ``` ... ``` fence (no language tag) is removed", () => {
    expect(JSONFenceStripper.strip('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  test("malformed (no closing fence) returns trimmed input", () => {
    expect(JSONFenceStripper.strip('```json\n{"a":1}')).toBe('```json\n{"a":1}');
  });
});
