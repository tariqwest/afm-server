// ============================================================================
// FmProcessManager.ts — Spawn and manage /usr/bin/fm serve --socket lifecycle
// ============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";

export const FM_BINARY_PATH = "/usr/bin/fm";

export interface FmProcess {
  process: ChildProcess;
  socketPath: string;
}

export class FmProcessManager {
  private process: ChildProcess | null = null;
  private socketPath: string;
  private shuttingDown = false;

  constructor(socketPath?: string) {
    this.socketPath = socketPath ?? this.generateSocketPath();
  }

  private generateSocketPath(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `/tmp/afm-js-fm-${timestamp}-${random}.sock`;
  }

  /**
   * Check if /usr/bin/fm exists and is executable
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await access(FM_BINARY_PATH, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn fm serve --socket and wait for it to be ready
   */
  async spawn(timeoutMs = 10000): Promise<FmProcess> {
    // Clean up any existing socket file
    try {
      await unlink(this.socketPath);
    } catch {
      // File may not exist, that's fine
    }

    const proc = spawn(FM_BINARY_PATH, ["serve", "--socket", this.socketPath], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    this.process = proc;

    // Handle stderr for debugging
    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString("utf-8").trim();
      if (msg) {
        console.error(`[fm] ${msg}`);
      }
    });

    // Wait for socket to be ready
    await this.waitForReady(timeoutMs);

    // Setup cleanup handlers
    this.setupCleanup();

    return {
      process: proc,
      socketPath: this.socketPath,
    };
  }

  /**
   * Poll socket until it's accepting connections
   */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const conn = createConnection(this.socketPath);
        await new Promise<void>((resolve, reject) => {
          conn.on("connect", () => {
            conn.destroy();
            resolve();
          });
          conn.on("error", reject);
        });
        return; // Connected successfully
      } catch {
        // Not ready yet, wait and retry
        await delay(100);
      }
    }

    throw new Error(`fm serve did not become ready within ${timeoutMs}ms`);
  }

  /**
   * Setup SIGTERM/SIGINT handlers for cleanup
   */
  private setupCleanup(): void {
    const cleanup = async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      await this.shutdown();
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    process.on("exit", cleanup);

    // Handle child process exit
    this.process?.on("exit", (code) => {
      if (!this.shuttingDown) {
        console.error(`fm process exited unexpectedly with code ${code}`);
      }
    });
  }

  /**
   * Shutdown the fm process and cleanup socket
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");

      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (!this.process?.killed) {
            this.process?.kill("SIGKILL");
          }
          resolve();
        }, 2000);

        this.process?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Remove socket file
    try {
      await unlink(this.socketPath);
    } catch {
      // File may not exist
    }

    this.process = null;
  }

  getSocketPath(): string {
    return this.socketPath;
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
