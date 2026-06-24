/**
 * Streaming Response Example
 *
 * Demonstrates streaming responses from apple-fm-sdk. streamResponse yields
 * cumulative snapshots, so we print only the delta since the previous chunk.
 */

import fm from "apple-fm-sdk";

async function main() {
  console.log("=== Streaming Response Example ===\n");

  const model = new fm.SystemLanguageModel();
  const [isAvailable, reason] = model.isAvailable();

  if (!isAvailable) {
    console.log(`Model not available: ${reason}`);
    return;
  }

  const session = new fm.LanguageModelSession({
    instructions: "You are a helpful assistant.",
  });

  const prompt = "Tell me a short story about a cat.";
  console.log(`User: ${prompt}\n`);
  process.stdout.write("Assistant: ");

  let previous = "";
  for await (const snapshot of session.streamResponse(prompt)) {
    const delta = snapshot.slice(previous.length);
    process.stdout.write(delta);
    previous = snapshot;
  }

  console.log("\n");
}

main().catch(console.error);