import { describe, expect, test } from "vitest";
import { ModelBackend } from "../src/backend/ModelBackend.js";

describe("ModelBackend", () => {
  test("default is onDevice", () => {
    expect(ModelBackend.default).toBe("onDevice");
  });

  test("canonical model ids", () => {
    expect(ModelBackend.canonicalModelID("onDevice")).toBe("apple-foundationmodel");
    expect(ModelBackend.canonicalModelID("privateCloudCompute")).toBe(
      "apple-foundationmodel-pcc",
    );
  });

  test("display labels", () => {
    expect(ModelBackend.displayLabel("onDevice")).toBe("on-device");
    expect(ModelBackend.displayLabel("privateCloudCompute")).toBe("Private Cloud Compute");
  });

  test("parse null/empty/default falls back to onDevice", () => {
    expect(ModelBackend.fromModelName(null)).toBe("onDevice");
    expect(ModelBackend.fromModelName(undefined)).toBe("onDevice");
    expect(ModelBackend.fromModelName("")).toBe("onDevice");
    expect(ModelBackend.fromModelName("default")).toBe("onDevice");
  });

  test("parse known on-device aliases", () => {
    expect(ModelBackend.fromModelName("apple-foundationmodel")).toBe("onDevice");
    expect(ModelBackend.fromModelName("Apfel")).toBe("onDevice");
  });

  test("unknown ids fall back to onDevice (forward-compat for OpenAI clients)", () => {
    expect(ModelBackend.fromModelName("gpt-4")).toBe("onDevice");
    expect(ModelBackend.fromModelName("claude-3-opus")).toBe("onDevice");
  });

  test("parse PCC aliases", () => {
    expect(ModelBackend.fromModelName("pcc")).toBe("privateCloudCompute");
    expect(ModelBackend.fromModelName("apfel-pcc")).toBe("privateCloudCompute");
    expect(ModelBackend.fromModelName("apple-foundationmodel-pcc")).toBe("privateCloudCompute");
  });

  test("parse is case-insensitive", () => {
    expect(ModelBackend.fromModelName("PCC")).toBe("privateCloudCompute");
    expect(ModelBackend.fromModelName("Apple-FoundationModel-PCC")).toBe("privateCloudCompute");
  });

  test("parse trims whitespace", () => {
    expect(ModelBackend.fromModelName("  pcc  ")).toBe("privateCloudCompute");
    expect(ModelBackend.fromModelName("\tapple-foundationmodel\n")).toBe("onDevice");
  });
});
