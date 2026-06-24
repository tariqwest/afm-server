# afm-server

OpenAI-compatible HTTP server and CLI for Apple Foundation Models on macOS. Inference runs in-process via [`apple-fm-sdk`](https://github.com/tariqwest/ts-apple-fm-sdk) — no subprocess backends, no Swift helper binary.

## What it does

- Exposes an OpenAI-compatible HTTP API (`/v1/chat/completions`, `/v1/models`, `/health`)
- Ships a CLI (`afm-server`) for `serve`, `respond`, `chat`, `token-count`, `available`, and `schema`
- Injects tools from local stdio MCP servers when clients send none
- Supports structured JSON output via `response_format`

## Model

| Model ID | Backend | Notes |
|----------|---------|-------|
| `system` | On-device `SystemLanguageModel` | Default. macOS 26+, Apple Silicon, Apple Intelligence enabled |

PCC (`model: "pcc"`) is **not supported** and returns 400.

Unknown model IDs (e.g. `gpt-4`) are rejected with 400. Only `system` is accepted.

## Requirements

- macOS 26 (Tahoe) or later, Apple Silicon (M1+)
- Apple Intelligence enabled in System Settings
- Node 20+
- [`ts-apple-fm-sdk`](https://github.com/tariqwest/ts-apple-fm-sdk) sibling checkout for local development

## Installation

### Homebrew

```bash
brew tap tariqwest/tap
brew install afm-server
afm-server serve --port 1337
```

### From source

```bash
git clone https://github.com/tariqwest/afm-server.git
git clone https://github.com/tariqwest/ts-apple-fm-sdk.git ../ts-apple-fm-sdk
cd afm-server

pnpm install
pnpm run build
afm-server serve --port 1337
```

## Architecture

afm-server is a **single Node.js package** (not a monorepo). Source is split into `src/server/` (HTTP + inference) and `src/cli/` (terminal commands).

```
afm-server CLI
    └─ src/cli/commands/serve.ts
           └─ startServer()
                  └─ createApp()          [Hono routes]
                         └─ Session.open()
                                └─ InferenceService
                                       └─ apple-fm-sdk (in-process FFI)
                                              └─ SystemLanguageModel
                                              └─ LanguageModelSession
```

### Request flow (`POST /v1/chat/completions`)

1. **Validate** — `ChatRequestValidator` checks model, parameters, message roles
2. **Context** — `ContextManager` folds messages into `(instructions, finalPrompt)`
3. **Session** — per-request `LanguageModelSession` created with instructions
4. **Infer** — `InferenceService.respond()` or `.stream()` via `apple-fm-sdk`
5. **Map** — SDK errors → `AfmError` → OpenAI error envelope; streaming snapshots → SSE deltas
6. **Release** — session `release()` in `finally`

### SDK adapter (`src/server/sdk/`)

| Module | Role |
|--------|------|
| `ModelProvider` | `SystemLanguageModel` lifecycle, availability, context size, token counting |
| `GenerationMapper` | OpenAI params → `GenerationOptions` |
| `SdkErrorMapper` | SDK errors → typed `AfmError` |
| `InferenceService` | Session open/respond/stream/shutdown |

## Project layout

```
afm-server/
├── src/
│   ├── server/          HTTP server, SDK adapter, MCP, validators
│   │   ├── app.ts       Hono route handlers
│   │   ├── server.ts    Node HTTP bootstrap
│   │   ├── sdk/         apple-fm-sdk adapter layer
│   │   ├── session/     Session + ContextManager
│   │   ├── mcp/         stdio MCP client
│   │   └── ...
│   └── cli/             CLI entry point and commands
│       ├── main.ts
│       └── commands/
├── bin/afm-server.js    executable shim → dist/cli/main.js
├── test/
│   ├── unit/
│   └── e2e/
├── examples/            apple-fm-sdk usage (not afm-server internals)
└── scripts/release.js
```

## Development

```bash
pnpm install
pnpm run build
pnpm test              # unit + e2e (e2e skipped if SDK native bindings unavailable)
pnpm run test:e2e      # e2e only
pnpm run typecheck
pnpm run ci            # build + test + typecheck
```

## Run the server

```bash
afm-server serve --port 1337 --token sk-apple-1337 --debug
```

```bash
curl -X POST http://127.0.0.1:1337/v1/chat/completions \
  -H "Authorization: Bearer sk-apple-1337" \
  -H "Content-Type: application/json" \
  -d '{"model":"system","messages":[{"role":"user","content":"Say hi."}]}'
```

Streaming:

```bash
curl -N -X POST http://127.0.0.1:1337/v1/chat/completions \
  -H "Authorization: Bearer sk-apple-1337" \
  -H "Content-Type: application/json" \
  -d '{"model":"system","stream":true,"messages":[{"role":"user","content":"Count to 5."}]}'
```

With a local MCP server:

```bash
afm-server serve --port 1337 --mcp "python3 /path/to/mcp/server.py"
```

Environment variables for `serve`:

- `AFM_SERVER_PORT` (default `1337`)
- `AFM_SERVER_TOKEN` (default `sk-apple-1337`)

## Programmatic API

Import the server library from the package root:

```typescript
import { startServer, createApp, InferenceService } from "afm-server";

const inference = InferenceService.create();
const app = createApp({ inference, token: "sk-apple-1337" });
// or
const server = await startServer({ port: 1337, token: "sk-apple-1337" });
await server.stop();
```

Published entry: `dist/server/index.js` (see `package.json` `exports`).

## CLI commands

| Command | Purpose |
|---------|---------|
| `serve` | Start the OpenAI-compatible HTTP server |
| `respond` | One-shot generation (optional `--stream`) |
| `chat` | Interactive multi-turn REPL |
| `token-count` | Count tokens via SDK (no generation) |
| `available` | Check model availability on this device |
| `schema` | Generate JSON schema locally (no model needed) |

```bash
afm-server respond "Hello"
afm-server respond --stream --instructions "Be concise." "Explain recursion"
afm-server chat --instructions "You are a coding assistant."
afm-server token-count --json "Hello world"
afm-server available --json
afm-server schema object --name Person --string name --int age
```

## Homebrew services

```bash
brew services start afm-server
brew services info afm-server
```

Logs: `/opt/homebrew/var/log/afm-server.log`, `/opt/homebrew/var/log/afm-server-error.log`

## Direct SDK usage

For inference without the HTTP layer, use [`apple-fm-sdk`](https://github.com/tariqwest/ts-apple-fm-sdk) directly. See [`examples/`](examples/) and the [SDK examples](https://github.com/tariqwest/ts-apple-fm-sdk/tree/master/examples).

## Removed / not supported

These existed in earlier versions and are gone:

- Subprocess backends (`/usr/bin/fm`, `afm-fm-helper`)
- `--helper`, `AFM_HELPER_PATH`
- `quota-usage` CLI command
- `model: "pcc"` (Private Cloud Compute)
- Monorepo packages (`@afm-js/core`, `@afm-js/cli`, `@afm-js/server`)

## Thanks & inspiration

- [Arthur-Ficial/apfel](https://github.com/Arthur-Ficial/apfel)
- [tariqwest/apfel-plus](https://github.com/tariqwest/apfel-plus)
- [codybrom/tsfm](https://github.com/codybrom/tsfm)
- [apple/python-apple-fm-sdk](https://github.com/apple/python-apple-fm-sdk)

## License

MIT