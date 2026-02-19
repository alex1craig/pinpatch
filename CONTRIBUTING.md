# Contributors Guide

This guide focuses on local testing workflows for Pinpatch contributors.

## Prerequisites

- Node.js `>=18`
- `pnpm` (the repo uses pnpm workspaces)
- Optional for real provider runs: Codex CLI installed/authenticated (`codex` on PATH)
- For real provider runs, enable Codex workspace write access:
  - From this repo root, run `codex` once and allow write access.

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

If you are using live Codex (not fixture mode), initialize write access first:

```bash
codex
```

Then open:

- `http://localhost:3030` (proxied app with overlay)

Manual checks:

1. Press `c` to enter pin mode.
2. Click an element, enter a prompt, and submit.
3. Confirm pin transitions (`queued` -> `running` -> terminal state).
4. Confirm artifacts are written to `.pinpatch/` in repo root.

## Deterministic Local Testing (Fixture Provider)

Use fixture mode to avoid live provider dependencies:

```bash
PINPATCH_PROVIDER_FIXTURE=1 pnpm --filter pinpatch exec tsx src/index.ts dev --target 3000 --proxy-port 3030 --bridge-port 7331 --debug
```

## Automated Smoke Tests (Playwright)

Run the full smoke suite:

```bash
pnpm test:e2e
```

Notes:

- The suite starts both the test app and Pinpatch runtime automatically.
- It uses fixture mode internally for deterministic behavior.

## Troubleshooting

- `Target localhost:<port> is unreachable`
  - Start the target app first, then rerun `pinpatch dev --target <port>`.
- `Bridge port ... is already in use` or `Proxy port ... is already in use`
  - Change ports with `--bridge-port` and `--proxy-port`.
- `Failed to start Codex process`
  - Confirm `codex` is installed/authenticated, or use fixture mode for local smoke checks.
- `Codex run finishes but no files are changed`
  - Run `codex` at repo root and enable workspace write access, then rerun the request.
