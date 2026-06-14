import { describe, expect, test } from "vitest";
import { OriginValidator } from "../src/security/OriginValidator.js";

describe("OriginValidator.isAllowed", () => {
  const defaults = OriginValidator.defaultAllowedOrigins;

  test("null origin always allowed (non-browser requests)", () => {
    expect(OriginValidator.isAllowed(null, defaults)).toBe(true);
    expect(OriginValidator.isAllowed(undefined, defaults)).toBe(true);
    expect(OriginValidator.isAllowed(null, [])).toBe(true);
  });

  test("default origins pass exact match", () => {
    expect(OriginValidator.isAllowed("http://127.0.0.1", defaults)).toBe(true);
    expect(OriginValidator.isAllowed("http://localhost", defaults)).toBe(true);
    expect(OriginValidator.isAllowed("http://[::1]", defaults)).toBe(true);
  });

  test("port suffix matches the bare-host prefix", () => {
    expect(OriginValidator.isAllowed("http://localhost:3000", defaults)).toBe(true);
    expect(OriginValidator.isAllowed("http://127.0.0.1:8080", defaults)).toBe(true);
  });

  test("foreign origin is rejected", () => {
    expect(OriginValidator.isAllowed("https://example.com", defaults)).toBe(false);
    expect(OriginValidator.isAllowed("http://evil.com", defaults)).toBe(false);
  });

  test("empty allowlist denies any non-null origin", () => {
    expect(OriginValidator.isAllowed("http://localhost", [])).toBe(false);
  });

  test("'*' allows any non-null origin", () => {
    expect(OriginValidator.isAllowed("https://anywhere.example", ["*"])).toBe(true);
  });
});

describe("OriginValidator.isValidToken", () => {
  test("no expected token disables auth", () => {
    expect(OriginValidator.isValidToken(null, null)).toBe(true);
    expect(OriginValidator.isValidToken(null, "")).toBe(true);
    expect(OriginValidator.isValidToken("anything", null)).toBe(true);
  });

  test("missing provided token fails", () => {
    expect(OriginValidator.isValidToken(null, "secret")).toBe(false);
    expect(OriginValidator.isValidToken(undefined, "secret")).toBe(false);
  });

  test("length mismatch fails fast", () => {
    expect(OriginValidator.isValidToken("short", "longer")).toBe(false);
  });

  test("exact match passes", () => {
    expect(OriginValidator.isValidToken("sk-correct", "sk-correct")).toBe(true);
  });

  test("byte mismatch fails", () => {
    expect(OriginValidator.isValidToken("sk-wrongggg", "sk-correctt")).toBe(false);
  });
});
