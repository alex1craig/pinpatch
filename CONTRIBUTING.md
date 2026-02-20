# Contributors Guide

This guide focuses on local testing workflows for Pinpatch contributors.

## Prerequisites

- Node.js `>=18`
- `pnpm` (the repo uses pnpm workspaces)
- Optional for real provider runs:
  - Codex CLI installed/authenticated (`codex` on PATH)
  - Claude Code CLI installed/authenticated (`claude` on PATH)
- For real provider runs, enable workspace write access/trust from your chosen provider CLI.

## First-Time Setup

```bash
pnpm install
pnpm build
```

## Fast Validation Loop

Run these before opening a PR:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

## Manual Local Test with the Included Test App

Open two terminals from repo root.

Terminal 1: start the test app on port `3000`.

```bash
pnpm --filter @pinpatch/test-app dev
```

Terminal 2: start Pinpatch and proxy the app.

```bash
pnpm --filter pinpatch exec tsx src/index.ts dev --target 3000 --proxy-port 3030 --bridge-port 7331 --debug
```

To switch provider in this workflow, pass `--provider` (and optionally `--model`):

```bash
pnpm --filter pinpatch exec tsx src/index.ts dev --target 3000 --proxy-port 3030 --bridge-port 7331 --debug --provider codex --model gpt-5.3-codex-spark
pnpm --filter pinpatch exec tsx src/index.ts dev --target 3000 --proxy-port 3030 --bridge-port 7331 --debug --provider claude --model sonnet
```

If you pass `--provider claude` without `--model`, Pinpatch defaults to `sonnet`.

If you are using live Codex (not fixture mode), initialize write access first:

```bash
codex
```

Then open:

- `http://localhost:3030` (proxied app with overlay)

If you are using live Claude instead, start Pinpatch with `--provider claude --model sonnet` and ensure `claude` is authenticated first.

Manual checks:

1. Press `c` to enter pin mode.
2. Click an element, enter a prompt, and submit.
3. Confirm pin transitions (`queued` -> `running` -> terminal state).
4. Confirm artifacts are written to `.pinpatch/` in repo root.

## Automated Smoke Tests (Playwright)

Run the full smoke suite:

```bash
pnpm test:e2e
```

Notes:

- The suite starts both the test app and Pinpatch runtime automatically.
- It uses fixture mode internally for deterministic behavior.

## Releasing

For npm publish readiness checks, package validation, publish order, and rollback commands, use:

- `docs/npm-release.md`
- `./scripts/npm-release.sh --help`

## Troubleshooting

- `Target localhost:<port> is unreachable`
  - Start the target app first, then rerun `pinpatch dev --target <port>`.
- `Bridge port ... is already in use` or `Proxy port ... is already in use`
  - Change ports with `--bridge-port` and `--proxy-port`.
- `Failed to start Codex process`
  - Confirm `codex` is installed/authenticated, or use fixture mode for local smoke checks.
- `Failed to start Claude process`
  - Confirm `claude` is installed/authenticated, or use fixture mode for local smoke checks.
- `Codex run finishes but no files are changed`
  - Run `codex` at repo root and enable workspace write access, then rerun the request.
