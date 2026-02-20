# Pinpatch

Pinpatch lets you drop pins directly on your running app, then send those requests to a supported coding provider (`codex` or `claude`) for implementation.

## Prerequisites

- Node.js `>=18`
- A local web app running on `localhost` (default target port is `3000`)
- For `codex` runs: Codex CLI installed and authenticated (`codex` command available on PATH)
- For `claude` runs: Claude Code CLI installed and authenticated (`claude` command available on PATH)
- For real provider runs, enable workspace write access/trust for the target repo in your chosen provider CLI.

## Installation

### Install globally (recommended)

```bash
npm install -g pinpatch
pinpatch --help
```

### Run from this repo (without global install)

```bash
pnpm install
pnpm build
pnpm -C packages/cli exec tsx src/index.ts --help
```

## Quick Start

1. Start your app locally (example: `localhost:3000`).
2. In your project root, ensure your chosen provider is authenticated and has workspace access. For Codex:

```bash
codex
```

3. Start Pinpatch:

```bash
pinpatch dev --target 3000
```

4. Open the proxied app at `http://localhost:3030`.
5. Press `c` to enter pin mode, click an element, write a request, and submit.
6. Hover the pin to see progress. Completed pins remain visible, allow follow-up prompts, and can be closed from the status panel.

## Switch Providers

You can switch providers per command or in `.pinpatch/config.json`.

Per command (highest precedence):

```bash
pinpatch dev --target 3000 --provider claude --model sonnet
pinpatch implement <taskId> --provider codex --model gpt-5.3-codex-spark
```

Project defaults in `.pinpatch/config.json`:

```json
{
  "provider": "claude",
  "model": "sonnet"
}
```

Default provider is `codex`.
Default model is provider-aware: `gpt-5.3-codex-spark` for `codex`, and `sonnet` when provider is `claude` and no model is set.

## CLI Commands

### `pinpatch --help`

Shows command usage and overlay keyboard shortcuts.

### `pinpatch dev`

Starts the bridge + reverse proxy runtime.

```bash
pinpatch dev --target 3000 --bridge-port 7331 --proxy-port 3030 --debug
```

Options:

- `--target <port>` target app port
- `--provider <name>` provider (`codex` or `claude`)
- `--model <model>` model name
- `--bridge-port <port>` bridge API port
- `--proxy-port <port>` proxy port
- `--debug` verbose logging

### `pinpatch implement <taskId>`

Runs a saved task again from `.pinpatch/tasks`.

```bash
pinpatch implement 2026-02-19-abc123 --dry-run
```

Options:

- `--provider <name>`
- `--model <model>`
- `--dry-run`
- `--debug`

### `pinpatch tasks`

Lists task artifacts:

```bash
pinpatch tasks
```

### `pinpatch tasks --prune`

Prunes stale runtime artifacts:

```bash
pinpatch tasks --prune
```

Default prune policy:

- logs older than 14 days
- orphan sessions older than 24 hours

## Overlay Keyboard Shortcuts

When using the proxied app during `pinpatch dev`:

- `c`: toggle pin mode
- `Escape`: exit pin mode and dismiss an open composer
- `Cmd+Delete` / `Cmd+Backspace` (macOS): clear all pins
- `Ctrl+Delete` / `Ctrl+Backspace` (non-macOS): clear all pins
- `Enter`: submit pin request from composer and submit completed-pin follow-ups
- `Shift+Enter`: insert newline in composer/follow-up textareas

## Configuration

Config precedence is:

1. CLI flags
2. `.pinpatch/config.json`
3. Built-in defaults

Default values:

- `provider`: `codex`
- `model`: provider-aware default (`gpt-5.3-codex-spark` for `codex`, `sonnet` for `claude`)
- `target`: `3000`
- `bridgePort`: `7331`
- `proxyPort`: `3030`
- `debug`: `false`

## Generated Artifacts

Pinpatch writes runtime files under `.pinpatch/` in the current project:

```text
.pinpatch/
  config.json
  tasks/
  sessions/
  screenshots/
  runtime/logs/
```

`.pinpatch/` is automatically added to `.gitignore`.

## Troubleshooting

- `Target localhost:<port> is unreachable`
  - Start your app first, then retry `pinpatch dev --target <port>`.
- `Bridge port ... is already in use` or `Proxy port ... is already in use`
  - Free the port or choose another with `--bridge-port` / `--proxy-port`.
- `Failed to start Codex process`
  - Confirm Codex CLI is installed, authenticated, and available as `codex`.
- `Failed to start Claude process`
  - Confirm Claude Code CLI is installed/authenticated and available as `claude`.
- `Codex execution completed but no file edits were applied`
  - Run `codex` in the target repo and enable workspace write access, then retry the pin.
- `Claude execution completed but no file edits were applied`
  - Ensure Claude has workspace trust/write access for this repo, then retry the pin.

## Monorepo Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
```

Reference docs:

- Product scope: `scope-doc.md`
- MVP traceability: `docs/mvp-checklist.md`
- npm release runbook: `docs/npm-release.md`
