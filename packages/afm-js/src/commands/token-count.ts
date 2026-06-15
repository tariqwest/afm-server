// ============================================================================
// token-count.ts — `afm-js token-count "..."`. Count tokens without generating.
// Mirrors Apple's `fm token-count` command.
// ============================================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { HelperProcess, UnifiedBackend } from "@afm-js/server";

export const tokenCountCommand = defineCommand({
  meta: {
    name: "token-count",
    description: "Count tokens in a prompt or instructions without generating.",
  },
  args: {
    text: {
      type: "positional",
      required: false,
      description: "The text to count. If omitted, reads from stdin.",
    },
    instructions: {
      type: "string",
      description: "Instructions to include in token count.",
    },
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
    const text = args.text
      ? String(args.text)
      : await readAllStdin();
    if (!text.trim() && !args.instructions) {
      process.stderr.write("afm-js: no text or instructions provided\n");
      process.exit(2);
    }

    const helper = new HelperProcess({ binaryPath: resolveHelperPath(args.helper as string | undefined) });
    helper.start();
    const backend = UnifiedBackend.createHelper(helper);

    try {
      // Use the backend to get token count
      const reply = await backend.call({
        op: "tokenCount",
        prompt: text,
        instructions: args.instructions as string | undefined,
      });

      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            prompt_tokens: reply.promptTokens ?? 0,
            instructions_tokens: reply.instructionsTokens ?? 0,
            total_tokens: reply.totalTokens ?? 0,
          })}\n`,
        );
      } else {
        const total = reply.totalTokens ?? 0;
        process.stdout.write(`${total}\n`);
      }
    } catch (err) {
      process.stderr.write(`afm-js: token count failed: ${err}\n`);
      process.exit(1);
    } finally {
      await helper.shutdown();
    }
  },
});

async function readAllStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  return await new Promise<string>((resolveStdin) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", () => resolveStdin(Buffer.concat(chunks).toString("utf8")));
  });
}

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
