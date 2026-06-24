// ============================================================================
// version.ts — Single source of truth for the package version. Reads the
// version field from the nearest package.json at module load so /health and
// the CLI never drift from package.json on release.
// ============================================================================

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
// dist/server/version.js → ../../package.json (repo root)
const pkgPath = join(here, "..", "..", "package.json");
const pkg = require(pkgPath) as { version?: string };

export const VERSION: string = pkg.version ?? "0.0.0";
