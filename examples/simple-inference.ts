/**
 * Simple Inference Example
 *
 * Demonstrates basic usage of apple-fm-sdk for non-streaming inference
 * with the on-device Foundation Models system model.
 */

import fm from "apple-fm-sdk";

async function main() {
  console.log("=== Simple Inference Example ===\n");

  const model = new fm.SystemLanguageModel();
  const [isAvailable, reason] = model.isAvailable();

  if (!isAvailable) {
    console.log(`Foundation Models not available: ${reason}`);
    return;
  }

  const session = new fm.LanguageModelSession({
    instructions: "You are a helpful assistant.",
  });

  const prompt = "Hello, how are you?";
  console.log(`User: ${prompt}\n`);

  const response = await session.respond(prompt);
  console.log(`Assistant: ${response}`);
}

main().catch(console.error);