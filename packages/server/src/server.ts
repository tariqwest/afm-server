// ============================================================================
// server.ts — @hono/node-server bootstrap. Exposes startServer() so the
// umbrella CLI can spin up the API on a chosen port/host with the helper
// already wired in.
// ============================================================================

import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "./app.js";
import { HelperProcess } from "./bridge/HelperProcess.js";
import { McpStdioClient } from "./mcp/McpClient.js";

export interface McpServerSpec {
  /** Executable path or command (e.g. "python3"). */
  command: string;
  /** Args appended after `command`. */
  args?: string[];
}

export interface StartOptions {
  /** Absolute path to the afm-fm-helper binary. */
  helperBinaryPath: string;
  /** Bind port. Default 11434. */
  port?: number;
  /** Bind host. Default 127.0.0.1. */
  host?: string;
  /** Bearer token to require on requests. Null/undefined disables auth. */
  token?: string | null;
  /** Local stdio-MCP servers whose tools are injected when the client sent none. */
  mcpServers?: McpServerSpec[];
  /** Debug log callback. */
  debug?: (msg: string) => void;
}

export interface RunningServer {
  /** Shut down the HTTP listener and the helper subprocess. */
  stop: () => Promise<void>;
}

export async function startServer(opts: StartOptions): Promise<RunningServer> {
  const debug = opts.debug ?? (() => {});
  const helper = new HelperProcess({ binaryPath: opts.helperBinaryPath, debug });
  helper.start();

  const mcpClients: McpStdioClient[] = (opts.mcpServers ?? []).map(
    (s) => new McpStdioClient({ command: s.command, args: s.args, debug }),
  );

  const app = createApp({ helper, token: opts.token, debug, mcpClients });

  const port = opts.port ?? 11434;
  const hostname = opts.host ?? "127.0.0.1";

  return new Promise<RunningServer>((resolve) => {
    const server: ServerType = serve(
      { fetch: app.fetch, port, hostname },
      () => {
        debug(`afm-js listening on http://${hostname}:${port}`);
        resolve({
          stop: () =>
            new Promise<void>((res) => {
              server.close(async () => {
                await Promise.allSettled(mcpClients.map((c) => c.shutdown()));
                await helper.shutdown();
                res();
              });
            }),
        });
      },
    );
  });
}
