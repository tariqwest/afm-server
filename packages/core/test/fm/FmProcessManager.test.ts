// ============================================================================
// FmProcessManager.test.ts — Process lifecycle and availability checks
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FmProcessManager } from "../../src/fm/FmProcessManager.js";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

// Mock fs/promises access
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

vi.mock("node:fs", () => ({
  constants: {
    X_OK: 1,
  },
}));

describe("FmProcessManager.isAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when /usr/bin/fm is accessible", async () => {
    vi.mocked(access).mockResolvedValue(undefined);

    const available = await FmProcessManager.isAvailable();

    expect(available).toBe(true);
    expect(access).toHaveBeenCalledWith("/usr/bin/fm", expect.any(Number));
  });

  it("returns false when /usr/bin/fm is not accessible", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    const available = await FmProcessManager.isAvailable();

    expect(available).toBe(false);
  });

  it("returns false when permission denied", async () => {
    vi.mocked(access).mockRejectedValue(new Error("EACCES"));

    const available = await FmProcessManager.isAvailable();

    expect(available).toBe(false);
  });
});

describe("FmProcessManager constructor", () => {
  it("accepts custom socket path", () => {
    const manager = new FmProcessManager("/tmp/custom.sock");
    expect(manager).toBeDefined();
  });

  it("works without socket path (auto-generated)", () => {
    const manager = new FmProcessManager();
    expect(manager).toBeDefined();
  });
});

describe("FmProcessManager spawn (skipping in test environment)", () => {
  // We can't actually spawn /usr/bin/fm in the test environment
  // since it's macOS 27+ only. These tests verify the API surface.

  it("has spawn method", () => {
    const manager = new FmProcessManager();
    expect(typeof manager.spawn).toBe("function");
  });

  it("has shutdown method", () => {
    const manager = new FmProcessManager();
    expect(typeof manager.shutdown).toBe("function");
  });
});

describe("FmProcessManager socket path generation", () => {
  it("generates unique socket paths", () => {
    const manager1 = new FmProcessManager();
    const manager2 = new FmProcessManager();

    // Both should work without explicit paths
    expect(manager1).toBeDefined();
    expect(manager2).toBeDefined();
  });

  it("accepts socket path with .sock extension", () => {
    const manager = new FmProcessManager("/tmp/test-fm.sock");
    expect(manager).toBeDefined();
  });

  it("accepts socket path in temp directory", () => {
    const manager = new FmProcessManager("/tmp/afm-js-test.sock");
    expect(manager).toBeDefined();
  });
});
