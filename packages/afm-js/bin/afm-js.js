#!/usr/bin/env node
import("../dist/main.js").catch((err) => {
  process.stderr.write(`afm-js: failed to start - ${err?.stack ?? err}\n`);
  process.exit(1);
});
