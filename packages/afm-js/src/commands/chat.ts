// ============================================================================
// chat.ts — `afm-js chat`. Multi-turn REPL via node:readline. Streams the
// model's responses token-by-token so the user sees output as it arrives.
// ============================================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { HelperProcess, Session, UnifiedBackend } from "@afm-js/server";

export const chatCommand = defineCommand({
  meta: {
    name: "chat",
    description: "Interactive multi-turn chat REPL.",
  },
  args: {
    model: {
      type: "string",
      description: "Model to use: 'system' (on-device, default) or 'pcc' (Private Cloud Compute).",
      default: "system",
    },
    instructions: { type: "string", description: "Optional system instructions." },
    helper: { type: "string", description: "Override the afm-fm-helper binary path." },
  },
  async run({ args }) {
    if (!input.isTTY) {
      process.stderr.write("afm-js chat: requires an interactive terminal (stdin must be a TTY)\n");
      process.exit(2);
    }
    const helper = new HelperProcess({
      binaryPath: resolveHelperPath(args.helper as string | undefined),
    });
    helper.start();
    const backend = UnifiedBackend.createHelper(helper);

    const modelBackend = args.model === "pcc" ? ("privateCloudCompute" as const) : ("onDevice" as const);
    const session = await Session.open(backend, modelBackend, args.instructions as string | undefined);

    const rl = createInterface({ input, output });
    const modelName = args.model === "pcc" ? "PCC" : "on-device";
    process.stdout.write(
      `afm-js chat (${modelName}). Ctrl-D to exit.\n`,
    );

    try {
      while (true) {
        const line = await rl.question("you> ").catch(() => null);
        if (line == null) break;
        if (line.trim() === "") continue;
        process.stdout.write("assistant> ");
        try {
          for await (const event of session.stream(line)) {
            if (event.kind === "delta") {
              process.stdout.write(event.text);
            }
          }
          process.stdout.write("\n");
        } catch (err) {
          process.stdout.write("\n");
          process.stderr.write(`afm-js: error - ${err instanceof Error ? err.message : err}\n`);
        }
      }
    } finally {
      rl.close();
      await session.close();
      await helper.shutdown();
      process.stdout.write("\nGoodbye.\n");
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
