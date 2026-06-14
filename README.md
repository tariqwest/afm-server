# afm-js

Apple Foundation Models for Node.js. OpenAI-compatible HTTP server and CLI for Apple Intelligence on macOS.

A TypeScript / Node.js port of [apfel-plus](https://github.com/tariqwest/apfel-plus) (Swift). Same OpenAI wire format, same `/v1/chat/completions`, `/v1/models`, `/health`, same `--pcc` opt-in to Apple Private Cloud Compute. Reaches the on-device `SystemLanguageModel` (and, on macOS 27+, `PrivateCloudComputeLanguageModel`) via a small Swift helper binary spoken to over newline-JSON.

> **Status:** M1 — minimum viable. On-device chat completions work end-to-end. Streaming, tool calling, MCP, structured outputs, and the `--autostart` LaunchAgent installer arrive in M2/M3.

## Architecture

```
┌─────────────────────────────────────────┐
│  afm-js (Node 20+, TypeScript)          │
│  ┌────────────────────────────────────┐ │
│  │  @afm-js/server (Hono + Node)      │ │
│  │  /v1/chat/completions  /v1/models  │ │
│  │  /health                /v1/logs   │ │
│  └─────────────┬──────────────────────┘ │
│                │ newline-JSON over      │
│                │ stdin/stdout           │
│                ▼                        │
│  ┌────────────────────────────────────┐ │
│  │  HelperProcess                     │ │
│  │  spawns afm-fm-helper, multiplexes │ │
│  │  sessions, frames lines            │ │
│  └────────────────────────────────────┘ │
└─────────────────┼──────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  afm-fm-helper (Swift, macOS 26+)       │
│  imports FoundationModels               │
│    SystemLanguageModel                  │
│    PrivateCloudComputeLanguageModel     │
│    LanguageModelSession                 │
└─────────────────────────────────────────┘
```

**Why a Swift helper instead of FFI:** the only path that gives day-one PCC support. The helper imports `FoundationModels` directly and ships as a prebuilt arm64 binary; Node spawns it and multiplexes requests over a tiny JSON protocol. Process isolation also keeps Swift 6's strict concurrency out of Node's event loop.

## Layout

```
afm-js/
├── packages/
│   ├── core/        @afm-js/core     pure: Zod schemas, AfmError, validators, ModelBackend
│   ├── cli/         @afm-js/cli      argv -> typed config (TODO M2)
│   ├── server/      @afm-js/server   Hono + HelperProcess bridge
│   └── afm-js/      afm-js           umbrella, the npm bin
└── helper/                            Swift sources for afm-fm-helper
```

## Build (dev)

```bash
# 1. Build the helper binary.
cd helper && swift build -c release

# 2. Install Node deps + typecheck.
cd .. && pnpm install && pnpm typecheck

# 3. Run the test suite.
pnpm test
```

## Run the server

```bash
node packages/afm-js/bin/afm-js.js serve --port 11434 --token sk-test --debug
```

```bash
curl -X POST http://127.0.0.1:11434/v1/chat/completions \
  -H "Authorization: Bearer sk-test" \
  -H "Content-Type: application/json" \
  -d '{"model":"apple-foundationmodel","messages":[{"role":"user","content":"Say hi."}]}'
```

## Models

- `apple-foundationmodel` — on-device, 4096-token context, default.
- `apple-foundationmodel-pcc` (or aliases `pcc`, `apfel-pcc`) — Apple Private Cloud Compute, 32K context, requires macOS 27+. Returns a typed 503 with a clear remediation message on ineligible hosts.

## Requirements

- macOS 26 (Tahoe) or later, Apple Silicon (M1+).
- Apple Intelligence enabled in System Settings.
- Node 20+.

## Provenance

The Swift app this ports is at [tariqwest/apfel-plus](https://github.com/tariqwest/apfel-plus); it in turn forks Franz's [Arthur-Ficial/apfel](https://github.com/Arthur-Ficial/apfel). Two libraries informed the design without being depended on:

- [codybrom/tsfm](https://github.com/codybrom/tsfm) — koffi-FFI bindings for on-device FoundationModels; no PCC.
- [apple/python-apple-fm-sdk](https://github.com/apple/python-apple-fm-sdk) — Apple's official Python SDK; clean session/model split.

## License

MIT.
