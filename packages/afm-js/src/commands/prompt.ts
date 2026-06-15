// ============================================================================
// prompt.ts — `afm-js prompt "..."`. Send a single prompt, print the answer.
// `--json` emits a tiny machine-readable envelope so shell scripts can pipe
// the result safely.
// ============================================================================

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { HelperProcess, Session, UnifiedBackend } from "@afm-js/server";
import { ModelBackend } from "@afm-js/core";

export const promptCommand = defineCommand({
  meta: {
    name: "prompt",
    description: "Send a single prompt and print the response.",
  },
  args: {
    text: {
      type: "positional",
      required: false,
      description: "The prompt text. If omitted, reads from stdin.",
    },
    pcc: {
      type: "boolean",
      description:
        "Route the request to Apple Private Cloud Compute instead of the on-device model.",
    },
    json: {
      type: "boolean",
      description: "Emit a JSON envelope instead of plain text.",
    },
    system: {
      type: "string",
      description: "Optional system prompt.",
    },
    helper: {
      type: "string",
      description: "Override the afm-fm-helper binary path.",
    },
  },
  async run({ args }) {
    const promptText = args.text
      ? String(args.text)
      : await readAllStdin();
    if (!promptText.trim()) {
      process.stderr.write("afm-js: no prompt provided\n");
      process.exit(2);
    }

    const helper = new HelperProcess({ binaryPath: resolveHelperPath(args.helper as string | undefined) });
    helper.start();
    const backend = UnifiedBackend.createHelper(helper);

    const modelBackend = args.pcc ? ("privateCloudCompute" as const) : ("onDevice" as const);
    const session = await Session.open(backend, modelBackend, args.system as string | undefined);
    try {
      const result = await session.respond(promptText);
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            model: ModelBackend.canonicalModelID(modelBackend),
            content: result.content,
            finish_reason: result.finishReason,
            usage: result.usage,
          })}\n`,
        );
      } else {
        process.stdout.write(`${result.content}\n`);
      }
    } finally {
      await session.close();
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
