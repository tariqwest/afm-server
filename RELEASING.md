# Releasing fm-server

Release process for fm-server, including Homebrew tap publication.

## Version Numbering

Semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes to the API or CLI interface
- **MINOR**: New features
- **PATCH**: Bug fixes and minor improvements

## Quick Start

```bash
gh auth login                 # one-time setup
pnpm run release              # auto-detect bump + publish (GH + Homebrew)
pnpm run release:gh           # auto-detect bump + GitHub release only (no Homebrew)
```

Or as separate steps:

```bash
pnpm run release:bump         # auto-detect bump (updates package.json)
pnpm run release:bump patch   # explicit patch bump
pnpm run release:publish      # build, bundle, GitHub release, Homebrew tap
pnpm run release:gh           # build, bundle, GitHub release only
```

## How It Works

The release is split into two scripts:

1. **`scripts/bump.js`** — Bumps the version in `package.json` (no git commit/tag)
2. **`scripts/release.js`** — Reads version from `package.json`, builds, bundles, publishes

### Version Bump (`release:bump`)

Accepts an explicit strategy or auto-detects from git history:

```bash
pnpm run release:bump patch   # 0.0.10 → 0.0.11
pnpm run release:bump minor   # 0.0.10 → 0.1.0
pnpm run release:bump major   # 0.0.10 → 1.0.0
pnpm run release:bump 1.2.3   # explicit version
pnpm run release:bump         # auto-detect
```

Auto-detection heuristic (from commits since last tag):

- `BREAKING CHANGE` in body or `feat!:` prefix → **major**
- `feat:` or `feat(scope):` prefix → **minor**
- Default → **minor**

### Publish (`release:publish`)

Reads the current version from `package.json` and:

1. Builds the project (`pnpm run build`)
2. Bundles prebuilt tarball with vendored apple-fm-sdk
3. Creates GitHub release + uploads artifact (via `gh` CLI)
4. Generates and publishes Homebrew formula to tap

### Dry Run

```bash
pnpm run release:publish --dry-run
```

## Scripts

- `pnpm run release` — Bump + publish in one shot (GH + Homebrew)
- `pnpm run release:bump [patch|minor|major|version]` — Bump only
- `pnpm run release:publish [--dry-run] [--no-brew]` — Publish (GH + Homebrew)
- `pnpm run release:gh` — Publish to GitHub only (no Homebrew)
- `pnpm run ci` — Build + test + typecheck

## Flags

- `--dry-run` — Skip actual operations (build, upload, tap push)
- `--no-brew` — Skip Homebrew tap publishing (GitHub release only)

## Environment Variables

- `APPLE_FM_SDK_PATH` — Path to ts-apple-fm-sdk (default: `../ts-apple-fm-sdk`)
- `TAP_REPO` — Homebrew tap repository (default: `tariqwest/homebrew-tap`)
- `TAP_DIR` — Local tap clone directory (default: `~/.cache/fm-server-tap`)

## Homebrew Tap

Users install via:

```bash
brew tap tariqwest/tap
brew install fm-server
```
