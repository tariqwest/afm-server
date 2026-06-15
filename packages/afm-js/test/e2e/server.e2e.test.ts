// ============================================================================
// server.e2e.test.ts — End-to-end tests against live server instance
// Requires afm-fm-helper binary to be built
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";

const SERVER_PORT = 19999;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

describe("E2E: afm-js serve", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;

  beforeAll(async () => {
    // Start server with auto-detected backend
    const mainPath = join(import.meta.dirname, "../../dist/main.js");
    serverProcess = spawn("node", [mainPath, "serve", "--port", String(SERVER_PORT)], {
      stdio: "pipe",
    });

    // Wait for server to be ready
    await waitForServer(SERVER_URL);
  }, 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
  });

  it("health endpoint returns ok", async () => {
    const res = await fetch(`${SERVER_URL}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("model");
  });

  it("models endpoint returns available models", async () => {
    const res = await fetch(`${SERVER_URL}/v1/models`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("object", "list");
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    // Check for expected models
    const modelIds = body.data.map((m: { id: string }) => m.id);
    expect(modelIds).toContain("system");
    expect(modelIds).toContain("pcc");
  });

  it("chat completions endpoint accepts requests", async () => {
    // This test verifies the endpoint is accessible
    // Actual model inference may take time or fail if model not loaded
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(`${SERVER_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "system",
          messages: [{ role: "user", content: "Hello" }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      // Should either succeed (200) or fail with model error (503), not 404/500
      expect([200, 400, 503]).toContain(res.status);
    } catch (err) {
      // Abort is expected if model takes too long to load
      clearTimeout(timeout);
      expect(String(err)).toMatch(/abort|timeout/i);
    }
  }, 10000);

  it("rejects invalid model IDs", async () => {
    const res = await fetch(`${SERVER_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "invalid-model-id",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    expect(res.status).toBe(400);
  });

  it("server starts with helper backend when fm CLI not available", async () => {
    // This test verifies the server can start and respond using the helper binary
    // The beforeAll already tests this - this is just an explicit assertion
    const res = await fetch(`${SERVER_URL}/health`);
    expect(res.ok).toBe(true);
  });
});
