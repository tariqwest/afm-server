# AGENTS.md — afm-server

Guide for AI agents working in this repository.

## Project summary

**afm-server** is a single-package Node.js app that exposes Apple Foundation Models through:

1. An OpenAI-compatible HTTP server (Hono)
2. A CLI binary (`afm-server`)

All inference runs **in-process** via [`apple-fm-sdk`](https://github.com/tariqwest/ts-apple-fm-sdk). There are no subprocess backends, no Swift helper, and no workspace/monorepo layout.

- **Repo:** https://github.com/tariqwest/afm-server
- **Package name:** `afm-server` (version in `package.json`)
- **Platform:** macOS 26+, Apple Silicon only (`package.json` `os`/`cpu` fields)

## Architecture

```
src/cli/          Terminal commands (citty)
    └─ imports ──► src/server/index.ts (public API)

src/server/
    app.ts        Hono routes: /health, /v1/models, /v1/chat/completions
    server.ts     @hono/node-server bootstrap (startServer)
    session/      Per-request LanguageModelSession wrapper
    sdk/          apple-fm-sdk adapter (InferenceService, ModelProvider, …)
    mcp/          stdio MCP tool injection
    validators/   Request validation (rejects pcc, unsupported params)
    errors/       AfmError taxonomy → OpenAI wire format
```

### Inference path

```
HTTP request
  → ChatRequestValidator.validate()
  → ContextManager.makeContext()     # fold messages → (instructions, prompt)
  → Session.open(inference, backend, instructions)
  → InferenceService.respond() | .stream()
  → apple-fm-sdk LanguageModelSession
  → Session.close()                  # release() in finally
```

### Session strategy

- **HTTP:** one `LanguageModelSession` per `/v1/chat/completions` request
- **CLI `chat`:** reuses a single session across REPL turns
- Multi-turn HTTP history is folded into text by `ContextManager` (Transcript API not yet wired)

### Streaming

`apple-fm-sdk` `streamResponse()` yields cumulative snapshots. `InferenceService.stream()` converts to deltas via `snapshot.slice(prev.length)` before emitting SSE chunks.

## Directory map

| Path | Purpose |
|------|---------|
| `src/server/app.ts` | Hono app factory, chat completion handler |
| `src/server/server.ts` | `startServer()`, MCP client wiring, shutdown |
| `src/server/index.ts` | Public exports (also `package.json` main) |
| `src/server/sdk/` | SDK adapter layer — start here for inference changes |
| `src/server/session/Session.ts` | Thin wrapper over `LanguageModelSession` |
| `src/server/session/ContextManager.ts` | Message folding → instructions + prompt |
| `src/server/validators/ChatRequestValidator.ts` | Model/param validation |
| `src/server/errors/AfmError.ts` | Error taxonomy + HTTP status mapping |
| `src/cli/main.ts` | CLI entry (citty subcommands) |
| `src/cli/commands/` | Individual CLI commands |
| `src/cli/inference.ts` | `createInference()` helper for CLI |
| `bin/afm-server.js` | Bin shim → `dist/cli/main.js` |
| `test/unit/` | Vitest unit tests |
| `test/e2e/` | Live CLI/server tests (require native SDK) |
| `examples/` | Standalone `apple-fm-sdk` examples (not server internals) |
| `scripts/release.js` | Release + Homebrew formula pipeline |

## Public API

Exported from `src/server/index.ts`, published as `afm-server`:

```typescript
import {
  startServer,
  createApp,
  InferenceService,
  Session,
  AfmError,
  ModelBackend,
  ModelAvailability,
} from "afm-server";
```

CLI commands import from `../../server/index.js` (relative), not from the package name.

## Commands

```bash
pnpm install          # requires ../ts-apple-fm-sdk for apple-fm-sdk link dep
pnpm run build        # tsc → dist/
pnpm test             # vitest (unit + e2e)
pnpm run test:e2e     # e2e only
pnpm run typecheck
pnpm run ci           # build + test + typecheck
pnpm run release      # GitHub release + Homebrew tap (needs GITHUB_TOKEN)
```

E2E tests call `isNativeAvailable()` from `apple-fm-sdk` and skip when bindings are missing.

## Conventions

- **ESM only** — all imports use `.js` extensions (`"module": "NodeNext"`)
- **TypeScript** — strict mode, `src/` → `dist/` mirroring
- **Lint/format** — Biome (`pnpm run check`)
- **Errors** — SDK errors flow through `SdkErrorMapper` → `AfmError` → OpenAI JSON envelope
- **Model ID** — only `system` accepted; `pcc` returns 400 with `pccUnsupported`
- **Logging prefix** — CLI messages use `afm-server:` on stderr

## SDK error → HTTP status

| SDK error | HTTP |
|-----------|------|
| `GuardrailViolationError` | 400 |
| `ExceededContextWindowSizeError` | 400 |
| `RateLimitedError` / `ConcurrentRequestsError` | 429 |
| `AssetsUnavailableError` | 503 |

## What NOT to do

- Do not reintroduce subprocess backends (`bridge/`, `fm/`, `afm-fm-helper`, `/usr/bin/fm`)
- Do not add `model: "pcc"` support until `apple-fm-sdk` ships `PrivateCloudComputeLanguageModel`
- Do not split back into a pnpm workspace monorepo without explicit direction
- Do not add `--helper` / `AFM_HELPER_PATH` flags
- `examples/` are SDK demos — don't route server code through them

## Making changes

| Task | Where to edit |
|------|---------------|
| New HTTP route | `src/server/app.ts` |
| OpenAI request schema | `src/server/openai/index.ts` |
| Validation rules | `src/server/validators/ChatRequestValidator.ts` |
| Inference behavior | `src/server/sdk/InferenceService.ts` |
| SDK error mapping | `src/server/sdk/SdkErrorMapper.ts` |
| New CLI command | `src/cli/commands/` + register in `src/cli/main.ts` |
| MCP tool injection | `src/server/mcp/McpClient.ts`, `src/server/app.ts` |

After edits: `pnpm run build && pnpm test && pnpm run typecheck`.

## Release

See `RELEASING.md`. Release artifacts:

- `afm-server-prebuilt-arm64-apple-darwin-{version}.tar.gz`
- Homebrew formula `afm-server.rb` in `tariqwest/homebrew-tap`

Env vars: `GITHUB_TOKEN`, `RELEASE_DRY_RUN`, `TAP_DIR` (default `~/.cache/afm-server-tap`).

## Related docs

- `.agents/sdk-migration-plan.md` — historical migration notes (subprocess → in-process SDK)
- `RELEASING.md` — release workflow