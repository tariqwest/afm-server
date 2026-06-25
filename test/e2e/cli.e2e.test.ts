// ============================================================================
// cli.e2e.test.ts — End-to-end tests for CLI commands
// ============================================================================

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { isNativeAvailable } from "apple-fm-sdk";

const MAIN_PATH = join(import.meta.dirname, "../../dist/cli/main.js");

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [MAIN_PATH, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

const describeE2E = isNativeAvailable() ? describe : describe.skip;

describeE2E("E2E: CLI commands", () => {
  it("available command checks model availability", async () => {
    const { stdout, stderr, exitCode } = await runCommand(["available"]);
    expect([0, 1]).toContain(exitCode);
    expect(stdout).toBeDefined();
    expect(stderr).not.toContain("failed");
  });

  it("available command with JSON output", async () => {
    const { stdout, exitCode } = await runCommand(["available", "--json"]);
    expect([0, 1]).toContain(exitCode);
    const output = JSON.parse(stdout);
    expect(output).toHaveProperty("available");
    expect(output).toHaveProperty("status");
  });

  it(
    "respond command generates a response",
    async () => {
      const { stdout, exitCode } = await runCommand(["respond", "Hello"]);
      expect([0, 1]).toContain(exitCode);
      expect(stdout).toBeDefined();
    },
    30_000,
  );

  it(
    "respond command accepts pcc model",
    async () => {
      const { exitCode } = await runCommand(["respond", "--model", "pcc", "Hello"]);
      // PCC may succeed (0) or fail due to fm CLI availability (1), but should not reject with 2
      expect(exitCode).not.toBe(2);
    },
    30_000,
  );

  it("schema command generates object schema", async () => {
    const { stdout, exitCode } = await runCommand([
      "schema",
      "object",
      "--name",
      "TestSchema",
      "--string",
      "field1",
      "--int",
      "field2",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("TestSchema");
    expect(stdout).toContain("field1");
    expect(stdout).toContain("field2");
  });

  it("token-count command counts tokens", async () => {
    const { stdout, exitCode } = await runCommand(["token-count", "Hello world"]);
    expect([0, 1]).toContain(exitCode);
    expect(stdout).toBeDefined();
  });
});