// ============================================================================
// server.ts — @hono/node-server bootstrap. Exposes startServer() so the
// umbrella CLI can spin up the API on a chosen port/host with the helper
// already wired in.
// ============================================================================

import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "./app.js";
import { HelperProcess } from "./bridge/HelperProcess.js";

export interface StartOptions {
  /** Absolute path to the afm-fm-helper binary. */
  helperBinaryPath: string;
  /** Bind port. Default 11434. */
  port?: number;
  /** Bind host. Default 127.0.0.1. */
  host?: string;
  /** Bearer token to require on requests. Null/undefined disables auth. */
  token?: string | null;
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
  const app = createApp({ helper, token: opts.token, debug });

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
                await helper.shutdown();
                res();
              });
            }),
        });
      },
    );
  });
}
