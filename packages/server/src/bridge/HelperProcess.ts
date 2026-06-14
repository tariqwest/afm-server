// ============================================================================
// HelperProcess.ts — Spawns afm-fm-helper, multiplexes id-correlated
// newline-JSON requests over its stdin/stdout, and surfaces typed errors.
// One instance per server lifetime; sessions are scoped to the helper.
// ============================================================================

import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { AfmError } from "@afm-js/core";

export interface HelperRequest {
  op:
    | "availability"
    | "openSession"
    | "respond"
    | "closeSession"
    | "shutdown";
  backend?: "on_device" | "pcc";
  session?: string;
  prompt?: string;
  instructions?: string;
  options?: { temperature?: number; maxTokens?: number; seed?: number };
}

export interface HelperOkAvailability {
  ok: true;
  id: string;
  status:
    | "available"
    | "appleIntelligenceNotEnabled"
    | "deviceNotEligible"
    | "modelNotReady"
    | "unknownUnavailable";
}

export interface HelperOkOpenSession {
  ok: true;
  id: string;
  session: string;
}

export interface HelperOkRespond {
  ok: true;
  id: string;
  content: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface HelperOkSimple {
  ok: true;
  id: string;
}

export interface HelperErrorEnvelope {
  ok: false;
  id: string;
  error: { kind: string; reason?: string; message: string };
}

export type HelperReply =
  | HelperOkAvailability
  | HelperOkOpenSession
  | HelperOkRespond
  | HelperOkSimple
  | HelperErrorEnvelope;

type Pending = {
  resolve: (value: HelperReply) => void;
  reject: (err: unknown) => void;
};

export interface HelperProcessOptions {
  /** Absolute path to the afm-fm-helper binary. */
  binaryPath: string;
  /** Debug log function; defaults to no-op. */
  debug?: (msg: string) => void;
}

export class HelperProcess {
  private readonly binaryPath: string;
  private readonly debug: (msg: string) => void;
  private child: ChildProcess | null = null;
  private buffer = "";
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private shuttingDown = false;

  constructor(opts: HelperProcessOptions) {
    this.binaryPath = opts.binaryPath;
    this.debug = opts.debug ?? (() => {});
  }

  /** Spawn the helper if not already running. Idempotent. */
  start(): void {
    if (this.child) return;
    this.debug(`spawning ${this.binaryPath}`);
    this.child = spawn(this.binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });

    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => this.debug(`helper stderr: ${chunk.trim()}`));

    this.child.on("exit", (code, signal) => {
      this.debug(`helper exited code=${code} signal=${signal}`);
      this.failAllPending(
        new Error(`afm-fm-helper exited unexpectedly (code=${code}, signal=${signal})`),
      );
      this.child = null;
    });

    this.child.on("error", (err) => {
      this.debug(`helper spawn error: ${err}`);
      this.failAllPending(err);
      this.child = null;
    });
  }

  /** Send a request, await its id-correlated reply. */
  async request(req: HelperRequest, timeoutMs = 60_000): Promise<HelperReply> {
    if (this.shuttingDown) {
      throw new Error("HelperProcess is shutting down");
    }
    this.start();
    if (!this.child?.stdin) {
      throw new Error("HelperProcess: stdin not available");
    }
    const id = `r${++this.nextId}`;
    const envelope = { id, ...req };
    const line = `${JSON.stringify(envelope)}\n`;

    const replyPromise = new Promise<HelperReply>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.child.stdin.write(line);

    const timeoutPromise = (async () => {
      await delay(timeoutMs);
      throw new Error(`HelperProcess: request '${req.op}' timed out after ${timeoutMs}ms`);
    })();

    try {
      return await Promise.race([replyPromise, timeoutPromise]);
    } finally {
      this.pending.delete(id);
    }
  }

  /**
   * Convenience wrapper that throws a typed AfmError on an `ok: false` reply
   * and returns the success-path reply otherwise. Callers that need to
   * inspect the raw envelope can still use `request()` directly.
   */
  async call<T extends HelperReply>(req: HelperRequest): Promise<T & { ok: true }> {
    const reply = await this.request(req);
    if (reply.ok) {
      return reply as T & { ok: true };
    }
    const err = reply.error;
    // Convert wire envelope to AfmError. The kinds align by name.
    switch (err.kind) {
      case "pccUnavailable":
        throw AfmError.classify({ kind: "pccUnavailable", reason: err.reason ?? err.message });
      case "pccQuotaExceeded":
        throw AfmError.classify({ kind: "pccQuotaExceeded" });
      case "pccNetworkFailure":
        throw AfmError.classify({ kind: "pccNetworkFailure", message: err.message });
      case "decodingFailure":
        throw AfmError.classify({ kind: "decodingFailure", message: err.message });
      default:
        throw AfmError.classify({ kind: "unknown", message: err.message });
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (!this.child) return;
    try {
      await this.request({ op: "shutdown" }, 2_000).catch(() => {});
    } finally {
      this.child?.kill("SIGTERM");
      this.child = null;
    }
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let nlIdx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard line-framing pattern
    while ((nlIdx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 1);
      if (line.trim() === "") continue;
      let parsed: HelperReply;
      try {
        parsed = JSON.parse(line) as HelperReply;
      } catch (err) {
        this.debug(`helper: malformed reply line dropped (${err}): ${line}`);
        continue;
      }
      const pending = this.pending.get(parsed.id);
      if (!pending) {
        this.debug(`helper: reply for unknown id ${parsed.id}, dropping`);
        continue;
      }
      pending.resolve(parsed);
    }
  }

  private failAllPending(err: unknown): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }
}
