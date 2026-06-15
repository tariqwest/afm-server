// ============================================================================
// available.ts — `afm-js available`. Check if Foundation Models are available.
// Mirrors Apple's `fm available` command.
// ============================================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { HelperProcess, UnifiedBackend } from "@afm-js/server";

export const availableCommand = defineCommand({
  meta: {
    name: "available",
    description: "Check if Foundation Models are available on this device.",
  },
  args: {
    json: {
      type: "boolean",
      description: "Emit a JSON envelope instead of plain text.",
    },
    helper: {
      type: "string",
      description: "Override the afm-fm-helper binary path.",
    },
  },
  async run({ args }) {
    const helper = new HelperProcess({ binaryPath: resolveHelperPath(args.helper as string | undefined) });
    helper.start();
    const backend = UnifiedBackend.createHelper(helper);

    try {
      const reply = await backend.call({ op: "availability" });
      
      const status = reply.status as string;
      const isAvailable = status === "available";
      
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            available: isAvailable,
            status: status,
          })}\n`,
        );
      } else {
        if (isAvailable) {
          process.stdout.write("Foundation Models are available.\n");
        } else {
          process.stdout.write(`Foundation Models are not available: ${status}\n`);
        }
      }
      
      process.exit(isAvailable ? 0 : 1);
    } catch (err) {
      process.stderr.write(`afm-js: availability check failed: ${err}\n`);
      process.exit(1);
    } finally {
      await helper.shutdown();
    }
  },
});

function resolveHelperPath(override?: string): string {
  const candidates = [
    override,
    process.env.AFM_HELPER_PATH,
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "helper",
      ".build",
      "release",
      "afm-fm-helper",
    ),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  process.stderr.write(
    "afm-js: could not locate afm-fm-helper. Set --helper or AFM_HELPER_PATH.\n",
  );
  process.exit(1);
}
