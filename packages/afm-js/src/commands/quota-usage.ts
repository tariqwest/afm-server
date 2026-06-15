// ============================================================================
// quota-usage.ts — `afm-js quota-usage`. Check PCC quota usage.
// Mirrors Apple's `fm quota-usage` command.
// ============================================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { HelperProcess, UnifiedBackend } from "@afm-js/server";

export const quotaUsageCommand = defineCommand({
  meta: {
    name: "quota-usage",
    description: "Check Private Cloud Compute (PCC) quota usage.",
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
      // Try to get quota info - this may not be supported by all backends
      const reply = await backend.call({ op: "quotaUsage" });
      
      const used = reply.used as number | undefined;
      const limit = reply.limit as number | undefined;
      const remaining = reply.remaining as number | undefined;
      
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            used: used ?? null,
            limit: limit ?? null,
            remaining: remaining ?? null,
          })}\n`,
        );
      } else {
        if (used !== undefined && limit !== undefined) {
          process.stdout.write(`PCC Quota: ${used} / ${limit} used\n`);
          if (remaining !== undefined) {
            process.stdout.write(`Remaining: ${remaining}\n`);
          }
        } else {
          process.stdout.write("PCC quota information not available.\n");
        }
      }
    } catch (err) {
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            used: null,
            limit: null,
            remaining: null,
            error: String(err),
          })}\n`,
        );
      } else {
        process.stdout.write("PCC quota information not available.\n");
      }
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
