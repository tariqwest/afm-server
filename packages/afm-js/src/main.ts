// ============================================================================
// main.ts — Entry point for the afm-js binary. Defines the top-level CLI
// surface via citty subcommands.
// ============================================================================

import { defineCommand, runMain } from "citty";
import { availableCommand } from "./commands/available.js";
import { chatCommand } from "./commands/chat.js";
import { quotaUsageCommand } from "./commands/quota-usage.js";
import { respondCommand } from "./commands/respond.js";
import { schemaCommand } from "./commands/schema.js";
import { serveCommand } from "./commands/serve.js";
import { tokenCountCommand } from "./commands/token-count.js";

const main = defineCommand({
  meta: {
    name: "afm-js",
    version: "0.0.2",
    description:
      "Apple Foundation Models for Node.js. OpenAI-compatible HTTP server + CLI for Apple Intelligence.",
  },
  subCommands: {
    serve: serveCommand,
    respond: respondCommand,
    chat: chatCommand,
    "token-count": tokenCountCommand,
    schema: schemaCommand,
    available: availableCommand,
    "quota-usage": quotaUsageCommand,
  },
});

runMain(main);
